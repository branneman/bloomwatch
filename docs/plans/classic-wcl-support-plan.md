# Support classic.warcraftlogs.com TBC reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept `classic.warcraftlogs.com` TBC report links (in addition to today's `fresh.` support), reject non-TBC content and inaccessible-to-this-account reports with clear messaging, and make every WCL deep-link in the app point back to the subdomain the report actually came from.

**Architecture:** No new WCL API host routing — live testing confirmed `www.warcraftlogs.com/api/v2/user` already serves `classic.`-sourced reports identically. The only wire change is two extra field groups (`zone.expansion`, `archiveStatus`) on the existing `fetchReportFights` query. A `Host = "fresh" | "classic"` value is captured once at input time (`parseReportInput`), threaded through the URL hash (`hashRoute.ts`, so it survives reload/shared links) and every component that builds a `classic./fresh.` deep-link.

**Tech Stack:** TypeScript, React, Vitest, MSW (`test/integration`), React Testing Library.

## Global Constraints

- Spec: `docs/specs/classic-wcl-support-design.md` — read it first; this plan implements it exactly.
- No spell/ability IDs or new thresholds are involved — not applicable here.
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) must pass full-project before any commit (pre-commit hook enforces this already).
- Tier 1 tests are pure/co-located `*.test.ts`; Tier 2 (`test/integration/`) uses MSW + real captured JSON fixtures; Tier 3 (`*.test.tsx`) uses React Testing Library. See `docs/testing.md`.
- Commit messages: Conventional Commits (`feat(scope): ...`, `test(scope): ...`, `docs: ...`).
- This worktree already has `.env.local` copied in (has `WCL_TEST_ACCESS_TOKEN`) if any task needs to spot-check something live — not expected to be necessary since this plan embeds real captured data already.

---

### Task 1: `parseReportInput` accepts `classic.` and returns a `Host`

**Files:**

- Modify: `src/report/parseReportInput.ts`
- Test: `src/report/parseReportInput.test.ts`

**Interfaces:**

- Produces: `export type Host = "fresh" | "classic";` (new, exported from this file — the canonical definition every other task imports).
- Produces: `ParseReportInputResult`'s `ok: true` branch gains `host: Host`.

- [ ] **Step 1: Write the failing tests**

Open `src/report/parseReportInput.test.ts`. Find the existing `classic.` rejection test (currently asserting `unsupported-realm`) and replace it, and add new cases. The file currently defines a `CODE` constant (`"4GYHZRdtL3bvhpc8"`) reused across cases — keep using it.

Replace the existing `it("rejects a classic.warcraftlogs.com URL", ...)`-style case (find it near the `www.` rejection case) with:

```ts
it("accepts a classic.warcraftlogs.com URL with host: classic", () => {
  const result = parseReportInput(
    `https://classic.warcraftlogs.com/reports/${CODE}`,
  );
  if (!result.ok) throw new Error("unreachable");
  expect(result).toEqual({
    ok: true,
    reportCode: CODE,
    fightId: null,
    host: "classic",
  });
});

it("accepts a classic.warcraftlogs.com URL with a fight fragment", () => {
  const result = parseReportInput(
    `https://classic.warcraftlogs.com/reports/${CODE}#fight=6`,
  );
  if (!result.ok) throw new Error("unreachable");
  expect(result).toEqual({
    ok: true,
    reportCode: CODE,
    fightId: 6,
    host: "classic",
  });
});
```

Find the existing `fresh.` acceptance test(s) and add a `host` assertion — e.g. if it currently does `expect(result).toEqual({ ok: true, reportCode: CODE, fightId: null })`, change the expectation to `{ ok: true, reportCode: CODE, fightId: null, host: "fresh" }`. Apply the same `host: "fresh"` addition to every other existing `ok: true` assertion in the file (fight-fragment case, etc.) — do not remove any existing case, just add the field to each expected object.

Add a bare-code default case:

```ts
it("defaults host to fresh for a bare report code", () => {
  const result = parseReportInput(CODE);
  if (!result.ok) throw new Error("unreachable");
  expect(result.host).toBe("fresh");
});
```

Confirm the `www.` rejection case (and any other-subdomain rejection case) is untouched — it must still return `{ ok: false, reason: "unsupported-realm", ... }`.

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npm test -- src/report/parseReportInput.test.ts`
Expected: FAIL — `classic.` cases fail because the current code still routes `classic` into `unsupported-realm`; `host` assertions fail because the field doesn't exist yet.

- [ ] **Step 3: Implement**

In `src/report/parseReportInput.ts`, add the exported `Host` type near the top and widen the accepted-hosts check. Full new content of the relevant section:

```ts
const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;
const WCL_HOSTNAME_PATTERN = /^([a-z0-9]+)\.warcraftlogs\.com$/;
const REPORT_PATH_PATTERN = /\/reports\/([A-Za-z0-9]{16})(?![A-Za-z0-9])/;

export type Host = "fresh" | "classic";

function isHost(value: string): value is Host {
  return value === "fresh" || value === "classic";
}

export type ParseReportInputResult =
  | { ok: true; reportCode: string; fightId: number | null; host: Host }
  | { ok: false; reason: "unsupported-realm" | "invalid"; message: string };

const UNSUPPORTED_REALM_MESSAGE =
  'This tool only supports TBC Anniversary ("fresh") or classic.warcraftlogs.com realm reports. Paste a link from fresh.warcraftlogs.com or classic.warcraftlogs.com.';
const INVALID_MESSAGE =
  "Couldn't recognize that as a Warcraft Logs report URL or code. Paste a fresh.warcraftlogs.com or classic.warcraftlogs.com report link, or just the 16-character report code.";

export function parseReportInput(input: string): ParseReportInputResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (REPORT_CODE_PATTERN.test(trimmed)) {
    return { ok: true, reportCode: trimmed, fightId: null, host: "fresh" };
  }

  const url = parseUrl(trimmed);
  if (!url) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  const hostMatch = url.hostname.match(WCL_HOSTNAME_PATTERN);
  if (!hostMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (!isHost(hostMatch[1])) {
    return {
      ok: false,
      reason: "unsupported-realm",
      message: UNSUPPORTED_REALM_MESSAGE,
    };
  }
  const host = hostMatch[1];

  const pathMatch = url.pathname.match(REPORT_PATH_PATTERN);
  if (!pathMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  return {
    ok: true,
    reportCode: pathMatch[1],
    fightId: parseFightId(url.hash),
    host,
  };
}
```

