# Host-aware calibration tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scripts/calibrate.ts` support both WCL API hosts (`fresh`/Anniversary and `classic`-2021), have its output self-describe which vintage it came from via a new `source` field, and use that to make the previously-unreproducible classic-2021 calibration corpus reproducible again.

**Architecture:** Thread an optional `host: "fresh" | "classic" = "fresh"` parameter through the single choke point every WCL fetch function already funnels through (`postGraphQL`/`postGraphQLOnce` in `src/wcl/client.ts`), fanning out to `fetchReportFights`/`fetchCastsTable`/`fetchMasterDataAbilities` (client.ts), `fetchEventsPage`/`fetchLookbackEventsPage` (events.ts), and `createEventFetcher` (eventCache.ts, bound once at factory-creation time). `calibrate.ts` derives `host` from its input via the same `parseReportInput` the app's `ConnectPanel` already uses — no new CLI flag. `CalibrationOutput` gains a `source: "fresh" | "classic"` field. Every existing app call site keeps its default (`"fresh"`) — zero behavior change to the shipped app.

**Tech Stack:** TypeScript, Vitest + MSW (Tier 2 integration tests), tsx (script execution), existing `src/wcl/*` and `scripts/lib/*` modules.

## Global Constraints

- Commits follow Conventional Commits: `type(scope): summary` (CLAUDE.md).
- No server-side code, no secrets required at build/deploy time (CLAUDE.md principle 2) — not touched by this work, but the pre-commit hook (`typecheck`, `lint`, `format:check`) must pass on every commit, never bypassed with `--no-verify` (CLAUDE.md).
- Static analysis runs full-project, not scoped to changed files (`docs/testing.md` Tier 0).
- Tests are co-located: `*.test.ts` next to unit-tested files (Tier 1), Tier 2 WCL-client integration tests live in `test/integration/*.test.ts` against MSW-mocked fixtures (`docs/testing.md`).
- Design spec for this work: `docs/specs/calibrate-host-support-design.md` — delete it once this plan ships and `docs/backlog.md`/`docs/testing.md` reflect the change (CLAUDE.md: "a story isn't done until its paperwork is retired").

---

### Task 1: Canonical `Host` type

**Files:**

- Modify: `src/wcl/client.ts` (add exported `Host` type)
- Modify: `src/report/parseReportInput.ts` (re-export `Host` from client.ts instead of defining its own)

**Interfaces:**

- Produces: `export type Host = "fresh" | "classic";` from `src/wcl/client.ts` — every later task imports this.

This is a pure type relocation (no behavior change): today `src/report/parseReportInput.ts` defines its own `Host` type, but `src/wcl/` (the lower-level API layer) never depends on `src/report/` (the domain layer) — every existing cross-file reference goes the other direction (e.g. `src/report/druidDetection.ts` imports `Fight` from `src/wcl/client.ts`). Moving the canonical definition into `client.ts` fixes that direction. Because `parseReportInput.ts` re-exports the same name, none of its ~20 existing consumers (`ReportInput`, `Scorecard`, `hashRoute.ts`, `wclLinks.ts`, etc.) need any change.

- [ ] **Step 1: Add `Host` to `src/wcl/client.ts`**

In `src/wcl/client.ts`, change:

```ts
import { publishRateLimitUsage } from "./rateLimitUsage";

export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
```

to:

```ts
import { publishRateLimitUsage } from "./rateLimitUsage";

export type Host = "fresh" | "classic";

export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
```

- [ ] **Step 2: Re-point `src/report/parseReportInput.ts` to import it**

Change:

```ts
const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;
const WCL_HOSTNAME_PATTERN = /^([a-z0-9]+)\.warcraftlogs\.com$/;
const REPORT_PATH_PATTERN = /\/reports\/([A-Za-z0-9]{16})(?![A-Za-z0-9])/;

export type Host = "fresh" | "classic";
```

to:

```ts
import type { Host } from "../wcl/client";

const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;
const WCL_HOSTNAME_PATTERN = /^([a-z0-9]+)\.warcraftlogs\.com$/;
const REPORT_PATH_PATTERN = /\/reports\/([A-Za-z0-9]{16})(?![A-Za-z0-9])/;

export type { Host };
```

- [ ] **Step 3: Verify nothing broke**

This is a type-only refactor with no new behavior, so verification is typecheck + the existing suite rather than a new test:

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run src/report/parseReportInput.test.ts`
Expected: all existing tests PASS unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/wcl/client.ts src/report/parseReportInput.ts
git commit -m "refactor(wcl-client): move Host type to client.ts, re-export from parseReportInput"
```

---

### Task 2: Host-aware `client.ts` fetch functions

**Files:**

- Modify: `src/wcl/client.ts` (`postGraphQLOnce`, `postGraphQL`, `fetchReportFights`, `fetchCastsTable`, `fetchMasterDataAbilities`)
- Test: `test/integration/client.test.ts`

**Interfaces:**

- Consumes: `Host` from Task 1.
- Produces: `CLASSIC_USER_API_URL: string`; every fetch function below gains a trailing optional `host: Host = "fresh"` parameter — signature otherwise unchanged, so every existing call site (17 metric cards, `ConnectPanel`, etc.) keeps working with no edits.

