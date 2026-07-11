# Refresh Cadence Histogram (Story 202) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship backlog story 202 — a histogram (with median R/O/G) of intervals between Lifebloom refreshes on already-3-stacked targets, replacing the static `RefreshCadenceCard` placeholder with a live computed metric.

**Architecture:** Extract the per-target Lifebloom stack-reconstruction logic already inside `lb3Uptime.ts` into a shared `lifebloomStacks.ts` module (both 201 and 202 build on it, and the backlog's 202-205 ordering note flags 203-205 as needing it too), refactor `lb3Uptime.ts` to consume it with no behavior change, add a new `refreshCadence.ts` metric on top of the same shared timeline, and wire the existing placeholder card to the real computation the same way `LB3UptimeCard` already works.

**Tech Stack:** TypeScript, React 19, Vitest, React Testing Library. No new dependencies.

Full design context: `docs/specs/refresh-cadence-design.md` (deleted by Task 5, per this project's "a story isn't done until its paperwork is retired" convention — read it now if you want the real-data investigation behind the dedup rule, it won't exist after Task 5).

## Global Constraints

- Spell/ability IDs are never hardcoded in production code — `lifebloomAbilityIds` is always a caller-supplied `Set<number>` resolved elsewhere (story 007). Only test fixtures use literal IDs (Lifebloom = `33763`).
- Every R/O/G threshold constant needs a comment pointing at its `docs/backlog.md` story rationale (CLAUDE.md principle 3).
- No server-side code, no secrets — this plan only touches browser-side TypeScript/React and Markdown docs.
- Commit messages follow Conventional Commits (`type(scope): summary`); this plan uses scope `lifebloom` for metric changes and `app` for the component change.
- `npm run typecheck && npm run lint && npm run format:check` must pass before every commit — the pre-commit hook enforces this full-project on every commit. Never bypass it with `--no-verify`.
- Run `npm test` (Tiers 1-3, all `*.test.ts`/`*.test.tsx` files) after every task; every existing test must stay green — `lb3Uptime.test.ts` in particular is the regression check on Task 2's refactor and must not be edited.
- A story isn't done until its spec is deleted and `docs/backlog.md`/`CLAUDE.md` reflect the new state — Task 5 does this in one commit.

---

### Task 1: Shared Lifebloom stack-timeline reconstruction

**Files:**

- Create: `src/metrics/lifebloomStacks.ts`
- Test: `src/metrics/lifebloomStacks.test.ts`

**Interfaces:**

- Consumes: `WclEvent` from `src/wcl/events.ts` (fields used: `timestamp`, `type`, `sourceID`, `targetID`, `abilityGameID`, `stack`).
- Produces (used by Tasks 2 and 3):

  ```ts
  export type LifebloomTimelineEventKind =
    "open" | "stack-change" | "close" | "refresh";

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

  The returned `Map`'s iteration order is first-seen-target order (insertion order), same guarantee `lb3Uptime.ts` currently builds itself via a manual `targetOrder` array.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/lifebloomStacks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("reconstructLifebloomTimelines", () => {
  it("reproduces the real captured sequence from report 4GYHZRdtL3bvhpc8 fight 6", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 1880312, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1881811, stack: 2, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1881811, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1883327, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1883327, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1889731, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1896347, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1903349, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 1880312, kind: "open" },
      { timestamp: 1881811, kind: "stack-change", stack: 2 },
      { timestamp: 1883327, kind: "stack-change", stack: 3 },
      { timestamp: 1889731, kind: "refresh" },
      { timestamp: 1896347, kind: "refresh" },
      { timestamp: 1903349, kind: "close" },
    ]);
  });

  it("keeps a solo refreshbuff as a genuine refresh when there's no co-occurring stack change", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 5000, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 5000, kind: "refresh" },
    ]);
  });

  it("tracks multiple targets independently, preserving first-seen order", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffEvent({ timestamp: 100, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 200, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 300, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect([...timelines.keys()]).toEqual([47, 42]);
    expect(timelines.get(47)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 200, kind: "close" },
    ]);
    expect(timelines.get(42)).toEqual([
      { timestamp: 100, kind: "open" },
      { timestamp: 300, kind: "close" },
    ]);
  });

  it("emits a second open/close pair after a drop and re-ramp on the same target", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 500, kind: "stack-change", stack: 2 },
      { timestamp: 1000, kind: "stack-change", stack: 3 },
      { timestamp: 3000, kind: "close" },
      { timestamp: 5000, kind: "open" },
      { timestamp: 5500, kind: "stack-change", stack: 2 },
      { timestamp: 6000, kind: "stack-change", stack: 3 },
      { timestamp: 9000, kind: "close" },
    ]);
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

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: FAIL — `Cannot find module './lifebloomStacks'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/metrics/lifebloomStacks.ts`:

```ts
import type { WclEvent } from "../wcl/events";

export type LifebloomTimelineEventKind =
  "open" | "stack-change" | "close" | "refresh";

export interface LifebloomTimelineEvent {
  timestamp: number;
  kind: LifebloomTimelineEventKind;
  stack?: number;
}

interface RawGroup {
  timestamp: number;
  hasApplyBuff: boolean;
  hasRemoveBuff: boolean;
  stackChangeValue: number | null;
  hasRefreshBuff: boolean;
}

// Reconstructs each target's chronological Lifebloom timeline from raw
// applybuff/applybuffstack/refreshbuff/removebuff events. WCL fires a
// refreshbuff at the same timestamp as every applybuffstack (an echo of
// the duration refresh that always accompanies a stack change) - that
// echo carries no information beyond the stack-change event itself and
// is dropped. A genuine 3-stack maintenance refresh shows up as a solo
// refreshbuff, with no co-occurring applybuffstack. Events are grouped
// by exact timestamp (not a running lookback) since WCL doesn't
// document sub-order for same-timestamp events.
export function reconstructLifebloomTimelines(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): Map<number, LifebloomTimelineEvent[]> {
  const groupsByTarget = new Map<number, Map<number, RawGroup>>();
  const targetOrder: number[] = [];

  for (const event of events) {
    if (event.sourceID !== druidId) continue;
    if (event.abilityGameID === undefined) continue;
    if (!lifebloomAbilityIds.has(event.abilityGameID)) continue;
    if (event.targetID === undefined) continue;

    let groups = groupsByTarget.get(event.targetID);
    if (!groups) {
      groups = new Map<number, RawGroup>();
      groupsByTarget.set(event.targetID, groups);
      targetOrder.push(event.targetID);
    }

    let group = groups.get(event.timestamp);
    if (!group) {
      group = {
        timestamp: event.timestamp,
        hasApplyBuff: false,
        hasRemoveBuff: false,
        stackChangeValue: null,
        hasRefreshBuff: false,
      };
      groups.set(event.timestamp, group);
    }

    if (event.type === "applybuff") {
      group.hasApplyBuff = true;
    } else if (event.type === "applybuffstack") {
      group.stackChangeValue =
        typeof event.stack === "number" ? event.stack : null;
    } else if (event.type === "removebuff") {
      group.hasRemoveBuff = true;
    } else if (event.type === "refreshbuff") {
      group.hasRefreshBuff = true;
    }
  }

  const result = new Map<number, LifebloomTimelineEvent[]>();

  for (const targetId of targetOrder) {
    const groups = groupsByTarget.get(targetId);
    if (!groups) continue;

    const sortedGroups = [...groups.values()].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const timeline: LifebloomTimelineEvent[] = [];
    for (const group of sortedGroups) {
      if (group.hasApplyBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "open" });
      } else if (group.stackChangeValue !== null) {
        timeline.push({
          timestamp: group.timestamp,
          kind: "stack-change",
          stack: group.stackChangeValue,
        });
      } else if (group.hasRemoveBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "close" });
      } else if (group.hasRefreshBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "refresh" });
      }
    }
    result.set(targetId, timeline);
  }

  return result;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lifebloomStacks.ts src/metrics/lifebloomStacks.test.ts