(`parseUrl` and `parseFightId` below are unchanged — leave them as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/report/parseReportInput.test.ts`
Expected: PASS, all cases including the new `classic.`/`host` ones.

- [ ] **Step 5: Commit**

```bash
git add src/report/parseReportInput.ts src/report/parseReportInput.test.ts
git commit -m "feat(report): accept classic.warcraftlogs.com report links"
```

---

### Task 2: `hashRoute.ts` carries `Host` through the URL

**Files:**

- Modify: `src/app/routing/hashRoute.ts`
- Test: `src/app/routing/hashRoute.test.ts`
- Test: `src/app/routing/useHashRoute.test.ts` (constructs `Route` literals directly; breaks once `host` is required — fixed in this task, not deferred, since the repo's pre-commit hook runs full-project `typecheck` on every commit)
- Modify: `src/App.tsx` (same reason — see Step 5 below; this is a **narrower** slice of Task 6's original scope, not a duplicate of it — see the note at the top of Task 6)

**Interfaces:**

- Consumes: `Host` from `../../report/parseReportInput` (Task 1).
- Produces: `Route`'s four report-bearing variants each gain `host: Host`. URL shape: `#/r/<code>[/h/<host>]/d/<name>/f/<fightId>/e/<epicId>` — the `/h/<host>` segment is **omitted when `host === "fresh"`** (the default), so every existing `fresh.`-sourced hash/URL is byte-identical to today. Only `classic.`-sourced routes get the extra segment.

**Why `App.tsx` is touched here, not only in Task 6:** making `Route.host` required breaks every `navigate({...})` call site that constructs a `Route` — the whole project must typecheck after every commit (Global Constraints), so this task must leave `App.tsx` compiling, not just `hashRoute.ts`/its own test. Everywhere `App.tsx` already has a `Route`'s `reportCode` in scope (from the existing top-level `reportCode` const or a narrowed `route.reportCode`), the matching `host` is equally in scope (`host` const or `route.host`) — those 8 call sites are fixed here. The 9th (`handleReportSubmit`, which builds a _new_ route from a freshly-parsed `ParsedReport`) is the one exception: `ParsedReport` doesn't carry `host` until Task 6 changes `ReportInput`, so this task gives it a temporary hardcoded `host: "fresh"` with a `// TODO(story-012 Task 6)` marker, which Task 6 then replaces with the real `parsed.host`.

- [ ] **Step 1: Write the failing tests**

In `src/app/routing/hashRoute.test.ts`, add the `host: "fresh"` field to every existing `route` object in the `cases` array (all five entries with a `reportCode` field — `"report only"`, `"report + druid"`, `"report + druid + fight"`, `"report + druid + fight + epic"`; the `"empty hash"`/`"bare hash"` `{ screen: "input" }` cases need no change). Also update the `"round-trips a druid name..."` test's `route` object the same way. Leave every `hash` string in `cases` unchanged — since `host: "fresh"` is the default, `serializeRoute` must still produce the exact same hash string as before.

Add new cases to the `cases` array (any position, e.g. after the existing report-bearing ones):

```ts
    {
      name: "report + classic host",
      hash: "#/r/4GYHZRdtL3bvhpc8/h/classic",
      route: {
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "classic",
      },
    },
    {
      name: "report + classic host + druid + fight + epic",
      hash: "#/r/4GYHZRdtL3bvhpc8/h/classic/d/Dassz/f/6/e/lifebloom",
      route: {
        screen: "fightEpic",
        reportCode: "4GYHZRdtL3bvhpc8",
        host: "classic",
        druidName: "Dassz",
        fightId: 6,
        epicId: "lifebloom",
      },
    },
```

Add a dedicated test for the "invalid host value degrades to fresh, not to the input screen" behavior (deliberately different from every other malformed-segment case, which falls back to `{ screen: "input" }`):

```ts
it("defaults to host: fresh (not the input screen) for an unrecognized host value", () => {
  expect(parseHash("#/r/4GYHZRdtL3bvhpc8/h/bogus")).toEqual({
    screen: "druidPicker",
    reportCode: "4GYHZRdtL3bvhpc8",
    host: "fresh",
  });
});

it("defaults to host: fresh when the h segment has no value", () => {
  expect(parseHash("#/r/4GYHZRdtL3bvhpc8/h")).toEqual({
    screen: "druidPicker",
    reportCode: "4GYHZRdtL3bvhpc8",
    host: "fresh",
  });
});
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npm test -- src/app/routing/hashRoute.test.ts`
Expected: FAIL — type errors / assertion mismatches since `host` doesn't exist on `Route` yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/app/routing/hashRoute.ts`:

```ts
import type { EpicId } from "../components/Scorecard/useFightEpicSummaries";
import type { Host } from "../../report/parseReportInput";

export type Route =
  | { screen: "input" }
  | { screen: "druidPicker"; reportCode: string; host: Host }
  | {
      screen: "dashboard";
      reportCode: string;
      host: Host;
      druidName: string;
    }
  | {
      screen: "fight";
      reportCode: string;
      host: Host;
      druidName: string;
      fightId: number;
    }
  | {
      screen: "fightEpic";
      reportCode: string;
      host: Host;
      druidName: string;
      fightId: number;
      epicId: EpicId;
    };

const EPIC_IDS: readonly EpicId[] = [
  "gcd",
  "lifebloom",
  "spell",
  "mana",
  "death",
  "prep",
];

function isEpicId(value: string): value is EpicId {
  return (EPIC_IDS as readonly string[]).includes(value);
}

function isHost(value: string): value is Host {
  return value === "fresh" || value === "classic";
}

const INPUT_ROUTE: Route = { screen: "input" };

export function parseHash(hash: string): Route {
  try {
    const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
    const segments = fragment
      .split("/")
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) return INPUT_ROUTE;
    if (segments[0] !== "r" || segments.length < 2) return INPUT_ROUTE;
    const reportCode = decodeURIComponent(segments[1]);

    let index = 2;
    let host: Host = "fresh";
    if (segments[index] === "h") {
      const hostRaw = decodeURIComponent(segments[index + 1] ?? "");
      host = isHost(hostRaw) ? hostRaw : "fresh";
      index += 2;
    }

    if (segments.length === index) {
      return { screen: "druidPicker", reportCode, host };
    }
    if (segments[index] !== "d" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const druidName = decodeURIComponent(segments[index + 1]);
    index += 2;

    if (segments.length === index) {
      return { screen: "dashboard", reportCode, host, druidName };
    }
    if (segments[index] !== "f" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const fightId = Number.parseInt(segments[index + 1], 10);
    if (Number.isNaN(fightId)) return INPUT_ROUTE;
    index += 2;

    if (segments.length === index) {
      return { screen: "fight", reportCode, host, druidName, fightId };
    }
    if (segments[index] !== "e" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const epicIdRaw = decodeURIComponent(segments[index + 1]);
    if (!isEpicId(epicIdRaw)) return INPUT_ROUTE;
    index += 2;

    if (segments.length === index) {
      return {
        screen: "fightEpic",
        reportCode,
        host,
        druidName,
        fightId,
        epicId: epicIdRaw,
      };
    }
    return INPUT_ROUTE;
  } catch (e) {
    if (e instanceof URIError) {
      return INPUT_ROUTE;
    }
    throw e;
  }
}

function hostSegment(host: Host): string {
  return host === "fresh" ? "" : `/h/${host}`;
}

export function serializeRoute(route: Route): string {
  switch (route.screen) {
    case "input":
      return "#";
    case "druidPicker":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}`;
    case "dashboard":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}`;
    case "fight":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}`;
    case "fightEpic":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}/e/${route.epicId}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/routing/hashRoute.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix `useHashRoute.test.ts` and `App.tsx` so the project still typechecks**

