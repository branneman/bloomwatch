# Design: Story 102 — Idle-gap detection

Backlog: `docs/backlog.md` story 102 (Epic B — GCD economy).

## Goal

List every gap > 1.7 s between the druid's casts, with total dead time, the
five longest gaps, and a link from each gap to that moment in the WCL report.
Judge total dead time as a % of fight duration.

## Shared cast-interval extraction

`src/metrics/gcdUtilization.ts` already reconstructs "occupied" windows from
begincast/cast event pairs, including the interrupted-cast case (a begincast
with no following cast contributes nothing) and the GCD-floor clamp (a
cast-time delta below 1.5 s still costs 1.5 s). Story 102 needs the same
occupied-window reconstruction to find the gaps between windows, so this
logic is extracted rather than duplicated:

- New `src/metrics/castIntervals.ts`:

  ```ts
  export interface CastInterval {
    start: number;
    end: number;
  }
  export function computeCastIntervals(
    events: WclEvent[],
    druidId: number,
  ): CastInterval[];
  ```

  Same begincast/cast pairing behavior as today's inline loop in
  `computeGcdUtilization`, but returns the intervals instead of a running
  total. Intervals are chronological but not necessarily sorted by `start`
  strictly ahead of prior code — cast events arrive in timestamp order from
  WCL, so no explicit sort is needed (matches current assumption).

- `computeGcdUtilization` is refactored to call `computeCastIntervals` and
  sum `end - start` per interval into `activeTimeMs`. Its existing test file
  (`gcdUtilization.test.ts`) is behavior-equivalent and should pass
  unchanged — this is a pure extraction, not a behavior change.

## `src/metrics/idleGaps.ts`

```ts
// Backlog story 102: gaps > 1.7s between casts are flagged as idle time.
export const IDLE_GAP_THRESHOLD_MS = 1700;

export interface IdleGap {
  startMs: number; // end of the preceding occupied interval
  endMs: number; // start of the next occupied interval
  durationMs: number;
}

export interface IdleGapsResult {
  gaps: IdleGap[]; // all gaps > threshold, chronological
  longestGaps: IdleGap[]; // top 5 by duration desc (ties: earlier first)
  totalDeadTimeMs: number; // sum of `gaps`
  fightDurationMs: number;
  deadTimePct: number;
  judgement: Judgement;
}

export function computeIdleGaps(
  events: WclEvent[],
  druidId: number,
  fightStart: number,
  fightEnd: number,
): IdleGapsResult;
```

Behavior:

- Compute `computeCastIntervals(events, druidId)`.
- For each consecutive pair of intervals, `gap = intervals[i+1].start -
intervals[i].end`. Only gaps between two casts count — no gap is synthesized
  before the first cast or after the last cast (confirmed with the user:
  out of scope for this story, since pull-in delay and post-last-cast idle
  are a different failure mode than mid-fight freezing).
- Keep gaps where `durationMs > IDLE_GAP_THRESHOLD_MS` (strictly greater
  than, per acceptance criteria; exactly 1700 ms is not flagged).
- `totalDeadTimeMs` = sum of the kept gaps (not `fightDuration -
activeTime` — this metric is scoped to the listed gaps only).
- `deadTimePct = totalDeadTimeMs / (fightEnd - fightStart) * 100`.
- `longestGaps` = kept gaps sorted by `durationMs` descending, first 5.
- Zero casts or zero qualifying gaps → `gaps: []`, `totalDeadTimeMs: 0`,
  green judgement.

### Judgement direction

`judgement.ts`'s `judgeThreshold` assumes higher-is-better (used by 101's
GCD utilization). Dead time is lower-is-better, so add a second comparator:

```ts
// Lower value is better (e.g. idle dead-time %, overheal %).
export function judgeThresholdBelow(
  value: number,
  thresholds: { greenMax: number; orangeMax: number },
): Judgement {
  if (value < thresholds.greenMax) return "green";
  if (value <= thresholds.orangeMax) return "orange";
  return "red";
}
```

Story 102 thresholds (`docs/backlog.md`): green `< 5%`, orange `5–15%`, red
`> 15%` → `judgeThresholdBelow(deadTimePct, { greenMax: 5, orangeMax: 15 })`.

This comparator is intentionally general — later lower-is-better metrics
(204 re-stack tax, 301 clip %, 302 wasteful %, 404 overheal) can reuse it
instead of re-deriving the same inverted comparison.

## WCL deep link

New `src/report/wclLinks.ts`:

```ts
export function buildFightTimeUrl(
  reportCode: string,
  fightId: number,
  startMs: number,
  endMs: number,
): string {
  return `https://fresh.warcraftlogs.com/reports/${reportCode}#fight=${fightId}&type=summary&start=${startMs}&end=${endMs}`;
}
```

`start`/`end` are the same report-relative millisecond values already used
throughout this codebase (`event.timestamp`, `fight.startTime` /
`fight.endTime` — see `GCDUtilizationCard`, which passes these straight
through with no offset). Confirmed with the user that WCL's own deep-link
query params use this same convention, so no conversion is needed.

## `IdleGapsCard` component

`src/app/components/IdleGapsCard/index.tsx`, structured identically to
`GCDUtilizationCard` (same `accessToken`/`reportCode`/`fight`/`druidId`/
`fetchEvents` props, same loading/error/stale-response handling via the
`accessToken`-tagged result pattern). Calls `fetchEvents(..., "Casts")` —
the same event type `GCDUtilizationCard` already requests for this fight;
`eventCache`'s `reportCode:fightId:dataType` cache key means this does not
trigger a duplicate network fetch when both cards are mounted.

Renders:

- Total dead time (`formatDuration`) and `deadTimePct` (rounded), with
  judgement label.
- Count of qualifying gaps.
- The 5 longest gaps, each as fight-relative elapsed time
  (`formatDuration(gap.startMs - fight.startTime)`) + duration
  (`formatDuration(gap.durationMs)`), rendered as a link
  (`buildFightTimeUrl(reportCode, fight.id, gap.startMs, gap.endMs)`,
  `target="_blank" rel="noreferrer"`).

Wired into `App.tsx` next to `GCDUtilizationCard`, in the same fight-mapped
list, same props shape.

## Testing

- `castIntervals.test.ts`: extracted logic, covering the same cases
  currently exercised inline via `gcdUtilization.test.ts` (instant cast,
  cast-time delta, interrupted cast, GCD-floor clamp, other-actor filter).
- `gcdUtilization.test.ts`: unchanged, must still pass after the refactor.
- `idleGaps.test.ts`: threshold boundary (exactly 1700 ms excluded, 1701 ms
  included), top-5 truncation and ordering (with a tie-breaking case),
  `deadTimePct` R/O/G boundaries, zero-gap case, other-actor filter.
- `IdleGapsCard/index.test.tsx`: loading / error / loaded states, same
  shape as `GCDUtilizationCard`'s tests, plus asserting a gap's link `href`.