git commit -m "feat(lifebloom): add shared stack-timeline reconstruction"
```

---

### Task 2: Refactor `lb3Uptime.ts` onto the shared timeline

**Files:**

- Modify: `src/metrics/lb3Uptime.ts` (full rewrite of the internals; public API unchanged)
- Test: `src/metrics/lb3Uptime.test.ts` — **do not modify.** It is the regression check for this task.

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines`, `LifebloomTimelineEvent` from Task 1's `src/metrics/lifebloomStacks.ts`.
- Produces: no change — `computeLb3Uptime(events, druidId, lifebloomAbilityIds, fightStart, fightEnd): Lb3UptimeResult` keeps its exact existing signature and `Lb3UptimeResult`/`Lb3TargetResult` shapes, since `LB3UptimeCard` and `lb3Uptime.test.ts` both depend on them unchanged.

- [ ] **Step 1: Read the current file for reference**

Run: `cat src/metrics/lb3Uptime.ts` — confirm it still matches the version this plan was written against (a per-target `TargetState` walking raw `WclEvent`s directly, with `currentStack`, `openAt`, `stack3OpenAt`, `firstReached3At`, `totalAnyStackMs`, `totalStack3Ms` fields). If it's drifted, stop and re-read `docs/specs/refresh-cadence-design.md`'s "lb3Uptime.ts refactor" section before proceeding.

