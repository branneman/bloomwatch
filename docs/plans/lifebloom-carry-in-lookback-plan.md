# Lifebloom Pre-Pull Carry-In Lookback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve backlog story 915 — when a target's Lifebloom timeline opens mid-stream (carry-in from before `fightStart`), fetch a bounded 60s lookback window and resolve the real prior stack state instead of always reading "0% LB3 uptime, bad."

**Architecture:** A new pure detector (`detectCarryInTargets`) flags which targets need a lookback, based only on already-fetched fight-window events. A new pure resolver (`resolveCarryInTimeline`) merges a lookback-window timeline with the fight-window timeline, producing either a resolved timeline (synthetic `open`/`stack-change` at exactly `fightStart`) or `null` if still ambiguous. `computeLb3Uptime` and `computeConcurrentLb3Targets` each gain one new optional parameter to consume this. Orchestration (4 call sites: `LB3UptimeCard`, `ConcurrentTargetsCard`, `useLifebloomDisciplineSummary`, `scripts/lib/calibrateReport.ts`) detects ambiguity, conditionally fires a **second, uncached, `fightIDs`-less** events fetch, and threads the result through.

**Critical live-verified finding this plan depends on:** WCL's `events` query, when given `fightIDs: [N]`, **never returns events before fight N's own `startTime`**, no matter how far back the query's own `startTime` argument reaches — confirmed against real report `DRtXV4ChA2Kw3c81` (fights 24→25, a wipe-then-kill pair on M'uru): querying `fightIDs: [25]` for the 60s before fight 25's start returned 0 events, while the identical time window with `fightIDs` omitted entirely returned 1 event correctly tagged `fight: 24`. **The lookback fetch must never pass a `fightIDs` filter.** This is why it needs a brand-new low-level fetch function rather than reusing `fetchEventsPage`.

**Tech Stack:** TypeScript, React, Vitest, `tsx` (scripts).

## Global Constraints

- Spell/ability IDs are never hardcoded — Lifebloom's two known game IDs (`33763`, `33778`) are already resolved at runtime elsewhere; this plan doesn't add any new hardcoded ID.
- `compute*` functions in `src/metrics/*.ts` stay pure and synchronous — no fetching inside them. All I/O (including the new conditional lookback fetch) lives in the calling hooks/components/script.
- The lookback fetch must fire **only when ambiguity is detected** for at least one target in a fight — never unconditionally (story 010's request-count discipline).
- `docs/thresholds.md` gets a dated note once this ships; `docs/backlog.md` story 915 flips to `✅ Done` and this plan file is deleted in the same final commit, per this repo's "a story isn't done until its paperwork is retired" rule.
- Every new/changed `compute*` signature must be checked against **both** its UI consumer(s) and `scripts/lib/calibrateReport.ts` — `npm run typecheck` covers both (it includes `tsconfig.scripts.json`).

---

### Task 1: Low-level `fightIDs`-less events fetch (`src/wcl/events.ts`)

**Files:**

- Modify: `src/wcl/events.ts`

**Interfaces:**

- Produces: `fetchLookbackEventsPage(accessToken: string, reportCode: string, dataType: WclEventDataType, startTime: number, endTime: number, includeResources = false): Promise<WclEventsPage>` — same `WclEventsPage` shape as `fetchEventsPage`, but the GraphQL query omits the `fightIDs` argument entirely.

- [ ] **Step 1: Add `fetchLookbackEventsPage` next to `fetchEventsPage`**

Add this function to `src/wcl/events.ts`, right after the existing `fetchEventsPage`:

```typescript
// Used only for backlog story 915's bounded pre-pull lookback: querying
// with a fightIDs filter never returns events before that fight's own
// startTime, even with an earlier startTime argument (confirmed live
// against report DRtXV4ChA2Kw3c81, fights 24->25 - a fightIDs-filtered
// query for the 60s before fight 25 returned nothing, while the same
// window with fightIDs omitted correctly returned an event tagged to the
// earlier fight 24). Omitting fightIDs is therefore load-bearing, not
// cosmetic - it's the only way to see a carry-in application that lives
// in a different WCL fight ID than the one being judged.
export async function fetchLookbackEventsPage(
  accessToken: string,
  reportCode: string,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
): Promise<WclEventsPage> {
  let data;
  try {
    data = await postGraphQL(
      accessToken,
      `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      events(dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
    );
  } catch (err) {
    if (err instanceof WclApiError && err.status === 429) {
      throw new WclRateLimitError(err.status, err.body);
    }
    throw err;
  }
  const events = data.reportData.report.events;
  return {
    events: events.data,
    nextPageTimestamp: events.nextPageTimestamp,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this is an additive export, no existing signature touched).

- [ ] **Step 3: Commit**

```bash
git add src/wcl/events.ts
git commit -m "feat(wcl-client): add fightIDs-less events fetch for lookback queries"
```

---

### Task 2: `createEventFetcher` gains `fetchLookbackEvents`

**Files:**

