# Fight List & Selection (Story 003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user see a report's boss fights (pull number, name, kill/wipe, duration), filter out trash by default, and select one fight.

**Architecture:** Extend the WCL client's `Fight` type/query with `encounterID`/`kill`/`bossPercentage`; add a pure `fightRows` module for trash/pull-number derivation; add a new `FightPicker` component; wire it into `App.tsx` via a new `onReportLoaded` callback on `ConnectPanel`.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library + `@testing-library/user-event`, MSW for Tier 2, Playwright for Tier 5.

## Global Constraints

- Commits follow Conventional Commits (`type(scope): summary`); scope `wcl-client`, `report`, or `fight-picker` depending on the file touched (see `CLAUDE.md`).
- Every commit must pass the full-project pre-commit hook (`npm run typecheck && npm run lint && npm run format:check`) — never bypass it.
- No hardcoded spell/ability IDs are involved in this story; not applicable here.
- No secrets required for the app's own build/deploy path (principle 2) — this story doesn't touch auth.
- Tier 1 tests are co-located `*.test.ts`; Tier 3 tests are co-located `*.test.tsx`; Tier 2 fixtures must be real captured WCL API payloads, never hand-built (`docs/testing.md`).
- Full design detail lives in `docs/specs/fight-picker-design.md` — this plan implements it task-by-task.

---

### Task 1: Extend the WCL client's `Fight` type and query

**Files:**

- Modify: `src/wcl/client.ts`
- Modify: `src/testUtils/factories.ts`
- Test: `test/integration/client.test.ts`

**Interfaces:**

- Produces: `Fight` gains `encounterID: number`, `kill: boolean | null`, `bossPercentage: number | null`. `aFight()` factory defaults: `encounterID: 601, kill: true, bossPercentage: null`.

- [ ] **Step 1: Write the failing test**

Add to `test/integration/client.test.ts`, inside the existing `describe("fetchReportFights", ...)` block:

```ts
it("requests encounterID, kill, and bossPercentage for each fight", async () => {
  let requestBody: { query: string } | undefined;
  server.use(
    http.post(USER_API_URL, async ({ request }) => {
      requestBody = (await request.json()) as { query: string };
      return HttpResponse.json(reportFightsFixture);
    }),
  );

  await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");

  expect(requestBody?.query).toContain("encounterID");
  expect(requestBody?.query).toContain("kill");
  expect(requestBody?.query).toContain("bossPercentage");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/client.test.ts`
Expected: FAIL — `requestBody?.query` does not contain `"encounterID"`.

- [ ] **Step 3: Write minimal implementation**

In `src/wcl/client.ts`, replace the `Fight` interface and the query string inside `fetchReportFights`:

```ts
export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID: number;
  kill: boolean | null;
  bossPercentage: number | null;
}
```

```ts
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage }
    }
  }
}`,
    }),