- [ ] **Step 1: Write the failing tests**

In `test/integration/client.test.ts`, add `CLASSIC_USER_API_URL` to the existing import from `../../src/wcl/client`:

```ts
import {
  exchangeCodeForToken,
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
  WclGraphQLError,
  withRateLimitDetection,
  WclTimeoutError,
  fetchWithTimeout,
  withErrorReporting,
  TOKEN_URL,
  USER_API_URL,
  CLASSIC_USER_API_URL,
} from "../../src/wcl/client";
```

Add this test inside `describe("fetchReportFights", ...)`, right after the existing `"parses a real captured classic.-sourced report the same way"` test:

```ts
it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
  server.use(
    http.post(CLASSIC_USER_API_URL, () =>
      HttpResponse.json(reportFightsClassicFixture),
    ),
  );
  const result = await fetchReportFights(
    "test-token",
    "mtRh3kJ9YMLazyvQ",
    undefined,
    "classic",
  );
  expect(result.title).toBe("BT / Hyjal");
});
```

Add this test inside `describe("fetchCastsTable", ...)`, right after the existing `"requests the table query with the given fight IDs"` test:

```ts
it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
  server.use(
    http.post(CLASSIC_USER_API_URL, () => HttpResponse.json(castsTableFixture)),
  );
  const result = await fetchCastsTable(
    "test-token",
    "mtRh3kJ9YMLazyvQ",
    [6],
    undefined,
    "classic",
  );
  expect(result).toHaveLength(5);
});
```

Add this test inside `describe("fetchMasterDataAbilities", ...)`, right after the existing `"requests the masterData abilities query for the given report"` test:

```ts
it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
  server.use(
    http.post(CLASSIC_USER_API_URL, () =>
      HttpResponse.json(masterDataAbilitiesFixture),
    ),
  );
  const result = await fetchMasterDataAbilities(
    "test-token",
    "mtRh3kJ9YMLazyvQ",
    undefined,
    "classic",
  );
  expect(result).toHaveLength(930);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/integration/client.test.ts`
Expected: FAIL — `CLASSIC_USER_API_URL` is not exported from `src/wcl/client.ts` (TypeScript/import error), and even once that's stubbed in, the three new tests fail with an MSW "unhandled request" error against `https://classic.warcraftlogs.com/...` because every fetch function still always posts to `USER_API_URL`.

- [ ] **Step 3: Implement**

In `src/wcl/client.ts`, change:

```ts
export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";
```

to:

```ts
export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";
export const CLASSIC_USER_API_URL =
  "https://classic.warcraftlogs.com/api/v2/user";

const USER_API_URLS: Record<Host, string> = {
  fresh: USER_API_URL,
  classic: CLASSIC_USER_API_URL,
};
```

Change `postGraphQLOnce`:

```ts
async function postGraphQLOnce(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
  host: Host = "fresh",
) {
  const resp = await fetchWithTimeout(
    USER_API_URLS[host],
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
    },
    signal,
  );
```

(rest of the function body unchanged)

Change `postGraphQL`:

```ts
export async function postGraphQL(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
  host: Host = "fresh",
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postGraphQLOnce(accessToken, query, signal, host);
    } catch (err) {
```

(rest of the function body unchanged)

Change `fetchReportFights`'s signature and its `postGraphQL` call:

```ts
export async function fetchReportFights(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<ReportFights> {
  const data = await postGraphQL(
    accessToken,
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage gameZone { id name } }
      zone { expansion { id name } }
      archiveStatus { isArchived isAccessible }
    }
  }
}`,
    signal,
    host,
  );
```

(rest of the function body unchanged)

Change `fetchCastsTable`'s signature and its `postGraphQL` call:

```ts
export async function fetchCastsTable(
  accessToken: string,
  reportCode: string,
  fightIds: number[],
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<CastTableEntry[]> {
  const data = await postGraphQL(
    accessToken,
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      table(fightIDs: [${fightIds.join(", ")}], dataType: Casts)
    }
  }
}`,
    signal,
    host,
  );
```

(rest of the function body unchanged)

Change `fetchMasterDataAbilities`'s signature and the `postGraphQLOnce` call inside its `fetchAbilities` closure:

```ts
export async function fetchMasterDataAbilities(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<ReportAbility[]> {
  const query = `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      masterData { abilities { gameID name } }
    }
  }
}`;

  const fetchAbilities = async () => {
    const data = await postGraphQLOnce(accessToken, query, signal, host);
    return data.reportData.report.masterData.abilities as Array<{
      gameID: number;
      name: string;
    }> | null;
  };
```