- Modify: `src/wcl/eventCache.ts`
- Test: `src/wcl/eventCache.test.ts`

**Interfaces:**

- Consumes: `fetchLookbackEventsPage` from Task 1 (injectable, matching the existing `fetchPage` DI pattern already used for `fetchEventsPage`).
- Produces: `createEventFetcher(...)` returns `{ fetchEvents, fetchLookbackEvents }`, where `fetchLookbackEvents(accessToken: string, reportCode: string, dataType: WclEventDataType, startTime: number, endTime: number, includeResources?: boolean): Promise<WclEvent[]>`.

This fetch is **deliberately not cached** — unlike `fetchEvents`, whose cache key (`reportCode:fight.id:dataType:includeResources`) has no room for an arbitrary time window without colliding with the normal per-fight-window cache entry for the same fight/dataType. Since the lookback fetch only ever fires once per ambiguous target set per fight (never repeated on re-render because callers gate it behind a one-time detection), caching isn't needed to satisfy story 010's request-discipline goal — the "only when ambiguity is detected" gate already provides that.

- [ ] **Step 1: Write the failing test**

Add to `src/wcl/eventCache.test.ts`:

```typescript
import { createEventFetcher } from "./eventCache";
import type { WclEventsPage } from "./events";

// ... (near the existing describe block, add a new describe)

describe("createEventFetcher - fetchLookbackEvents", () => {
  it("paginates via the injected lookback page-fetcher and concatenates results", async () => {
    const fakeFetchLookbackPage = vi
      .fn()
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 1 })],
        nextPageTimestamp: 500,
      })
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 2 })],
        nextPageTimestamp: null,
      });

    const { fetchLookbackEvents } = createEventFetcher(
      undefined,
      fakeFetchLookbackPage,
    );
    const result = await fetchLookbackEvents(
      "token",
      "report1",
      "Buffs",
      0,
      1000,
    );

    expect(result.map((e) => e.timestamp)).toEqual([1, 2]);
    expect(fakeFetchLookbackPage).toHaveBeenNthCalledWith(
      1,
      "token",
      "report1",
      "Buffs",
      0,
      1000,
      false,
    );
    expect(fakeFetchLookbackPage).toHaveBeenNthCalledWith(
      2,
      "token",
      "report1",
      "Buffs",
      500,
      1000,
      false,
    );
  });

  it("does not cache - two calls with the same arguments fetch twice", async () => {
    const fakeFetchLookbackPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchLookbackEvents } = createEventFetcher(
      undefined,
      fakeFetchLookbackPage,
    );
    await fetchLookbackEvents("token", "report1", "Buffs", 0, 1000);
    await fetchLookbackEvents("token", "report1", "Buffs", 0, 1000);

    expect(fakeFetchLookbackPage).toHaveBeenCalledTimes(2);
  });
});
```

Add the `WclEventsPage` type import alongside the existing `WclEvent` import at the top of the test file if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wcl/eventCache.test.ts`
Expected: FAIL — `createEventFetcher(...).fetchLookbackEvents` is `undefined`.

- [ ] **Step 3: Implement `fetchLookbackEvents` in `eventCache.ts`**

Modify `src/wcl/eventCache.ts`:

```typescript
import { fetchEventsPage, fetchLookbackEventsPage } from "./events";
import type { WclEvent, WclEventDataType } from "./events";

export interface EventFetcherFight {
  id: number;
  startTime: number;
  endTime: number;
}

