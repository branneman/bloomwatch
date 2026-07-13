# Swiftmend Quality Audit (Story 302) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, directly on `main` (per this repo's `CLAUDE.md` — no worktree isolation, no separate executing-plans review checkpoint). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 302 — for each Swiftmend cast, show the HoT it consumed, that HoT's remaining duration, the target's HP% at cast, and an efficient/emergency/wasteful classification, judged on wasteful share.

**Architecture:** A new pure metrics module (`src/metrics/swiftmendAudit.ts`) replays `Buffs` events to know which Rejuvenation/Regrowth was on a target when Swiftmend's `removebuff` fired, and scans `Healing` events (fetched with a new `includeResources: true` WCL query flag) for the target's most recent HP% sample before the cast. A new `SwiftmendAuditCard` (mirroring the existing `HotClipDetectionCard`) renders it, slotted into the existing `SpellDisciplineContent` epic alongside HoT clip detection. This is the first story to need per-actor HP%, so the WCL events client and event cache gain a new optional parameter.

**Tech Stack:** TypeScript, React (functional components), Vitest (+ React Testing Library, MSW for Tier 2), existing `src/wcl`, `src/metrics`, `src/app/components` structure.

## Global Constraints

- Never hardcode spell/ability IDs — resolve them from `masterData.abilities` at runtime (existing `resolveAbilities.ts` already resolves `Swiftmend` → gameID `18562`; reuse it, don't re-derive).
- Every red/orange/green threshold must cite its source in `docs/backlog.md` story 302 in a comment.
- No backend, no secrets — all computation stays client-side using the existing WCL client.
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) must pass full-project before any commit (pre-commit hook enforces this already).
- Tier boundaries per `docs/testing.md`: pure metric logic is Tier 1 (Vitest, co-located, hand-built factories from `src/testUtils/factories.ts`); the WCL client change is Tier 2 (MSW + a **real** captured fixture, not synthetic); components are Tier 3 (React Testing Library, co-located `*.test.tsx`).

## Background you need (already verified live against report `4GYHZRdtL3bvhpc8`, fight 6, during planning)

