# Concurrent LB3 Targets (Story 205) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing static `ConcurrentTargetsCard` placeholder to real data — average and peak concurrent 3-stack-Lifebloom (LB3) targets, plus % of fight time at each concurrency level — completing backlog story 205.

**Architecture:** Extract the per-target Lifebloom stack-state walk (currently embedded in `lb3Uptime.ts`) into a shared, tested helper in `lifebloomStacks.ts`. Build a new `concurrentLb3Targets.ts` metrics module on top of it that sweep-lines all "maintained" targets' 3-stack intervals into a single concurrency timeline. Wire the result into the existing `ConcurrentTargetsCard` component using the exact fetch-on-mount pattern already used by `RestackTaxCard`.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react. No new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded — resolved from `masterData.abilities` upstream; this feature consumes only already-resolved `lifebloomAbilityIds`.
- Story 205 is **informational only** — no R/O/G judgement anywhere in this feature (per `docs/backlog.md` story 205 and product principle 3's "judgement is visible and sourced" doesn't apply here since there's deliberately no judgement to source).
- Full-project static analysis (typecheck, ESLint, Prettier) runs via pre-commit hook — do not bypass it (`--no-verify` is forbidden).
- Commits follow Conventional Commits (`type(scope): summary`), scope `lifebloom` for this epic.
- Design spec: `docs/specs/concurrent-lb3-targets-design.md` (read for full rationale; this plan is the executable breakdown of it).

---

### Task 1: Extract `deriveLifebloomTargetState` into `lifebloomStacks.ts`

**Files:**

- Modify: `src/metrics/lifebloomStacks.ts`
- Test: `src/metrics/lifebloomStacks.test.ts`

**Interfaces:**

- Consumes: `LifebloomTimelineEvent` (existing type in this file, unchanged).
- Produces: `export interface LifebloomTargetState { totalAnyStackMs: number; stack3Intervals: { start: number; end: number }[] }` and `export function deriveLifebloomTargetState(timeline: LifebloomTimelineEvent[], fightEnd: number): LifebloomTargetState`. Task 2 (refactoring `lb3Uptime.ts`) and Task 3 (`concurrentLb3Targets.ts`) both call this function directly.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/metrics/lifebloomStacks.test.ts` (new `import` line alongside the existing one, new `describe` block):

```ts
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
} from "./lifebloomStacks";
```

(replaces the existing single-symbol import line at the top of the file)

```ts
describe("deriveLifebloomTargetState", () => {
  it("accumulates any-stack time and records a single stack-3 interval", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 20000);

    expect(state).toEqual({
      totalAnyStackMs: 10000,
      stack3Intervals: [{ start: 2000, end: 10000 }],
    });
  });

  it("records a second interval after a drop and re-ramp", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
        anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 10000);

    expect(state).toEqual({
      totalAnyStackMs: 7000,
      stack3Intervals: [
        { start: 1000, end: 3000 },
        { start: 6000, end: 9000 },
      ],
    });
  });

  it("closes an open interval and open any-stack window at fightEnd", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 5000);

    expect(state).toEqual({
      totalAnyStackMs: 5000,
      stack3Intervals: [{ start: 2000, end: 5000 }],
    });
  });

  it("returns an empty interval list for a target that never reaches 3 stacks", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 8000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 10000);

    expect(state).toEqual({
      totalAnyStackMs: 8000,
      stack3Intervals: [],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: FAIL — `deriveLifebloomTargetState is not a function` (or similar import error), since it doesn't exist yet.

- [ ] **Step 3: Implement `deriveLifebloomTargetState`**

Add to `src/metrics/lifebloomStacks.ts`, after the existing `reconstructLifebloomTimelines` function:

```ts
export interface LifebloomTargetState {
  totalAnyStackMs: number;
  stack3Intervals: { start: number; end: number }[];
}

// Walks one target's timeline once, computing both any-stack uptime (used by
// story 201's "maintained target" filter) and closed stack-3 intervals (used
// by 201's LB3 window and 205's concurrency sweep) in a single pass, so the
// two stories' metric modules don't each re-implement this state machine.
export function deriveLifebloomTargetState(
  timeline: LifebloomTimelineEvent[],
  fightEnd: number,
): LifebloomTargetState {
  let openAt: number | null = null;
  let stack3OpenAt: number | null = null;
  let totalAnyStackMs = 0;
  const stack3Intervals: { start: number; end: number }[] = [];

  for (const event of timeline) {
    if (event.kind === "open") {
      openAt = event.timestamp;
      continue;
    }

    if (event.kind === "stack-change") {
      const stack = event.stack ?? 0;
      if (stack >= 3 && stack3OpenAt === null) {
        stack3OpenAt = event.timestamp;
      } else if (stack < 3 && stack3OpenAt !== null) {
        stack3Intervals.push({ start: stack3OpenAt, end: event.timestamp });
        stack3OpenAt = null;
      }
      continue;
    }

    if (event.kind === "close") {
      if (openAt !== null) {
        totalAnyStackMs += event.timestamp - openAt;
        openAt = null;
      }
      if (stack3OpenAt !== null) {
        stack3Intervals.push({ start: stack3OpenAt, end: event.timestamp });
        stack3OpenAt = null;
      }
      continue;
    }

    // "refresh": no stack change, nothing to record.
  }

  if (openAt !== null) {
    totalAnyStackMs += fightEnd - openAt;
  }
  if (stack3OpenAt !== null) {
    stack3Intervals.push({ start: stack3OpenAt, end: fightEnd });
  }

  return { totalAnyStackMs, stack3Intervals };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: PASS, all tests including the four new ones.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lifebloomStacks.ts src/metrics/lifebloomStacks.test.ts
git commit -m "feat(lifebloom): extract deriveLifebloomTargetState helper"
```

---

### Task 2: Refactor `lb3Uptime.ts` to use the shared helper

**Files:**

- Modify: `src/metrics/lb3Uptime.ts`
- Test: `src/metrics/lb3Uptime.test.ts` (must NOT need any changes — this is the regression guard)

**Interfaces:**

- Consumes: `deriveLifebloomTargetState` from Task 1 (`src/metrics/lifebloomStacks.ts`).
- Produces: `computeLb3Uptime`'s existing signature and `Lb3UptimeResult`/`Lb3TargetResult` shapes, unchanged — no consumer of this module needs to change.

- [ ] **Step 1: Run the existing test suite first to confirm the baseline passes**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS (all 8 existing tests) — this is the pre-refactor baseline.

- [ ] **Step 2: Replace the internal state machine with the shared helper**

In `src/metrics/lb3Uptime.ts`, replace the whole file's body (keep the two threshold constants and the exported interfaces `Lb3TargetResult`/`Lb3UptimeResult` as-is) with:

```ts
import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import {
  deriveLifebloomTargetState,
  reconstructLifebloomTimelines,
} from "./lifebloomStacks";

// Backlog story 201: targets under 30% any-stack Lifebloom uptime are
// one-off casts, not "maintained" targets, and are excluded entirely.
const MAINTAINED_MIN_UPTIME_PCT = 30;

// R/O/G thresholds per docs/backlog.md story 201: green >= 90%, orange 75-90%, red < 75%.
const GREEN_MIN_PCT = 90;
const ORANGE_MIN_PCT = 75;

export interface Lb3TargetResult {
  targetId: number;
  lbUptimePct: number;
  lb3UptimeMs: number;
  windowMs: number;
  lb3UptimePct: number;
  judgement: Judgement;
}

export interface Lb3UptimeResult {
  targets: Lb3TargetResult[];
}

export function computeLb3Uptime(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): Lb3UptimeResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );

  const fightDurationMs = fightEnd - fightStart;
  const results: Lb3TargetResult[] = [];

  for (const [targetId, timeline] of timelines) {
    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      timeline,
      fightEnd,
    );

    const lbUptimePct = (totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    const firstReached3At =
      stack3Intervals.length > 0 ? stack3Intervals[0].start : null;
    const windowMs =
      firstReached3At === null ? fightDurationMs : fightEnd - firstReached3At;
    const lb3UptimeMs = stack3Intervals.reduce(
      (sum, interval) => sum + (interval.end - interval.start),
      0,
    );
    const lb3UptimePct = windowMs > 0 ? (lb3UptimeMs / windowMs) * 100 : 0;

    results.push({
      targetId,
      lbUptimePct,
      lb3UptimeMs,
      windowMs,
      lb3UptimePct,
      judgement: judgeThreshold(lb3UptimePct, {
        greenMin: GREEN_MIN_PCT,
        orangeMin: ORANGE_MIN_PCT,
      }),
    });
  }

  return { targets: results };
}
```

This removes the old `TargetState`/`newTargetState` internals entirely — `deriveLifebloomTargetState` now owns that state machine.

- [ ] **Step 3: Run the existing test suite to verify no regression**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS, all 8 tests, unmodified — this proves the refactor is behavior-preserving.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lb3Uptime.ts
git commit -m "refactor(lifebloom): compute LB3 uptime from deriveLifebloomTargetState"
```

---

### Task 3: `concurrentLb3Targets.ts` metrics module

**Files:**

- Create: `src/metrics/concurrentLb3Targets.ts`
- Test: `src/metrics/concurrentLb3Targets.test.ts`

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines`, `deriveLifebloomTargetState` from `src/metrics/lifebloomStacks.ts` (Task 1).
- Produces: `export interface ConcurrentLb3Level { count: number; pct: number }`, `export interface ConcurrentLb3Result { avgConcurrent: number; peakConcurrent: number; levels: ConcurrentLb3Level[] }`, `export function computeConcurrentLb3Targets(events: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>, fightStart: number, fightEnd: number): ConcurrentLb3Result`. Task 4 (`ConcurrentTargetsCard`) calls this function directly.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/concurrentLb3Targets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeConcurrentLb3Targets } from "./concurrentLb3Targets";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const LB_IDS = new Set([33763]);

describe("computeConcurrentLb3Targets", () => {
  it("returns zero average/peak and a full-fight level 0 with no events", () => {
    const result = computeConcurrentLb3Targets([], DRUID_ID, LB_IDS, 0, 10000);
    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
    });
  });

  it("computes overlapping windows for two maintained targets", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 3000, stack: 3, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 1.5,
      peakConcurrent: 2,
      levels: [
        { count: 0, pct: 20 },
        { count: 1, pct: 10 },
        { count: 2, pct: 70 },
      ],
    });
  });

  it("computes back-to-back non-overlapping windows for two maintained targets", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 7000, stack: 3, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 0.6,
      peakConcurrent: 1,
      levels: [
        { count: 0, pct: 40 },
        { count: 1, pct: 60 },
      ],
    });
  });

  it("excludes a target below the 30% maintained-uptime threshold even if it reached 3 stacks", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 99 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 99 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 99 }),
      aRemoveBuffEvent({ timestamp: 25000, targetID: 99 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      100000,
    );

    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
    });
  });

  it("closes an interval still open at fightEnd", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      5000,
    );

    expect(result).toEqual({
      avgConcurrent: 0.6,
      peakConcurrent: 1,
      levels: [
        { count: 0, pct: 40 },
        { count: 1, pct: 60 },
      ],
    });
  });

  it("produces a level-3 segment for a three-way overlap", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 25000, stack: 2, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 30000, stack: 3, targetID: 50 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      100000,
    );

    expect(result).toEqual({
      avgConcurrent: 2.4,
      peakConcurrent: 3,
      levels: [
        { count: 0, pct: 10 },
        { count: 1, pct: 10 },
        { count: 2, pct: 10 },
        { count: 3, pct: 70 },
      ],
    });
  });

  it("ignores events from a different caster and non-Lifebloom abilities", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, sourceID: 99 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 3,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: FAIL — module `./concurrentLb3Targets` does not exist.

- [ ] **Step 3: Implement `computeConcurrentLb3Targets`**

Create `src/metrics/concurrentLb3Targets.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import {
  deriveLifebloomTargetState,
  reconstructLifebloomTimelines,
} from "./lifebloomStacks";

// Backlog story 201's "maintained target" filter (>=30% any-stack uptime),
// reused here so a one-off/incidental 3-stack on a non-tank doesn't count as
// a second concurrent target. Kept as an independent constant rather than an
// import from lb3Uptime.ts — see docs/specs/concurrent-lb3-targets-design.md.
const MAINTAINED_MIN_UPTIME_PCT = 30;

export interface ConcurrentLb3Level {
  count: number;
  pct: number;
}

export interface ConcurrentLb3Result {
  avgConcurrent: number;
  peakConcurrent: number;
  levels: ConcurrentLb3Level[];
}

interface Boundary {
  timestamp: number;
  delta: number;
}

export function computeConcurrentLb3Targets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): ConcurrentLb3Result {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;

  const boundaries: Boundary[] = [];

  for (const timeline of timelines.values()) {
    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      timeline,
      fightEnd,
    );
    const lbUptimePct = (totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    for (const interval of stack3Intervals) {
      boundaries.push({ timestamp: interval.start, delta: 1 });
      boundaries.push({ timestamp: interval.end, delta: -1 });
    }
  }

  boundaries.sort((a, b) => a.timestamp - b.timestamp);

  const durationByCount = new Map<number, number>();
  let currentCount = 0;
  let cursor = fightStart;
  let peakConcurrent = 0;
  let weightedSum = 0;

  let i = 0;
  while (i < boundaries.length) {
    const timestamp = boundaries[i].timestamp;
    let delta = 0;
    while (i < boundaries.length && boundaries[i].timestamp === timestamp) {
      delta += boundaries[i].delta;
      i++;
    }

    const sliceMs = timestamp - cursor;
    if (sliceMs > 0) {
      durationByCount.set(
        currentCount,
        (durationByCount.get(currentCount) ?? 0) + sliceMs,
      );
      weightedSum += currentCount * sliceMs;
    }

    currentCount += delta;
    if (currentCount > peakConcurrent) peakConcurrent = currentCount;
    cursor = timestamp;
  }

  const tailMs = fightEnd - cursor;
  if (tailMs > 0) {
    durationByCount.set(
      currentCount,
      (durationByCount.get(currentCount) ?? 0) + tailMs,
    );
    weightedSum += currentCount * tailMs;
  }

  const avgConcurrent = fightDurationMs > 0 ? weightedSum / fightDurationMs : 0;

  const levels: ConcurrentLb3Level[] = [...durationByCount.entries()]
    .filter(([, durationMs]) => durationMs > 0)
    .sort(([a], [b]) => a - b)
    .map(([count, durationMs]) => ({
      count,
      pct: (durationMs / fightDurationMs) * 100,
    }));

  return { avgConcurrent, peakConcurrent, levels };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc -b && npx eslint src/metrics/concurrentLb3Targets.ts src/metrics/concurrentLb3Targets.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/concurrentLb3Targets.ts src/metrics/concurrentLb3Targets.test.ts
git commit -m "feat(lifebloom): add concurrent LB3 targets metric"
```

---

### Task 4: Wire `ConcurrentTargetsCard` to real data, and `Scorecard` to it

**Files:**

- Modify: `src/app/components/ConcurrentTargetsCard/index.tsx`
- Modify (full rewrite): `src/app/components/ConcurrentTargetsCard/index.test.tsx`
- Modify: `src/app/components/Scorecard/index.tsx:134`
- Test: `src/app/components/Scorecard/index.test.tsx` (must NOT need any changes — regression guard)

**Interfaces:**

- Consumes: `computeConcurrentLb3Targets`, `ConcurrentLb3Result` from Task 3 (`src/metrics/concurrentLb3Targets.ts`); `MetricCard` (`src/app/components/ui/MetricCard`); `StackedBar` (`src/app/components/ui/StackedBar`); `Fight` (`src/wcl/client`); `WclEvent`, `WclEventDataType` (`src/wcl/events`); `EventFetcherFight` (`src/wcl/eventCache`).
- Produces: `export interface ConcurrentTargetsCardProps { accessToken: string; reportCode: string; fight: Fight; druidId: number; lifebloomAbilityIds: Set<number>; fetchEvents: (...) => Promise<WclEvent[]> }` and `export function ConcurrentTargetsCard(props: ConcurrentTargetsCardProps)`. `Scorecard/index.tsx` (updated within this same task, Steps 5–8) is the sole renderer of this component.

This task both rewrites the card and updates its one caller (`Scorecard`) in the same task/commit — see the note after Step 4 for why they can't be split across two commits here.

- [ ] **Step 1: Write the failing test (full rewrite)**

Replace the entire contents of `src/app/components/ConcurrentTargetsCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    _dataType: WclEventDataType,
  ): Promise<WclEvent[]> => Promise.resolve(buffEvents);
}

describe("ConcurrentTargetsCard", () => {
  it("shows average, peak, and level breakdown once loaded, with no judgement chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 5000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Concurrent LB3 targets" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Avg 0.6 · Peak 1")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
    expect(screen.getByText("0 targets — 40%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 60%")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: FAIL — the component doesn't accept these props yet / doesn't render `Avg 0.6 · Peak 1`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/app/components/ConcurrentTargetsCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeConcurrentLb3Targets,
  type ConcurrentLb3Result,
} from "../../../metrics/concurrentLb3Targets";
import { MetricCard } from "../ui/MetricCard";
import { StackedBar } from "../ui/StackedBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface ConcurrentTargetsCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: ConcurrentLb3Result }
  | { accessToken: string; error: string };

const THRESHOLD =
  "No R/O/G — the right number of concurrent targets depends on your assignments, not a universal target.";

const LEVEL_COLORS = [
  "var(--border)",
  "var(--accent-border)",
  "var(--accent)",
  "var(--purple-600)",
];

function colorForLevel(count: number): string {
  return LEVEL_COLORS[Math.min(count, LEVEL_COLORS.length - 1)];
}

export function ConcurrentTargetsCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
}: ConcurrentTargetsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then((events) => {
        const computed = computeConcurrentLb3Targets(
          events,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate concurrent LB3 targets.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Concurrent LB3 targets"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Concurrent LB3 targets"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { avgConcurrent, peakConcurrent, levels } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Concurrent LB3 targets"
      value={`Avg ${avgConcurrent.toFixed(1)} · Peak ${peakConcurrent}`}
      note="Informational — no judgement"
      threshold={THRESHOLD}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        How many targets simultaneously had your LB3, as a share of the fight.
        Maintaining multiple tanks at once is recognized as the skill it is.
      </p>
      <StackedBar
        segments={levels.map((level) => ({
          label: `${level.count} target${level.count === 1 ? "" : "s"}`,
          pct: level.pct,
          color: colorForLevel(level.count),
        }))}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: PASS, all 3 tests.

`ConcurrentTargetsCard` is already rendered (props-less) inside `Scorecard`, so this task is not commit-safe until `Scorecard/index.tsx` is also updated — the pre-commit hook's project-wide typecheck would otherwise fail on `Scorecard`'s now-mismatched usage. Steps 5–8 below fix that in the same task before committing.

- [ ] **Step 5: Update `Scorecard` to pass the new required props**

In `src/app/components/Scorecard/index.tsx`, replace line 134 (`<ConcurrentTargetsCard />`) with:

```tsx
<ConcurrentTargetsCard
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 6: Run the Scorecard test to verify it still passes**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (the single existing test, unmodified — it uses a `fetchEvents` stub that resolves `[]` for every data type, which `computeConcurrentLb3Targets` handles fine, returning `{ avgConcurrent: 0, peakConcurrent: 0, levels: [{ count: 0, pct: 100 }] }`).

- [ ] **Step 7: Run the full test suite, typecheck, and lint**

Run: `npx vitest run && npx tsc -b && npx eslint .`
Expected: all PASS, no errors — this confirms nothing else in the tree still references the old no-prop `ConcurrentTargetsCard` signature.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/ConcurrentTargetsCard/index.tsx src/app/components/ConcurrentTargetsCard/index.test.tsx src/app/components/Scorecard/index.tsx
git commit -m "feat(lifebloom): wire ConcurrentTargetsCard to real concurrency data"
```

---

### Task 5: Close out story 205 (docs)

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/concurrent-lb3-targets-design.md`
- Delete: `docs/plans/concurrent-lb3-targets-plan.md` (this file — deleted once execution is complete, per CLAUDE.md's "a story isn't done until its paperwork is retired")

**Interfaces:** None — documentation only.

- [ ] **Step 1: Confirm nothing else references the spec or plan files**

Run: `grep -rn "concurrent-lb3-targets-design\|concurrent-lb3-targets-plan" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only this plan's own self-reference (if any) and no other file pointing at either doc.

- [ ] **Step 2: Mark story 205 done in the backlog**

In `docs/backlog.md`, change the heading:

```diff
-### 205 — Concurrent LB3 targets
+### 205 — Concurrent LB3 targets ✅ Done
```

- [ ] **Step 3: Update `CLAUDE.md`'s Repo state paragraph**

In `CLAUDE.md`, in the "## Repo state" section, replace:

```
...story 203 (accidental bloom counter), and story 204 (re-stack tax) are complete and live. Phase 1 MVP work continues with backlog story 205 (concurrent LB3 targets) next.
```

with:

```
...story 203 (accidental bloom counter), story 204 (re-stack tax), and story 205 (concurrent LB3 targets) are complete and live. Phase 1 MVP work continues with backlog story 701 (single-fight scorecard) next.
```

(i.e. insert "story 204 (re-stack tax), and story 205 (concurrent LB3 targets)" in place of "and story 204 (re-stack tax)", and update the trailing "next" story reference from 205 to 701, matching `docs/backlog.md`'s suggested path.)

- [ ] **Step 4: Delete the retired spec and plan files**

```bash
git rm docs/specs/concurrent-lb3-targets-design.md docs/plans/concurrent-lb3-targets-plan.md
```

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 205 (concurrent LB3 targets)"
```

---

## Final verification

After Task 5, run the full gate once more to confirm the tree is clean:

```bash
npx vitest run && npx tsc -b && npx eslint . && npx prettier --check .
```

Expected: all PASS.
