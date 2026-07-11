# Refresh cadence histogram — design (story 202)

Spec for backlog story 202. See `docs/backlog.md`'s "202 — Refresh cadence histogram" for the acceptance criteria this implements.

## Problem

We want a histogram of intervals between a druid's Lifebloom refreshes on targets that are already at 3 stacks, with a median and R/O/G judgement, so the druid can see whether they refresh too eagerly (wasted mana/GCDs) or too late (risking an accidental bloom — counted separately by story 203).

## Real-data finding

Live Buffs events pulled from report `4GYHZRdtL3bvhpc8`, fight 6 (Dassz, Lifebloom ability IDs `33763`/`33778`) show:

- Every stack-increasing `applybuffstack` co-fires a `refreshbuff` at the **same timestamp** (an echo of the duration refresh that always accompanies a stack change).
- A genuine "refresh while already at 3 stacks" appears as a **solo** `refreshbuff` — no `applybuffstack` at that timestamp.

Example sequence for one target's first ramp (fight-relative timestamps):

```
1880312 applybuff            stack 1
1881811 applybuffstack       stack 2   (+ refreshbuff echo, same ts — ignored)
1883327 applybuffstack       stack 3   (+ refreshbuff echo, same ts — ignored)
1889731 refreshbuff  (solo)            → interval since reaching 3 stacks: 6404ms
1896347 refreshbuff  (solo)            → interval since previous refresh: 6616ms
1903349 removebuff                     → window closes, no trailing interval
```

This dedup rule (ignore a `refreshbuff` sharing a timestamp with an `applybuffstack` on the same target) is the crux of correctly detecting "true" 3-stack refreshes.

## Architecture

### 1. `src/metrics/lifebloomStacks.ts` (new, shared)

Extracted from `lb3Uptime.ts`'s per-target state machine, since the backlog's ordering note flags 202-205 as all needing Lifebloom stack reconstruction.

```ts
export type LifebloomTimelineEventKind =
  "open" | "stack-change" | "refresh" | "close";

export interface LifebloomTimelineEvent {
  timestamp: number;
  kind: LifebloomTimelineEventKind;
  stack?: number; // present only for "stack-change"
}

export function reconstructLifebloomTimelines(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): Map<number, LifebloomTimelineEvent[]>;
```

Mapping from raw WCL events to timeline events: events are first grouped per target by **exact timestamp** (not processed as a running lookback), since WCL doesn't document sub-order for same-timestamp events and the real data only ever showed `applybuffstack` before its `refreshbuff` echo by coincidence, not by contract. Each timestamp group then emits at most one timeline event, by priority:

1. `applybuff` present → `open` (stack starts at 1). Any co-occurring `refreshbuff` in the same group is ignored (never observed in real data, but harmless if present).
2. `applybuffstack` present → `stack-change` (carries the new stack count via `stack`). Any co-occurring `refreshbuff` echo in the same group is dropped entirely — this is the case that matters, confirmed against real data.
3. `removebuff` present → `close`.
4. Otherwise, a solo `refreshbuff` → `refresh`.

Groups are then emitted in timestamp order to form each target's chronological timeline.

Map iteration order follows insertion order (first-seen target), same guarantee `lb3Uptime.ts` currently gets from its manual `targetOrder` array — that array is dropped in favor of relying on `Map`'s insertion-order guarantee.

### 2. `lb3Uptime.ts` refactor

`computeLb3Uptime` is rewritten to consume `reconstructLifebloomTimelines` instead of walking raw events itself. Public API (`computeLb3Uptime` signature, `Lb3UptimeResult`/`Lb3TargetResult` shapes) is unchanged. This is a pure internal refactor — `lb3Uptime.test.ts` is not modified and must keep passing unchanged as the regression check.

### 3. `src/metrics/refreshCadence.ts` (new)

```ts
export interface RefreshCadenceBucket {
  label: "early" | "ideal" | "late";
  count: number;
  pct: number; // rounded, of intervalCount
}

export interface RefreshCadenceResult {
  intervalCount: number;
  medianMs: number | null; // null when no 3-stack refresh ever happened
  judgement: Judgement | null;
  buckets: RefreshCadenceBucket[]; // always all three labels, pct 0 when intervalCount is 0
}

export function computeRefreshCadence(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): RefreshCadenceResult;
```

Algorithm, per target's timeline (all targets pooled into one set of intervals — no per-target output, no maintained-target filter):