- WCL's `events` query accepts an `includeResources: Boolean` argument. When `true`, `Healing`/`Casts`/etc. events gain `hitPoints`/`maxHitPoints` fields — and critically, **`maxHitPoints` is always `100`**, i.e. `hitPoints` is already a 0–100 percentage, not a raw HP value.
- A `resourceActor` field disambiguates _whose_ HP the event describes: `resourceActor: 1` = the event's source actor, `resourceActor: 2` = the event's target actor. For Swiftmend's own heal event (`sourceID` = druid, `targetID` = tank), `resourceActor: 2` gives the tank's HP.
- We only need the target's HP just _before_ the cast, so we use the most recent **other** heal on that target (any source, `resourceActor: 2`) before the Swiftmend's own timestamp — not the Swiftmend's own heal event, which reflects post-heal HP.
- Swiftmend's consumption of a HoT fires a `removebuff` event (never `refreshbuff` — already documented in `docs/testing.md` and relied on by story 301's `hotClipDetection.ts`). Live-verified: the `removebuff` lands **1ms after** the `cast` event's timestamp (cast at `1998512`, matching `removebuff` and the Swiftmend's own `heal` event both at `1998513`). A small tolerance window (chosen: 50ms) is used to match a Swiftmend cast to the `removebuff` it caused, rather than requiring an exact timestamp match.
- Approach chosen (see conversation): derive target HP% only from `Healing` events (not a separate `DamageTaken` fetch) — simpler, reuses a dataType the app already fetches elsewhere, at the cost of a small safe-direction bias (if damage lands between the last heal sample and the cast, we'll overestimate HP, undercounting "emergency" classifications). This tradeoff is documented in the new card's threshold text.

---

### Task 1: WCL events client — add `includeResources` support, with a real captured fixture

**Files:**

- Modify: `src/wcl/events.ts`
- Modify: `src/wcl/eventCache.ts`
- Modify: `test/integration/events.test.ts`
- Modify: `src/wcl/eventCache.test.ts`
- Create: `test/integration/fixtures/events-healing-with-resources.json`
- Modify: `docs/testing.md` (known-reports table)

**Interfaces:**

- Produces: `fetchEventsPage(accessToken, reportCode, fightId, dataType, startTime, endTime, includeResources = false)` — same return type as before (`Promise<WclEventsPage>`), with an added optional 7th parameter.
- Produces: `createEventFetcher(...).fetchEvents(accessToken, reportCode, fight, dataType, includeResources = false)` — same return type as before (`Promise<WclEvent[]>`), with an added optional 5th parameter. Existing 4-arg call sites throughout the app remain valid (TypeScript allows assigning a function with an added optional trailing parameter to a narrower function type), so no other file needs to change for this task alone.

- [ ] **Step 1: Capture the real fixture**

The fixture below is real data already captured live against report `4GYHZRdtL3bvhpc8`, fight 6 (targetID 52, a tank, around a Swiftmend cast at timestamp 1998512). Create the file exactly as follows:

```json
{
  "data": {
    "reportData": {
      "report": {
        "events": {
          "data": [
            {
              "timestamp": 1997070,
              "type": "heal",
              "sourceID": 37,
              "targetID": 52,
              "abilityGameID": 15290,
              "fight": 6,
              "hitType": 1,
              "amount": 87,
              "tick": true,
              "resourceActor": 2,
              "classResources": [
                { "amount": 11130, "max": 0, "type": 2360, "cost": 46 }
              ],
              "hitPoints": 48,
              "maxHitPoints": 100,
              "attackPower": 61,
              "spellPower": 680,
              "armor": 3770,
              "absorb": 0,
              "x": 44451,
              "y": 4690,
              "facing": -399,
              "mapID": 332,
              "versatility": 0,
              "avoidance": 0,
              "itemLevel": 124
            },
            {
              "timestamp": 1998513,
              "type": "heal",
              "sourceID": 2,
              "targetID": 52,
              "abilityGameID": 18562,
              "fight": 6,
              "hitType": 1,
              "amount": 4042,
              "resourceActor": 2,
              "classResources": [
                { "amount": 11130, "max": 0, "type": 2513, "cost": 47 }
              ],
              "hitPoints": 94,
              "maxHitPoints": 100,
              "attackPower": 61,
              "spellPower": 680,
              "armor": 3770,
              "absorb": 0,
              "x": 44355,
              "y": 4775,
              "facing": -536,
              "mapID": 332,
              "versatility": 0,
              "avoidance": 0,
              "itemLevel": 124
            },
            {
              "timestamp": 1998895,
              "type": "heal",
              "sourceID": 52,
              "targetID": 52,
              "abilityGameID": 25235,
              "fight": 6,
              "hitType": 1,
              "amount": 500,
              "overheal": 2109,
              "resourceActor": 1,
              "classResources": [
                { "amount": 11130, "max": 0, "type": 2513, "cost": 47 }
              ],
              "hitPoints": 100,
              "maxHitPoints": 100,
              "attackPower": 61,
              "spellPower": 680,
              "armor": 3770,
              "absorb": 0,
              "x": 44355,
              "y": 4775,
              "facing": -579,
              "mapID": 332,
              "versatility": 0,
              "avoidance": 0,
              "itemLevel": 124
            },
            {
              "timestamp": 1999197,
              "type": "heal",
              "sourceID": 1,
              "targetID": 52,
              "abilityGameID": 10328,
              "fight": 6,
              "buffs": "31834.",
              "hitType": 1,
              "amount": 0,
              "overheal": 2661,
              "resourceActor": 2,
              "classResources": [
                { "amount": 11130, "max": 0, "type": 2043, "cost": 47 }
              ],
              "hitPoints": 100,
              "maxHitPoints": 100,
              "attackPower": 61,
              "spellPower": 680,
              "armor": 3770,
              "absorb": 0,
              "x": 44355,
              "y": 4775,
              "facing": -579,
              "mapID": 332,
              "versatility": 0,
              "avoidance": 0,
              "itemLevel": 124
            }
          ],
          "nextPageTimestamp": null
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Add to `test/integration/events.test.ts` (new `import` alongside the existing fixture imports, and two new `it` blocks inside the existing `describe("fetchEventsPage", ...)` block):

```ts
import withResourcesFixture from "./fixtures/events-healing-with-resources.json";
```

```ts
it("parses hitPoints/resourceActor fields from a real includeResources response", async () => {
  server.use(
    http.post(USER_API_URL, () => HttpResponse.json(withResourcesFixture)),
  );

  const result = await fetchEventsPage(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    6,
    "Healing",
    1997000,
    1999500,
    true,
  );

  expect(result.events).toHaveLength(4);
  const swiftmendHeal = result.events.find((e) => e.timestamp === 1998513);
  expect(swiftmendHeal).toMatchObject({
    resourceActor: 2,
    hitPoints: 94,
    maxHitPoints: 100,
  });
});

it("sends includeResources: true only when requested, and defaults to false", async () => {
  let requestBody: { query: string } | undefined;
  server.use(
    http.post(USER_API_URL, async ({ request }) => {
      requestBody = (await request.json()) as { query: string };
      return HttpResponse.json(singlePageFixture);
    }),
  );

  await fetchEventsPage(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    6,
    "Healing",
    1879119,
    2036920,
  );
  expect(requestBody?.query).toContain("includeResources: false");

  await fetchEventsPage(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    6,
    "Healing",
    1879119,
    2036920,
    true,
  );
  expect(requestBody?.query).toContain("includeResources: true");
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm test -- test/integration/events.test.ts`
Expected: FAIL — `fetchEventsPage` doesn't yet accept a 7th argument, and the query never contains `includeResources`.

- [ ] **Step 4: Implement `includeResources` in `fetchEventsPage`**

In `src/wcl/events.ts`, change the function signature and query body:

```ts
export async function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
): Promise<WclEventsPage> {
  const resp = await fetch(USER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (resp.status === 429) throw new WclRateLimitError(resp.status, bodyText);
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  const events = parsed.data.reportData.report.events;
  return {
    events: events.data,
    nextPageTimestamp: events.nextPageTimestamp,
  };
}
```

(Only the function signature and the `events(...)` line inside the query template literal change — everything else in the file is unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- test/integration/events.test.ts`
Expected: PASS (all tests, including the pre-existing ones — `toContain` assertions on `fightIDs`/`dataType`/`startTime`/`endTime` are unaffected by the added `includeResources` clause).

- [ ] **Step 6: Thread `includeResources` through the event cache**

In `src/wcl/eventCache.ts`, update `fetchAllPages` and the returned `fetchEvents`, and include the flag in the cache key so a plain fetch and a `includeResources: true` fetch for the same fight/dataType don't collide:

```ts
import { fetchEventsPage } from "./events";
import type { WclEvent, WclEventDataType } from "./events";

export interface EventFetcherFight {
  id: number;
  startTime: number;
  endTime: number;
}

export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
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

  return { fetchEvents };
}
```

- [ ] **Step 7: Update existing cache tests for the new positional argument**

`fetchAllPages` now always passes `includeResources` (resolved to `false` by default) as a 7th positional argument to `fetchPage`. In `src/wcl/eventCache.test.ts`, update the two `toHaveBeenNthCalledWith` assertions to include it:

In the `"concatenates events across multiple pages until nextPageTimestamp is null"` test, change:

```ts
expect(fakeFetchPage).toHaveBeenNthCalledWith(
  1,
  "token",
  "report1",
  6,
  "Healing",
  1879119,
  2036920,
);
expect(fakeFetchPage).toHaveBeenNthCalledWith(
  2,
  "token",
  "report1",
  6,
  "Healing",
  1900000,
  2036920,
);
```

to:

```ts
expect(fakeFetchPage).toHaveBeenNthCalledWith(
  1,
  "token",
  "report1",
  6,
  "Healing",
  1879119,
  2036920,
  false,
);
expect(fakeFetchPage).toHaveBeenNthCalledWith(
  2,
  "token",
  "report1",
  6,
  "Healing",
  1900000,
  2036920,
  false,
);
```

In the `"discards a partial multi-page result on a later-page failure, so retry restarts from page 1"` test, change the final assertion:

```ts
expect(fakeFetchPageSuccess).toHaveBeenNthCalledWith(
  1,
  "token",
  "report1",
  6,
  "Healing",
  1879119,
  2036920,
);
```

to:

```ts
expect(fakeFetchPageSuccess).toHaveBeenNthCalledWith(
  1,
  "token",
  "report1",
  6,
  "Healing",
  1879119,
  2036920,
  false,
);
```

- [ ] **Step 8: Add a new cache test for `includeResources` cache separation**

Add a new `it` block to the same `describe("createEventFetcher", ...)`:

```ts
it("caches includeResources: true separately from the default fetch for the same fight/dataType", async () => {
  const fakeFetchPage = vi.fn().mockResolvedValue({
    events: [anEvent()],
    nextPageTimestamp: null,
  });

  const { fetchEvents } = createEventFetcher(fakeFetchPage);
  await fetchEvents("token", "report1", fight, "Healing");
  await fetchEvents("token", "report1", fight, "Healing", true);

  expect(fakeFetchPage).toHaveBeenCalledTimes(2);
  expect(fakeFetchPage).toHaveBeenNthCalledWith(
    1,
    "token",
    "report1",
    6,
    "Healing",
    1879119,
    2036920,
    false,
  );
  expect(fakeFetchPage).toHaveBeenNthCalledWith(
    2,
    "token",
    "report1",
    6,
    "Healing",
    1879119,
    2036920,
    true,
  );
});
```

- [ ] **Step 9: Run the full test suite for this task**

Run: `npm test -- src/wcl/eventCache.test.ts test/integration/events.test.ts`
Expected: PASS

- [ ] **Step 10: Record the new validated facts in `docs/testing.md`**

In `docs/testing.md`'s "Known real test reports" table, find the row for `4GYHZRdtL3bvhpc8` (it ends with "...the basis for 301 excluding Swiftmend-consumed HoTs from clip detection with no special-case code."). Append this sentence to the end of that cell (same row, same table, just extending the existing paragraph — don't add a new row for the same report code):

```
Also validated (fight 6, targetID 52) that `includeResources: true` adds `hitPoints`/`maxHitPoints` (already a 0-100 percentage, not a raw value) to Healing events, tagged by a `resourceActor` field (`1` = the event's source, `2` = its target) — and that Swiftmend's `removebuff` and its own `heal` event both land exactly 1ms after its `cast` event — the basis for story 302's Swiftmend quality audit reading target HP% from the nearest preceding Healing event and matching a Swiftmend cast to the `removebuff` it caused via a small timestamp tolerance rather than an exact match.
```

- [ ] **Step 11: Run full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/wcl/events.ts src/wcl/eventCache.ts test/integration/events.test.ts src/wcl/eventCache.test.ts test/integration/fixtures/events-healing-with-resources.json docs/testing.md
git commit -m "feat(wcl-client): add includeResources support for per-actor HP% events"
```

---

### Task 2: `computeSwiftmendAudit` metric (Tier 1, TDD)

**Files:**

- Modify: `src/metrics/hotClipDetection.ts` (export duration/threshold constants for reuse — no behavior change)
- Create: `src/metrics/swiftmendAudit.ts`
- Create: `src/metrics/swiftmendAudit.test.ts`

**Interfaces:**

- Consumes: `WclEvent` from `../wcl/events`; `Judgement` from `./judgement`; `HotClipSpell`, `REJUVENATION_DURATION_MS`, `REGROWTH_DURATION_MS`, `CLIP_THRESHOLD_MS` from `./hotClipDetection` (all newly exported in this task).
- Produces: `computeSwiftmendAudit(buffEvents, castEvents, healingEvents, druidId, swiftmendAbilityIds, rejuvenationAbilityIds, regrowthAbilityIds, fightDurationMs): SwiftmendAuditResult`, and the `SwiftmendAuditResult` / `SwiftmendCastResult` / `SwiftmendClassification` types — all consumed by Task 4 (`SwiftmendAuditCard`) and Task 5 (`epicSummary.ts`).

- [ ] **Step 1: Export the shared HoT constants from `hotClipDetection.ts`**

In `src/metrics/hotClipDetection.ts`, add `export` to the three module-level constants (no other change):

```ts
export const REJUVENATION_DURATION_MS = 12_000;
```

```ts
export const REGROWTH_DURATION_MS = 27_000;
```

```ts
export const CLIP_THRESHOLD_MS = 3_000;
```

Run: `npm test -- src/metrics/hotClipDetection.test.ts`
Expected: PASS (unchanged behavior — this only changes visibility).

- [ ] **Step 2: Write the failing test suite**

Create `src/metrics/swiftmendAudit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeSwiftmendAudit } from "./swiftmendAudit";
import {
  aCastEvent,
  anApplyBuffEvent,
  aRemoveBuffEvent,
  aHealEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const SWIFTMEND_IDS = new Set([18562]);
const REJUV_IDS = new Set([26982]);
const REGROWTH_IDS = new Set([26980]);

describe("computeSwiftmendAudit", () => {
  it("returns no casts, zero wasteful share, and green judgement with no events", () => {
    const result = computeSwiftmendAudit(
      [],
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result).toEqual({
      casts: [],
      swiftmendCastCount: 0,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    });
  });

  it("classifies as efficient when the consumed HoT had <=3s remaining, ignoring HP", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      // Rejuvenation lasts 12000ms; removed at 9501ms leaves 2499ms (<=3000ms) remaining.
      aRemoveBuffEvent({
        timestamp: 9501,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 9500,
        targetID: 50,
        abilityGameID: 18562,
      }),
    ];
    // A low HP sample is present too, but efficient takes priority over emergency.
    const healingEvents = [
      aHealEvent({
        timestamp: 9000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 30,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts).toEqual([
      {
        timestampMs: 9500,
        targetId: 50,
        consumedSpell: "Rejuvenation",
        remainingMs: 2499,
        targetHpPct: 30,
        classification: "efficient",
      },
    ]);
  });

  it("classifies as emergency when remaining >3s and target HP <=50%", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 44,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].classification).toBe("emergency");
    expect(result.casts[0].targetHpPct).toBe(44);
  });

  it("classifies as wasteful when remaining >3s and target HP >50%", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 80,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].classification).toBe("wasteful");
  });

  it("treats an unknown target HP (no prior Healing sample) as not-emergency, so it falls through to wasteful", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].targetHpPct).toBeNull();
    expect(result.casts[0].classification).toBe("wasteful");
  });

  it("reads target HP from the most recent Healing sample before the cast, ignoring resourceActor 1 (source) and later entries", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 500,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 70,
      }),
      // The druid's own HP (source, resourceActor 1) — must be ignored.
      aHealEvent({
        timestamp: 1500,
        targetID: 50,
        resourceActor: 1,
        hitPoints: 100,
      }),
      aHealEvent({
        timestamp: 1800,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 40,
      }),
      // After the cast — must be ignored.
      aHealEvent({
        timestamp: 2500,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 95,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].targetHpPct).toBe(40);
  });

  it("identifies the consumed spell as Regrowth from the removebuff's own ability, using Regrowth's 27s duration", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 26980 }),
      // Regrowth lasts 27000ms; removed at 25001ms leaves 1999ms (<=3000ms) remaining.
      aRemoveBuffEvent({
        timestamp: 25001,
        targetID: 60,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 25000, targetID: 60, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].consumedSpell).toBe("Regrowth");
    expect(result.casts[0].classification).toBe("efficient");
  });

  it("skips a Swiftmend cast with no matching HoT removal, but still counts it in swiftmendCastCount", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      [],
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts).toEqual([]);
    expect(result.swiftmendCastCount).toBe(1);
    expect(result.wastefulPct).toBe(0);
    expect(result.judgement).toBe("green");
  });

  it("ignores casts from other sources or other abilities", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        sourceID: 99,
        abilityGameID: 18562,
      }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 26982 }),
    ];

    const result = computeSwiftmendAudit(
      [],
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.swiftmendCastCount).toBe(0);
  });

  it.each([
    { wastefulOf: [0, 4], expected: "green" },
    { wastefulOf: [1, 4], expected: "orange" },
    { wastefulOf: [1, 3], expected: "red" },
  ])(
    "judges $expected when $wastefulOf.0 of $wastefulOf.1 casts are wasteful",
    ({ wastefulOf, expected }) => {
      const [wastefulCount, totalCount] = wastefulOf;
      const buffEvents: ReturnType<typeof anApplyBuffEvent>[] = [];
      const castEvents: ReturnType<typeof aCastEvent>[] = [];

      for (let i = 0; i < totalCount; i++) {
        const target = 50 + i;
        const applyAt = i * 100000;
        const castAt = applyAt + 2000;
        buffEvents.push(
          anApplyBuffEvent({
            timestamp: applyAt,
            targetID: target,
            abilityGameID: 26982,
          }),
        );
        buffEvents.push(
          aRemoveBuffEvent({
            timestamp: castAt + 1,
            targetID: target,
            abilityGameID: 26982,
          }),
        );
        castEvents.push(
          aCastEvent({
            timestamp: castAt,
            targetID: target,
            abilityGameID: 18562,
          }),
        );
      }
      // No Healing events at all -> every cast has remaining (12000-2001=9999ms,
      // well over the 3s efficient threshold) and unknown HP -> every cast is
      // wasteful. Re-classify the first `wastefulCount` casts as emergency
      // (not wasteful) by giving them a low-HP Healing sample instead.
      const healingEvents: ReturnType<typeof aHealEvent>[] = [];
      for (let i = wastefulCount; i < totalCount; i++) {
        const target = 50 + i;
        const castAt = i * 100000 + 2000;
        healingEvents.push(
          aHealEvent({
            timestamp: castAt - 500,
            targetID: target,
            resourceActor: 2,
            hitPoints: 30,
          }),
        );
      }

      const result = computeSwiftmendAudit(
        buffEvents,
        castEvents,
        healingEvents,
        DRUID_ID,
        SWIFTMEND_IDS,
        REJUV_IDS,
        REGROWTH_IDS,
        341000,
      );

      expect(result.wastefulCount).toBe(wastefulCount);
      expect(result.judgement).toBe(expected);
    },
  );

  it("computes availableWindows as the floor of fight duration over 15s", () => {
    const result = computeSwiftmendAudit(
      [],
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.availableWindows).toBe(22);
  });
});
```

- [ ] **Step 3: Run the test suite to verify it fails**

Run: `npm test -- src/metrics/swiftmendAudit.test.ts`
Expected: FAIL with "Cannot find module './swiftmendAudit'" (the module doesn't exist yet).

- [ ] **Step 4: Implement `src/metrics/swiftmendAudit.ts`**

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import {
  type HotClipSpell,
  CLIP_THRESHOLD_MS,
  REJUVENATION_DURATION_MS,
  REGROWTH_DURATION_MS,
} from "./hotClipDetection";

// Swiftmend's own heal/removebuff events land ~1ms after its cast event in
// live data (live-validated against report 4GYHZRdtL3bvhpc8 fight 6, see
// docs/testing.md) — a small tolerance window absorbs that gap without
// risking a match against an unrelated HoT removal on the same target.
const SWIFTMEND_MATCH_TOLERANCE_MS = 50;

export type SwiftmendClassification = "efficient" | "emergency" | "wasteful";

export interface SwiftmendCastResult {
  timestampMs: number;
  targetId: number;
  consumedSpell: HotClipSpell;
  remainingMs: number;
  targetHpPct: number | null;
  classification: SwiftmendClassification;
}

export interface SwiftmendAuditResult {
  casts: SwiftmendCastResult[];
  swiftmendCastCount: number;
  wastefulCount: number;
  wastefulPct: number;
  judgement: Judgement;
  availableWindows: number;
}

interface HotRemoval {
  timestampMs: number;
  targetId: number;
  spell: HotClipSpell;
  remainingMs: number;
}

// Green only at exactly 0% wasteful, orange up to 25%, red above — per
// docs/backlog.md story 302. Deliberately not judgeThresholdBelow (whose
// "< greenMax" semantics can't express an exact-zero green band).
function judgeWastefulShare(wastefulPct: number): Judgement {
  if (wastefulPct === 0) return "green";
  if (wastefulPct <= 25) return "orange";
  return "red";
}

function trackHotRemovals(
  buffEvents: WclEvent[],
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): HotRemoval[] {
  const relevant = buffEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        (rejuvenationAbilityIds.has(event.abilityGameID) ||
          regrowthAbilityIds.has(event.abilityGameID)),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  // Keyed by target+spell (not just target) since both HoTs can be up on
  // the same target at once.
  const expiryByKey = new Map<string, number>();
  const removals: HotRemoval[] = [];

  for (const event of relevant) {
    const targetId = event.targetID as number;
    const abilityGameID = event.abilityGameID as number;
    const spell: HotClipSpell = rejuvenationAbilityIds.has(abilityGameID)
      ? "Rejuvenation"
      : "Regrowth";
    const durationMs =
      spell === "Rejuvenation"
        ? REJUVENATION_DURATION_MS
        : REGROWTH_DURATION_MS;
    const key = `${targetId}:${spell}`;

    if (event.type === "applybuff" || event.type === "refreshbuff") {
      expiryByKey.set(key, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "removebuff") {
      const expiry = expiryByKey.get(key);
      if (expiry !== undefined) {
        removals.push({
          timestampMs: event.timestamp,
          targetId,
          spell,
          remainingMs: expiry - event.timestamp,
        });
      }
      expiryByKey.delete(key);
    }
  }

  return removals;
}

function findConsumedHot(
  removals: HotRemoval[],
  targetId: number,
  castTimestamp: number,
): HotRemoval | undefined {
  return removals.find(
    (removal) =>
      removal.targetId === targetId &&
      removal.timestampMs >= castTimestamp &&
      removal.timestampMs <= castTimestamp + SWIFTMEND_MATCH_TOLERANCE_MS,
  );
}

function findTargetHpPctBeforeCast(
  healingEvents: WclEvent[],
  targetId: number,
  castTimestamp: number,
): number | null {
  let best: { timestamp: number; hitPoints: number } | null = null;

  for (const event of healingEvents) {
    if (event.targetID !== targetId) continue;
    if (event.timestamp >= castTimestamp) continue;
    // resourceActor 2 marks the target's own HP on this event (1 would be
    // the event's source) — live-validated, see docs/testing.md.
    if (event.resourceActor !== 2) continue;
    const hitPoints = event.hitPoints;
    if (typeof hitPoints !== "number") continue;
    if (best === null || event.timestamp > best.timestamp) {
      best = { timestamp: event.timestamp, hitPoints };
    }
  }

  return best?.hitPoints ?? null;
}

// Efficient takes priority even if HP also happens to be low — consuming an
// about-to-expire HoT is the correct play regardless of the target's HP.
function classify(
  remainingMs: number,
  targetHpPct: number | null,
): SwiftmendClassification {
  if (remainingMs <= CLIP_THRESHOLD_MS) return "efficient";
  if (targetHpPct !== null && targetHpPct <= 50) return "emergency";
  return "wasteful";
}

export function computeSwiftmendAudit(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  fightDurationMs: number,
): SwiftmendAuditResult {
  const swiftmendCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        swiftmendAbilityIds.has(event.abilityGameID),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const removals = trackHotRemovals(
    buffEvents,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
  );

  const casts: SwiftmendCastResult[] = [];
  for (const cast of swiftmendCasts) {
    const targetId = cast.targetID as number;
    const consumed = findConsumedHot(removals, targetId, cast.timestamp);
    // A Swiftmend the game allowed to be cast always consumed a real HoT;
    // no match means our buff-event window didn't cover its application —
    // skip rather than guess which spell or how much was remaining.
    if (consumed === undefined) continue;

    const targetHpPct = findTargetHpPctBeforeCast(
      healingEvents,
      targetId,
      cast.timestamp,
    );
    const remainingMs = Math.max(0, consumed.remainingMs);

    casts.push({
      timestampMs: cast.timestamp,
      targetId,
      consumedSpell: consumed.spell,
      remainingMs,
      targetHpPct,
      classification: classify(remainingMs, targetHpPct),
    });
  }

  const wastefulCount = casts.filter(
    (cast) => cast.classification === "wasteful",
  ).length;
  const wastefulPct =
    casts.length === 0 ? 0 : (wastefulCount / casts.length) * 100;

  return {
    casts,
    swiftmendCastCount: swiftmendCasts.length,
    wastefulCount,
    wastefulPct,
    judgement: judgeWastefulShare(wastefulPct),
    availableWindows: Math.floor(fightDurationMs / 15_000),
  };
}
```