- [ ] **Step 2: Replace the implementation**

Replace the full contents of `src/metrics/lb3Uptime.ts` with:

```ts
import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

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

interface TargetState {
  openAt: number | null;
  stack3OpenAt: number | null;
  firstReached3At: number | null;
  totalAnyStackMs: number;
  totalStack3Ms: number;
}

function newTargetState(): TargetState {
  return {
    openAt: null,
    stack3OpenAt: null,
    firstReached3At: null,
    totalAnyStackMs: 0,
    totalStack3Ms: 0,
  };
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
    const state = newTargetState();

    for (const event of timeline) {
      if (event.kind === "open") {
        state.openAt = event.timestamp;
        continue;
      }

      if (event.kind === "stack-change") {
        const stack = event.stack ?? 0;
        if (stack >= 3 && state.stack3OpenAt === null) {
          state.stack3OpenAt = event.timestamp;
          if (state.firstReached3At === null) {
            state.firstReached3At = event.timestamp;
          }
        } else if (stack < 3 && state.stack3OpenAt !== null) {
          state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
          state.stack3OpenAt = null;
        }
        continue;
      }

      if (event.kind === "close") {
        if (state.openAt !== null) {
          state.totalAnyStackMs += event.timestamp - state.openAt;
          state.openAt = null;
        }
        if (state.stack3OpenAt !== null) {
          state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
          state.stack3OpenAt = null;
        }
        continue;
      }

      // "refresh": no stack change, nothing to record.
    }

    if (state.openAt !== null) {
      state.totalAnyStackMs += fightEnd - state.openAt;
      state.openAt = null;
    }
    if (state.stack3OpenAt !== null) {
      state.totalStack3Ms += fightEnd - state.stack3OpenAt;
      state.stack3OpenAt = null;
    }

    const lbUptimePct = (state.totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    const windowMs =
      state.firstReached3At === null
        ? fightDurationMs
        : fightEnd - state.firstReached3At;
    const lb3UptimeMs = state.totalStack3Ms;
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

- [ ] **Step 3: Run `lb3Uptime.test.ts` and confirm it still passes, unmodified**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS (all 7 existing tests, no edits made to the test file).

- [ ] **Step 4: Run the full test suite as a broader regression check**

Run: `npm test`
Expected: PASS (no other file references `lb3Uptime.ts`'s internals — only its unchanged public API — so nothing else should be affected).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lb3Uptime.ts
git commit -m "refactor(lifebloom): rebuild computeLb3Uptime on the shared stack timeline"
```

---

### Task 3: `refreshCadence.ts` metric

**Files:**

