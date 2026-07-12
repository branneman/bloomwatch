# Design: Concurrent LB3 targets (backlog story 205)

## Summary

Wire the existing static `ConcurrentTargetsCard` placeholder to real data: a timeline/summary
of how many targets simultaneously had the druid's 3-stack Lifebloom (LB3), reporting average
and peak concurrent LB3 targets and % of fight time at each concurrency level. Informational
only — no R/O/G judgement, per story 205's acceptance criteria.

## Scope

- New metrics module computing concurrency from already-fetched Buff events.
- A small shared-logic extraction out of `lb3Uptime.ts` into `lifebloomStacks.ts`, so the
  per-target stack-state walk (open/stack-change/close) isn't implemented a third time.
- Wiring `ConcurrentTargetsCard` from its current static placeholder to the fetch-on-mount
  pattern already used by `RestackTaxCard` / `LB3UptimeCard`.
- Out of scope: any change to 201/202/203/204's own behavior or thresholds (the refactor must
  leave `computeLb3Uptime`'s output unchanged); zone-wide aggregation (story 702).

## Data flow

### 1. Shared helper: `lifebloomStacks.ts`

Extract the per-target state machine currently embedded in `lb3Uptime.ts`'s loop into a new
exported function:

```ts
export interface LifebloomTargetState {
  totalAnyStackMs: number;
  stack3Intervals: { start: number; end: number }[];
}

export function deriveLifebloomTargetState(
  timeline: LifebloomTimelineEvent[],
  fightEnd: number,
): LifebloomTargetState;
```

Walks the timeline once, tracking:

- `totalAnyStackMs` — total time the buff was up at any stack count (same accumulation
  `lb3Uptime.ts` already does for `lbUptimePct`).
- `stack3Intervals` — closed `[start, end)` windows where stack count was continuously ≥ 3.
  A window still open at the end of the timeline is closed at `fightEnd` (mirrors
  `lb3Uptime.ts`'s existing end-of-fight clamp).

`lb3Uptime.ts` is refactored to call this helper and derive `totalAnyStackMs` and
`totalStack3Ms` (= sum of interval durations) from its result, `firstReached3At` from the first
interval's `start`. `computeLb3Uptime`'s exported behavior (its `Lb3UptimeResult` shape and
values) is unchanged — this is a pure internal refactor, verified by the existing
`lb3Uptime.test.ts` continuing to pass unmodified.

### 2. New module: `src/metrics/concurrentLb3Targets.ts`

```ts
export interface ConcurrentLb3Level {
  count: number;
  pct: number;
}

export interface ConcurrentLb3Result {
  avgConcurrent: number;
  peakConcurrent: number;
  levels: ConcurrentLb3Level[];
}

export function computeConcurrentLb3Targets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): ConcurrentLb3Result;
```

Steps:

1. `reconstructLifebloomTimelines` (existing) → per-target timelines.
2. For each target, `deriveLifebloomTargetState`. Filter to "maintained" targets: same
   `MAINTAINED_MIN_UPTIME_PCT = 30` threshold as story 201 (`lbUptimePct >= 30`), re-declared as
   a local constant in this module pointing back to story 201's rationale in
   `docs/backlog.md` — kept as a duplicate constant rather than an import, since the two modules
   independently satisfy their own stories' acceptance criteria and importing across metric
   modules for a single numeric constant isn't worth the coupling.
3. Collect all maintained targets' `stack3Intervals` into one list. Sweep-line over the
   combined `{ timestamp, delta: +1 | -1 }` boundary events (start → +1, end → −1), sorted by
   timestamp (ties: process all deltas at the same timestamp together since order between
   simultaneous +1/−1 doesn't affect the resulting duration-weighted levels), tracking current
   concurrent count across `[fightStart, fightEnd]`.
4. Accumulate duration-at-each-count-level. `avgConcurrent = Σ(count × duration) / fightDurationMs`.
   `peakConcurrent = max(count)` observed (0 if no maintained targets ever reached 3 stacks).
5. `levels` = one entry per distinct count with nonzero accumulated duration, ascending by
   `count`, `pct = duration / fightDurationMs * 100`. A count with zero duration (never actually
   occurred, e.g. concurrency jumps 0 → 2 with no window at 1) is omitted rather than emitted as
   a zero-width bar segment.

No `Judgement` is computed or returned — story 205 is explicitly informational.

### 3. Card: `ConcurrentTargetsCard`

Converted from the static placeholder to the fetch-on-mount pattern already established by
`RestackTaxCard`/`LB3UptimeCard`:

- Props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds`, `fetchEvents`
  (no `targetNames` — this card has no per-target listing, only aggregate levels).
- Fetches `"Buffs"` events only (no casts needed — concurrency is derived purely from buff
  stack state).
- Loading / error states mirror `RestackTaxCard` exactly (`Calculating…`, `role="alert"`).
- Value line: `` `Avg ${avgConcurrent.toFixed(1)} · Peak ${peakConcurrent}` ``.
- Body: existing explanatory paragraph (unchanged copy) + `StackedBar` fed from `levels`,
  with segment `label: "${count} target${count === 1 ? "" : "s"}"`. Color mapping is a fixed
  array indexed by `count`, reusing the placeholder's existing three colors and extending it
  one step for the rare higher-concurrency case: `["var(--border)", "var(--accent-border)",
"var(--accent)", "var(--purple-600)"]` for counts 0/1/2/3, clamping to the last entry
  (`--purple-600`) for any count ≥ 3 rather than growing the array further.
- `threshold` prop keeps the existing informational copy ("No R/O/G — the right number of
  concurrent targets depends on your assignments, not a universal target.").
- No `JudgementChip`; keep the existing "Informational — no judgement" note.

### 4. `Scorecard/index.tsx`

`<ConcurrentTargetsCard />` gains the same props its siblings already receive
(`accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds`, `fetchEvents`).

## Testing

- `lifebloomStacks.test.ts`: add cases for `deriveLifebloomTargetState` (single stack3 window,
  multiple windows, window still open at fight end, target that never reaches 3 stacks →
  empty `stack3Intervals`).
- `lb3Uptime.test.ts`: unchanged — asserts the refactor didn't alter observable behavior.
- `concurrentLb3Targets.test.ts` (new): two overlapping maintained targets, two
  non-overlapping, one unmaintained target excluded from the count, a target still at 3 stacks
  when the fight ends, zero maintained targets (avg 0, peak 0, empty levels), three-way overlap
  producing a level above 2.
- `ConcurrentTargetsCard/index.test.tsx`: rewritten (not extended) to mirror
  `RestackTaxCard/index.test.tsx`'s loading/error/success coverage against a mocked
  `fetchEvents`, replacing the current static-mock assertions.

## Edge cases

- **No maintained targets**: `avgConcurrent: 0`, `peakConcurrent: 0`, `levels: [{ count: 0, pct: 100 }]`.
- **Simultaneous open on one target + close on another at the same timestamp**: both deltas
  applied at that instant before the next duration slice starts, so no zero-length phantom
  level is introduced.
- **Fight shorter than any LB3 window** (shouldn't happen given intervals are clamped to
  `fightEnd`, but guarded by the clamp in `deriveLifebloomTargetState`).

## Open items

None — all acceptance criteria (average, peak, % of fight at each level, informational/no R/O/G)
are covered above.