```

In `src/testUtils/factories.ts`, update `aFight`:

```ts
export function aFight(overrides: Partial<Fight> = {}): Fight {
  return {
    id: 1,
    name: "Coilfang Frenzy",
    startTime: 1477307,
    endTime: 1505939,
    encounterID: 601,
    kill: true,
    bossPercentage: null,
    ...overrides,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — the old fixture lacks the new fields, but the pre-existing assertions only check `id`/`name`/`startTime`/`endTime` via object literals, which still match).

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass. (`npm run format` first if `format:check` fails on formatting only.)

- [ ] **Step 6: Commit**

```bash
git add src/wcl/client.ts src/testUtils/factories.ts test/integration/client.test.ts
git commit -m "feat(wcl-client): request encounterID, kill, and bossPercentage for fights"
```

---

### Task 2: Fight row derivation — `src/report/fightRows.ts`

**Files:**

- Create: `src/report/fightRows.ts`
- Test: `src/report/fightRows.test.ts`

**Interfaces:**

- Consumes: `Fight` from `src/wcl/client.ts`, `aFight` from `src/testUtils/factories.ts` (Task 1).
- Produces: `FightRow { fight: Fight; isTrash: boolean; pullNumber: number | null }`, `buildFightRows(fights: Fight[]): FightRow[]`, `formatDuration(ms: number): string`.

- [ ] **Step 1: Write the failing test**

Create `src/report/fightRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFightRows, formatDuration } from "./fightRows";
import { aFight } from "../testUtils/factories";

describe("buildFightRows", () => {
  it("marks encounterID 0 fights as trash with no pull number", () => {
    const fights = [aFight({ id: 1, encounterID: 0 })];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it("numbers repeated attempts at the same encounter starting at 1", () => {
    const fights = [
      aFight({ id: 1, encounterID: 500 }),
      aFight({ id: 2, encounterID: 500 }),
      aFight({ id: 3, encounterID: 500 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.map((r) => r.pullNumber)).toEqual([1, 2, 3]);
  });

  it("keeps pull numbers separate across interleaved encounters", () => {
    const fights = [
      aFight({ id: 1, encounterID: 500 }),
      aFight({ id: 2, encounterID: 600 }),
      aFight({ id: 3, encounterID: 500 }),
      aFight({ id: 4, encounterID: 600 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.map((r) => r.pullNumber)).toEqual([1, 1, 2, 2]);
  });

  it("marks every fight as trash and pull-number-less for an all-trash report", () => {
    const fights = [
      aFight({ id: 1, encounterID: 0 }),
      aFight({ id: 2, encounterID: 0 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.every((r) => r.isTrash && r.pullNumber === null)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatDuration(5000)).toBe("0:05");
  });

  it("formats multi-minute durations as m:ss", () => {
    expect(formatDuration(90000)).toBe("1:30");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(59700)).toBe("1:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/fightRows.test.ts`
Expected: FAIL — `Cannot find module './fightRows'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/report/fightRows.ts`:

```ts
import type { Fight } from "../wcl/client";

export interface FightRow {
  fight: Fight;
  isTrash: boolean;
  pullNumber: number | null;
}

export function buildFightRows(fights: Fight[]): FightRow[] {
  const counts = new Map<number, number>();
  return fights.map((fight) => {
    const isTrash = fight.encounterID === 0;
    if (isTrash) {
      return { fight, isTrash, pullNumber: null };
    }
    const next = (counts.get(fight.encounterID) ?? 0) + 1;
    counts.set(fight.encounterID, next);
    return { fight, isTrash, pullNumber: next };
  });
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/fightRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/report/fightRows.ts src/report/fightRows.test.ts
git commit -m "feat(report): add fight row derivation and duration formatting"
```

---

### Task 3: `FightPicker` component

**Files:**

- Create: `src/app/components/FightPicker/index.tsx`
- Test: `src/app/components/FightPicker/index.test.tsx`

**Interfaces:**

- Consumes: `Fight` from `src/wcl/client.ts`; `buildFightRows`, `formatDuration` from `src/report/fightRows.ts` (Task 2); `aFight` from `src/testUtils/factories.ts`.
- Produces: `FightPickerProps { fights: Fight[]; initialFightId: number | null; onSelectFight: (fightId: number) => void }`, component `FightPicker`.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/FightPicker/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FightPicker } from "./index";
import { aFight } from "../../../testUtils/factories";

const trash = aFight({
  id: 1,
  name: "Trash",
  encounterID: 0,
  kill: null,
  bossPercentage: null,
  startTime: 0,
  endTime: 5000,
});
const bossKill = aFight({
  id: 2,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 90000,
});
const bossWipe = aFight({
  id: 3,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: false,
  bossPercentage: 34.2,
  startTime: 0,
  endTime: 60000,
});