(rest of the function body unchanged — the retry logic below already calls `fetchAbilities()` twice; both calls now use `host` via the closure automatically.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Run full typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (confirms every existing app call site still compiles with the new trailing optional parameter).

- [ ] **Step 6: Commit**

```bash
git add src/wcl/client.ts test/integration/client.test.ts
git commit -m "feat(wcl-client): support classic.warcraftlogs.com via an optional host parameter"
```

---

### Task 3: Host-aware `events.ts` fetch functions

**Files:**

- Modify: `src/wcl/events.ts` (`postEventsQuery`, `fetchEventsPage`, `fetchLookbackEventsPage`)
- Test: `test/integration/events.test.ts`

**Interfaces:**

- Consumes: `Host` from `src/wcl/client.ts` (Task 1), `postGraphQL`'s new `host` parameter (Task 2).
- Produces: `fetchEventsPage(..., includeResources = false, host: Host = "fresh")`, `fetchLookbackEventsPage(..., includeResources = false, host: Host = "fresh")` — both gain the new parameter as the last one, after their existing trailing default.

- [ ] **Step 1: Write the failing tests**

In `test/integration/events.test.ts`, update the imports:

```ts
import {
  fetchEventsPage,
  fetchLookbackEventsPage,
  WclRateLimitError,
} from "../../src/wcl/events";
import {
  WclApiError,
  WclGraphQLError,
  USER_API_URL,
  CLASSIC_USER_API_URL,
} from "../../src/wcl/client";
```

Add this test inside `describe("fetchEventsPage", ...)`, right after the existing `"sends fightIDs, dataType, startTime, and endTime in the query"` test:

```ts
it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
  server.use(
    http.post(CLASSIC_USER_API_URL, () => HttpResponse.json(singlePageFixture)),
  );

  const result = await fetchEventsPage(
    "test-token",
    "mtRh3kJ9YMLazyvQ",
    6,
    "Healing",
    1879119,
    2036920,
    false,
    "classic",
  );

  expect(result.events).toHaveLength(5);
});
```

Add this new describe block at the end of the file, after the closing `});` of `describe("fetchEventsPage", ...)`:

```ts
describe("fetchLookbackEventsPage", () => {
  it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
    server.use(
      http.post(CLASSIC_USER_API_URL, () =>
        HttpResponse.json(singlePageFixture),
      ),
    );

    const result = await fetchLookbackEventsPage(
      "test-token",
      "mtRh3kJ9YMLazyvQ",
      "Buffs",
      0,
      1000,
      false,
      "classic",
    );

    expect(result.events).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/integration/events.test.ts`
Expected: FAIL — `CLASSIC_USER_API_URL` import error until Task 2 is in place (it is, from the prior task), then an MSW "unhandled request" error against `classic.warcraftlogs.com` because both functions still always post to `USER_API_URL`.

- [ ] **Step 3: Implement**

In `src/wcl/events.ts`, change the top imports:

```ts
import { WclApiError, postGraphQL } from "./client";
import type { Host } from "./client";
```

Change `postEventsQuery`:

```ts
async function postEventsQuery(
  accessToken: string,
  reportCode: string,
  eventsFieldArgs: string,
  host: Host = "fresh",
): Promise<WclEventsPage> {
  let data;
  try {
    data = await postGraphQL(
      accessToken,
      `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      events(${eventsFieldArgs}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
      undefined,
      host,
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

Change `fetchEventsPage`:

```ts
export async function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
  host: Host = "fresh",
): Promise<WclEventsPage> {
  return postEventsQuery(
    accessToken,
    reportCode,
    `fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}`,
    host,
  );
}
```

Change `fetchLookbackEventsPage`:

```ts
export async function fetchLookbackEventsPage(
  accessToken: string,
  reportCode: string,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
  host: Host = "fresh",
): Promise<WclEventsPage> {
  return postEventsQuery(
    accessToken,
    reportCode,
    `dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}`,
    host,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/integration/events.test.ts`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/wcl/events.ts test/integration/events.test.ts
git commit -m "feat(wcl-client): thread host through events.ts fetch functions"
```

---

### Task 4: Host-bound `createEventFetcher`

**Files:**

- Modify: `src/wcl/eventCache.ts`
- Test: `src/wcl/eventCache.test.ts`

**Interfaces:**

- Consumes: `Host`, `fetchEventsPage`/`fetchLookbackEventsPage`'s new trailing `host` parameter (Task 3).
- Produces: `createEventFetcher(fetchPage?, fetchLookbackPage?, host: Host = "fresh")` — `host` is bound once at creation, **not** added to `fetchEvents`/`fetchLookbackEvents`'s own signatures, so `scripts/lib/calibrateReport.ts`'s many `ctx.fetchEvents(...)` call sites need zero changes.

- [ ] **Step 1: Write the failing test**

In `src/wcl/eventCache.test.ts`, add this test inside the top `describe("createEventFetcher", ...)` block, right after the `"caches includeResources: true separately..."` test:

```ts
it("passes the given host through to fetchPage", async () => {
  const fakeFetchPage = vi.fn().mockResolvedValue({
    events: [anEvent()],
    nextPageTimestamp: null,
  });

  const { fetchEvents } = createEventFetcher(
    fakeFetchPage,
    undefined,
    "classic",
  );
  await fetchEvents("token", "report1", fight, "Healing");

  expect(fakeFetchPage).toHaveBeenCalledWith(
    "token",
    "report1",
    6,
    "Healing",
    1879119,
    2036920,
    false,
    "classic",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wcl/eventCache.test.ts -t "passes the given host through to fetchPage"`
Expected: FAIL — `fakeFetchPage` is called with 7 arguments (no host), not 8.

- [ ] **Step 3: Implement**

In `src/wcl/eventCache.ts`, change the top of the file:

```ts
import { fetchEventsPage, fetchLookbackEventsPage } from "./events";
import type { WclEvent, WclEventDataType } from "./events";
import type { Host } from "./client";

export interface EventFetcherFight {
  id: number;
  startTime: number;
  endTime: number;
}

export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
  fetchLookbackPage: typeof fetchLookbackEventsPage = fetchLookbackEventsPage,
  host: Host = "fresh",
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
        host,
      );
      events.push(...page.events);
      if (page.nextPageTimestamp === null) break;
      startTime = page.nextPageTimestamp;
    }
    return events;
  }
