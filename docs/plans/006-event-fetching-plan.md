# Story 006 — Event Fetching & Caching Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, tested data layer that fetches WCL events (casts, buffs, heals, resources, deaths, combatant info) for a fight, transparently paginating via `nextPageTimestamp`, caching per-fight results in memory so they're never fetched twice in a session, and surfacing rate-limit responses as a distinguishable, retryable error.

**Architecture:** Two new modules mirroring the project's existing test-tier split. `src/wcl/events.ts` is a raw single-page fetch function (same low-abstraction `fetch` + template-string GraphQL style as the existing `fetchCastsTable`/`fetchReportFights` in `src/wcl/client.ts`), tested at Tier 2 against MSW-mocked HTTP with real captured fixtures. `src/wcl/eventCache.ts` wraps it with a pagination loop and an in-memory `Map` cache, tested at Tier 1 with a hand-rolled fake page-fetcher (no HTTP, no MSW).

**Tech Stack:** TypeScript, Vitest, MSW (`msw/node`) for Tier 2 HTTP mocking — same as the rest of `src/wcl/`.

## Global Constraints

- No spell/ability IDs are hardcoded anywhere in this story — not applicable here (this story fetches raw events, not resolved abilities; ability resolution is story 007).
- No secrets required at build/test time — this story adds no new auth surface; it reuses the existing `accessToken` parameter pattern from `client.ts`.
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) must pass full-project before every commit (pre-commit hook enforces this already).
- Every red/orange/green threshold must cite `docs/backlog.md` — not applicable to this story (no judgement thresholds here).
- Commits follow Conventional Commits: `type(scope): summary`. Use scope `wcl` for all commits in this plan.

---

## Reference: existing code this plan builds on

`src/wcl/client.ts` (read, do not modify except where a task says so) already exports:

```ts
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";

export class WclApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`WCL API responded ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}
```

`test/integration/client.test.ts` shows the existing MSW pattern (`setupServer()`, `beforeAll(() => server.listen({ onUnhandledRequest: "error" }))`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())`) — new Tier 2 tests reuse this exact setup.

Three real fixtures already exist at `test/integration/fixtures/`:

- `events-healing-single-page.json` — real WCL response, `data.reportData.report.events` has 5 sample events and `nextPageTimestamp: null`.
- `events-healing-paginated-page1.json` — real WCL response, `nextPageTimestamp: 2489306`.
- `events-healing-paginated-page2.json` — real WCL response, `nextPageTimestamp: 3068415`.

(All three were captured live against report `4GYHZRdtL3bvhpc8`, fight 6, per `docs/specs/006-event-fetching-design.md`.)

---

### Task 1: `src/wcl/events.ts` — raw single-page event fetch

**Files:**

- Create: `src/wcl/events.ts`
- Create: `test/integration/events.test.ts`
- Read (fixtures, already exist): `test/integration/fixtures/events-healing-single-page.json`, `test/integration/fixtures/events-healing-paginated-page1.json`, `test/integration/fixtures/events-healing-paginated-page2.json`

**Interfaces:**

- Consumes: `USER_API_URL`, `WclApiError` from `src/wcl/client.ts`.
- Produces (used by Task 2): `WclEventDataType`, `WclEvent`, `WclEventsPage`, `WclRateLimitError`, `fetchEventsPage(accessToken, reportCode, fightId, dataType, startTime, endTime): Promise<WclEventsPage>`.

- [ ] **Step 1: Write the failing tests**