- [ ] **Step 5: Run the test suite to verify it passes**

Run: `npm test -- src/metrics/swiftmendAudit.test.ts src/metrics/hotClipDetection.test.ts`
Expected: PASS

- [ ] **Step 6: Static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/metrics/hotClipDetection.ts src/metrics/swiftmendAudit.ts src/metrics/swiftmendAudit.test.ts
git commit -m "feat(spell-discipline): add computeSwiftmendAudit metric"
```

---

### Task 3: `ClassTag` UI primitive (Tier 3)

**Files:**

- Create: `src/app/components/ui/ClassTag/index.tsx`
- Create: `src/app/components/ui/ClassTag/index.module.css`
- Create: `src/app/components/ui/ClassTag/index.test.tsx`

**Interfaces:**

- Produces: `ClassTag({ tone: "efficient" | "emergency" | "wasteful", children: ReactNode })` — consumed by Task 4's `SwiftmendAuditCard`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassTag } from "./index";

describe("ClassTag", () => {
  it.each([
    ["efficient", "Efficient"],
    ["emergency", "Emergency"],
    ["wasteful", "Wasteful"],
  ] as const)("renders %s tone content", (tone, text) => {
    render(<ClassTag tone={tone}>{text}</ClassTag>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/app/components/ui/ClassTag/index.test.tsx`