export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
  fetchLookbackPage: typeof fetchLookbackEventsPage = fetchLookbackEventsPage,
) {
  const cache = new Map<string, Promise<WclEvent[]>>();

  async function fetchAllPages(
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources: boolean,
  ): Promise<WclEvent[]> {
    const events: WclEvent[] = [];
    let startTime = fight.startTime;
    for (;;) {
      const page = await fetchPage(
        accessToken,
        reportCode,
        fight.id,
        dataType,
        startTime,
        fight.endTime,
        includeResources,
      );
      events.push(...page.events);
      if (page.nextPageTimestamp === null) break;
      startTime = page.nextPageTimestamp;
    }
    return events;
  }

  function fetchEvents(
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources = false,
  ): Promise<WclEvent[]> {
    // includeResources only ever adds fields, never removes/changes ones a
    // false-requesting caller relies on (story 010) — so every call site for a
    // given dataType should pass the same value. A mismatch here silently
    // splits the cache key and doubles the request for that dataType/fight.
    const key = `${reportCode}:${fight.id}:${dataType}:${includeResources}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = fetchAllPages(
      accessToken,
      reportCode,
      fight,
      dataType,
      includeResources,
    ).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
    return promise;
  }

  // Story 915: a bounded pre-fightStart lookback, deliberately uncached (see
  // plan) and deliberately not fightIDs-filtered (see fetchLookbackEventsPage's
  // own comment) — callers gate this behind a one-time ambiguity check, so
  // repeated requests for the same window shouldn't happen in practice.
  async function fetchLookbackEvents(
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources = false,
  ): Promise<WclEvent[]> {
    const events: WclEvent[] = [];
    let cursor = startTime;
    for (;;) {
      const page = await fetchLookbackPage(
        accessToken,
        reportCode,
        dataType,
        cursor,
        endTime,
        includeResources,
      );
      events.push(...page.events);
      if (page.nextPageTimestamp === null) break;
      cursor = page.nextPageTimestamp;
    }
    return events;
  }

  return { fetchEvents, fetchLookbackEvents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wcl/eventCache.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/wcl/eventCache.ts src/wcl/eventCache.test.ts
git commit -m "feat(wcl-client): add uncached fetchLookbackEvents to the event fetcher"
```

---

### Task 3: Pure carry-in detector (`detectCarryInTargets`)

**Files:**

- Modify: `src/metrics/lifebloomStacks.ts`
- Test: `src/metrics/lifebloomStacks.test.ts`

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines` (existing, unchanged).
- Produces: `detectCarryInTargets(events: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>): number[]` — target IDs whose fight-window timeline is non-empty and doesn't start with `"open"`.

- [ ] **Step 1: Write the failing test**

Add to `src/metrics/lifebloomStacks.test.ts`:

```typescript
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
  detectCarryInTargets,
} from "./lifebloomStacks";

// ... add a new describe block

describe("detectCarryInTargets", () => {
  it("flags a target whose timeline opens with a refresh instead of an open", () => {
    const events = [
      aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 2064275, targetID: 5, sourceID: 1 }),
    ];

    expect(detectCarryInTargets(events, 1, LB_IDS)).toEqual([5]);
  });

  it("does not flag a target whose timeline opens with a genuine open", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 42 }),
    ];

    expect(detectCarryInTargets(events, 2, LB_IDS)).toEqual([]);
  });

  it("flags only the ambiguous target among several", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 0, targetID: 47, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 47, sourceID: 1 }),
    ];

    expect(detectCarryInTargets(events, 1, LB_IDS)).toEqual([47]);
  });
});
```

Note: the second/third tests mix `sourceID: 1` (matching `druidId: 1`) with the first test's own druid ID 2 for the "genuine open" case — keep each test's `druidId` argument consistent with its own events' `sourceID`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: FAIL — `detectCarryInTargets` is not exported.

- [ ] **Step 3: Implement `detectCarryInTargets`**

Add to `src/metrics/lifebloomStacks.ts`, after `reconstructLifebloomTimelines`:

```typescript
// Story 915: flags targets whose fight-window timeline opens mid-stream
// (anything other than "open" as the first event) - proof the buff was
// already active before this fetch window began, per
// deriveLifebloomTargetState's own existing carry-in comment. Callers use
// this, from the fight-window events they've already fetched, to decide
// whether a second (lookback) fetch is worth making at all.
export function detectCarryInTargets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): number[] {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const flagged: number[] = [];
  for (const [targetId, timeline] of timelines) {
    if (timeline.length > 0 && timeline[0].kind !== "open") {
      flagged.push(targetId);
    }
  }
  return flagged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lifebloomStacks.ts src/metrics/lifebloomStacks.test.ts
git commit -m "feat(lifebloom): add pure detector for pre-pull carry-in ambiguity"
```

---

### Task 4: Pure carry-in resolver (`resolveCarryInTimeline`)

**Files:**

- Modify: `src/metrics/lifebloomStacks.ts`
- Test: `src/metrics/lifebloomStacks.test.ts`

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines`, `LifebloomTimelineEvent` (existing).
- Produces: `resolveCarryInTimeline(fightWindowTimeline: LifebloomTimelineEvent[], lookbackEvents: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>, targetId: number, fightStart: number): LifebloomTimelineEvent[] | null`.

- [ ] **Step 1: Write the failing tests**

Add to `src/metrics/lifebloomStacks.test.ts`:

```typescript
describe("resolveCarryInTimeline", () => {
  it("resolves a genuine open found in the lookback window, synthesizing open+stack-change at fightStart", () => {
    const fightWindowTimeline: ReturnType<
      typeof reconstructLifebloomTimelines
    > extends Map<number, infer T>
      ? T
      : never = [
      { timestamp: 2016447, kind: "refresh" },
      { timestamp: 2064275, kind: "close" },
    ];
    // Lookback events: the druid genuinely applied Lifebloom and stacked it
    // to 3 within the 60s before fightStart (2011529).
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1960000, targetID: 5, sourceID: 1 }),
      anApplyBuffStackEvent({
        timestamp: 1965000,
        stack: 2,
        targetID: 5,
        sourceID: 1,
      }),
      anApplyBuffStackEvent({
        timestamp: 1970000,
        stack: 3,
        targetID: 5,
        sourceID: 1,
      }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toEqual([
      { timestamp: 2011529, kind: "open" },
      { timestamp: 2011529, kind: "stack-change", stack: 3 },
      { timestamp: 2016447, kind: "refresh" },
      { timestamp: 2064275, kind: "close" },
    ]);
  });

  it("resolves to a bare open (no stack-change) when the lookback shows exactly 1 stack at fightStart", () => {
    const fightWindowTimeline = [
      { timestamp: 2016447, kind: "refresh" as const },
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 2000000, targetID: 5, sourceID: 1 }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toEqual([
      { timestamp: 2011529, kind: "open" },
      { timestamp: 2016447, kind: "refresh" },
    ]);
  });

  it("returns null when the lookback window itself never shows a genuine open (real capture: report DRtXV4ChA2Kw3c81 fight 84, druid Stuuri, target 30)", () => {
    const fightWindowTimeline = [
      { timestamp: 10199672, kind: "refresh" as const },
    ];
    // No applybuff for this druid/target anywhere in the 60s lookback -
    // matches this session's live trace, which found nothing even 190s back.
    const lookbackEvents: ReturnType<typeof anApplyBuffEvent>[] = [];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      10,
      LB_IDS,
      30,
      10199672,
    );

    expect(resolved).toBeNull();
  });

  it("returns null when the lookback shows the buff opened and closed again before fightStart", () => {
    const fightWindowTimeline = [
      { timestamp: 2016447, kind: "refresh" as const },
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1990000, targetID: 5, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 1995000, targetID: 5, sourceID: 1 }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toBeNull();
  });
});
```

Adjust the first test's inline type annotation if it doesn't typecheck cleanly — a simpler alternative is to just type it as `LifebloomTimelineEvent[]` (imported from `./lifebloomStacks`) instead of the conditional type; use that simpler form.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: FAIL — `resolveCarryInTimeline` is not exported.

- [ ] **Step 3: Implement `resolveCarryInTimeline`**

Add to `src/metrics/lifebloomStacks.ts`, after `detectCarryInTargets`:

```typescript
// Story 915: attempts to resolve a carry-in target's true state at
// fightStart using a bounded lookback window (events strictly before
// fightStart). Walks the lookback timeline forward simulating the same
// open/stack-change/close state machine deriveLifebloomTargetState uses; if
// a genuine "open" is found and the buff is still active by fightStart,
// returns fightWindowTimeline prefixed with a synthetic open (and, if the
// resolved stack is >= 2, a stack-change) at exactly fightStart - a
// timeline deriveLifebloomTargetState can consume completely unchanged,
// since it now legitimately starts with "open" at fightStart. Returns null
// when the ambiguity persists (no genuine open found, or the buff already
// closed again before fightStart) - callers exclude the target from
// judgement in that case rather than guessing.
export function resolveCarryInTimeline(
  fightWindowTimeline: LifebloomTimelineEvent[],
  lookbackEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  targetId: number,
  fightStart: number,
): LifebloomTimelineEvent[] | null {
  const lookbackTimelines = reconstructLifebloomTimelines(
    lookbackEvents,
    druidId,
    lifebloomAbilityIds,
  );
  const lookbackTimeline = lookbackTimelines.get(targetId) ?? [];

  let stack = 0;
  let isOpen = false;
  let sawGenuineOpen = false;

  for (const event of lookbackTimeline) {
    if (event.kind === "open") {
      isOpen = true;
      stack = 1;
      sawGenuineOpen = true;
    } else if (event.kind === "stack-change") {
      stack = event.stack ?? stack;
    } else if (event.kind === "close") {
      isOpen = false;
      stack = 0;
    }
    // "refresh": no state change.
  }

  if (!sawGenuineOpen || !isOpen) return null;

  const prefix: LifebloomTimelineEvent[] = [
    { timestamp: fightStart, kind: "open" },
  ];
  if (stack >= 2) {
    prefix.push({ timestamp: fightStart, kind: "stack-change", stack });
  }

  return [...prefix, ...fightWindowTimeline];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lifebloomStacks.ts src/metrics/lifebloomStacks.test.ts
git commit -m "feat(lifebloom): add pure resolver for pre-pull carry-in state"
```

---

### Task 5: `computeLb3Uptime` consumes resolved lookback data

**Files:**

- Modify: `src/metrics/lb3Uptime.ts`
- Test: `src/metrics/lb3Uptime.test.ts`

**Interfaces:**

- Consumes: `detectCarryInTargets`, `resolveCarryInTimeline` (Tasks 3-4).
- Produces: `computeLb3Uptime(events, druidId, lifebloomAbilityIds, fightStart, fightEnd, lookbackEvents?: WclEvent[]): Lb3UptimeResult` — new 6th optional parameter. When omitted (`undefined`), behavior is byte-for-byte unchanged from today. When supplied, an unresolvable carry-in target is excluded from `result.targets` entirely instead of reading a confident "bad".

- [ ] **Step 1: Write the failing tests**

Add to `src/metrics/lb3Uptime.test.ts`:

```typescript
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

// ... add to the existing describe("computeLb3Uptime", ...) block

it("resolves a carry-in target's true stack-3 state using lookback events instead of reading 0%", () => {
  const fightStart = 2011529;
  const fightEnd = 2113050;
  const events = [
    aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 1 }),
    aRemoveBuffEvent({ timestamp: 2064275, targetID: 5, sourceID: 1 }),
  ];
  const lookbackEvents = [
    anApplyBuffEvent({ timestamp: 1960000, targetID: 5, sourceID: 1 }),
    anApplyBuffStackEvent({
      timestamp: 1970000,
      stack: 3,
      targetID: 5,
      sourceID: 1,
    }),
  ];

  const result = computeLb3Uptime(
    events,
    1,
    LB_IDS,
    fightStart,
    fightEnd,
    lookbackEvents,
  );

  expect(result.targets).toEqual([
    {
      targetId: 5,
      lbUptimePct: 100,
      lb3UptimeMs: fightEnd - fightStart,
      windowMs: fightEnd - fightStart,
      lb3UptimePct: 100,
      judgement: "good",
    },
  ]);
});

it("excludes a carry-in target still ambiguous after the lookback, instead of reading a confident bad", () => {
  const fightStart = 10199672;
  const fightEnd = 10440305;
  const events = [
    aRefreshBuffEvent({ timestamp: fightStart, targetID: 30, sourceID: 10 }),
  ];
  const lookbackEvents: ReturnType<typeof anApplyBuffEvent>[] = [];

  const result = computeLb3Uptime(
    events,
    10,
    LB_IDS,
    fightStart,
    fightEnd,
    lookbackEvents,
  );

  expect(result.targets).toEqual([]);
});

it("keeps today's exact backdate-to-fightStart behavior when lookbackEvents is omitted (backward compatible)", () => {
  const fightStart = 2011529;
  const fightEnd = 2113050;
  const events = [
    aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 1 }),
    aRemoveBuffEvent({ timestamp: 2064275, targetID: 5, sourceID: 1 }),
  ];

  const result = computeLb3Uptime(events, 1, LB_IDS, fightStart, fightEnd);

  expect(result.targets).toEqual([
    {
      targetId: 5,
      lbUptimePct: 100,
      lb3UptimeMs: 0,
      windowMs: fightEnd - fightStart,
      lb3UptimePct: 0,
      judgement: "bad",
    },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: FAIL — extra argument not accepted / carry-in target not excluded.

- [ ] **Step 3: Implement in `computeLb3Uptime`**

Modify `src/metrics/lb3Uptime.ts`:

```typescript
import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import {
  deriveLifebloomTargetState,
  detectCarryInTargets,
  reconstructLifebloomTimelines,
  resolveCarryInTimeline,
} from "./lifebloomStacks";

// ... (existing constants/interfaces unchanged) ...

export function computeLb3Uptime(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
  lookbackEvents?: WclEvent[],
): Lb3UptimeResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const carryInTargets =
    lookbackEvents !== undefined
      ? new Set(detectCarryInTargets(events, druidId, lifebloomAbilityIds))
      : new Set<number>();

  const fightDurationMs = fightEnd - fightStart;
  const results: Lb3TargetResult[] = [];

  for (const [targetId, timeline] of timelines) {
    let resolvedTimeline = timeline;
    if (carryInTargets.has(targetId)) {
      const resolved = resolveCarryInTimeline(
        timeline,
        lookbackEvents as WclEvent[],
        druidId,
        lifebloomAbilityIds,
        targetId,
        fightStart,
      );
      if (resolved === null) continue; // still ambiguous - exclude, don't guess
      resolvedTimeline = resolved;
    }

    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      resolvedTimeline,
      fightStart,
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
        goodMin: GOOD_MIN_PCT,
        fairMin: FAIR_MIN_PCT,
      }),
    });
  }

  return { targets: results };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (new parameter is optional, existing call sites unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/metrics/lb3Uptime.ts src/metrics/lb3Uptime.test.ts
git commit -m "feat(lifebloom): resolve or exclude carry-in targets in LB3 uptime"
```

---

### Task 6: `computeConcurrentLb3Targets` consumes resolved lookback data

**Files:**

- Modify: `src/metrics/concurrentLb3Targets.ts`
- Test: `src/metrics/concurrentLb3Targets.test.ts`

**Interfaces:**

- Same shape as Task 5: new optional 6th parameter `lookbackEvents?: WclEvent[]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/metrics/concurrentLb3Targets.test.ts` (mirroring Task 5's three scenarios — resolved, still-ambiguous-excluded, backward-compatible-when-omitted). Use the same fixture shapes as Task 5's tests, asserting on `result.levels`/`result.avgConcurrent`/`result.peakConcurrent` instead of `result.targets`. For the "resolves" case, assert the resolved target now contributes to `peakConcurrent` and the `levels` breakdown instead of being silently absent; for the "still ambiguous" case, assert the target contributes nothing (as if it were never maintained at all).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `computeConcurrentLb3Targets`**

Modify `src/metrics/concurrentLb3Targets.ts` the same way as Task 5 — add the `lookbackEvents?: WclEvent[]` parameter, compute `carryInTargets` the same way, and inside the `for (const [targetId, timeline] of timelines)` — wait, the current code loops `for (const timeline of timelines.values())` without the target ID (see existing source). Change that loop to iterate entries so the target ID is available for the carry-in check:

```typescript
export function computeConcurrentLb3Targets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
  lookbackEvents?: WclEvent[],
): ConcurrentLb3Result {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;
  const carryInTargets =
    lookbackEvents !== undefined
      ? new Set(detectCarryInTargets(events, druidId, lifebloomAbilityIds))
      : new Set<number>();

  const boundaries: Boundary[] = [];

  for (const [targetId, timeline] of timelines) {
    let resolvedTimeline = timeline;
    if (carryInTargets.has(targetId)) {
      const resolved = resolveCarryInTimeline(
        timeline,
        lookbackEvents as WclEvent[],
        druidId,
        lifebloomAbilityIds,
        targetId,
        fightStart,
      );
      if (resolved === null) continue;
      resolvedTimeline = resolved;
    }

    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      resolvedTimeline,
      fightStart,
      fightEnd,
    );
    const lbUptimePct = (totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    for (const interval of stack3Intervals) {
      boundaries.push({ timestamp: interval.start, delta: 1 });
      boundaries.push({ timestamp: interval.end, delta: -1 });
    }
  }

  // ... rest of the function (boundary sweep, levels, judgement) unchanged
}
```

Add the `detectCarryInTargets`/`resolveCarryInTimeline` imports from `./lifebloomStacks` alongside the existing ones.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/metrics/concurrentLb3Targets.ts src/metrics/concurrentLb3Targets.test.ts
git commit -m "feat(lifebloom): resolve or exclude carry-in targets in concurrent LB3 count"
```