Create `test/integration/events.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchEventsPage, WclRateLimitError } from "../../src/wcl/events";
import { WclApiError, USER_API_URL } from "../../src/wcl/client";
import singlePageFixture from "./fixtures/events-healing-single-page.json";
import paginatedPage1Fixture from "./fixtures/events-healing-paginated-page1.json";
import paginatedPage2Fixture from "./fixtures/events-healing-paginated-page2.json";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchEventsPage", () => {
  it("parses events and nextPageTimestamp from a real single-page response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(singlePageFixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      1879119,
      2036920,
    );

    expect(result.nextPageTimestamp).toBeNull();
    expect(result.events).toHaveLength(5);
    expect(result.events[0]).toMatchObject({
      timestamp: expect.any(Number),
      type: "heal",
    });
  });

  it("parses a non-null nextPageTimestamp from a real paginated response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(paginatedPage1Fixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      0,
      999999999,
    );

    expect(result.nextPageTimestamp).toBe(2489306);
    expect(result.events).toHaveLength(5);
  });

  it("parses a different nextPageTimestamp from the following real page", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(paginatedPage2Fixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      2489306,
      999999999,
    );

    expect(result.nextPageTimestamp).toBe(3068415);
    expect(result.events).toHaveLength(5);
  });

  it("sends fightIDs, dataType, startTime, and endTime in the query", async () => {
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

    expect(requestBody?.query).toContain("fightIDs: [6]");
    expect(requestBody?.query).toContain("dataType: Healing");
    expect(requestBody?.query).toContain("startTime: 1879119");
    expect(requestBody?.query).toContain("endTime: 2036920");
  });

  it("throws WclRateLimitError with a retryable message on HTTP 429", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );

    await expect(
      fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      ),
    ).rejects.toThrow(WclRateLimitError);

    let error: unknown;
    try {
      await fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      );
    } catch (e) {
      error = e;
    }
    expect((error as Error).message).toBe(
      "Warcraft Logs is rate-limiting requests right now — wait a moment and try again.",
    );
  });

  it("throws WclApiError on other non-2xx responses", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
      ),
    );

    await expect(
      fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      ),
    ).rejects.toThrow(WclApiError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/integration/events.test.ts`
Expected: FAIL — `src/wcl/events.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/wcl/events.ts`:

```ts
import { USER_API_URL, WclApiError } from "./client";

export type WclEventDataType =
  "Casts" | "Buffs" | "Healing" | "Resources" | "Deaths" | "CombatantInfo";

export interface WclEvent {
  timestamp: number;
  type: string;
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  fight: number;
  [key: string]: unknown;
}

export interface WclEventsPage {
  events: WclEvent[];
  nextPageTimestamp: number | null;
}

export class WclRateLimitError extends WclApiError {
  constructor(status: number, body: string) {
    super(status, body);
    this.message =
      "Warcraft Logs is rate-limiting requests right now — wait a moment and try again.";
  }
}

export async function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
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
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}) {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/integration/events.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/wcl/events.ts test/integration/events.test.ts
git commit -m "feat(wcl): add paginated single-page event fetch with rate-limit detection"
```

---

### Task 2: `src/wcl/eventCache.ts` — pagination loop + session cache

**Files:**

- Create: `src/wcl/eventCache.ts`
- Create: `src/wcl/eventCache.test.ts`

**Interfaces:**

- Consumes: `fetchEventsPage`, `WclEvent`, `WclEventDataType`, `WclEventsPage` from `src/wcl/events.ts` (Task 1).
- Produces: `EventFetcherFight` (`{ id: number; startTime: number; endTime: number }`), `createEventFetcher(fetchPage?: typeof fetchEventsPage): { fetchEvents(accessToken: string, reportCode: string, fight: EventFetcherFight, dataType: WclEventDataType): Promise<WclEvent[]> }`.

- [ ] **Step 1: Write the failing tests**