Run: `npm run typecheck` — it will fail, listing every `Route` literal now missing `host`. Fix each as follows.

In `src/app/routing/useHashRoute.test.ts`: every object literal with `screen: "druidPicker"` or `screen: "dashboard"` (there are 8 occurrences across the file, both as arguments to `navigate({...})` and as `expect(...).toEqual({...})` targets) needs `host: "fresh"` added as a sibling field of `reportCode`.

In `src/App.tsx`:

1. Add a `host` derivation right after the existing `const reportCode = ...` line (search for `const reportCode = route.screen === "input" ? null : route.reportCode;`):

```ts
const host = route.screen === "input" ? null : route.host;
```

2. `handleOpenFight`, `handleCloseFight`, and both branches of `handleSelectEpic` already use the top-level `reportCode` const inside their `navigate({...})` calls — add `host,` alongside every existing `reportCode,` in each, and add `|| host === null` to each function's existing early-return guard (e.g. `handleOpenFight`'s `if (reportCode === null || selectedDruid === null) return;` becomes `if (reportCode === null || selectedDruid === null || host === null) return;`).

3. `advanceFromPicker` narrows `route.screen === "druidPicker"` and uses `route.reportCode` directly in two `navigate({...})` calls — add `host: route.host,` alongside each `reportCode: route.reportCode,`.

4. The two fallback-navigation `useEffect` blocks each call `navigate({ reportCode: route.reportCode, ... })` inside a narrowed `route` — add `host: route.host,` to each.

5. `handleReportSubmit` builds a _new_ route from `parsed: ParsedReport`, which doesn't carry `host` until Task 6 updates `ReportInput`. Give it a temporary hardcoded value with a marker comment:

```ts
function handleReportSubmit(parsed: ParsedReport) {
  resetReportState();
  setPendingFightId(parsed.fightId);
  navigate({
    screen: "druidPicker",
    reportCode: parsed.reportCode,
    // TODO(story-012 Task 6): use parsed.host once ReportInput carries it.
    host: "fresh",
  });
}
```

Do **not** touch the `ConnectPanel` or `ReportDashboard` JSX render call sites in this task — they don't need `host` as a prop yet (that's Task 5/Task 7/Task 6's job) and adding it prematurely would just be reverted-and-redone.

Run: `npm run typecheck`
Expected: clean (no errors anywhere in the project). If any error remains outside `useHashRoute.test.ts`/`App.tsx`, it's a genuine gap this task missed — fix it the same way (add the matching `host`), it should not require touching `ConnectPanel`/`ReportDashboard`.

Run: `npm test -- src/app/routing/useHashRoute.test.ts src/App.test.tsx`
Expected: PASS (App.test.tsx exercises `handleReportSubmit` and friends; since `host` always resolves to `"fresh"` today — the only value any existing test input produces — behavior is unchanged, only the `Route` shape gained a field).

- [ ] **Step 6: Full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: clean. Run `npm run format` first if `format:check` fails, then re-verify.

- [ ] **Step 7: Commit**

```bash
git add src/app/routing/hashRoute.ts src/app/routing/hashRoute.test.ts src/app/routing/useHashRoute.test.ts src/App.tsx
git commit -m "feat(routing): carry report host through the URL hash"
```

---

### Task 3: MERGED INTO TASK 7

Originally a standalone task changing `buildFightTimeUrl`'s signature to take a leading `host` parameter. Discovered during Task 2's execution (same root cause): changing a shared function's signature breaks every caller that isn't updated in the same commit, and this repo's pre-commit hook runs full-project `typecheck` — so `buildFightTimeUrl`'s signature can't change in a commit that leaves its 9 callers (`Scorecard` + 8 metric cards) still calling the old 4-arg form. Since Task 7 already has to touch all 9 of those callers anyway (to add `host,` to their `buildFightTimeUrl(...)` calls), the signature change now lands as part of Task 7's single atomic commit instead of its own. See Task 7's file list and steps — `src/report/wclLinks.ts` and `src/report/wclLinks.test.ts` are listed there now.

---

### Task 4: `fetchReportFights` returns `expansionId` and `archiveStatus`

**Files:**

- Modify: `src/wcl/client.ts`
- Modify: `src/testUtils/factories.ts`
- Modify: `test/integration/fixtures/report-fights.json`
- Create: `test/integration/fixtures/report-fights-classic.json`
- Test: `test/integration/client.test.ts`

**Interfaces:**

- Produces: `ReportFights` gains `expansionId: number` and `archiveStatus: { isArchived: boolean; isAccessible: boolean }`.

- [ ] **Step 1: Update the fixtures (real captured data)**

`test/integration/fixtures/report-fights.json` already exists with a `data.reportData.report` object containing `title` and `fights` (6 curated fights from real report `4GYHZRdtL3bvhpc8`). Add two sibling fields to that same `report` object (do not touch `title`/`fights`), matching the real live-captured response for this report:

```json
        "zone": { "expansion": { "id": 1001, "name": "The Burning Crusade" } },
        "archiveStatus": { "isArchived": false, "isAccessible": true }
```

Place them as siblings of `"title"` and `"fights"` inside `data.reportData.report`.

Create `test/integration/fixtures/report-fights-classic.json` (real captured data from `classic.`-sourced report `mtRh3kJ9YMLazyvQ`, "BT / Hyjal"):