---

### Task 7: Orchestrate the lookback fetch in `useLifebloomDisciplineSummary`

**Files:**

- Modify: `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`
- Test: `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`

**Interfaces:**

- Consumes: `detectCarryInTargets` (Task 3), the new `fetchLookbackEvents` shape (Task 2).
- Produces: `useLifebloomDisciplineSummary` gains a new final parameter `fetchLookbackEvents: (accessToken, reportCode, dataType, startTime, endTime, includeResources?) => Promise<WclEvent[]>`.

- [ ] **Step 1: Write the failing test**

Read `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts` first to match its existing mock-fetchEvents conventions exactly, then add a test asserting: when the fetched Buffs events contain a carry-in target, a second call is made to `fetchLookbackEvents` with `startTime = fight.startTime - 60_000` and `endTime = fight.startTime`, and its result reaches `computeLb3Uptime`/`computeConcurrentLb3Targets` (assert via the resulting `summary` no longer showing the carry-in target as "bad"/excluded, using the same fixture shape as Task 5's "resolves" test). Add a second test confirming that when no target is ambiguous, `fetchLookbackEvents` is never called (assert call count 0) — the "never unconditionally" requirement.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestration**

Modify `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`:

```typescript
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeLb3Uptime } from "../../../metrics/lb3Uptime";
import { computeRefreshCadence } from "../../../metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../../metrics/accidentalBlooms";
import { computeRestackTax } from "../../../metrics/restackTax";
import { computeConcurrentLb3Targets } from "../../../metrics/concurrentLb3Targets";
import { detectCarryInTargets } from "../../../metrics/lifebloomStacks";
import { summarizeLifebloomDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

const LOOKBACK_WINDOW_MS = 60_000;

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useLifebloomDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(async ([buffEvents, castEvents, healEvents]) => {
        const carryInTargets = detectCarryInTargets(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const lookbackEvents =
          carryInTargets.length > 0
            ? await fetchLookbackEvents(
                accessToken,
                reportCode,
                "Buffs",
                fight.startTime - LOOKBACK_WINDOW_MS,
                fight.startTime,
                true,
              )
            : undefined;

        const lb3 = computeLb3Uptime(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
          lookbackEvents,
        );
        const refresh = computeRefreshCadence(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const blooms = computeAccidentalBlooms(
          buffEvents,
          healEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const restack = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
        );
        const concurrent = computeConcurrentLb3Targets(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
          lookbackEvents,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeLifebloomDiscipline(
              lb3,
              refresh,
              blooms,
              restack,
              concurrent,
            ),
          },
        });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to summarize Lifebloom discipline.",
          },
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
    fetchLookbackEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useLifebloomDisciplineSummary.ts src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts
git commit -m "feat(lifebloom): fetch pre-pull lookback events when carry-in is detected"
```

---

### Task 8: Orchestrate the lookback fetch in `LB3UptimeCard` and `ConcurrentTargetsCard`

**Files:**

- Modify: `src/app/components/LB3UptimeCard/index.tsx`
- Modify: `src/app/components/ConcurrentTargetsCard/index.tsx`
- Test: `src/app/components/LB3UptimeCard/index.test.tsx`
- Test: `src/app/components/ConcurrentTargetsCard/index.test.tsx`

**Interfaces:**

- Both cards gain a new required prop `fetchLookbackEvents` with the same signature as Task 7.

- [ ] **Step 1: Write the failing tests**

In each card's test file, add a test using the same carry-in fixture as Task 5/6's "resolves" scenario, asserting the rendered result now shows the resolved (non-excluded) target, and a second test asserting `fetchLookbackEvents` is never called when the fetched events contain no carry-in target.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/LB3UptimeCard/index.test.tsx src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: FAIL — missing required prop / not called.

- [ ] **Step 3: Implement in `LB3UptimeCard`**

Modify `src/app/components/LB3UptimeCard/index.tsx`: add `fetchLookbackEvents` to `LB3UptimeCardProps` (same signature as Task 7's), import `detectCarryInTargets` from `"../../../metrics/lifebloomStacks"`, and inside the existing `useEffect`'s `.then((events) => { ... })`, mirror Task 7's pattern — detect carry-in targets on `events`, conditionally await `fetchLookbackEvents(...)` for `[fight.startTime - 60_000, fight.startTime)`, then pass the result as `computeLb3Uptime`'s 6th argument. The `.then` callback needs to become `async` to `await` the conditional fetch before calling `computeLb3Uptime`.

- [ ] **Step 4: Implement in `ConcurrentTargetsCard`**

Same pattern as Step 3, for `ConcurrentTargetsCard/index.tsx` and `computeConcurrentLb3Targets`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/LB3UptimeCard/index.test.tsx src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LB3UptimeCard src/app/components/ConcurrentTargetsCard
git commit -m "feat(lifebloom): wire pre-pull lookback fetch into LB3 uptime and concurrent-targets cards"
```

---

### Task 9: Thread `fetchLookbackEvents` through the component tree

**Files:**

- Modify: `src/app/components/LifebloomDisciplineContent/index.tsx`
- Modify: `src/app/components/Scorecard/useFightEpicSummaries.ts`
- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/ReportDashboard/index.tsx`
- Modify: `src/App.tsx`

This is pure prop-threading — no new logic, verified by typecheck plus the existing component/hook test suites (which will fail to compile if a required prop is missing, catching any threading mistake).

**Interfaces:**

- Consumes: `eventFetcher.fetchLookbackEvents` (Task 2), wrapped the same way as `eventFetcher.fetchEvents` already is in `App.tsx`.

- [ ] **Step 1: `LifebloomDisciplineContent`**

Add `fetchLookbackEvents` to `LifebloomDisciplineContentProps` (same signature as Task 7/8), destructure it, and pass it as a new prop to `<LB3UptimeCard>` and `<ConcurrentTargetsCard>` only (not the other three children — they don't consume Lifebloom carry-in state).

- [ ] **Step 2: `useFightEpicSummaries`**

Add `fetchLookbackEvents: FetchLookbackEvents` as a new final parameter (define a `FetchLookbackEvents` type alias next to the existing `FetchEvents` one), and pass it through to the `useLifebloomDisciplineSummary(...)` call as its new final argument.

- [ ] **Step 3: `Scorecard`**

Add `fetchLookbackEvents` to `ScorecardProps` (same signature), destructure it, pass it to the `useFightEpicSummaries(...)` call (final argument), and pass it to the `<LifebloomDisciplineContent>` render (alongside the existing `fetchEvents={fetchEvents}`).

- [ ] **Step 4: `ReportDashboard`**

Add `fetchLookbackEvents` to `ReportDashboardProps`, to `FightRowProps` (as `ReportDashboardProps["fetchLookbackEvents"]`, matching the existing `fetchEvents` pattern at line 99), destructure it in both the top-level component and `FightRow`, pass it to `FightRow`'s own `useFightEpicSummaries(...)` call, and pass it to the `<Scorecard>` render.

- [ ] **Step 5: `App.tsx`**

Wrap `eventFetcher.fetchLookbackEvents` the same way `eventFetcher.fetchEvents` is wrapped (mirroring the existing `wrappedFetchEvents` `useMemo` block):

```typescript
const wrappedFetchLookbackEvents = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(
        eventFetcher.fetchLookbackEvents,
        reportRateLimited,
      ),
      reportError,
    ),
  [eventFetcher, reportRateLimited, reportError],
);
```

Pass `fetchLookbackEvents={wrappedFetchLookbackEvents}` to the `<ReportDashboard>` render alongside the existing `fetchEvents={wrappedFetchEvents}`.

- [ ] **Step 6: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors. If any component's tests fail to compile due to a missing prop in a test's render call, fix those call sites (add the new prop, e.g. a simple `() => Promise.resolve([])` stub, to any test that doesn't specifically exercise carry-in behavior).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/app/components/LifebloomDisciplineContent src/app/components/Scorecard src/app/components/ReportDashboard
git commit -m "feat(lifebloom): thread fetchLookbackEvents through the component tree"
```

---

### Task 10: Wire `scripts/lib/calibrateReport.ts`

**Files:**

- Modify: `scripts/lib/calibrateReport.ts`

**Interfaces:**

- Consumes: `ctx.fetchEvents`'s sibling — `createEventFetcher()`'s returned `fetchLookbackEvents` — added to `ReportContext`.

- [ ] **Step 1: Add `fetchLookbackEvents` to `ReportContext` and `buildReportContext`**

In `scripts/lib/calibrateReport.ts`, `ReportContext` gains `fetchLookbackEvents: ReturnType<typeof createEventFetcher>["fetchLookbackEvents"]`. In `buildReportContext`, destructure it from the same `createEventFetcher()` call already producing `fetchEvents` and include it in the returned context object.

- [ ] **Step 2: Use it in `computeFightResult`**

After the existing `Promise.all([...])` that fetches `buffEvents`/`castEvents`/`healingEvents`/`deathEvents`/`combatantInfoEvents`, add:

```typescript
const carryInTargets = detectCarryInTargets(
  buffEvents,
  druidId,
  ctx.lifebloomAbilityIds,
);
const lookbackEvents =
  carryInTargets.length > 0
    ? await ctx.fetchLookbackEvents(
        ctx.accessToken,
        ctx.reportCode,
        "Buffs",
        fight.startTime - 60_000,
        fight.startTime,
        true,
      )
    : undefined;
```

Add the `detectCarryInTargets` import from `"../../src/metrics/lifebloomStacks"`. Then pass `lookbackEvents` as the 6th argument to both `computeLb3Uptime(...)` and `computeConcurrentLb3Targets(...)` inside the `lifebloomDiscipline` block.

- [ ] **Step 3: Typecheck (covers `scripts/` via `tsconfig.scripts.json`)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Smoke-test against a real report**

Run: `npm run calibrate -- mtRh3kJ9YMLazyvQ` (a report already validated live this session)
Expected: completes without error, output unchanged in shape (this report's fights weren't chosen for carry-in ambiguity, so this mainly confirms no regression — a true end-to-end check of the resolution path itself happens in the unit tests from Tasks 5-6, sourced from the real `DRtXV4ChA2Kw3c81` capture).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/calibrateReport.ts
git commit -m "feat(calibrate): wire pre-pull lookback fetch into the CLI calibration tool"
```

---

### Task 11: Documentation and backlog cleanup

**Files:**

- Modify: `docs/thresholds.md`
- Modify: `docs/backlog.md`
- Delete: `docs/plans/lifebloom-carry-in-lookback-plan.md` (this file)

- [ ] **Step 1: Document the new behavior in `docs/thresholds.md`**

Add a dated paragraph to the Lifebloom discipline section along these lines: a carry-in target (timeline opening mid-stream) now triggers a bounded 60-second pre-`fightStart` lookback fetch (Buffs events, `fightIDs` filter deliberately omitted — a `fightIDs`-scoped query never sees events tagged to an earlier WCL fight ID, confirmed live against `DRtXV4ChA2Kw3c81` fights 24→25) to resolve the target's true carried-in stack state. If resolved, the target is judged normally from that point; if still ambiguous after the lookback (real example: `DRtXV4ChA2Kw3c81` fight 84, druid Stuuri, targets Jeloviina/id 30 and Hulina/id 6), the target is excluded from judgement entirely rather than reading a confident "bad".

- [ ] **Step 2: Mark story 915 done in `docs/backlog.md`**

Change `### 915 — Resolve unknown pre-pull Lifebloom stack state via bounded event lookback 🔲 Todo` to `✅ Done`. Leave the rest of its existing text as the historical record (per this repo's convention of not rewriting shipped story text).

- [ ] **Step 3: Delete this plan file**

```bash
rm docs/plans/lifebloom-carry-in-lookback-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/thresholds.md docs/backlog.md
git rm docs/plans/lifebloom-carry-in-lookback-plan.md
git commit -m "docs: mark story 915 done, document pre-pull lookback behavior"
```

---

## Self-Review Notes

- **Spec coverage:** all 5 acceptance criteria bullets from backlog story 915 are covered — the pure detector (Task 3), the lookback-consuming `deriveLifebloomTargetState` equivalent via `resolveCarryInTimeline` (Task 4), conditional-only fetching at every call site (Tasks 7-10), exclusion-not-bad-default for unresolvable targets (Tasks 5-6), fixtures for both resolved and still-unresolved cases (Tasks 5-6), and `docs/thresholds.md` documentation (Task 11).
- **Backward compatibility:** every `compute*` signature change is an added optional trailing parameter; when omitted, behavior is unchanged (explicitly tested in Task 5). This matters because `scripts/lib/calibrateReport.ts` and every UI call site are touched in different tasks — if any is missed, it simply keeps today's behavior rather than breaking.
- **Type consistency:** `LifebloomTimelineEvent`, `Lb3TargetResult`, `ConcurrentLb3Result` are unchanged types throughout — only new function signatures are introduced, all consistent across Tasks 3-10.