Expected: FAIL — "Cannot find module './index'"

- [ ] **Step 3: Implement**

`src/app/components/ui/ClassTag/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ClassTagProps {
  tone: "efficient" | "emergency" | "wasteful";
  children: ReactNode;
}

export function ClassTag({ tone, children }: ClassTagProps) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}
```

`src/app/components/ui/ClassTag/index.module.css` (colors match `docs/design_v2/source/shared.jsx`'s `CLASS_TONE`):

```css
.tag {
  display: inline-block;
  font-size: var(--text-small-size);
  font-weight: 600;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  white-space: nowrap;
}
.efficient {
  color: var(--judgement-green);
  background: var(--judgement-green-bg);
}
.emergency {
  color: var(--text);
  background: var(--code-bg);
}
.wasteful {
  color: var(--judgement-red);
  background: var(--judgement-red-bg);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/app/components/ui/ClassTag/index.test.tsx`
Expected: PASS

- [ ] **Step 5: Static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/app/components/ui/ClassTag
git commit -m "feat(ui): add ClassTag primitive for per-row classification badges"
```

---

### Task 4: `SwiftmendAuditCard` component (Tier 3)

**Files:**

- Create: `src/app/components/SwiftmendAuditCard/index.tsx`
- Create: `src/app/components/SwiftmendAuditCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeSwiftmendAudit` from `../../../metrics/swiftmendAudit` (Task 2); `MetricCard`, `DataTable`, `ClassTag` from `../ui/*`; `formatDuration` from `../../../report/fightRows`; `buildFightTimeUrl` from `../../../report/wclLinks`.
- Produces: `SwiftmendAuditCard(props): JSX.Element` — consumed by Task 5's `SpellDisciplineContent`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwiftmendAuditCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  aRemoveBuffEvent,
  aHealEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve(buffEvents);
  };
}

describe("SwiftmendAuditCard", () => {
  it("shows the wasteful count/judgement and a per-cast table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 80,
      }),
    ];

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents, healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Swiftmend quality audit" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 wasteful of 1 (100%)")).toBeInTheDocument(),
    );
    expect(screen.getByText("Maintank")).toBeInTheDocument();
    expect(screen.getByText("Rejuvenation")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Wasteful")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no Swiftmends", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No Swiftmends cast this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/app/components/SwiftmendAuditCard/index.test.tsx`
Expected: FAIL — "Cannot find module './index'"

- [ ] **Step 3: Implement `src/app/components/SwiftmendAuditCard/index.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeSwiftmendAudit,
  type SwiftmendAuditResult,
} from "../../../metrics/swiftmendAudit";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { ClassTag } from "../ui/ClassTag";

export interface SwiftmendAuditCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  swiftmendAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: SwiftmendAuditResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_relics_idolofrejuvenation.jpg";

const THRESHOLD =
  "Classification: efficient (consumed HoT ≤ 3s remaining, regardless of HP), emergency (not efficient, and target ≤ 50% HP), wasteful (neither). Green 0% wasteful, orange ≤ 25%, red > 25% of Swiftmend casts. Target HP% is read from the most recent Healing event on that target before the cast — if damage landed in the gap between that sample and the cast, the true HP may have been lower than shown. Usage vs. 15s-cooldown availability is informational context only.";

const CLASSIFICATION_LABEL: Record<string, string> = {
  efficient: "Efficient",
  emergency: "Emergency",
  wasteful: "Wasteful",
};

export function SwiftmendAuditCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  swiftmendAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  targetNames,
  fetchEvents,
}: SwiftmendAuditCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
        const computed = computeSwiftmendAudit(
          buffEvents,
          castEvents,
          healingEvents,
          druidId,
          swiftmendAbilityIds,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Swiftmend quality audit.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    swiftmendAbilityIds,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const {
    casts,
    swiftmendCastCount,
    wastefulCount,
    wastefulPct,
    judgement,
    availableWindows,
  } = result.result;

  const utilizationPct =
    availableWindows === 0 ? 0 : (swiftmendCastCount / availableWindows) * 100;

  return (
    <MetricCard
      icon={ICON}
      title="Swiftmend quality audit"
      value={`${wastefulCount} wasteful of ${casts.length} (${wastefulPct.toFixed(0)}%)`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {casts.length === 0 ? (
        <p>No Swiftmends cast this fight.</p>
      ) : (
        <DataTable
          columns={[
            "Time",
            "Target",
            "HoT consumed",
            "Remaining",
            "Target HP%",
            "Classification",
          ]}
          rows={casts.map((cast) => [
            <a
              href={buildFightTimeUrl(
                reportCode,
                fight.id,
                cast.timestampMs,
                cast.timestampMs,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {formatDuration(cast.timestampMs - fight.startTime)}
            </a>,
            targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`,
            cast.consumedSpell,
            `${(cast.remainingMs / 1000).toFixed(1)}s`,
            cast.targetHpPct === null ? "—" : `${cast.targetHpPct}%`,
            <ClassTag tone={cast.classification}>
              {CLASSIFICATION_LABEL[cast.classification]}
            </ClassTag>,
          ])}
        />
      )}
      <p>
        {swiftmendCastCount} Swiftmend{swiftmendCastCount === 1 ? "" : "s"} cast
        of {availableWindows} possible 15s windows — {utilizationPct.toFixed(0)}
        % utilization (informational).
      </p>
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/app/components/SwiftmendAuditCard/index.test.tsx`
Expected: PASS

- [ ] **Step 5: Static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/app/components/SwiftmendAuditCard
git commit -m "feat(spell-discipline): add SwiftmendAuditCard"
```

---

### Task 5: Wire the audit into Spell discipline, the epic summary, Scorecard, and App

**Files:**

- Modify: `src/app/components/SpellDisciplineContent/index.tsx`
- Modify: `src/app/components/SpellDisciplineContent/index.test.tsx`
- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.ts`
- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `SwiftmendAuditCard` (Task 4), `computeSwiftmendAudit`/`SwiftmendAuditResult` (Task 2), `resolveSpellAbilityIds` (existing, `../abilities/resolveAbilities`).

- [ ] **Step 1: Update `summarizeSpellDiscipline` — write the failing test first**

In `src/metrics/epicSummary.test.ts`, add the import and replace the existing `describe("summarizeSpellDiscipline", ...)` block (it currently only takes `hotClips`) with:

```ts
import type { SwiftmendAuditResult } from "./swiftmendAudit";
```

```ts
describe("summarizeSpellDiscipline", () => {
  it("takes the worst of Rejuvenation's clip judgement and the Swiftmend judgement", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 64,
        clipCount: 4,
        clipPct: 6.25,
        judgement: "orange",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 22,
        clipCount: 3,
        clipPct: 13.636363636363637,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 6,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(summarizeSpellDiscipline(hotClips, swiftmendAudit)).toEqual({
      judgement: "orange",
      stats: ["Rejuvenation clips: 6.3%", "Swiftmend wasteful: 0.0%"],
    });
  });

  it("is green when both Rejuvenation clips and Swiftmend wasteful share are green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(summarizeSpellDiscipline(hotClips, swiftmendAudit).judgement).toBe(
      "green",
    );
  });

  it("turns red when Swiftmend's wasteful share is red, even if Rejuvenation clips are green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 3,
      wastefulPct: 75,
      judgement: "red",
      availableWindows: 22,
    };

    expect(summarizeSpellDiscipline(hotClips, swiftmendAudit).judgement).toBe(
      "red",
    );
  });
});
```

Run: `npm test -- src/metrics/epicSummary.test.ts`
Expected: FAIL — `summarizeSpellDiscipline` doesn't accept a second argument yet, and the expected stats no longer match.

- [ ] **Step 2: Update `summarizeSpellDiscipline` implementation**

In `src/metrics/epicSummary.ts`, add the import:

```ts
import type { SwiftmendAuditResult } from "./swiftmendAudit";
```

Replace the existing `summarizeSpellDiscipline` function with:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a judgement.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      swiftmendAudit.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`,
    ],
  };
}
```

Run: `npm test -- src/metrics/epicSummary.test.ts`
Expected: PASS

- [ ] **Step 3: Update `SpellDisciplineContent` — write the failing test first**

In `src/app/components/SpellDisciplineContent/index.test.tsx`, add `swiftmendAbilityIds={new Set([18562])}` to the existing render call's props, and add a new assertion:

```tsx
render(
  <SpellDisciplineContent
    accessToken="test-token"
    reportCode="4GYHZRdtL3bvhpc8"
    fight={fight}
    druidId={2}
    rejuvenationAbilityIds={new Set([26982])}
    regrowthAbilityIds={new Set([26980])}
    swiftmendAbilityIds={new Set([18562])}
    targetNames={new Map()}
    fetchEvents={fetchEvents}
  />,
);

expect(
  screen.getByRole("heading", { name: "HoT clip detection" }),
).toBeInTheDocument();
expect(
  screen.getByRole("heading", { name: "Swiftmend quality audit" }),
).toBeInTheDocument();
```

Run: `npm test -- src/app/components/SpellDisciplineContent/index.test.tsx`
Expected: FAIL — the `swiftmendAbilityIds` prop doesn't exist on `SpellDisciplineContentProps` yet, and no "Swiftmend quality audit" heading renders.

- [ ] **Step 4: Update `SpellDisciplineContent` implementation**

Replace `src/app/components/SpellDisciplineContent/index.tsx` with:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { HotClipDetectionCard } from "../HotClipDetectionCard";
import { SwiftmendAuditCard } from "../SwiftmendAuditCard";
import styles from "./index.module.css";

export interface SpellDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function SpellDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  targetNames,
  fetchEvents,
}: SpellDisciplineContentProps) {
  return (
    <div className={styles.group}>
      <HotClipDetectionCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <SwiftmendAuditCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        swiftmendAbilityIds={swiftmendAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

Run: `npm test -- src/app/components/SpellDisciplineContent/index.test.tsx`
Expected: PASS

- [ ] **Step 5: Update `useSpellDisciplineSummary` — write the failing test first**

In `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`, add `new Set([18562])` as a new argument (after `regrowthAbilityIds`, before `fetchEvents`) to both `renderHook` calls:

```ts
const { result } = renderHook(() =>
  useSpellDisciplineSummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Set([26982]),
    new Set([26980]),
    new Set([18562]),
    fetchEvents,
  ),
);
```

(Apply the same added argument to the second `renderHook` call in the `"reports an error status when a fetch rejects"` test.)

Run: `npm test -- src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
Expected: FAIL — too many arguments passed to `useSpellDisciplineSummary`.

- [ ] **Step 6: Update `useSpellDisciplineSummary` implementation**

Replace `src/app/components/Scorecard/useSpellDisciplineSummary.ts` with:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeHotClipDetection } from "../../../metrics/hotClipDetection";
import { computeSwiftmendAudit } from "../../../metrics/swiftmendAudit";
import { summarizeSpellDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useSpellDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
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
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
        const hotClips = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        const swiftmendAudit = computeSwiftmendAudit(
          buffEvents,
          castEvents,
          healingEvents,
          druidId,
          swiftmendAbilityIds,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
          fight.endTime - fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeSpellDiscipline(hotClips, swiftmendAudit),
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
                : "Failed to summarize Spell discipline.",
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
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

Run: `npm test -- src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
Expected: PASS

- [ ] **Step 7: Update `Scorecard` — write the failing test first**

In `src/app/components/Scorecard/index.test.tsx`, add `swiftmendAbilityIds={new Set([18562])}` to both `render(<Scorecard ... />)` calls, immediately after the existing `regrowthAbilityIds` prop line.

Run: `npm test -- src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — `swiftmendAbilityIds` doesn't exist on `ScorecardProps` yet.

- [ ] **Step 8: Update `Scorecard` implementation**

In `src/app/components/Scorecard/index.tsx`:

Add `swiftmendAbilityIds: Set<number>;` to `ScorecardProps` (right after `regrowthAbilityIds: Set<number>;`), and add `includeResources?: boolean;` as a 5th optional parameter to the `fetchEvents` prop's function type:

```ts
export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  onBackToFights: () => void;
  onStartOver: () => void;
}
```

Destructure the new prop in the component signature (add `swiftmendAbilityIds,` after `regrowthAbilityIds,`):

```ts
export function Scorecard({
  accessToken,
  reportCode,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  targetNames,
  fetchEvents,
  onBackToFights,
  onStartOver,
}: ScorecardProps) {
```

Pass it to `useSpellDisciplineSummary`:

```ts
const spellSummary = useSpellDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  fetchEvents,
);
```

And to the `SpellDisciplineContent` render inside the `activeEpic === "spell"` block:

```tsx
<SpellDisciplineContent
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  rejuvenationAbilityIds={rejuvenationAbilityIds}
  regrowthAbilityIds={regrowthAbilityIds}
  swiftmendAbilityIds={swiftmendAbilityIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

Run: `npm test -- src/app/components/Scorecard/index.test.tsx`
Expected: PASS

- [ ] **Step 9: Wire `swiftmendAbilityIds` in `App.tsx`**

No test changes needed here (App.tsx's existing tests exercise `canGetScorecard` gating behaviorally, not via prop inspection — verify with the full run in Step 10). In `src/App.tsx`, add a new `useMemo` right after `regrowthAbilityIds` (around line 114-120):

```ts
const swiftmendAbilityIds = useMemo(
  () =>
    resolvedAbilities
      ? resolveSpellAbilityIds(resolvedAbilities, "Swiftmend")
      : null,
  [resolvedAbilities],
);
```

Add it to the `canGetScorecard` condition:

```ts
const canGetScorecard =
  selectedDruid !== null &&
  lifebloomAbilityIds !== null &&
  rejuvenationAbilityIds !== null &&
  regrowthAbilityIds !== null &&
  swiftmendAbilityIds !== null &&
  selectedFightIds.length > 0;
```

Add it to the render-gating condition and the `Scorecard` props (in the block starting `{report && loadedReport && scorecardRequested && ...}`):

```tsx
{
  report &&
    loadedReport &&
    scorecardRequested &&
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    loadedReport.fights
      .filter((f) => selectedFightIds.includes(f.id))
      .map((f) => (
        <Shell width={800} key={f.id}>
          <Scorecard
            accessToken={accessToken}
            reportCode={report.reportCode}
            fight={f}
            druidId={selectedDruid.id}
            druid={selectedDruid}
            lifebloomAbilityIds={lifebloomAbilityIds}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            targetNames={actorNames}
            fetchEvents={wrappedFetchEvents}
            onBackToFights={handleChangeFightSelection}
            onStartOver={handleStartOver}
          />
        </Shell>
      ));
}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS (including `src/App.test.tsx` unmodified — `resolveSpellAbilityIds` returns an empty `Set`, not `null`, when no Swiftmend abilities resolve, so `canGetScorecard`'s `!== null` check is unaffected by whether the test's mocked report includes a Swiftmend cast).

If `src/App.test.tsx` fails: read the failure carefully (per `docs/testing.md`, don't guess) — the most likely cause would be a snapshot of button/heading text counts changing, not the ability-id gating logic itself.

- [ ] **Step 11: Static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

```bash
git add src/app/components/SpellDisciplineContent src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts src/app/components/Scorecard/useSpellDisciplineSummary.ts src/app/components/Scorecard/useSpellDisciplineSummary.test.ts src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx src/App.tsx
git commit -m "feat(spell-discipline): wire the Swiftmend quality audit into the scorecard"
```

---

### Task 6: Documentation wrap-up

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/plans/swiftmend-quality-audit-plan.md` (this file)

**Interfaces:** none (docs only).

- [ ] **Step 1: Mark story 302 done in the backlog**

In `docs/backlog.md`, change the heading:

```
### 302 — Swiftmend quality audit
```

to:

```
### 302 — Swiftmend quality audit ✅ Done
```

(matching the existing convention used by story 301's heading directly above it).

- [ ] **Step 2: Update `CLAUDE.md`'s Repo state paragraph**

In `CLAUDE.md`, find the sentence ending `"...and story 301 (HoT clip detection) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D, story 302 next."` and change it to:

```
... and story 301 (HoT clip detection) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D — story 301 and story 302 (Swiftmend quality audit) are done, story 303 next.
```

(Adjust the surrounding sentence only as needed for grammar — the substantive change is marking 302 done and pointing "next" at 303.)

- [ ] **Step 3: Delete this plan file**

```bash
rm docs/plans/swiftmend-quality-audit-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git rm docs/plans/swiftmend-quality-audit-plan.md
git commit -m "docs: mark story 302 done"
```

---

## Self-review notes

- **Spec coverage:** all three acceptance criteria bullets of story 302 are covered — classification (Task 2's `classify`), usage-vs-availability info stat (Task 2's `swiftmendCastCount`/`availableWindows`, rendered in Task 4), and the wasteful-share R/O/G (Task 2's `judgeWastefulShare`, tested at all three boundaries in Task 2 Step 2's `it.each`).
- **New capability flagged during planning, not silently assumed:** target HP% required extending the WCL client (Task 1) — confirmed live against real report `4GYHZRdtL3bvhpc8` before writing any code, per this repo's convention of not guessing at WCL response shapes.
- **Type consistency:** `SwiftmendAuditResult`/`SwiftmendCastResult`/`SwiftmendClassification` (Task 2) are the exact names/shapes imported in Task 4 (`SwiftmendAuditCard`) and Task 5 (`epicSummary.ts`); the `fetchEvents` prop type gains its optional 5th `includeResources` parameter consistently across Task 1 (`eventCache.ts`), Task 4 (`SwiftmendAuditCardProps`), and Task 5 (`SpellDisciplineContentProps`, `useSpellDisciplineSummary`, `ScorecardProps`).