```json
{
  "data": {
    "reportData": {
      "report": {
        "title": "BT / Hyjal",
        "fights": [
          {
            "id": 1,
            "name": "Coilskar Wrangler",
            "startTime": 414939,
            "endTime": 427463,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null
          },
          {
            "id": 2,
            "name": "Leviathan",
            "startTime": 498879,
            "endTime": 552783,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null
          },
          {
            "id": 3,
            "name": "Coilskar Wrangler",
            "startTime": 572463,
            "endTime": 572463,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null
          },
          {
            "id": 10,
            "name": "High Warlord Naj'entus",
            "startTime": 1118581,
            "endTime": 1271196,
            "encounterID": 601,
            "kill": true,
            "bossPercentage": 0.01
          }
        ],
        "zone": { "expansion": { "id": 1001, "name": "The Burning Crusade" } },
        "archiveStatus": { "isArchived": true, "isAccessible": true }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

In `test/integration/client.test.ts`, add the new fixture import near the existing ones:

```ts
import reportFightsClassicFixture from "./fixtures/report-fights-classic.json";
```

Inside `describe("fetchReportFights", ...)`, add:

```ts
it("parses expansionId and archiveStatus from a real captured www response", async () => {
  server.use(
    http.post(USER_API_URL, () => HttpResponse.json(reportFightsFixture)),
  );
  const result = await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
  expect(result.expansionId).toBe(1001);
  expect(result.archiveStatus).toEqual({
    isArchived: false,
    isAccessible: true,
  });
});

it("parses a real captured classic.-sourced report the same way", async () => {
  server.use(
    http.post(USER_API_URL, () =>
      HttpResponse.json(reportFightsClassicFixture),
    ),
  );
  const result = await fetchReportFights("test-token", "mtRh3kJ9YMLazyvQ");
  expect(result.title).toBe("BT / Hyjal");
  expect(result.fights).toHaveLength(4);
  expect(result.expansionId).toBe(1001);
  expect(result.archiveStatus).toEqual({
    isArchived: true,
    isAccessible: true,
  });
});
```

Extend the existing `it("requests encounterID, kill, and bossPercentage for each fight", ...)` test's assertions to also check the query text:

```ts
expect(requestBody?.query).toContain("expansion");
expect(requestBody?.query).toContain("archiveStatus");
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm test -- test/integration/client.test.ts`
Expected: FAIL — `expansionId`/`archiveStatus` are `undefined` on the result; query doesn't contain the new field names yet.

- [ ] **Step 4: Implement**

In `src/wcl/client.ts`, update `ReportFights` and `fetchReportFights` (replace the existing `ReportFights` interface and `fetchReportFights` function):

```ts
export interface ReportFights {
  title: string;
  fights: Fight[];
  expansionId: number;
  archiveStatus: { isArchived: boolean; isAccessible: boolean };
}

export async function fetchReportFights(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
): Promise<ReportFights> {
  const data = await postGraphQL(
    accessToken,
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage }
      zone { expansion { id name } }
      archiveStatus { isArchived isAccessible }
    }
  }
}`,
    signal,
  );
  const report = data.reportData.report;
  return {
    title: report.title,
    fights: report.fights.map(
      (fight: {
        id: number;
        name: string;
        startTime: number;
        endTime: number;
        encounterID: number;
        kill: boolean | null;
        bossPercentage: number | null;
      }): Fight => ({
        id: fight.id,
        name: fight.name,
        startTime: fight.startTime,
        endTime: fight.endTime,
        encounterID: fight.encounterID,
        kill: fight.kill,
        bossPercentage: fight.bossPercentage,
      }),
    ),
    expansionId: report.zone.expansion.id,
    archiveStatus: {
      isArchived: report.archiveStatus.isArchived,
      isAccessible: report.archiveStatus.isAccessible,
    },
  };
}
```

In `src/testUtils/factories.ts`, update `aReportFights` to default to TBC + accessible (so every existing test using this factory without overrides keeps passing unchanged):

```ts
export function aReportFights(
  overrides: Partial<ReportFights> = {},
): ReportFights {
  return {
    title: "SSC+TK 2026-07-07",
    fights: [aFight()],
    expansionId: 1001,
    archiveStatus: { isArchived: false, isAccessible: true },
    ...overrides,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- test/integration/client.test.ts src/testUtils`
Expected: PASS.

- [ ] **Step 6: Typecheck** (this changes a widely-consumed type)

Run: `npm run typecheck`
Expected: may show errors at call sites that construct a `ReportFights`-shaped object by hand outside factories — fix any such call sites found by adding the two new fields (there should be none outside `client.ts`/`factories.ts`, since production code only ever receives `ReportFights` from `fetchReportFights`, never constructs it — but this step exists to catch any exception to that if one exists). If clean, proceed.

- [ ] **Step 7: Commit**

```bash
git add src/wcl/client.ts src/testUtils/factories.ts test/integration/client.test.ts test/integration/fixtures/report-fights.json test/integration/fixtures/report-fights-classic.json
git commit -m "feat(wcl-client): fetch report expansion and archive-accessibility status"
```

---

### Task 5: `ConnectPanel` rejects non-TBC and inaccessible reports

**Files:**

- Modify: `src/app/components/ConnectPanel/index.tsx`
- Test: `src/app/components/ConnectPanel/index.test.tsx`

**Interfaces:**

- Consumes: `ReportFights.expansionId` / `.archiveStatus` (Task 4).
- Produces: `ConnectPanelProps` gains `onStartOver: () => void` (required).

- [ ] **Step 1: Write the failing tests**

Add `onStartOver={vi.fn()}` to every existing `<ConnectPanel ... />` render in `src/app/components/ConnectPanel/index.test.tsx` (5 existing render call sites) — TypeScript will otherwise fail to compile the test file once the prop becomes required.

Add new test cases to the `describe("ConnectPanel", ...)` block:

```ts
  it("shows a rejection message and does not call onReportLoaded for a non-TBC report", async () => {
    const fetchReportFights = () =>
      Promise.resolve(aReportFights({ expansionId: 1000 }));
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
        onStartOver={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "isn't Burning Crusade content",
      ),
    );
    expect(onReportLoaded).not.toHaveBeenCalled();
  });

  it("shows a subscription-required message and does not call onReportLoaded when archiveStatus.isAccessible is false", async () => {
    const fetchReportFights = () =>
      Promise.resolve(
        aReportFights({
          archiveStatus: { isArchived: true, isAccessible: false },
        }),
      );
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
        onStartOver={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "requires an active Warcraft Logs subscription",
      ),
    );
    expect(onReportLoaded).not.toHaveBeenCalled();
  });

  it("shows the subscription-required message when the fetch throws an error mentioning a subscription", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchReportFights = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("This report has been archived."));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "requires an active Warcraft Logs subscription",
    );
  });

  it("calls onStartOver when the back-link is clicked after a rejection", async () => {
    const onStartOver = vi.fn();
    const fetchReportFights = () =>
      Promise.resolve(aReportFights({ expansionId: 1002 }));
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
        onStartOver={onStartOver}
      />,
    );
    await waitFor(() => screen.getByRole("alert"));
    screen.getByText("Load different WCL report").click();
    expect(onStartOver).toHaveBeenCalledOnce();
  });
```

