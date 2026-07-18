# Story 903b — Per-fight healing-role detection: design

Spec for `docs/backlog.md` story 903b. Full acceptance criteria live there; this doc is the implementation design.

## Problem

Story 005's druid detection (`detectDruids` in `src/report/druidDetection.ts`) sums a candidate's healing-spell casts across every fight ID in one combined `table()` query, then reuses that one `DruidCandidate` identity for every fight in the report. A druid who plays a hybrid hero (e.g. Restokin) can legitimately swap between healing and DPS across pulls with no respec — real-data confirmation this session, report `F7aL6x13zVq8kTRt`, druid Nebd (druidId 33, `CombatantInfo` talents 48/0/13, `likely-dreamstate-full` per story 900's bucketing): 0 healing casts on fights 4 (Hydross) and 8 (Lurker Below), both self-labeled `Druid-Balance` that pull, versus 6-120 healing casts on the other 8 fights. Summed across the whole report (551 total healing casts) he's clearly detected and auto-selected — but every metric epic still computes and judges fights 4 and 8 as if he were healing them, producing a false "green" (0 accidental blooms, 0 restack-tax casts, etc. — out of 0 opportunities, not because he played those pulls well). This was flagged as its own story (709) during story 802's calibration work; 903b absorbs and supersedes it with a more general per-fight mechanism.

## Architecture

### `detectHealingRoleThisFight` — `src/report/druidDetection.ts`

New export, added to the existing file (same detection domain as `detectDruids`, just fed a different data source — raw `Casts` events instead of a `table()` query's `CastTableEntry[]`):

```ts
export interface HealingRoleThisFight {
  healingCastCount: number;
  isHealingThisFight: boolean;
}

export function detectHealingRoleThisFight(
  events: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): HealingRoleThisFight {
  const healingCastCount = events.filter((event) => {
    if (event.sourceID !== druidId) return false;
    if (event.type !== "cast") return false;
    if (event.abilityGameID === undefined) return false;
    const resolved = resolvedAbilities.get(event.abilityGameID);
    return (
      resolved?.kind === "spell" && HEALING_SPELL_NAMES.includes(resolved.spell)
    );
  }).length;
  return {
    healingCastCount,
    isHealingThisFight: healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
  };
}
```

Reuses the existing `HEALING_SPELL_NAMES` array and `MIN_HEALING_CASTS_FOR_DETECTION` constant unchanged — no new threshold, no duplicated spell list. `event.type === "cast"` matches the existing convention in `src/metrics/castIntervals.ts`. `resolved.spell` (a `DruidHealingSpell` union member) compared against `HEALING_SPELL_NAMES: string[]` type-checks fine since every `DruidHealingSpell` literal that matters here is already in that array.

### Hook: `src/app/components/Scorecard/useHealingRoleThisFight.ts`

New file, same shape as `usePrepHygieneSummary.ts`/`useArchetypeBucket.ts`:

```ts
export type HealingRoleStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; healingCastCount: number; isHealingThisFight: boolean };

export function useHealingRoleThisFight(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fetchEvents: (...) => Promise<WclEvent[]>,
): HealingRoleStatus
```

Fetches `"Casts"` with `includeResources: true` via the passed-in `fetchEvents` — identical cache key (`${reportCode}:${fight.id}:Casts:true`) to what `useGcdEconomySummary` already fetches for the same fight, so when both hooks run together (as they do in every `FightRow` and every `Scorecard`) this is a cache hit, not a second network request. Calls `detectHealingRoleThisFight` on the result. Catch-all error handling, same pattern as its siblings.

## Data flow / wiring

### `ReportDashboard` / `FightRow`

`FightRow` calls `useHealingRoleThisFight` alongside its existing `useFightEpicSummaries` call, and reports the result upward via a new callback prop `onHealingRole: (fightId: number, isHealingThisFight: boolean) => void` — added as a sibling to the existing `onSummaries` prop, following the exact same "report resolved status to parent" pattern already used there (including the same `summaryDeps`-style effect-dependency flattening, keyed on this hook's own resolved status only, not the six-epic one).

`ReportDashboard` tracks a new `healingRoleByFight: Map<number, boolean>` state (parallel to `summariesByFight`), updated via a `handleHealingRole` callback mirroring `handleSummaries`.

Before computing the aggregate chip strip, `ReportDashboard` filters:

```ts
const onRoleRows = rows.filter(
  (row) => healingRoleByFight.get(row.fight.id) !== false,
);
const allSummaries = onRoleRows
  .map((row) => summariesByFight.get(row.fight.id))
  .filter((s): s is FightEpicSummaries => s !== undefined);
```

A fight whose role status hasn't resolved yet (`undefined` in the map) is treated as on-role for now — matches `worstReadyJudgement`'s existing "progressive, never falsely better" design: the strip already only counts fights whose epic summaries have resolved, so an unresolved role check just means that fight isn't excluded yet, not that it's wrongly included after resolution.

`FightRow`'s own render: when its own `useHealingRoleThisFight` call resolves `isHealingThisFight: false`, the row gets a `styles.offRole` class (dimmed — reduced opacity, matching your "dim/gray out the whole row" choice) and renders a plain-text `"Not healing this fight"` label (new `styles.offRoleLabel` class, styled like the existing `.calculating` label — no new `Badge` tone, keeping `Badge`'s existing kill/wipe/trash contract untouched) in place of `combineFightEpicStatus`'s `JudgementChip`. The Kill/Wipe outcome badge and duration stay exactly as today — those are fight facts, independent of this druid's role that pull.

### `Scorecard`

Calls the same hook. When `isHealingThisFight === false` (and status is `"ready"`), renders an `Alert tone="warning"` (reusing the existing component and tone — no new `Alert` tone needed) directly below the existing `archetypeLine` (903a) and above the epic widget grid:

> `{druid.name} cast {healingCastCount} healing spell(s) this fight — the judgements below may not be meaningful for an off-role pull.`

The six epic widgets still render underneath unconditionally — this is a caveat notice, not a card-hiding mechanism (903c hides individual cards for a talent-unreachable reason; this is a whole-fight-scope caveat for a role reason, deliberately different).

## Testing

- `src/report/druidDetection.test.ts` — extend with `detectHealingRoleThisFight` cases: clears threshold (≥3 healing casts → `isHealingThisFight: true`), below threshold (0-2 → `false`), a cast that resolves to a non-healing spell (e.g. Innervate, Nature's Swiftness, or a DPS spell like Starfire) doesn't count toward `healingCastCount`, an `abilityGameID` absent from `resolvedAbilities` doesn't count and doesn't throw, events from a different `sourceID` are ignored.
- `src/app/components/Scorecard/useHealingRoleThisFight.test.ts` — loading→ready for both an on-role and an off-role case, and a fetch-rejection→error case. Mirrors `useArchetypeBucket.test.ts`'s structure.
- `src/app/components/ReportDashboard/index.test.tsx` — extend to cover: an off-role fight's row renders the dimmed style and "Not healing this fight" label instead of a judgement chip; a report with one all-red on-role fight and one all-green off-role fight shows the aggregate strip as red (proving the off-role fight's green doesn't dilute the pooled judgement).
- `src/app/components/Scorecard/index.test.tsx` — extend to cover the off-role `Alert` appearing when the hook resolves `isHealingThisFight: false`, and not appearing when `true`.
- Real-data spot-check: `4GYHZRdtL3bvhpc8` (Dassz, reused from 903a's own spot-check) as an on-role control — every fight should read as healing. `F7aL6x13zVq8kTRt` (Nebd) as the off-role case — fights 4 and 8 should read "Not healing this fight" in the dashboard, every other fight should read normally.
- `docs/testing.md`'s known-reports table gains a new row for `F7aL6x13zVq8kTRt`, documenting Nebd's per-fight healing-cast counts from this session's live query (0 on fights 4/8, 6-120 on the rest) — this also fixes `docs/backlog.md` story 903b's existing citation to "`docs/testing.md`'s `F7aL6x13zVq8kTRt` entry," which doesn't actually exist yet as of this design.

## Story 709 retirement

Following this repo's existing precedent for story 004 (superseded by 702 — its entry was fully removed from `docs/backlog.md`, with the supersession fact recorded in `CLAUDE.md`'s repo-state narrative instead of leaving a stale "superseded" marker in the backlog): story 709's entry is deleted from `docs/backlog.md` entirely in 903b's close-out commit. `CLAUDE.md`'s repo-state paragraph gains a sentence noting 709 was retired/absorbed into 903b, matching the existing phrasing pattern used for 004.

## Out of scope

- Any change to 903a's talent-archetype detection or its Scorecard display (separate mechanism, separate reason for existing).
- Card-hiding based on unreachable talents (903c) — this story's `Scorecard` caveat is a role-based notice, not a talent-based one, and doesn't hide any card.
- The onboarding notice (903d).
- Changing `detectDruids`'s whole-report candidate-selection logic itself (which druid gets auto-selected/offered in the picker) — that stays exactly as today; this story only changes what happens _after_ a druid is selected, per fight.