Create `src/wcl/eventCache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createEventFetcher } from "./eventCache";
import type { WclEvent } from "./events";

function anEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 0,
    type: "heal",
    fight: 6,
    ...overrides,
  };
}

const fight = { id: 6, startTime: 1879119, endTime: 2036920 };

describe("createEventFetcher", () => {
  it("concatenates events across multiple pages until nextPageTimestamp is null", async () => {
    const fakeFetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 1 })],
        nextPageTimestamp: 1900000,
      })
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 2 })],
        nextPageTimestamp: null,
      });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    const result = await fetchEvents("token", "report1", fight, "Healing");

    expect(result.map((e) => e.timestamp)).toEqual([1, 2]);
    expect(fakeFetchPage).toHaveBeenCalledTimes(2);
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
  });

  it("never fetches the same fight/dataType/report twice", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    await fetchEvents("token", "report1", fight, "Healing");
    await fetchEvents("token", "report1", fight, "Healing");

    expect(fakeFetchPage).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls for the same key into one fetch", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    const [a, b] = await Promise.all([
      fetchEvents("token", "report1", fight, "Healing"),
      fetchEvents("token", "report1", fight, "Healing"),
    ]);

    expect(fakeFetchPage).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("fetches independently for different fight, dataType, or report keys", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    await fetchEvents("token", "report1", fight, "Healing");
    await fetchEvents("token", "report1", { ...fight, id: 7 }, "Healing");
    await fetchEvents("token", "report1", fight, "Casts");
    await fetchEvents("token", "report2", fight, "Healing");

    expect(fakeFetchPage).toHaveBeenCalledTimes(4);
  });

  it("does not cache a rejected fetch, allowing a later retry", async () => {
    const fakeFetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        events: [anEvent()],
        nextPageTimestamp: null,
      });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);

    await expect(
      fetchEvents("token", "report1", fight, "Healing"),
    ).rejects.toThrow("rate limited");

    const result = await fetchEvents("token", "report1", fight, "Healing");
    expect(result).toHaveLength(1);
    expect(fakeFetchPage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wcl/eventCache.test.ts`
Expected: FAIL — `src/wcl/eventCache.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/wcl/eventCache.ts`:

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
  ): Promise<WclEvent[]> {
    const key = `${reportCode}:${fight.id}:${dataType}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = fetchAllPages(
      accessToken,
      reportCode,
      fight,
      dataType,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wcl/eventCache.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass, including the full existing suite (no regressions).

```bash
git add src/wcl/eventCache.ts src/wcl/eventCache.test.ts
git commit -m "feat(wcl): add pagination loop and in-memory cache over event fetching"
```

---

### Task 3: Retire story 006's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/006-event-fetching-design.md`
- Delete: `docs/plans/006-event-fetching-plan.md` (this file)
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation only, no code interfaces.

- [ ] **Step 1: Mark story 006 done in the backlog**

In `docs/backlog.md`, change the heading:

```diff
-### 006 — Event fetching & caching layer
+### 006 — Event fetching & caching layer ✅ Done
```

- [ ] **Step 2: Update the ordering-note pointer**

In `docs/backlog.md`, in the "Ordering note" section, change:

```diff
-**Suggested path from the current state (006 next):**
+**Suggested path from the current state (007 next):**
```

- [ ] **Step 3: Update CLAUDE.md's repo-state summary**

In `CLAUDE.md`, under "## Repo state", change:

```diff
-Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), and story 005 (druid auto-detection & selection) are complete and live. Phase 1 MVP work continues with backlog story 006 (event fetching & caching layer) next.
+Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), and story 006 (event fetching & caching layer) are complete and live. Phase 1 MVP work continues with backlog story 007 (ability resolution table) next.
```

- [ ] **Step 4: Confirm nothing else references the spec/plan paths**

Run: `grep -rn "006-event-fetching" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only matches inside `docs/specs/006-event-fetching-design.md` and `docs/plans/006-event-fetching-plan.md` themselves (the files about to be deleted). If anything else matches, fix that reference before deleting.

- [ ] **Step 5: Delete the spec and plan files**

```bash
rm docs/specs/006-event-fetching-design.md docs/plans/006-event-fetching-plan.md
```

- [ ] **Step 6: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

```bash
git add docs/backlog.md CLAUDE.md
git add -u docs/specs/006-event-fetching-design.md docs/plans/006-event-fetching-plan.md
git commit -m "docs: mark story 006 done, delete its spec/plan, point at story 007"
```