Add the import at the top of the test file: `import { aReportFights } from "../../../testUtils/factories";` (if not already imported).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- src/app/components/ConnectPanel/index.test.tsx`
Expected: FAIL (compile error on missing `onStartOver` prop, then behavioral failures).

- [ ] **Step 3: Implement**

Replace `src/app/components/ConnectPanel/index.tsx` in full:

```tsx
import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<ReportFights>;
  onReportLoaded: (report: ReportFights) => void;
  onStartOver: () => void;
}

type FetchResult = { accessToken: string; report: ReportFights };

const TBC_EXPANSION_ID = 1001;

// Best-effort fallback for the case (unverified — this project's test
// account has full access to every report tried) where WCL denies the
// whole report node for an inaccessible archived report instead of
// resolving it with archiveStatus.isAccessible: false. See
// docs/specs/classic-wcl-support-design.md's "Error handling" section.
const SUBSCRIPTION_ERROR_PATTERN = /subscri|premium|upgrade|archived/i;

const UNSUPPORTED_EXPANSION_MESSAGE =
  "This report isn't Burning Crusade content — Bloomwatch only judges TBC logs.";
const SUBSCRIPTION_REQUIRED_MESSAGE =
  "This report requires an active Warcraft Logs subscription to view.";

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
  onReportLoaded,
  onStartOver,
}: ConnectPanelProps) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setRejection(null);
    const controller = new AbortController();
    fetchReportFights(accessToken, reportCode, controller.signal)
      .then((report) => {
        if (report.expansionId !== TBC_EXPANSION_ID) {
          setRejection(UNSUPPORTED_EXPANSION_MESSAGE);
          return;
        }
        if (!report.archiveStatus.isAccessible) {
          setRejection(SUBSCRIPTION_REQUIRED_MESSAGE);
          return;
        }
        setResult({ accessToken, report });
        onReportLoaded(report);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (
          err instanceof Error &&
          SUBSCRIPTION_ERROR_PATTERN.test(err.message)
        ) {
          setRejection(SUBSCRIPTION_REQUIRED_MESSAGE);
          return;
        }
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchReportFights (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
    return () => controller.abort();
  }, [accessToken, reportCode, fetchReportFights, onReportLoaded]);

  if (!accessToken) return <p>Not connected.</p>;

  if (rejection) {
    return (
      <div>
        <Alert tone="warning">
          {rejection}
          {rejection === SUBSCRIPTION_REQUIRED_MESSAGE && (
            <>
              {" "}
              <a
                href="https://www.warcraftlogs.com/subscribe"
                target="_blank"
                rel="noreferrer"
              >
                See Warcraft Logs subscription options →
              </a>
            </>
          )}
        </Alert>
        <Button onClick={onStartOver}>Load different WCL report</Button>
      </div>
    );
  }

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Loading report…</p>;

  return (
    <div>
      <h2>{result.report.title}</h2>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/components/ConnectPanel/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConnectPanel/index.tsx src/app/components/ConnectPanel/index.test.tsx
git commit -m "feat(connect-panel): reject non-TBC and subscription-gated reports"
```

---

### Task 6: Wire `host` through `ReportInput`, `ConnectPanel`, and `ReportDashboard`

**Note:** Task 2 already added the `host` derivation and wired it through every `navigate()` call in `App.tsx` except `handleReportSubmit` (which needed `ParsedReport.host`, not yet defined at that point) — see Task 2 Step 5 if you need that context. This task finishes the remaining, narrower slice: `ReportInput`'s `ParsedReport` type, flipping `handleReportSubmit`'s temporary hardcoded `host: "fresh"` to the real `parsed.host`, and wiring `ConnectPanel`'s new `onStartOver` prop. `ReportDashboard`'s `host` prop is declared **optional** in this task (`host?: Host`) — Task 7 makes it required once `Scorecard` actually consumes it, so this task's commit stays green without depending on Task 7 landing first.

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/app/components/ReportInput/index.tsx`
- Modify: `src/app/components/ReportDashboard/index.tsx` (only: add `host?: Host;` to `ReportDashboardProps` — do not destructure or use it yet, that's Task 7)
- Test: `src/app/components/ReportInput/index.test.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**

- Consumes: `Host` (Task 1), `Route` with `host` (Task 2), `ConnectPanelProps.onStartOver` (Task 5).
- Produces: `ParsedReport` (from `ReportInput`) gains `host: Host`. `ReportDashboardProps` gains optional `host?: Host` (Task 7 makes it required and consumes it).

- [ ] **Step 1: Write the failing tests**

In `src/app/components/ReportInput/index.test.tsx`, add `host: "fresh"` to both existing `expect(onSubmit).toHaveBeenCalledWith({...})` assertions (the bare-code and URL-fragment cases), and add one new test for a classic URL:

```ts
  it("calls onSubmit with host: classic for a classic.warcraftlogs.com URL", async () => {
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/report url or code/i);
    await userEvent.type(
      input,
      `https://classic.warcraftlogs.com/reports/${CODE}`,
    );
    await userEvent.click(screen.getByRole("button", { name: /load report/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      reportCode: CODE,
      fightId: null,
      host: "classic",
    });
  });
```

(Check the exact existing test's input-interaction style — e.g. `userEvent.type`/`fireEvent` and the input's accessible label/role — and match it; the two existing tests already in the file show the pattern to copy.)

In `src/App.test.tsx`: this file drives full app flows. Search it for any place that constructs a `Route`/hash literal by hand for a `classic.`-style scenario — there shouldn't be one yet (this story is new), so no changes are anticipated here beyond what running the suite reveals. Do not pre-edit this file; run it after Step 3's implementation and fix only what the run reports as broken (expected: nothing, since `host` defaults to `"fresh"` everywhere existing tests exercise, and `aReportFights()`'s new defaults are TBC + accessible).

- [ ] **Step 2: Run the ReportInput test to verify it fails**

Run: `npm test -- src/app/components/ReportInput/index.test.tsx`
Expected: FAIL (missing `host` field / new case not implemented).

- [ ] **Step 3: Implement**

In `src/app/components/ReportInput/index.tsx`, update `ParsedReport` and the submit handler:

```ts
import type { Host } from "../../../report/parseReportInput";

export interface ParsedReport {
  reportCode: string;
  fightId: number | null;
  host: Host;
}
```

And in `handleSubmit`, change:

```ts
onSubmit({ reportCode: result.reportCode, fightId: result.fightId });
```

to:

```ts
onSubmit({
  reportCode: result.reportCode,
  fightId: result.fightId,
  host: result.host,
});
```

In `src/App.tsx`, find `handleReportSubmit` (it currently has a temporary hardcoded `host: "fresh"` with a `// TODO(story-012 Task 6)` comment, added by Task 2) and replace it with the real value:

```ts
function handleReportSubmit(parsed: ParsedReport) {
  resetReportState();
  setPendingFightId(parsed.fightId);
  navigate({
    screen: "druidPicker",
    reportCode: parsed.reportCode,
    host: parsed.host,
  });
}
```

Then, still in `src/App.tsx`:

1. `ConnectPanel` render (~line 455): add `onStartOver={handleStartOver}`:

```tsx
<ConnectPanel
  accessToken={accessToken}
  reportCode={reportCode}
  fetchReportFights={wrappedFetchReportFights}
  onReportLoaded={setLoadedReport}
  onStartOver={handleStartOver}
/>
```

2. `ReportDashboard` render (~line 512): add `host={host}` right after `reportCode={reportCode}` — `host` is already derived (Task 2) as `route.screen === "input" ? null : route.host`, and the surrounding condition already requires `reportCode` truthy; add `host !== null` to that same condition list (alongside the existing `reportCode &&` check at ~line 503):

```tsx
          {loadedReport &&
            reportCode &&
            host !== null &&
            selectedDruid !== null &&
```

and:

```tsx
                <ReportDashboard
                  accessToken={accessToken}
                  reportCode={reportCode}
                  host={host}
                  reportTitle={loadedReport.title}
```

In `src/app/components/ReportDashboard/index.tsx`, add `host?: Host;` (optional) to `ReportDashboardProps`, and the matching import `import type { Host } from "../../../report/parseReportInput";`. Do not destructure it in the component function or use it anywhere yet — Task 7 does that.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/components/ReportInput/index.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all clean — this task's changes complete every remaining `host` gap in `App.tsx` (Task 2 already handled the rest), and `ReportDashboardProps.host` being optional means `ReportDashboard`'s own body doesn't need to change yet.

Run: `npm test -- src/App.test.tsx`
Expected: PASS (behavior is unchanged for every existing test input, since `parsed.host` resolves to `"fresh"` for every case they exercise).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/app/components/ReportInput/index.tsx src/app/components/ReportInput/index.test.tsx src/app/components/ReportDashboard/index.tsx
git commit -m "feat(app): wire report host into ReportInput, ConnectPanel, and ReportDashboard"
```

---

### Task 7: Thread `host` through the report-view component tree

**Files:**

- Modify: `src/report/wclLinks.ts` (merged in from the original Task 3 — see the "Task 3: MERGED INTO TASK 7" note above)
- Test: `src/report/wclLinks.test.ts`
- Modify: `src/app/components/ReportDashboard/index.tsx`
- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/GcdEconomyContent/index.tsx`
- Modify: `src/app/components/LifebloomDisciplineContent/index.tsx`
- Modify: `src/app/components/SpellDisciplineContent/index.tsx`
- Modify: `src/app/components/ManaEconomyContent/index.tsx`
- Modify: `src/app/components/DeathForensicsContent/index.tsx`
- Modify: `src/app/components/IdleGapsCard/index.tsx`
- Modify: `src/app/components/AccidentalBloomsCard/index.tsx`
- Modify: `src/app/components/RestackTaxCard/index.tsx`
- Modify: `src/app/components/HotClipDetectionCard/index.tsx`
- Modify: `src/app/components/SwiftmendAuditCard/index.tsx`
- Modify: `src/app/components/NaturesSwiftnessCard/index.tsx`
- Modify: `src/app/components/InnervateAuditCard/index.tsx`
- Modify: `src/app/components/DeathForensicsCard/index.tsx`
- Test: the `index.test.tsx` for each of the 8 cards above, plus `src/app/components/Scorecard/index.test.tsx`, `src/app/components/ReportDashboard/index.test.tsx`, `src/App.test.tsx`

**Interfaces:**

- Consumes: `Host` (Task 1), `buildFightTimeUrl(host, reportCode, fightId, startMs, endMs)` (Task 3), `ReportDashboardProps` receiving `host` from `App.tsx` (Task 6).

**Special case — `ReportDashboard/index.tsx`:** Task 6 already added `host?: Host;` (optional) to `ReportDashboardProps` and the `Host` import; this task changes it to required (`host: Host;`), destructures `host` in the component function, and passes `host={host}` on the `<Scorecard ... />` render only (per the scope table below) — don't re-add the interface field or import from scratch, just tighten and use what's already there.

This task is one mechanical, uniform transformation repeated across every file above — it must land as one commit since the tree only type-checks once every file is done. **The rule, applied identically everywhere `reportCode` already appears (except `ReportDashboard`, per the special case above):**

1. Wherever `reportCode: string;` appears in a `Props` interface, add `host: Host;` on the next line (and `import type { Host } from ...` — path depends on file depth, e.g. `"../../../report/parseReportInput"` from a component two levels under `src/app/components/`).
2. Wherever `reportCode,` appears in a destructured function-parameter list, add `host,` on the next line.
3. Wherever `reportCode={reportCode}` appears as a JSX prop passed to a _child that itself needs `host`_ (see the specific list below — not every child needs it), add `host={host}` immediately after it.
4. Wherever `buildFightTimeUrl(reportCode, ...)` is called, change it to `buildFightTimeUrl(host, reportCode, ...)` (new leading argument, per Task 3).

**Exact scope per file** (only these children receive `host` — siblings that never call `buildFightTimeUrl` do not need it and must NOT be touched, to keep the diff minimal):

- `ReportDashboard/index.tsx`: add `host: Host;` to `ReportDashboardProps` only (**not** the internal `FightRow`-local props type — `FightRow` never builds a WCL link). Destructure `host` in the main `ReportDashboard` function. Pass `host={host}` on the `<Scorecard ... />` render only (**not** on the `<FightRow ... />` render).
- `Scorecard/index.tsx`: add `host: Host;` to `ScorecardProps`, destructure it, use it in its own `buildFightTimeUrl(reportCode, fight.id, 0, fight.endTime - fight.startTime)` call (→ `buildFightTimeUrl(host, reportCode, fight.id, 0, fight.endTime - fight.startTime)`). Pass `host={host}` on the `<GcdEconomyContent>`, `<LifebloomDisciplineContent>`, `<SpellDisciplineContent>`, `<ManaEconomyContent>`, `<DeathForensicsContent>` renders — **not** `<PrepHygieneContent>` (none of its cards build WCL links).
- `GcdEconomyContent/index.tsx`: add `host`, pass `host={host}` only to `<IdleGapsCard>` (not `<GCDUtilizationCard>`).
- `LifebloomDisciplineContent/index.tsx`: add `host`, pass `host={host}` only to `<AccidentalBloomsCard>` and `<RestackTaxCard>` (not `<LB3UptimeCard>`, `<RefreshCadenceCard>`, `<ConcurrentTargetsCard>`).
- `SpellDisciplineContent/index.tsx`: add `host`, pass `host={host}` only to `<HotClipDetectionCard>`, `<SwiftmendAuditCard>`, `<NaturesSwiftnessCard>` (not `<DownrankingDisciplineCard>`).
- `ManaEconomyContent/index.tsx`: add `host`, pass `host={host}` only to `<InnervateAuditCard>` (not `<ManaCurveCard>`, `<ConsumableThroughputCard>`, `<OverhealTableCard>`).
- `DeathForensicsContent/index.tsx`: add `host`, pass `host={host}` to its one child, `<DeathForensicsCard>`.
- The 8 card files (`IdleGapsCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `HotClipDetectionCard`, `SwiftmendAuditCard`, `NaturesSwiftnessCard`, `InnervateAuditCard`, `DeathForensicsCard`): add `host: Host;` to their `Props` interface (right after `reportCode: string;`), destructure `host`, and update their `buildFightTimeUrl(reportCode, ...)` call to `buildFightTimeUrl(host, reportCode, ...)`.

- [ ] **Step 1: Change `buildFightTimeUrl`'s signature (do this first — everything else in this task calls it)**

Replace `src/report/wclLinks.test.ts` in full:

```ts
import { describe, expect, it } from "vitest";
import { buildFightTimeUrl } from "./wclLinks";

describe("buildFightTimeUrl", () => {
  it("builds a fresh.warcraftlogs.com deep link scoped to the fight and time range", () => {
    const url = buildFightTimeUrl("fresh", "4GYHZRdtL3bvhpc8", 6, 1500, 5000);
    expect(url).toBe(
      "https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8#fight=6&type=summary&start=1500&end=5000",
    );
  });

  it("builds a classic.warcraftlogs.com deep link when the report came from classic", () => {
    const url = buildFightTimeUrl(
      "classic",
      "4GYHZRdtL3bvhpc8",
      6,
      1500,
      5000,
    );
    expect(url).toBe(
      "https://classic.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8#fight=6&type=summary&start=1500&end=5000",
    );
  });
});
```

Run: `npm test -- src/report/wclLinks.test.ts` — Expected: FAIL (argument count / hardcoded `fresh.` mismatch).

Replace `src/report/wclLinks.ts` in full:

```ts
import type { Host } from "./parseReportInput";

// Deep-links into a specific moment of a fight's timeline on the WCL web UI.
// start/end are report-relative milliseconds — the same convention used by
// event.timestamp and fight.startTime/endTime throughout this codebase.
export function buildFightTimeUrl(
  host: Host,
  reportCode: string,
  fightId: number,
  startMs: number,
  endMs: number,
): string {
  return `https://${host}.warcraftlogs.com/reports/${reportCode}#fight=${fightId}&type=summary&start=${startMs}&end=${endMs}`;
}
```

Run: `npm test -- src/report/wclLinks.test.ts` — Expected: PASS. At this point every one of the 9 callers (`Scorecard` + 8 cards) fails to typecheck — that's expected and exactly what Step 2 fixes next.

- [ ] **Step 2: Apply the mechanical edit to the remaining 15 files listed above**

Use the exact rule and per-file scope given above. Import path for `Host`: from `src/app/components/<Name>/index.tsx` it's `"../../../report/parseReportInput"`.

- [ ] **Step 3: Run typecheck to find anything missed**

Run: `npm run typecheck`
Expected: initially FAILS, listing every call site still missing `host`. Fix each reported error (it will point at an exact file:line — either a missing prop on a JSX element, or a missing field on a destructure/interface) until the run is clean. This is the primary correctness check for this task — the compiler enumerates every remaining gap precisely.

- [ ] **Step 4: Update the 8 card test files**

For each of `IdleGapsCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `HotClipDetectionCard`, `SwiftmendAuditCard`, `NaturesSwiftnessCard`, `InnervateAuditCard`, `DeathForensicsCard`'s `index.test.tsx`: every existing `render(<XCard reportCode="..." .../>)` call needs `host="fresh"` added alongside `reportCode="..."`. Run each file, e.g.:

Run: `npm test -- src/app/components/IdleGapsCard/index.test.tsx`
Expected: FAILS to compile until `host="fresh"` is added to every render call in the file (TypeScript will report the missing required prop); after adding it, PASSES unchanged (default `host="fresh"` preserves every existing `fresh.warcraftlogs.com`-asserting expectation, if any).

Repeat for all 8 files, plus `src/app/components/Scorecard/index.test.tsx` and `src/app/components/ReportDashboard/index.test.tsx` (same pattern: add `host="fresh"` to every existing render call).

- [ ] **Step 5: Run the full suite, including `App.test.tsx`**

Run: `npm test`
Expected: PASS. If `App.test.tsx` fails, the failure will point at a specific assertion — most likely a hash string or a missing `host` on a hand-built route/props object somewhere in that file's setup; fix by adding `host: "fresh"` (or the hash equivalent, which needs no change since `"fresh"` serializes with no `/h/` segment per Task 2) to whatever the failure identifies.

- [ ] **Step 6: Full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all clean. If `format:check` fails, run `npm run format` and re-verify.

- [ ] **Step 7: Commit**

```bash
git add src/report/wclLinks.ts src/report/wclLinks.test.ts src/app/components/ReportDashboard src/app/components/Scorecard src/app/components/GcdEconomyContent src/app/components/LifebloomDisciplineContent src/app/components/SpellDisciplineContent src/app/components/ManaEconomyContent src/app/components/DeathForensicsContent src/app/components/IdleGapsCard src/app/components/AccidentalBloomsCard src/app/components/RestackTaxCard src/app/components/HotClipDetectionCard src/app/components/SwiftmendAuditCard src/app/components/NaturesSwiftnessCard src/app/components/InnervateAuditCard src/app/components/DeathForensicsCard
git commit -m "feat(scorecard): thread report host through every WCL deep-link"
```

---

### Task 8: Documentation updates

**Files:**

- Modify: `docs/backlog.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/testing.md`
- Delete: `docs/specs/classic-wcl-support-design.md`

- [ ] **Step 1: `docs/backlog.md`**

Find story `012` (search for `### 012 — Support`). Change its status marker from `🔲 Todo` to `✅ Done`. Rewrite acceptance criteria bullet #2 (the www→classic fallback one) and #5 (the per-request base URL one) to reflect the confirmed host-agnostic reality:

Replace:

```
- A bare report code (no host in the URL, story 002's existing supported input shape) is disambiguated by trying `www.warcraftlogs.com` first (today's only host) and falling back to `classic.warcraftlogs.com` if the report isn't found there, rather than requiring the user to specify which host.
```

with:

```
- Report codes resolve identically regardless of which of `www`/`classic`/`fresh` WCL hosts serves the request (confirmed live during implementation) — a bare report code needs no host disambiguation at all; it's fetched exactly as it always has been.
```

Replace:

```
- `src/wcl/client.ts`'s WCL API base URL, currently hardcoded to `www.warcraftlogs.com`, becomes a per-request choice based on which host the report resolved against.
```

with:

```
- `src/wcl/client.ts`'s WCL API base URL stays a single hardcoded `www.warcraftlogs.com` endpoint — confirmed live that it already serves `classic.`-sourced reports identically, so no per-request host routing is needed. The parsed input `host` (`fresh`/`classic`) is used only for building outbound deep-links back to WCL's own web UI, not for choosing an API endpoint.
```

Find the bullet naming the subscription-status field and sharpen it to name the real field:

```
- The account's subscription status is surfaced to the user proactively via `Report.archiveStatus.isAccessible` (confirmed live — no `currentUser`-level subscription field exists in the schema); a `classic.` report attempt that fails despite that check is surfaced as a clear, distinct message (per story 708's error-handling conventions) that explains a WCL subscription is needed and links to WCL's own subscription page — not a generic "something went wrong," and not a prompt to register a personal Client ID, since that alone wouldn't fix it.
```

(Replace whatever the existing similarly-worded bullet says with this.)

- [ ] **Step 2: `docs/roadmap.md`**

Find the line (~line 30): `Anniversary ("fresh") realm reports resolve against `https://www.warcraftlogs.com/api/v2/user`... — a single host regardless of which subdomain the report link uses.`Update to note`classic.`-sourced reports too:

```
- TBC reports resolve against `https://www.warcraftlogs.com/api/v2/user` regardless of whether the link is `fresh.warcraftlogs.com` (Anniversary) or `classic.warcraftlogs.com` (the original 2021-2024 Classic-launch TBC window) — confirmed with reports `4GYHZRdtL3bvhpc8` and `mtRh3kJ9YMLazyvQ` respectively (see `docs/wcl-auth.md`) — a single host regardless of which subdomain the report link uses. `classic.warcraftlogs.com` also serves Vanilla/Wrath/Cata/MoP logs, rejected via `zone.expansion.id !== 1001`; and older reports may require an active WCL subscription (`Report.archiveStatus.isAccessible`) — see backlog story 012.
```

Find the "Explicitly out of scope" bullet (~line 78): `Other WoW versions, expansions, or realm types — Vanilla/Wrath/Cataclysm Classic, Season of Discovery, retail, and non-Anniversary ("progression") TBC realms. TBC Anniversary ("fresh") realms only.` Update to:

```
- Other WoW versions or expansions — Vanilla/Wrath/Cataclysm/MoP Classic, Season of Discovery, retail. TBC content only (Anniversary "fresh" realms and the original 2021-2024 Classic-launch TBC window via `classic.warcraftlogs.com`) — no other realm type.
```

- [ ] **Step 3: `CLAUDE.md`**

Find the "Project" paragraph's scope sentence: `In scope: TBC Anniversary ("fresh") realms only — no other WoW version, expansion, or realm type.` Update to:

```
In scope: TBC content only — Anniversary ("fresh") realms and the original 2021-2024 Classic-launch TBC window (`classic.warcraftlogs.com`) — no other WoW version, expansion, or realm type.
```

Find the "Repo state" paragraph's running list of completed stories (the long paragraph starting "Phase 0..."). Append a new sentence documenting story 012 in the same style as the existing entries (mentioning what it changed and why), e.g. appended at the end of that paragraph:

```
Story 012 (support `classic.warcraftlogs.com` TBC reports for subscribed users, epic A) is done too — `parseReportInput` now accepts `classic.` links alongside `fresh.`, and a report's TBC-content and access checks (`Report.zone.expansion.id` / `Report.archiveStatus.isAccessible`, both added to the existing `fetchReportFights` query at no extra request cost) happen in `ConnectPanel` after the fetch resolves, since they need the network round trip `parseReportInput` itself doesn't make. Live testing during this story found report codes resolve identically regardless of which of `www`/`classic`/`fresh` WCL API host serves the request, so `src/wcl/client.ts`'s API base URL needed no per-host routing — the parsed `host` is used only for building outbound deep-links back to WCL's own web UI (threaded through the URL hash, per 703, and down through every metric card that links out).
```

- [ ] **Step 4: `docs/testing.md`**

In the "Known real test reports" table, add a new row for `mtRh3kJ9YMLazyvQ`:

```
| `mtRh3kJ9YMLazyvQ` | BT / Hyjal                     | The only known `classic.warcraftlogs.com`-sourced report in this table (every other row is `fresh.`/Anniversary) — used to validate story 012's TBC-content and access checks. Confirmed live: `zone.expansion.id: 1001` ("The Burning Crusade") and `archiveStatus: { isArchived: true, isAccessible: true }` against this project's test account, despite the report being from the original 2021-launch TBC Classic window (archived, but this account has full access) — the basis for `report-fights-classic.json`'s Tier 2 fixture. |
```

- [ ] **Step 5: Delete the spec**

```bash
git rm docs/specs/classic-wcl-support-design.md
```

Confirm nothing else references that path first:

```bash
grep -rn "classic-wcl-support-design" . --include=*.md --include=*.ts --include=*.tsx 2>/dev/null
```

Expected: no output after the `git rm` (the only prior reference was this plan file itself, which is expected to mention it).

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md docs/roadmap.md CLAUDE.md docs/testing.md
git commit -m "docs: mark story 012 done and document classic.warcraftlogs.com support"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all clean.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all PASS (Tiers 1-3).

- [ ] **Step 3: Sanity-check the plan's live-data claims are still embedded correctly**

Run: `npm run wcl:query -- 'query { reportData { report(code: "mtRh3kJ9YMLazyvQ") { title zone { expansion { id name } } archiveStatus { isArchived isAccessible } } } }'`
Expected: JSON output matching `title: "BT / Hyjal"`, `expansion: { id: 1001, name: "The Burning Crusade" }`, `archiveStatus: { isArchived: true, isAccessible: true }` — confirms the fixtures embedded in Task 4 still reflect live reality (no need to update anything if it matches; investigate if it doesn't).

- [ ] **Step 4: No stray changes**

Run: `git status --short`
Expected: clean (everything already committed task-by-task). If anything is uncommitted, review it and commit or discard per the safety protocol (never discard without understanding what it is first).

This is the final task — once it passes, the story is fully implemented and documented, ready for `superpowers:finishing-a-development-branch` (rebase onto `main`, fast-forward merge, per this repo's fast-forward-only convention).