- Create: `src/metrics/refreshCadence.ts`
- Test: `src/metrics/refreshCadence.test.ts`

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines` from Task 1's `src/metrics/lifebloomStacks.ts`; `Judgement` from `src/metrics/judgement.ts`.
- Produces (used by Task 4):

  ```ts
  export type RefreshCadenceBucketLabel = "early" | "ideal" | "late";

  export interface RefreshCadenceBucket {
    label: RefreshCadenceBucketLabel;
    count: number;
    pct: number;
  }

  export interface RefreshCadenceResult {
    intervalCount: number;
    medianMs: number | null; // null only when intervalCount is 0
    judgement: Judgement | null; // null only when intervalCount is 0
    buckets: RefreshCadenceBucket[]; // always exactly 3 entries: early, ideal, late
  }

  export function computeRefreshCadence(
    events: WclEvent[],
    druidId: number,
    lifebloomAbilityIds: Set<number>,
  ): RefreshCadenceResult;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/refreshCadence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRefreshCadence } from "./refreshCadence";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("computeRefreshCadence", () => {
  it("reproduces the real captured sequence from report 4GYHZRdtL3bvhpc8 fight 6", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 1880312, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1881811, stack: 2, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1881811, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1883327, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1883327, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1889731, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1896347, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1903349, targetID: 42 }),
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(2);
    expect(result.medianMs).toBe(6510); // (6404 + 6616) / 2
    expect(result.judgement).toBe("green");
    expect(result.buckets).toEqual([
      { label: "early", count: 0, pct: 0 },
      { label: "ideal", count: 2, pct: 100 },
      { label: "late", count: 0, pct: 0 },
    ]);
  });

  it("counts the interval from reaching 3 stacks to the first refresh", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 7000, targetID: 42 }),
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(1);
    expect(result.medianMs).toBe(6000);
  });

  it("buckets intervals at the early/ideal/late boundaries, pooled across targets", () => {
    const reach3For = (targetID: number) => [
      anApplyBuffEvent({ timestamp: 0, targetID }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID }),
    ];

    const events = [
      ...reach3For(42),
      aRefreshBuffEvent({ timestamp: 200 + 5499, targetID: 42 }), // early
      ...reach3For(43),
      aRefreshBuffEvent({ timestamp: 200 + 5500, targetID: 43 }), // ideal, lower edge
      ...reach3For(44),
      aRefreshBuffEvent({ timestamp: 200 + 7000, targetID: 44 }), // ideal, upper edge
      ...reach3For(45),
      aRefreshBuffEvent({ timestamp: 200 + 7001, targetID: 45 }), // late
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(4);
    expect(result.buckets).toEqual([
      { label: "early", count: 1, pct: 25 },
      { label: "ideal", count: 2, pct: 50 },
      { label: "late", count: 1, pct: 25 },
    ]);
  });

  it("computes the median for an odd number of intervals", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 12200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 20200, targetID: 42 }), // interval 8000
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(3);
    expect(result.medianMs).toBe(6000);
  });

  it("computes the median for an even number of intervals", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 12700, targetID: 42 }), // interval 6500
      aRefreshBuffEvent({ timestamp: 19700, targetID: 42 }), // interval 7000
      aRefreshBuffEvent({ timestamp: 27700, targetID: 42 }), // interval 8000
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(4);
    // sorted: [6000, 6500, 7000, 8000] -> median (6500 + 7000) / 2
    expect(result.medianMs).toBe(6750);
  });

  it("judges the median red below 5s, orange 5-6s, green 6-7s, and red above 7s", () => {
    const singleIntervalResult = (intervalMs: number) => {
      const events = [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
        aRefreshBuffEvent({ timestamp: 200 + intervalMs, targetID: 42 }),
      ];
      return computeRefreshCadence(events, 2, LB_IDS);
    };

    expect(singleIntervalResult(4999).judgement).toBe("red");
    expect(singleIntervalResult(5000).judgement).toBe("orange");
    expect(singleIntervalResult(5999).judgement).toBe("orange");
    expect(singleIntervalResult(6000).judgement).toBe("green");
    expect(singleIntervalResult(7000).judgement).toBe("green");
    expect(singleIntervalResult(7001).judgement).toBe("red");
  });

  it("does not record a trailing interval when the window closes via removebuff (a bloom)", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // one genuine interval: 6000
      aRemoveBuffEvent({ timestamp: 15000, targetID: 42 }), // bloom, no interval for this gap
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(1);
    expect(result.medianMs).toBe(6000);
  });

  it("starts a fresh window after a drop and re-ramp, not chaining across the gap", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 20000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 20100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 20200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 26700, targetID: 42 }), // interval 6500, anchored at 20200
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(2);
    expect(result.buckets.map((bucket) => bucket.count)).toEqual([0, 2, 0]);
  });

  it("returns null median/judgement and zeroed buckets when no 3-stack refresh ever happened", () => {
    const events = [anApplyBuffEvent({ timestamp: 0, targetID: 42 })];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result).toEqual({
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [
        { label: "early", count: 0, pct: 0 },
        { label: "ideal", count: 0, pct: 0 },
        { label: "late", count: 0, pct: 0 },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/metrics/refreshCadence.test.ts`
Expected: FAIL — `Cannot find module './refreshCadence'`.

- [ ] **Step 3: Write the implementation**

Create `src/metrics/refreshCadence.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

// Bucket boundaries per docs/backlog.md story 202.
const EARLY_MAX_MS = 5500; // < 5.5s
const IDEAL_MAX_MS = 7000; // 5.5-7s inclusive; > 7s is "late"

// Median R/O/G per docs/backlog.md story 202: green 6-7s, orange 5-6s.
// A median above 7s is judged red, not just "not green" - refreshing
// consistently late correlates with near-bloom timing, treated as
// severely as refreshing too eagerly. Actual blooms are counted
// separately by story 203's accidental-bloom counter.
const GREEN_MIN_MS = 6000;
const GREEN_MAX_MS = 7000;
const ORANGE_MIN_MS = 5000;

export type RefreshCadenceBucketLabel = "early" | "ideal" | "late";

export interface RefreshCadenceBucket {
  label: RefreshCadenceBucketLabel;
  count: number;
  pct: number;
}

export interface RefreshCadenceResult {
  intervalCount: number;
  medianMs: number | null;
  judgement: Judgement | null;
  buckets: RefreshCadenceBucket[];
}

function judgeMedianCadence(medianMs: number): Judgement {
  if (medianMs > GREEN_MAX_MS) return "red";
  if (medianMs >= GREEN_MIN_MS) return "green";
  if (medianMs >= ORANGE_MIN_MS) return "orange";
  return "red";
}

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

export function computeRefreshCadence(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): RefreshCadenceResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );

  const intervalsMs: number[] = [];

  for (const timeline of timelines.values()) {
    let currentStack = 0;
    let anchorAt: number | null = null;

    for (const event of timeline) {
      if (event.kind === "open") {
        currentStack = 1;
        anchorAt = null;
        continue;
      }

      if (event.kind === "stack-change") {
        currentStack = event.stack ?? currentStack;
        if (currentStack >= 3 && anchorAt === null) {
          anchorAt = event.timestamp;
        }
        continue;
      }

      if (event.kind === "refresh") {
        if (currentStack >= 3 && anchorAt !== null) {
          intervalsMs.push(event.timestamp - anchorAt);
          anchorAt = event.timestamp;
        }
        continue;
      }

      // "close"
      currentStack = 0;
      anchorAt = null;
    }
  }

  const bucketCounts: Record<RefreshCadenceBucketLabel, number> = {
    early: 0,
    ideal: 0,
    late: 0,
  };

  for (const intervalMs of intervalsMs) {
    if (intervalMs < EARLY_MAX_MS) {
      bucketCounts.early += 1;
    } else if (intervalMs <= IDEAL_MAX_MS) {
      bucketCounts.ideal += 1;
    } else {
      bucketCounts.late += 1;
    }
  }

  const intervalCount = intervalsMs.length;
  const buckets: RefreshCadenceBucket[] = (
    ["early", "ideal", "late"] as const
  ).map((label) => ({
    label,
    count: bucketCounts[label],
    pct:
      intervalCount === 0
        ? 0
        : Math.round((bucketCounts[label] / intervalCount) * 100),
  }));

  if (intervalCount === 0) {
    return { intervalCount, medianMs: null, judgement: null, buckets };
  }

  const medianMs = median([...intervalsMs].sort((a, b) => a - b));

  return {
    intervalCount,
    medianMs,
    judgement: judgeMedianCadence(medianMs),
    buckets,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/metrics/refreshCadence.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/refreshCadence.ts src/metrics/refreshCadence.test.ts
git commit -m "feat(lifebloom): add refresh-cadence histogram metric"
```

---

### Task 4: Wire `RefreshCadenceCard` to the real metric

**Files:**

- Modify: `src/app/components/RefreshCadenceCard/index.tsx` (full rewrite — currently a static placeholder)
- Modify: `src/app/components/RefreshCadenceCard/index.test.tsx` (full rewrite — currently tests the static placeholder)
- Modify: `src/app/components/Scorecard/index.tsx` (pass real props to `<RefreshCadenceCard>` instead of none)

**Interfaces:**

- Consumes: `computeRefreshCadence`, `RefreshCadenceResult`, `RefreshCadenceBucketLabel` from Task 3's `src/metrics/refreshCadence.ts`; `Fight` from `src/wcl/client.ts`; `WclEvent`, `WclEventDataType` from `src/wcl/events.ts`; `EventFetcherFight` from `src/wcl/eventCache.ts`; `MetricCard` and `Histogram` from `src/app/components/ui/`.
- Produces: `RefreshCadenceCard` component with props `{ accessToken: string; reportCode: string; fight: Fight; druidId: number; lifebloomAbilityIds: Set<number>; fetchEvents: (accessToken, reportCode, fight, dataType) => Promise<WclEvent[]> }` — same prop shape `LB3UptimeCard` already takes, minus `targetNames`.

- [ ] **Step 1: Write the failing component tests**

Replace the full contents of `src/app/components/RefreshCadenceCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefreshCadenceCard } from "./index";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

describe("RefreshCadenceCard", () => {
  it("renders the median, judgement, and histogram once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 20000 });
    const events = [
      anApplyBuffEvent({ timestamp: 1880312, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1881811, stack: 2, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1881811, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1883327, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1883327, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1889731, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1896347, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1903349, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Refresh cadence" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Median 6.5s")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
  });

  it("shows a message when no 3-stack refreshes happened", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 20000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No 3-stack refreshes recorded this fight."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <RefreshCadenceCard
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
      <RefreshCadenceCard
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

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/app/components/RefreshCadenceCard/index.test.tsx`
Expected: FAIL — the old placeholder test assertions no longer match (e.g. no `accessToken`/`fetchEvents` props accepted yet, "Sample — not yet computed" text gone from the new test's expectations, "Median 6.5s" not yet rendered).

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `src/app/components/RefreshCadenceCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeRefreshCadence,
  type RefreshCadenceResult,
  type RefreshCadenceBucketLabel,
} from "../../../metrics/refreshCadence";
import { MetricCard } from "../ui/MetricCard";
import { Histogram } from "../ui/Histogram";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface RefreshCadenceCardProps {
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
  | { accessToken: string; result: RefreshCadenceResult }
  | { accessToken: string; error: string };

const BUCKET_LABEL: Record<RefreshCadenceBucketLabel, string> = {
  early: "Early (< 5.5s)",
  ideal: "Ideal (5.5–7s)",
  late: "Late (> 7s)",
};

const BUCKET_COLOR: Record<RefreshCadenceBucketLabel, string> = {
  early: "var(--judgement-orange)",
  ideal: "var(--judgement-green)",
  late: "var(--judgement-red)",
};

const THRESHOLD =
  "Only refreshes on targets already at 3 stacks count. Buckets: < 5.5s early, 5.5–7s ideal, > 7s late. Median R/O/G: green 6–7s, orange 5–6s, red < 5s or > 7s — a late median risks accidental blooms, counted separately by the accidental-bloom counter below.";

export function RefreshCadenceCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
}: RefreshCadenceCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then((events) => {
        const computed = computeRefreshCadence(
          events,
          druidId,
          lifebloomAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate refresh cadence.",
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
        title="Refresh cadence"
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
        title="Refresh cadence"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { result: cadence } = result;

  if (cadence.medianMs === null) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Refresh cadence"
        threshold={THRESHOLD}
      >
        <p>No 3-stack refreshes recorded this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Refresh cadence"
      value={`Median ${(cadence.medianMs / 1000).toFixed(1)}s`}
      judgement={cadence.judgement}
      threshold={THRESHOLD}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 4px" }}>
        Interval between your Lifebloom refreshes on 3-stacked targets — too
        early wastes mana and GCDs, too late risks an accidental bloom.
      </p>
      <Histogram
        buckets={cadence.buckets.map((bucket) => ({
          label: BUCKET_LABEL[bucket.label],
          pct: bucket.pct,
          color: BUCKET_COLOR[bucket.label],
        }))}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the component tests and confirm they pass**

Run: `npx vitest run src/app/components/RefreshCadenceCard/index.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire real props through `Scorecard`**

In `src/app/components/Scorecard/index.tsx`, find:

```tsx
<RefreshCadenceCard />
```

Replace with:

```tsx
<RefreshCadenceCard
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS. `src/app/components/Scorecard/index.test.tsx` only asserts the "Refresh cadence" heading exists (not placeholder-specific text), so it passes unmodified with the card now live and receiving an empty `fetchEvents` result (renders the "No 3-stack refreshes recorded this fight." empty state, which the Scorecard test doesn't assert against).

- [ ] **Step 7: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/RefreshCadenceCard/index.tsx src/app/components/RefreshCadenceCard/index.test.tsx src/app/components/Scorecard/index.tsx
git commit -m "feat(app): wire RefreshCadenceCard to real refresh-cadence data"
```

---

### Task 5: Close out story 202

**Files:**

- Modify: `docs/testing.md` (append to the `4GYHZRdtL3bvhpc8` row's "Notable for" cell)
- Modify: `docs/backlog.md` (mark story 202 done)
- Modify: `CLAUDE.md` (update the "Repo state" paragraph)
- Delete: `docs/specs/refresh-cadence-design.md`

**Interfaces:** none — this task only edits Markdown.

- [ ] **Step 1: Update `docs/testing.md`**

Find the `4GYHZRdtL3bvhpc8` row in the "Known real test reports" table (its "Notable for" cell currently ends with `...proved story 005's detection must gate on healing-cast count, not WCL's own spec label.`). Append a new sentence to that same cell (keep it one table cell, one row — do not add a new row for the same report code):

```
Also validated (fight 6, Dassz's Lifebloom) that `refreshbuff` co-fires with `applybuffstack` on every stack increase, and fires solo only when refreshing at an already-maxed stack — the dedup rule story 202's refresh-cadence histogram depends on.
```

- [ ] **Step 2: Mark story 202 done in `docs/backlog.md`**

Find:

```
### 202 — Refresh cadence histogram
```

Replace with:

```
### 202 — Refresh cadence histogram ✅ Done
```

- [ ] **Step 3: Update `CLAUDE.md`'s "Repo state" section**

Find:

```
and story 201 (LB3 uptime per target) are complete and live. Phase 1 MVP work continues with backlog story 202 (refresh cadence histogram) next.
```

Replace with:

```
story 201 (LB3 uptime per target), and story 202 (refresh cadence histogram) are complete and live. Phase 1 MVP work continues with backlog story 203 (accidental bloom counter) next.
```

(Note: the word "and" moves — the sentence now lists three trailing items instead of two, so drop the "and" before "story 201" as well, i.e. `..., story 201 (LB3 uptime per target), and story 202 (refresh cadence histogram) are complete...`. Read the surrounding sentence first so the list still reads grammatically.)

- [ ] **Step 4: Delete the spec**

```bash
git rm docs/specs/refresh-cadence-design.md
```

- [ ] **Step 5: Confirm nothing else references the deleted spec**

Run: `grep -r "refresh-cadence-design" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: no output (besides possibly this plan file itself, which is fine — the plan document isn't required reading after execution).

- [ ] **Step 6: Final full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add docs/testing.md docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 202 (refresh cadence histogram)"
```
