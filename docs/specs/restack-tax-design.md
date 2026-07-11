# Re-stack Tax Design

Design for backlog story 204 (`docs/backlog.md`). Epic C, Lifebloom discipline — follows 201 (LB3 uptime), 202 (refresh cadence), 203 (accidental blooms).

## Goal

Quantify the concrete cost — in Lifebloom casts and mana — of rebuilding Lifebloom stacks after they've dropped below 3, so dropped stacks are visible as an error with a price tag, not just a UX annoyance.

## Scope (acceptance criteria, from `docs/backlog.md` story 204)

- Counts LB casts on targets at < 3 stacks, excluding the opener and excluding deliberate new-target ramps (first ramp per target is free).
- Reported as casts + estimated mana; R/O/G scales with fight length.

## Design decisions

### 1. "Opener" and "first ramp per target" are one rule, not two

A cast counts as re-stack tax only if the target has **already reached 3 stacks at least once before** this cast. Every target's first-ever climb from 0→3 stacks is free, whether that happens during the fight's opening seconds (the common "opener" case) or mid-fight (a tank swap or new add picking up LB for the first time). Once a target has reached 3 stacks once, every subsequent cast on that target while below 3 stacks counts — including a full rebuild after a total drop (close event), which is exactly the scenario this story exists to price.

This is implemented as a single per-target `everReached3` flag that latches true the first time the target's stack count hits 3, and never resets.

### 2. Metric: merge cast events with the existing Lifebloom timeline

Reuses `reconstructLifebloomTimelines` (`src/metrics/lifebloomStacks.ts`) — the same per-target open/stack-change/close/refresh reconstruction already used by `refreshCadence.ts` and `accidentalBlooms.ts` — rather than re-deriving stack state from raw buff events.

New module `src/metrics/restackTax.ts`:

```ts
export interface RestackTaxCast {
  timestampMs: number;
  targetId: number;
}

export interface RestackTaxResult {
  casts: RestackTaxCast[];
  castCount: number;
  estimatedMana: number;
  judgement: Judgement;
}

export function computeRestackTax(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightDurationMs: number,
): RestackTaxResult;
```

Algorithm:

1. Build each target's Lifebloom timeline via `reconstructLifebloomTimelines(buffEvents, druidId, lifebloomAbilityIds)`.
2. Filter `castEvents` to `type === "cast"`, `sourceID === druidId`, `abilityGameID ∈ lifebloomAbilityIds`; group timestamps by `targetID`.
3. Per target, merge that target's cast timestamps and timeline events into one chronological stream, sorted by timestamp with **casts ordered before buff events at equal timestamps** — a cast and the stack-change/open it causes share a timestamp, and we need the stack state as it was _going into_ the cast, not the result of it.
4. Walk the merged stream maintaining `currentStack` (0 by default) and `everReached3` (false by default):
   - On a cast item: if `everReached3 && currentStack < 3`, record it as a tax cast.
   - On a buff item: `open` → `currentStack = 1`; `stack-change` → `currentStack = event.stack`; `close` → `currentStack = 0`; `refresh` → no change. After applying, if `currentStack >= 3`, set `everReached3 = true`.
5. Concatenate tax casts across all targets, sort by timestamp.
6. `estimatedMana = castCount * LIFEBLOOM_MANA_COST` (see below).
7. `judgement` from the fight-length-scaled thresholds (see below).

### 3. Mana estimate: flat constant, not derived from resource events

Lifebloom is single-rank in TBC (`resolveAbilities.ts` already encodes this: gameIDs 33763/33778 both map to rank 1), so there's no downranking ambiguity. WCL's per-event resource data isn't a reliable way to recover the mana actually spent on one specific cast, and the acceptance criteria itself says "**estimated** mana" — so this uses a flat, undiscounted base cost:

```ts
// Lifebloom base mana cost, TBC Classic, single rank — see
// https://www.wowhead.com/tbc/spell=33763/lifebloom. Intentionally NOT
// adjusted for talent/gear mana-cost reduction (e.g. Moonglow, set
// bonuses) — the acceptance criteria (docs/backlog.md story 204) calls
// for an *estimate*, and per-log-accurate cost isn't reliably
// recoverable from WCL resource events.
const LIFEBLOOM_MANA_COST = 220;
```

### 4. R/O/G: dynamic thresholds scaled by fight length

Reproduces the existing `RestackTaxCard` placeholder's worked example exactly: for a 5:41 (5.683 min) fight, green = 0–2, orange = 3–5, red = 6+.

```ts
// R/O/G scales with fight length per docs/backlog.md story 204. Budget:
// one green-tier tax cast per 2 minutes elapsed, one orange-tier tax
// cast per minute elapsed. Reproduces the original placeholder's
// worked example: a 5:41 fight allows green 0-2, orange 3-5, red 6+.
const fightMinutes = fightDurationMs / 60000;
const greenMax = Math.floor(fightMinutes / 2) + 1;
const orangeMax = Math.floor(fightMinutes);
const judgement = judgeThresholdBelow(castCount, { greenMax, orangeMax });
```

Reuses the existing `judgeThresholdBelow` helper (`src/metrics/judgement.ts`) rather than a bespoke judge function — thresholds are just computed per-fight instead of being fixed constants.

### 5. Card wiring

`RestackTaxCard` (`src/app/components/RestackTaxCard/`) currently renders static mock content (`d42a4ce`). It's rewired to real data following the exact pattern `AccidentalBloomsCard` used for story 203 (`ba951d2`):

- Props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds`, `targetNames`, `fetchEvents`.
- On mount/prop-change, `fetchEvents` both `"Buffs"` and `"Casts"` for the fight in parallel, call `computeRestackTax`, guard against stale results via the `accessToken` current-request check already used elsewhere.
- Loading / error / current-fight-guard states match `AccidentalBloomsCard`'s.
- Rendered value: `"{castCount} casts · ~{estimatedMana} mana"`.
- Body lists each tax cast (time-in-fight link via `buildFightTimeUrl` + `formatDuration`, target name via `targetNames`), same list style as `AccidentalBloomsCard`.
- Threshold text explains both the exemption rule and the dynamic formula in plain language.
- Wired into `Scorecard` the same way `AccidentalBloomsCard` was (`Scorecard/index.tsx`).

## Testing

- `src/metrics/restackTax.test.ts`: no events → 0 casts, green; free first ramp not counted; cast during an established target's dip below 3 counted; full rebuild after a `close` event counts every rebuild cast; a same-target maintenance refresh at 3 stacks not counted; a second target's independent free ramp not counted; mana = castCount × 220; judgement boundary cases at the green/orange/red edges for a couple of fight lengths.
- `RestackTaxCard/index.test.tsx`: replaces the current static-mock test (mirrors `AccidentalBloomsCard`'s real-data test suite) — loading state, error state, stale-fetch guard, rendered value/list, empty state.
- `Scorecard` wiring test updated the same way it was for story 203.

## Out of scope

- GCD count as a separate figure — Lifebloom is a 0-cast-time, GCD-only spell, so cast count and GCDs spent are identical; the card reports casts only, per the acceptance criteria's literal "casts + estimated mana."
- Per-player talent/gear-adjusted mana cost.
- Any change to `reconstructLifebloomTimelines` itself.