describe("FightPicker", () => {
  it("hides trash fights by default", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Trash/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("reveals trash fights when the toggle is checked", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(screen.getByRole("button", { name: /Trash/ })).toBeInTheDocument();
  });

  it("shows kill and wipe status distinctly, with boss HP% on a wipe", () => {
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toHaveTextContent("Kill");
    expect(
      screen.getByRole("button", { name: /Pull 2 — Coilfang Frenzy/ }),
    ).toHaveTextContent("Wipe (34%)");
  });

  it("calls onSelectFight and highlights the clicked row", async () => {
    const user = userEvent.setup();
    const onSelectFight = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectFight={onSelectFight}
      />,
    );
    const wipeRow = screen.getByRole("button", { name: /Wipe/ });
    await user.click(wipeRow);
    expect(onSelectFight).toHaveBeenCalledWith(3);
    expect(wipeRow).toHaveAttribute("aria-current", "true");
  });

  it("pre-selects a boss fight from initialFightId without enabling the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={2}
        onSelectFight={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Coilfang Frenzy/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("pre-selects a trash fight from initialFightId and auto-enables the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={1}
        onSelectFight={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
    expect(screen.getByRole("button", { name: /Trash/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/FightPicker/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/components/FightPicker/index.tsx`:

```tsx
import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import { buildFightRows, formatDuration } from "../../../report/fightRows";

export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectFight: (fightId: number) => void;
}

function isInitialFightTrash(
  fights: Fight[],
  initialFightId: number | null,
): boolean {
  if (initialFightId === null) return false;
  const fight = fights.find((f) => f.id === initialFightId);
  return fight !== undefined && fight.encounterID === 0;
}

export function FightPicker({
  fights,
  initialFightId,
  onSelectFight,
}: FightPickerProps) {
  const [showTrash, setShowTrash] = useState(() =>
    isInitialFightTrash(fights, initialFightId),
  );
  const [selectedFightId, setSelectedFightId] = useState<number | null>(
    initialFightId,
  );

  const rows = buildFightRows(fights).filter(
    (row) => !row.isTrash || showTrash,
  );

  function handleSelect(fightId: number) {
    setSelectedFightId(fightId);
    onSelectFight(fightId);
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={showTrash}
          onChange={(event) => setShowTrash(event.target.checked)}
        />
        Show trash fights
      </label>
      <ul>
        {rows.map(({ fight, isTrash, pullNumber }) => {
          const label = isTrash
            ? fight.name
            : `Pull ${pullNumber} — ${fight.name}`;
          const status =
            fight.kill === true
              ? "Kill"
              : fight.kill === false
                ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
                : null;
          const duration = formatDuration(fight.endTime - fight.startTime);
          const text = [label, status, duration].filter(Boolean).join(" — ");

          return (
            <li key={fight.id}>
              <button
                type="button"
                aria-current={fight.id === selectedFightId}
                onClick={() => handleSelect(fight.id)}
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/FightPicker/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/FightPicker
git commit -m "feat(fight-picker): add FightPicker component"
```

---

### Task 4: `ConnectPanel` — surface the loaded report via `onReportLoaded`

**Files:**

- Modify: `src/app/components/ConnectPanel/index.tsx`
- Modify: `src/app/components/ConnectPanel/index.test.tsx`

**Interfaces:**

- Produces: `ConnectPanelProps` gains `onReportLoaded: (report: ReportFights) => void`, called once per successful fetch.

- [ ] **Step 1: Write the failing test**

Replace `src/app/components/ConnectPanel/index.test.tsx` in full:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectPanel } from "./index";
import { aReportFights } from "../../../testUtils/factories";

describe("ConnectPanel", () => {
  it("shows a not-connected message when there is no access token", () => {
    render(
      <ConnectPanel
        accessToken={null}
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={() => Promise.reject()}
        onReportLoaded={vi.fn()}
      />,
    );
    expect(screen.getByText("Not connected.")).toBeInTheDocument();
  });

  it("fetches and renders the report title once connected", async () => {
    const fetchReportFights = () => Promise.resolve(aReportFights());
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("SSC+TK 2026-07-07")).toBeInTheDocument(),
    );
  });

  it("calls onReportLoaded with the fetched report once loaded", async () => {
    const report = aReportFights();
    const fetchReportFights = () => Promise.resolve(report);
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
      />,
    );
    await waitFor(() => expect(onReportLoaded).toHaveBeenCalledWith(report));
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchReportFights = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ConnectPanel/index.test.tsx`
Expected: FAIL — type error / missing prop `onReportLoaded`, and the `onReportLoaded` test times out since it's never called.

- [ ] **Step 3: Write minimal implementation**

Replace `src/app/components/ConnectPanel/index.tsx` in full:

```tsx
import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
  ) => Promise<ReportFights>;
  onReportLoaded: (report: ReportFights) => void;
}

type FetchResult =
  | { accessToken: string; report: ReportFights }
  | { accessToken: string; error: string };

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
  onReportLoaded,
}: ConnectPanelProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchReportFights(accessToken, reportCode)
      .then((report) => {
        setResult({ accessToken, report });
        onReportLoaded(report);
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error: err instanceof Error ? err.message : "Failed to fetch report.",
        }),
      );
  }, [accessToken, reportCode, fetchReportFights, onReportLoaded]);

  if (!accessToken) return <p>Not connected.</p>;

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Loading report…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return (
    <div>
      <h2>{result.report.title}</h2>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ConnectPanel/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ConnectPanel
git commit -m "feat(fight-picker): surface loaded report via ConnectPanel onReportLoaded"
```

---

### Task 5: Wire `FightPicker` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `FightPicker` (Task 3), `ConnectPanel`'s new `onReportLoaded` prop (Task 4), `ReportFights` type from `src/wcl/client.ts`.

No new test file — this task is covered by the Task 6 E2E update, since `App.tsx` currently has no dedicated test file and this is pure composition of already-tested components.

- [ ] **Step 1: Replace `src/App.tsx` in full**

```tsx
import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import { fetchReportFights, type ReportFights } from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [, setSelectedFightId] = useState<number | null>(null);

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    setLoadedReport(null);
    setSelectedFightId(null);
  }

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      {accessToken && <ReportInput onSubmit={handleReportSubmit} />}
      {accessToken && report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={fetchReportFights}
          onReportLoaded={setLoadedReport}
        />
      )}
      {loadedReport && (
        <FightPicker
          fights={loadedReport.fights}
          initialFightId={report?.fightId ?? null}
          onSelectFight={setSelectedFightId}
        />
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(fight-picker): wire FightPicker into App"
```

---

### Task 6: Update the E2E smoke test to drive fight selection

**Files:**

- Modify: `test/e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: the live app as wired in Task 5 — `FightPicker` rows render as `<button>`s with accessible names like `Pull 1 — <boss name>` and `aria-current="true"` when selected.

- [ ] **Step 1: Replace `test/e2e/smoke.spec.ts` in full**

```ts
import { test, expect } from "@playwright/test";

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;
const REPORT_CODE = "4GYHZRdtL3bvhpc8";

test.skip(!accessToken, "WCL_TEST_ACCESS_TOKEN not set — see docs/testing.md");

test("a pre-authenticated visit renders the real fight list and allows picking a fight", async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem("wcl_access_token", token as string);
  }, accessToken);

  // "/" would resolve to the domain root on GitHub Pages (base path is /bloomwatch/,
  // not the domain root) — "./" correctly stays relative to baseURL in both
  // local dev (http://localhost:5173) and production (.../bloomwatch/).
  await page.goto("./");

  await page.getByLabel("Report URL or code").fill(REPORT_CODE);
  await page.getByRole("button", { name: "Load report" }).click();

  await expect(page.getByText("SSC+TK 2026-07-07")).toBeVisible();

  const firstBossFight = page
    .getByRole("button", { name: /^Pull \d+/ })
    .first();
  await expect(firstBossFight).toBeVisible();
  await firstBossFight.click();
  await expect(firstBossFight).toHaveAttribute("aria-current", "true");
});
```

- [ ] **Step 2: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass. (E2E itself needs `WCL_TEST_ACCESS_TOKEN` in `.env.local` to actually execute against the live site — running it live is optional here and not required for this task's commit, per `docs/testing.md`'s manual-trigger norm for anything hitting the real API.)

- [ ] **Step 3: Commit**

```bash
git add test/e2e/smoke.spec.ts
git commit -m "test(e2e): drive fight selection in the smoke test"
```

---

## Manual follow-up (outside subagent execution)

The Tier 2 fixture `test/integration/fixtures/report-fights.json` is a real captured WCL API payload and does not yet include `encounterID`, `kill`, or `bossPercentage` (see `docs/specs/fight-picker-design.md`). Subagents have no WCL bearer token and cannot capture this. Once the tasks above are merged, you (the user) should:

1. Run the query below against `https://www.warcraftlogs.com/api/v2/user` with a real bearer token, for report `4GYHZRdtL3bvhpc8`:
   ```graphql
   query {
     reportData {
       report(code: "4GYHZRdtL3bvhpc8") {
         title
         fights {
           id
           name
           startTime
           endTime
           encounterID
           kill
           bossPercentage
         }
       }
     }
   }
   ```
2. Replace `test/integration/fixtures/report-fights.json` with the real response body.
3. Update the `toEqual` assertions on `result.fights[0]` / `result.fights[5]` in `test/integration/client.test.ts` to include the new fields with their real captured values.
4. ~~Check `bossPercentage`'s scale.~~ **Resolved.** The real capture confirmed `bossPercentage` is already a 0–100 float, not scaled (e.g. `0.01` on a near-flawless kill; a separate real wipe elsewhere in the same report — "High Astromancer Solarian", first pull — returned `100` at a fresh wipe). No display-logic change needed in `FightPicker`.
5. Run `npm test` to confirm everything still passes, then commit as `test(wcl-client): capture real encounterID/kill/bossPercentage fixture`.

**Done** (2026-07-10): steps 1–5 completed using the real `WCL_TEST_ACCESS_TOKEN` in `.env.local`. The fixture was trimmed to the same first 6 fights as the original (a real report has 72), since the original fixture was already a truncated slice of the same live report and the point was adding the new fields, not growing the fixture's size.