```

And further down, `fetchLookbackEvents`:

```ts
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
      host,
    );
    events.push(...page.events);
    if (page.nextPageTimestamp === null) break;
    cursor = page.nextPageTimestamp;
  }
  return events;
}
```

(the rest of the file — `fetchEvents`'s caching wrapper and the final `return { fetchEvents, fetchLookbackEvents };` — is unchanged)

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/wcl/eventCache.test.ts -t "passes the given host through to fetchPage"`
Expected: PASS.

- [ ] **Step 5: Update existing assertions for the new trailing argument**

Every other test in this file that asserts exact call arguments via `toHaveBeenNthCalledWith` now needs a trailing `"fresh"` appended (the default host), since `fetchPage`/`fetchLookbackPage` are always called with 8 arguments now, not 7. Update these 4 existing assertion blocks:

In `"concatenates events across multiple pages until nextPageTimestamp is null"`:

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
  "fresh",
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
  "fresh",
);
```

In `"discards a partial multi-page result on a later-page failure, so retry restarts from page 1"`:

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
  "fresh",
);
```

In `"caches includeResources: true separately from the default fetch for the same fight/dataType"`:

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
  "fresh",
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
  "fresh",
);
```

In `"paginates via the injected lookback page-fetcher and concatenates results"` (inside `describe("createEventFetcher - fetchLookbackEvents", ...)`):

```ts
expect(fakeFetchLookbackPage).toHaveBeenNthCalledWith(
  1,
  "token",
  "report1",
  "Buffs",
  0,
  1000,
  false,
  "fresh",
);
expect(fakeFetchLookbackPage).toHaveBeenNthCalledWith(
  2,
  "token",
  "report1",
  "Buffs",
  500,
  1000,
  false,
  "fresh",
);
```

- [ ] **Step 6: Run the full file to verify everything passes**

Run: `npx vitest run src/wcl/eventCache.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add src/wcl/eventCache.ts src/wcl/eventCache.test.ts
git commit -m "feat(wcl-client): bind host once at createEventFetcher construction"
```

---

### Task 5: `CalibrationOutput.source` + host-aware `calibrateReport`

**Files:**

- Modify: `scripts/lib/types.ts` (`CalibrationOutput`)
- Modify: `scripts/lib/calibrateReport.ts` (`buildReportContext`, `calibrateReport`)

**Interfaces:**

- Consumes: `Host` from `src/wcl/client.ts` (Task 1); host-aware `fetchReportFights`/`fetchCastsTable`/`fetchMasterDataAbilities`/`createEventFetcher` (Tasks 2 & 4).
- Produces: `CalibrationOutput.source: Host`; `buildReportContext(accessToken, reportCode, host: Host = "fresh")`; `calibrateReport(accessToken, reportCode, host: Host = "fresh")`.

Neither `scripts/lib/calibrateReport.ts` nor `scripts/calibrate.ts` has existing automated test coverage today (confirmed: no `scripts/*.test.ts` besides `scripts/lib/rollup.test.ts`, which only covers `rollupDruid`'s pure aggregation logic). This task follows that existing convention — verified via typecheck plus a manual CLI smoke run, the same way this script has always been validated, rather than introducing a new test harness as an unrelated scope expansion.

- [ ] **Step 1: Add `source` to `CalibrationOutput`**

In `scripts/lib/types.ts`, add to the top import block:

```ts
import type { Host } from "../../src/wcl/client";
```

Change:

```ts
export interface CalibrationOutput {
  reportCode: string;
  reportTitle: string;
  generatedAt: string;
  druids: DruidResult[];
}
```

to:

```ts
export interface CalibrationOutput {
  reportCode: string;
  reportTitle: string;
  generatedAt: string;
  source: Host;
  druids: DruidResult[];
}
```

- [ ] **Step 2: Thread `host` through `calibrateReport.ts`**

In `scripts/lib/calibrateReport.ts`, change the `client.ts` type import:

```ts
import type { Fight, Host } from "../../src/wcl/client";
```

Change `buildReportContext`:

```ts
export async function buildReportContext(
  accessToken: string,
  reportCode: string,
  host: Host = "fresh",
): Promise<ReportContext> {
  const { title, fights } = await fetchReportFights(
    accessToken,
    reportCode,
    undefined,
    host,
  );
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => ({ fight: row.fight, pullNumber: row.pullNumber }));

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((row) => row.fight.id),
    undefined,
    host,
  );
  const candidates = detectDruids(castTableEntries);
  const actorClasses = new Map(
    castTableEntries.map((entry) => [
      entry.id,
      { class: entry.type, specIcon: entry.icon },
    ]),
  );

  const reportAbilities = await fetchMasterDataAbilities(
    accessToken,
    reportCode,
    undefined,
    host,
  );
  const resolvedAbilities = resolveAbilities(reportAbilities);

  const { fetchEvents, fetchLookbackEvents } = createEventFetcher(
    undefined,
    undefined,
    host,
  );
```

(the rest of `buildReportContext`'s body — building `lifebloomAbilityIds` etc. and the final `return { ... }` — is unchanged)

Change `calibrateReport`:

```ts
export async function calibrateReport(
  accessToken: string,
  reportCode: string,
  host: Host = "fresh",
): Promise<CalibrationOutput> {
  const ctx = await buildReportContext(accessToken, reportCode, host);

  const druids: DruidResult[] = [];
  for (const candidate of ctx.candidates) {
    const fights = [];
    for (const { fight, pullNumber } of ctx.nonTrashFights) {
      fights.push(await computeFightResult(ctx, candidate, fight, pullNumber));
    }
    druids.push({
      druidId: candidate.id,
      druidName: candidate.name,
      isRestoSpec: candidate.isRestoSpec,
      healingCastCount: candidate.healingCastCount,
      fights,
      rollup: rollupDruid(fights),
    });
  }

  return {
    reportCode: ctx.reportCode,
    reportTitle: ctx.reportTitle,
    generatedAt: new Date().toISOString(),
    source: host,
    druids,
  };
}
```

- [ ] **Step 3: Verify via typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts
git commit -m "feat(calibrate): thread host through calibrateReport, add source to output"
```

(Manual CLI verification of this change happens as part of Task 6, once `calibrate.ts` itself can pass a real `host` value in from a command-line argument.)

---

### Task 6: `calibrate.ts` derives host from the report link, no new flag

**Files:**

- Modify: `scripts/calibrate.ts`

**Interfaces:**

- Consumes: `parseReportInput` from `src/report/parseReportInput.ts` (existing, unchanged); `calibrateReport(accessToken, reportCode, host)` from Task 5.

- [ ] **Step 1: Implement**

Replace the full contents of `scripts/calibrate.ts` with:

```ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAccessToken } from "./lib/env";
import { calibrateReport } from "./lib/calibrateReport";
import { parseReportInput } from "../src/report/parseReportInput";
import { WclApiError } from "../src/wcl/client";
import { WclRateLimitError } from "../src/wcl/events";

async function writeCalibrationOutput(
  reportCode: string,
  output: unknown,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "calibration-data");
  await mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `${reportCode}.json`);
  const tempPath = `${finalPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(tempPath, finalPath);
  return finalPath;
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run calibrate -- <reportCode or report URL>");
    process.exit(1);
  }

  const parsed = parseReportInput(input);
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  const output = await calibrateReport(
    accessToken,
    parsed.reportCode,
    parsed.host,
  );

  if (output.druids.length === 0) {
    console.log(
      `No resto druid candidates detected in report ${parsed.reportCode}. Nothing written.`,
    );
    return;
  }

  const filePath = await writeCalibrationOutput(parsed.reportCode, output);
  console.log(
    `Wrote ${filePath} — ${output.druids.length} druid(s), ` +
      `${output.druids[0].fights.length} fight(s) each.`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof WclRateLimitError) {
    console.error("Rate limited by WCL. Wait a bit and try again.");
  } else if (err instanceof WclApiError) {
    console.error(`WCL API error: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`Failed: ${err.message}`);
  } else {
    console.error("Failed with an unknown error.", err);
  }
  process.exit(1);
});
```

- [ ] **Step 2: Verify via typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke test — bare code (unchanged behavior)**

Run: `npm run calibrate -- 4GYHZRdtL3bvhpc8`
Expected: succeeds exactly as before. Inspect `calibration-data/4GYHZRdtL3bvhpc8.json` and confirm it now has `"source": "fresh"`.

- [ ] **Step 4: Manual smoke test — classic URL (new capability)**

Run: `npm run calibrate -- https://classic.warcraftlogs.com/reports/mtRh3kJ9YMLazyvQ`
Expected: succeeds. Inspect `calibration-data/mtRh3kJ9YMLazyvQ.json` and confirm `"source": "classic"`.

- [ ] **Step 5: Manual smoke test — invalid input**

Run: `npm run calibrate -- not-a-report`
Expected: exits 1, prints `parseReportInput`'s existing "Couldn't recognize that as a Warcraft Logs report URL or code..." message — no crash/stack trace.

- [ ] **Step 6: Commit**

```bash
git add scripts/calibrate.ts
git commit -m "feat(calibrate): derive host from report URL/code, drop --host in favor of parseReportInput"
```

---

### Task 7: Consolidate `tagArchetypes.ts` onto the shared client

**Files:**

- Modify: `scripts/tagArchetypes.ts`

**Interfaces:**

- Consumes: `fetchReportFights`, `fetchCastsTable`, `Host` from `src/wcl/client.ts` (Tasks 1 & 2); `createEventFetcher` from `src/wcl/eventCache.ts` (Task 4).
- CLI interface (`--host fresh|classic`) is unchanged — only the internal fetch layer changes.

`tagArchetypes.ts` carries its own small host-parameterized fetch layer (`graphql`, `fetchReportFights`, `fetchCastsTable`, `fetchTalents`) built to avoid merge conflicts with story 012, which landed long ago — and it has already drifted: its private `fetchReportFights` query is missing `zone.expansion.id`/`archiveStatus`/`rateLimitData`, which the real `client.ts` version has. This task deletes the duplicate.

- [ ] **Step 1: Implement**

Replace the full contents of `scripts/tagArchetypes.ts` with:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";
import { detectDruids } from "../src/report/druidDetection";
import { buildFightRows } from "../src/report/fightRows";
import {
  fetchReportFights,
  fetchCastsTable,
  type Host,
} from "../src/wcl/client";
import { createEventFetcher } from "../src/wcl/eventCache";
import {
  classifyBucket,
  BUCKET_DEFINITIONS,
  parseTalentPoints,
  type TalentBucket,
} from "../src/report/archetypeDetection";

function isHostKey(value: string): value is Host {
  return value === "fresh" || value === "classic";
}

async function fetchTalents(
  accessToken: string,
  host: Host,
  reportCode: string,
  fight: { id: number; startTime: number; endTime: number },
  druidId: number,
): Promise<[number, number, number] | null> {
  const { fetchEvents } = createEventFetcher(undefined, undefined, host);
  const events = await fetchEvents(
    accessToken,
    reportCode,
    fight,
    "CombatantInfo",
  );
  return parseTalentPoints(events, druidId);
}

interface ArchetypeEntry {
  druidId: number;
  druidName: string;
  source: Host;
  balance: number | null;
  feral: number | null;
  restoration: number | null;
  bucket: TalentBucket;
}

interface ArchetypeFile {
  bucketDefinitions: Record<TalentBucket, string>;
  reports: Record<string, ArchetypeEntry>;
}

const OUTPUT_PATH = new URL(
  "../docs/calibration-archetypes.json",
  import.meta.url,
).pathname;

async function loadExisting(): Promise<ArchetypeFile> {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { bucketDefinitions: BUCKET_DEFINITIONS, reports: {} };
  }
}

async function main() {
  const reportCode = process.argv[2];
  const hostFlagIndex = process.argv.indexOf("--host");
  const hostArg =
    hostFlagIndex >= 0 ? process.argv[hostFlagIndex + 1] : "fresh";
  if (!reportCode || !isHostKey(hostArg)) {
    console.error(
      "usage: tagArchetypes.ts <reportCode> [--host fresh|classic]",
    );
    process.exit(1);
  }
  const host = hostArg;
  const accessToken = loadAccessToken();

  const { fights } = await fetchReportFights(
    accessToken,
    reportCode,
    undefined,
    host,
  );
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => row.fight);

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((f) => f.id),
    undefined,
    host,
  );
  const candidates = detectDruids(castTableEntries);

  if (candidates.length === 0) {
    console.log(`No resto druid candidates detected in ${reportCode}.`);
    return;
  }

  const file = await loadExisting();
  file.bucketDefinitions = BUCKET_DEFINITIONS;

  for (const candidate of candidates) {
    const firstFight = nonTrashFights[0];
    const talents = await fetchTalents(
      accessToken,
      host,
      reportCode,
      firstFight,
      candidate.id,
    );
    const [balance, feral, restoration] = talents ?? [null, null, null];
    const bucket: TalentBucket =
      talents === null
        ? "unknown-no-talent-data"
        : classifyBucket(
            balance as number,
            feral as number,
            restoration as number,
          );

    const key = `${reportCode}:${candidate.name}`;
    file.reports[key] = {
      druidId: candidate.id,
      druidName: candidate.name,
      source: host,
      balance,
      feral,
      restoration,
      bucket,
    };
    console.log(
      `${key}\t${host}\t${balance}/${feral}/${restoration}\t${bucket}`,
    );
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify via typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke test — must reproduce the existing committed entry exactly**

`mtRh3kJ9YMLazyvQ:Olklo` is already committed in `docs/calibration-archetypes.json` with `source: "classic"`. Re-running the consolidated tool against the same report and host must produce a byte-identical entry — this is the correctness check for the refactor (identical inputs through a different fetch path should yield an identical result).

Run: `npm run tag-archetype -- mtRh3kJ9YMLazyvQ --host classic`
Expected: prints a line for `Olklo` matching the values already in `docs/calibration-archetypes.json` (`balance: 8, feral: 11, restoration: 42, bucket: "deep-resto"`).

Run: `git diff docs/calibration-archetypes.json`
Expected: **no output** (empty diff) — proves the consolidated fetch layer produces identical output to the deleted duplicate one.

- [ ] **Step 4: Commit**

```bash
git add scripts/tagArchetypes.ts
git commit -m "refactor(tag-archetype): share host-aware client.ts fetch functions instead of a private copy"
```

---

### Task 8: Update `docs/testing.md`

**Files:**

- Modify: `docs/testing.md`

- [ ] **Step 1: Update the "Calibration tooling" paragraph**

Change:

```
`scripts/calibrate.ts` (`npm run calibrate -- <reportCode>`) runs the app's real `compute*`/`summarize*` functions against a real report and writes `calibration-data/<reportCode>.json` — every metric's full numeric result plus judgement, per fight, plus a whole-report numeric rollup (duration/count-weighted pooling — see `scripts/lib/rollup.ts` for the exact rule per metric). It exists to support story 802 (threshold calibration) and any future recalibration pass (`docs/thresholds.md`), and to avoid re-deriving WCL API quirks (like the `www`/`classic`/`fresh` host distinction — see `scripts/wcl-query.ts`) from scratch each time. `calibration-data/` is gitignored — a real calibration pass (900-902) generates far more output than is worth committing, and the durable findings get distilled into this file's known-reports tables and `docs/thresholds.md` instead.
```

to:

```
`scripts/calibrate.ts` (`npm run calibrate -- <reportCode or report URL>`) runs the app's real `compute*`/`summarize*` functions against a real report and writes `calibration-data/<reportCode>.json` — every metric's full numeric result plus judgement, per fight, plus a whole-report numeric rollup (duration/count-weighted pooling — see `scripts/lib/rollup.ts` for the exact rule per metric), plus a `source: "fresh" | "classic"` field recording which WCL host served the report. Its argument is parsed by the same `parseReportInput` (`src/report/parseReportInput.ts`) `ConnectPanel` uses — a bare 16-character code defaults to `"fresh"`; a full `classic.warcraftlogs.com/reports/<code>` link derives `"classic"`. There's no separate `--host` flag: the tool figures out vintage the same way the app does, from what's pasted in. It exists to support story 802 (threshold calibration) and any future recalibration pass (`docs/thresholds.md`), and to avoid re-deriving WCL API quirks (like the `www`/`classic`/`fresh` host distinction — see `scripts/wcl-query.ts`) from scratch each time. `calibration-data/` is gitignored — a real calibration pass (900-902) generates far more output than is worth committing, and the durable findings get distilled into this file's known-reports tables and `docs/thresholds.md` instead. There's no `calibration-data/classic/` subfolder — every report's own `source` field records its vintage, so the flat `calibration-data/<code>.json` layout is enough.
```

- [ ] **Step 2: Update the `tagArchetypes.ts` paragraph**

Change:

```
`scripts/tagArchetypes.ts` (`npm run tag-archetype -- <reportCode> [--host fresh|classic]`, story 900) reads each detected druid's talent-tree point totals from `CombatantInfo` and classifies them into a bucket (deep resto, likely dreamstate, mostly resto, mostly balance, etc. — see the story for exact cutoffs), writing/merging into `docs/calibration-archetypes.json`. Unlike `calibration-data/`, this index **is** committed — it's the durable, queryable record of every calibration corpus report's archetype, not scratch output. It has its own small host-parameterized fetch layer (not `src/wcl/client.ts`, which is still hardcoded to `www.warcraftlogs.com` pending story 012) to avoid merge conflicts with that story's in-progress work.
```

to:

```
`scripts/tagArchetypes.ts` (`npm run tag-archetype -- <reportCode> [--host fresh|classic]`, story 900) reads each detected druid's talent-tree point totals from `CombatantInfo` and classifies them into a bucket (deep resto, likely dreamstate, mostly resto, mostly balance, etc. — see the story for exact cutoffs), writing/merging into `docs/calibration-archetypes.json`. Unlike `calibration-data/`, this index **is** committed — it's the durable, queryable record of every calibration corpus report's archetype, not scratch output. It shares `src/wcl/client.ts`'s host-aware fetch functions (`fetchReportFights`, `fetchCastsTable`) and `src/wcl/eventCache.ts`'s `createEventFetcher` rather than carrying its own copy — the story 012 in-flight-merge-conflict risk that once justified a separate fetch layer is long since resolved.
```

- [ ] **Step 3: Add a curated-subset note after the classic reports table**

Find the blank line immediately after the classic-reports table's last row (`| \`7kdJZF6wAbjzVh2P\` | Оря | Unknown (КБ) | Mid-pack contrast: 50% ideal refresh, concurrent avg 0.37. |`) and before the `## Calibration tooling` heading. Insert this paragraph there:

```

This table is a curated subset of exemplars used for specific calibration findings, not a full index of the classic-vintage corpus — the complete, self-describing corpus (including 2 codes pulled during story 901's search but not written up here individually, `a2HMJ3wX6Tq9jpn7` "Zul'Aman" and `tWCqHha9jRfTw8rG` "Bam") lives in `calibration-data/` with each file's own `source` field, per the "Calibration tooling" section below.
```

- [ ] **Step 4: Verify formatting**

Run: `npx prettier --check docs/testing.md`
Expected: no formatting issues. If any, run `npx prettier --write docs/testing.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/testing.md
git commit -m "docs: update calibration tooling docs for host support and self-describing output"
```

---

### Task 9: Regenerate the corpus, retire `calibration-data/classic/`

**Files:**

- Create (scratch, not committed): a one-time regeneration script outside the repo.
- Delete: `calibration-data/classic/` (gitignored — not a tracked git change, just a local cleanup).

The only _complete_ record of which report codes are classic-vintage is the current `calibration-data/classic/` folder's 22 filenames — `docs/calibration-archetypes.json` is missing one (`yNLDrn9z7hM3KRBG`) and `docs/testing.md`'s narrative table is missing two (`a2HMJ3wX6Tq9jpn7`, `tWCqHha9jRfTw8rG`), so neither is a safe substitute. This must run against the real, live WCL API — ~103 calibration passes, each several requests per fight, real quota and wall-clock time, with a real chance of a mid-run rate limit. The script is resumable so a rate-limit interruption just means re-running it.

- [ ] **Step 1: Write the regeneration script**

Write this to a scratch path outside the repo (e.g. your session's scratchpad directory), not into `bloomwatch/` itself — it's a one-time migration aid, not committed tooling:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$1"
if [ -z "$REPO_ROOT" ]; then
  echo "usage: $0 <path to bloomwatch repo/worktree>" >&2
  exit 1
fi
cd "$REPO_ROOT"

source_of() {
  local file="calibration-data/$1.json"
  if [ -f "$file" ]; then
    node -e "console.log(JSON.parse(require('fs').readFileSync('$file','utf8')).source ?? '')"
  else
    echo ""
  fi
}

CLASSIC_CODES=$(ls calibration-data/classic/*.json | xargs -n1 basename | sed 's/\.json$//')
ROOT_CODES=$(ls calibration-data/*.json 2>/dev/null | xargs -n1 basename | sed 's/\.json$//' | grep -v '^archetypes$' || true)

echo "=== Phase 1: ${CLASSIC_CODES} (classic) ==="
for code in $CLASSIC_CODES; do
  if [ "$(source_of "$code")" = "classic" ]; then
    echo "skip $code (already source=classic)"
    continue
  fi
  echo "regenerating $code as classic..."
  npm run calibrate -- "https://classic.warcraftlogs.com/reports/${code}"
done

echo "=== Phase 2: root-only codes (fresh) ==="
for code in $ROOT_CODES; do
  if echo "$CLASSIC_CODES" | grep -qx "$code"; then
    continue
  fi
  if [ "$(source_of "$code")" = "fresh" ]; then
    echo "skip $code (already source=fresh)"
    continue
  fi
  echo "regenerating $code as fresh..."
  npm run calibrate -- "$code"
done

echo "=== Verification ==="
node -e "
const fs = require('fs');
const rootCodes = new Set(
  fs.readdirSync('calibration-data')
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5)),
);
const classicCodes = fs
  .readdirSync('calibration-data/classic')
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5));
const missing = classicCodes.filter((c) => !rootCodes.has(c));
if (missing.length > 0) {
  console.error('MISSING from root:', missing);
  process.exit(1);
}
console.log(
  'All',
  classicCodes.length,
  'classic codes present in root. Safe to delete calibration-data/classic/.',
);
"
```

- [ ] **Step 2: Run it in the background**

This will take a long time (103 live calibration passes). Run it backgrounded and check on it periodically rather than blocking on it:

Run: `bash /path/to/regenerate-corpus.sh /Users/bran/Source/bloomwatch/.claude/worktrees/calibrate-host-support > /path/to/regenerate.log 2>&1 &`

Periodically check progress with: `tail -30 /path/to/regenerate.log`

If it stops partway (e.g. WCL rate limit — `calibrate.ts` prints "Rate limited by WCL. Wait a bit and try again." and exits 1 for that one code, which will halt the `set -euo pipefail` loop), wait a few minutes and re-run the exact same command — already-correct codes are skipped, so it picks up where it left off.

Expected final output: the verification block prints `All 22 classic codes present in root. Safe to delete calibration-data/classic/.`

- [ ] **Step 3: Confirm and clean up**

Run: `ls calibration-data/*.json | wc -l`
Expected: `103` (101 original root codes + the 2 previously-orphaned classic-only codes).

Run: `node -e "const fs=require('fs'); let bad=0; for (const f of fs.readdirSync('calibration-data').filter(f=>f.endsWith('.json'))) { const d = JSON.parse(fs.readFileSync('calibration-data/'+f)); if (!['fresh','classic'].includes(d.source)) { console.log(f, 'has source:', d.source); bad++; } } console.log(bad, 'files missing a valid source field');"`
Expected: `0 files missing a valid source field`.

Once both checks pass:

Run: `rm -rf calibration-data/classic`

- [ ] **Step 4: No commit needed**

`calibration-data/` is gitignored — regenerating and cleaning it up produces no git changes. Confirm with:

Run: `git status --porcelain calibration-data`
Expected: no output.

---

### Task 10: Final full-repo verification

**Files:** none (verification only)

- [ ] **Step 1: Full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass, including every test added in Tasks 2-4.

- [ ] **Step 3: Confirm the design spec is ready to retire**

Per CLAUDE.md, once a story ships, its spec gets deleted in the same pass its lasting details land in a permanent doc. `docs/testing.md` (Task 8) now carries the durable details from `docs/specs/calibrate-host-support-design.md`.

Run: `grep -rl "calibrate-host-support-design" docs/ src/ scripts/ 2>/dev/null`
Expected: no output (nothing else references the spec file).

Run: `rm docs/specs/calibrate-host-support-design.md`
Run: `rmdir docs/specs 2>/dev/null || true`

- [ ] **Step 4: Final commit**

```bash
git add -A
git status --porcelain
git commit -m "docs: retire calibrate-host-support design spec now that docs/testing.md covers it"
```

Expected: only the spec deletion is staged (everything else was already committed in prior tasks; `calibration-data/` never shows up, since it's gitignored).