- Track `currentStack` (starts 0) and `anchorAt: number | null` (starts null).
- `open`: `currentStack = 1`, `anchorAt = null`.
- `stack-change`: `currentStack = event.stack`. If `currentStack >= 3` and `anchorAt === null`, set `anchorAt = event.timestamp` (first time reaching 3 stacks this window — this becomes the start point for the _first_ interval, per the "count it" decision).
- `refresh`: if `currentStack >= 3` and `anchorAt !== null`, push `event.timestamp - anchorAt` to the interval list, then `anchorAt = event.timestamp`.
- `close`: `currentStack = 0`, `anchorAt = null` (ends the window — a bloom/removal never produces a trailing interval; that failure mode is story 203's accidental-bloom counter, not this histogram).

Bucketing, over the pooled interval list (comments cite story 202 per CLAUDE.md principle 3):

```ts
// Bucket boundaries per docs/backlog.md story 202.
const EARLY_MAX_MS = 5500; // < 5.5s
const IDEAL_MAX_MS = 7000; // 5.5-7s inclusive; > 7s is "late"
```

Median judgement (asymmetric band — doesn't fit `judgeThreshold`/`judgeThresholdBelow`'s monotonic shape, so it's a small private function in this file, not a new `judgement.ts` primitive):

```ts
// Median R/O/G per docs/backlog.md story 202: green 6-7s, orange 5-6s.
// A median above 7s is judged red, not just "not green" — refreshing
// consistently late correlates with near-bloom timing, treated as
// severely as refreshing too eagerly. Actual blooms are counted
// separately by story 203's accidental-bloom counter.
const GREEN_MIN_MS = 6000;
const GREEN_MAX_MS = 7000;
const ORANGE_MIN_MS = 5000;

function judgeMedianCadence(medianMs: number): Judgement {
  if (medianMs > GREEN_MAX_MS) return "red";
  if (medianMs >= GREEN_MIN_MS) return "green";
  if (medianMs >= ORANGE_MIN_MS) return "orange";
  return "red";
}
```

Median: standard median of the sorted interval list (average the two middle values on an even count). `medianMs`/`judgement` are `null` when `intervalCount === 0`.

### 4. `RefreshCadenceCard` (replace static placeholder)

Mirrors `LB3UptimeCard`'s fetch/effect/render pattern exactly:

- Props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds`, `fetchEvents` (no `targetNames` — this histogram isn't per-target).
- Fetches `"Buffs"` events via `fetchEvents` (already deduped against `LB3UptimeCard`'s identical fetch by the existing per-`reportCode:fightId:dataType` cache in `eventCache.ts` — no double-fetch).
- Computes via `computeRefreshCadence`.
- States: loading (`Calculating…`), error (`role="alert"`), empty (`intervalCount === 0` → "No 3-stack refreshes recorded this fight."), and the real result: `Median {X.X}s` + `JudgementChip` + `Histogram` fed the three buckets.
- `Scorecard` passes it the same set of props it already threads through to `LB3UptimeCard`.

## Testing

Per `docs/testing.md`'s pyramid — push risk mitigation as low as possible, no tier skipped for convenience:

- **Tier 1 (`lifebloomStacks.test.ts`, new):** dedup of the co-fired echo (including a test that replays the _exact_ real captured sequence above and asserts intervals `[6404, 6616]` downstream — real behavior, not a synthetic guess), multiple targets tracked independently, a drop-and-re-ramp producing two separate windows.
- **Tier 1 (`refreshCadence.test.ts`, new):** bucket boundary edges (5500ms, 7000ms), median for odd/even interval counts, all four judgement bands (including the >7s red case), a window closed by `removebuff` contributing no trailing interval, multi-target pooling into one result, the `intervalCount === 0` case.
- **Tier 1 (`lb3Uptime.test.ts`):** unchanged — passes unmodified as the regression check on the refactor.
- **Tier 3 (`RefreshCadenceCard/index.test.tsx`, rewritten):** loading → real-data render, error state, empty state — same shape as `LB3UptimeCard/index.test.tsx`, using existing event factories.
- **No Tier 2 changes** — `Buffs` dataType fetching is already generic in `fetchEventsPage`/`eventCache`; this story adds no new client-parsing surface.
- **No Tier 4/5 changes** — the E2E smoke test's golden path renders whatever's on the Scorecard; a newly-live card needs no new assertion there, per Tier 5's "deliberately small, edge cases belong in lower tiers" charter. Confirmed `Scorecard/index.test.tsx` only asserts the "Refresh cadence" heading exists (not placeholder text), so it survives unmodified.

## Docs housekeeping

- `docs/testing.md`: append to `4GYHZRdtL3bvhpc8`'s "Notable for" cell — this report/fight also validated that Lifebloom's `refreshbuff` co-fires with `applybuffstack` on every stack increase, and fires solo only when refreshing at an already-maxed stack.
- `docs/backlog.md`: mark story 202 `✅ Done` on completion.
- `CLAUDE.md`: update "Repo state" to include story 202, per existing convention.
- This spec file is deleted once the story ships, per CLAUDE.md's "a story isn't done until its paperwork is retired."
