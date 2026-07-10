# Druid Auto-Detection & Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect all resto druids in a loaded WCL report and let the user pick one, auto-selecting when there's only one (backlog story 005).

**Architecture:** A thin WCL-client fetcher (`fetchCastsTable`) pulls per-actor cast breakdowns for every fight in the report. A pure function (`detectDruids`) filters those to druid actors whose healing-spell cast count clears a small threshold, using WCL's own class/spec label only as a display/sort corroboration. Two components — one fetch-owning (`DruidDetector`), one presentational (`DruidPicker`) — mirror the existing `ConnectPanel`/`FightPicker` split and wire into `App.tsx` independently of fight selection.

**Tech Stack:** React 19 + TypeScript, Vitest + MSW (Tier 2), Vitest + React Testing Library (Tier 3).

## Global Constraints

- Spell/ability names are matched as strings from the WCL `table` response — no hardcoded numeric ability IDs (see `CLAUDE.md`).
- No backend, no secrets required at build time — this story only adds client-side fetch + pure logic + components.
- Design rationale and live-data validation live in `docs/specs/druid-detection-design.md` — read it if a task's "why" isn't obvious from this plan alone.
- Full static analysis (`npm run typecheck && npm run lint && npm run format:check`) must pass before every commit; the pre-commit hook enforces this already — don't bypass it.
- Every new source file is co-located with its test (`*.test.ts` / `*.test.tsx` next to the file under test), per `docs/testing.md`.

---

### Task 1: `fetchCastsTable` in the WCL client

**Files:**

- Modify: `src/wcl/client.ts`
- Test: `test/integration/client.test.ts`
- Fixture: `test/integration/fixtures/casts-table.json` (already captured live and committed to the repo working tree — real response for report `4GYHZRdtL3bvhpc8`, fight 6, trimmed to 5 actors: `Fanah` (Paladin, non-druid, for filter testing), `Dassz` (Druid, `Druid-Restoration`, real heal casts), `Maoqi` (Druid, `Druid-Balance`, no heal casts), `Nezzy` (Druid, `Druid-Feral`, no heal casts), `Barrychuckle` (Druid, mislabeled `Druid-Restoration`, but zero heal casts that fight — all Shred/Claw/Rip/Cat Form/Enrage))

**Interfaces:**

- Produces: `CastTableAbility { name: string; total: number }`, `CastTableEntry { id: number; name: string; type: string; icon: string; abilities: CastTableAbility[] }`, `fetchCastsTable(accessToken: string, reportCode: string, fightIds: number[]): Promise<CastTableEntry[]>`

- [ ] **Step 1: Write the failing integration test**

Add to `test/integration/client.test.ts`, alongside the existing `describe("fetchReportFights", ...)` block (same file, same `server`/`beforeAll`/`afterEach`/`afterAll` setup already in place):

```ts
import { fetchCastsTable } from "../../src/wcl/client";
import castsTableFixture from "./fixtures/casts-table.json";
```

(add these two imports at the top, next to the existing `fetchReportFights`/`reportFightsFixture` imports)

```ts
describe("fetchCastsTable", () => {
  it("parses actor cast breakdowns from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(castsTableFixture)),
    );
    const result = await fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6]);
    expect(result).toHaveLength(5);
    const dassz = result.find((e) => e.name === "Dassz");
    expect(dassz).toEqual({
      id: 2,
      name: "Dassz",
      type: "Druid",
      icon: "Druid-Restoration",
      abilities: [
        { name: "Lifebloom", total: 33 },
        { name: "Rejuvenation", total: 16 },
        { name: "Regrowth", total: 6 },
        { name: "Rejuvenation", total: 3 },
        { name: "Swiftmend", total: 2 },
      ],
    });
  });

  it("requests the table query with the given fight IDs", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(castsTableFixture);
      }),
    );

    await fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6, 9]);

    expect(requestBody?.query).toContain("dataType: Casts");
    expect(requestBody?.query).toContain("fightIDs: [6, 9]");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/integration/client.test.ts`
Expected: FAIL — `fetchCastsTable` is not exported from `src/wcl/client.ts`.

- [ ] **Step 3: Implement `fetchCastsTable`**

Add to `src/wcl/client.ts`, after the existing `fetchReportFights` function:

```ts
export interface CastTableAbility {
  name: string;
  total: number;
}

export interface CastTableEntry {
  id: number;
  name: string;
  type: string;
  icon: string;
  abilities: CastTableAbility[];
}

export async function fetchCastsTable(
  accessToken: string,
  reportCode: string,
  fightIds: number[],
): Promise<CastTableEntry[]> {
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
      table(fightIDs: [${fightIds.join(", ")}], dataType: Casts)
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report.table.data.entries;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/integration/client.test.ts`
Expected: PASS (all `fetchCastsTable` and pre-existing `fetchReportFights`/`exchangeCodeForToken` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/wcl/client.ts test/integration/client.test.ts test/integration/fixtures/casts-table.json
git commit -m "feat(wcl-client): fetch per-actor casts table for druid detection"
```

---

### Task 2: `aCastTableEntry` test factory

**Files:**

- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Consumes: `CastTableEntry`, `CastTableAbility` from `src/wcl/client.ts` (Task 1)
- Produces: `aCastTableEntry(overrides?: Partial<CastTableEntry>): CastTableEntry`

- [ ] **Step 1: Add the factory**

Add to `src/testUtils/factories.ts`, after the existing `aReportFights` function, importing the new types alongside the existing `Fight`/`ReportFights` import:

```ts
import type { Fight, ReportFights, CastTableEntry } from "../wcl/client";
```

(replace the existing `import type { Fight, ReportFights } from "../wcl/client";` line with the above)

```ts
export function aCastTableEntry(
  overrides: Partial<CastTableEntry> = {},
): CastTableEntry {
  return {
    id: 2,
    name: "Dassz",
    type: "Druid",
    icon: "Druid-Restoration",
    abilities: [
      { name: "Lifebloom", total: 33 },
      { name: "Rejuvenation", total: 16 },
      { name: "Regrowth", total: 6 },
      { name: "Swiftmend", total: 2 },
    ],
    ...overrides,
  };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/testUtils/factories.ts
git commit -m "test: add aCastTableEntry factory"
```

---

### Task 3: `detectDruids` pure detection logic

**Files:**

- Create: `src/report/druidDetection.ts`
- Test: `src/report/druidDetection.test.ts`

**Interfaces:**

- Consumes: `CastTableEntry` from `src/wcl/client.ts` (Task 1), `aCastTableEntry` from `src/testUtils/factories.ts` (Task 2)
- Produces: `HEALING_SPELL_NAMES: string[]`, `MIN_HEALING_CASTS_FOR_DETECTION: number`, `DruidCandidate { id: number; name: string; healingCastCount: number; isRestoSpec: boolean }`, `detectDruids(entries: CastTableEntry[]): DruidCandidate[]`

- [ ] **Step 1: Write the failing tests**

Create `src/report/druidDetection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  detectDruids,
  MIN_HEALING_CASTS_FOR_DETECTION,
} from "./druidDetection";
import { aCastTableEntry } from "../testUtils/factories";

describe("detectDruids", () => {
  it("includes a druid with healing casts above the threshold", () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const result = detectDruids([dassz]);
    expect(result).toEqual([
      { id: 2, name: "Dassz", healingCastCount: 57, isRestoSpec: true },
    ]);
  });

  it("excludes non-druid actors regardless of casts", () => {
    const paladin = aCastTableEntry({
      id: 42,
      name: "Fanah",
      type: "Paladin",
      icon: "Paladin-Holy",
      abilities: [{ name: "Holy Light", total: 100 }],
    });
    expect(detectDruids([paladin])).toEqual([]);
  });

  it("excludes a druid labeled Restoration with zero healing casts", () => {
    const mislabeled = aCastTableEntry({
      id: 19,
      name: "Barrychuckle",
      icon: "Druid-Restoration",
      abilities: [
        { name: "Shred", total: 11 },
        { name: "Claw", total: 9 },
        { name: "Rip", total: 4 },
      ],
    });
    expect(detectDruids([mislabeled])).toEqual([]);
  });

  it("includes a druid with an ambiguous spec label but real healing casts", () => {
    const ambiguous = aCastTableEntry({
      id: 4,
      name: "Maoqi",
      icon: "Druid",
      abilities: [
        { name: "Starfire", total: 300 },
        { name: "Lifebloom", total: 40 },
      ],
    });
    expect(detectDruids([ambiguous])).toEqual([
      { id: 4, name: "Maoqi", healingCastCount: 40, isRestoSpec: false },
    ]);
  });

  it(`excludes a druid with fewer than ${MIN_HEALING_CASTS_FOR_DETECTION} healing casts`, () => {
    const stray = aCastTableEntry({
      id: 7,
      name: "Coggersblast",
      icon: "Druid",
      abilities: [
        { name: "Starfire", total: 200 },
        { name: "Healing Touch", total: MIN_HEALING_CASTS_FOR_DETECTION - 1 },
      ],
    });
    expect(detectDruids([stray])).toEqual([]);
  });

  it(`includes a druid with exactly ${MIN_HEALING_CASTS_FOR_DETECTION} healing casts`, () => {
    const borderline = aCastTableEntry({
      id: 8,
      name: "Zeyam",
      icon: "Druid",
      abilities: [
        { name: "Rejuvenation", total: MIN_HEALING_CASTS_FOR_DETECTION },
      ],
    });
    expect(detectDruids([borderline])).toHaveLength(1);
  });

  it("sorts Restoration-labeled candidates before others, then by healing cast count", () => {
    const ambiguousHighCasts = aCastTableEntry({
      id: 4,
      name: "Maoqi",
      icon: "Druid",
      abilities: [{ name: "Lifebloom", total: 500 }],
    });
    const restoLowCasts = aCastTableEntry({
      id: 2,
      name: "Dassz",
      icon: "Druid-Restoration",
      abilities: [{ name: "Lifebloom", total: 10 }],
    });
    const result = detectDruids([ambiguousHighCasts, restoLowCasts]);
    expect(result.map((c) => c.name)).toEqual(["Dassz", "Maoqi"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/report/druidDetection.test.ts`
Expected: FAIL — `src/report/druidDetection.ts` does not exist.

- [ ] **Step 3: Implement `detectDruids`**

Create `src/report/druidDetection.ts`:

```ts
import type { CastTableEntry } from "../wcl/client";

export const HEALING_SPELL_NAMES = [
  "Rejuvenation",
  "Regrowth",
  "Lifebloom",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
];

// A stray opportunistic cross-heal from an off-spec druid is 1-2 casts; a real
// healer casts in the hundreds even in a single fight. Validated live against
// 7 real reports (see docs/specs/druid-detection-design.md) — every genuine
// resto druid cleared this by two orders of magnitude, every non-healer sat
// at exactly 0.
export const MIN_HEALING_CASTS_FOR_DETECTION = 3;

export interface DruidCandidate {
  id: number;
  name: string;
  healingCastCount: number;
  isRestoSpec: boolean;
}

export function detectDruids(entries: CastTableEntry[]): DruidCandidate[] {
  return entries
    .filter((entry) => entry.type === "Druid")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      healingCastCount: entry.abilities
        .filter((ability) => HEALING_SPELL_NAMES.includes(ability.name))
        .reduce((sum, ability) => sum + ability.total, 0),
      isRestoSpec: entry.icon === "Druid-Restoration",
    }))
    .filter(
      (candidate) =>
        candidate.healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
    )
    .sort((a, b) => {
      if (a.isRestoSpec !== b.isRestoSpec) return a.isRestoSpec ? -1 : 1;
      return b.healingCastCount - a.healingCastCount;
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/report/druidDetection.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/report/druidDetection.ts src/report/druidDetection.test.ts
git commit -m "feat(druid-detection): detect resto druids by healing cast count"
```

---

### Task 4: `DruidPicker` presentational component

**Files:**

- Create: `src/app/components/DruidPicker/index.tsx`
- Test: `src/app/components/DruidPicker/index.test.tsx`

**Interfaces:**

- Consumes: `DruidCandidate` from `src/report/druidDetection.ts` (Task 3)
- Produces: `DruidPicker({ candidates: DruidCandidate[]; onSelect: (druidId: number) => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/DruidPicker/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DruidPicker } from "./index";
import type { DruidCandidate } from "../../../report/druidDetection";

const dassz: DruidCandidate = {
  id: 2,
  name: "Dassz",
  healingCastCount: 1652,
  isRestoSpec: true,
};
const maoqi: DruidCandidate = {
  id: 4,
  name: "Maoqi",
  healingCastCount: 40,
  isRestoSpec: false,
};

describe("DruidPicker", () => {
  it("shows an informational message when there are no candidates", () => {
    render(<DruidPicker candidates={[]} onSelect={vi.fn()} />);
    expect(
      screen.getByText("No resto druids detected in this report."),
    ).toBeInTheDocument();
  });

  it("auto-selects the sole candidate without rendering a picker", () => {
    const onSelect = vi.fn();
    render(<DruidPicker candidates={[dassz]} onSelect={onSelect} />);
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("renders a radio option per candidate when there are multiple", () => {
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/Dassz/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Maoqi/)).toBeInTheDocument();
  });

  it("shows a Restoration badge only for candidates WCL labeled as such", () => {
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/Dassz/)).toHaveAccessibleName(/Restoration/);
    expect(screen.getByLabelText(/Maoqi/)).not.toHaveAccessibleName(
      /Restoration/,
    );
  });

  it("calls onSelect with the chosen druid's id when a radio option is picked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={onSelect} />);
    await user.click(screen.getByLabelText(/Maoqi/));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/components/DruidPicker/index.test.tsx`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 3: Implement `DruidPicker`**

Create `src/app/components/DruidPicker/index.tsx`:

```tsx
import { useEffect } from "react";
import type { DruidCandidate } from "../../../report/druidDetection";

export interface DruidPickerProps {
  candidates: DruidCandidate[];
  onSelect: (druidId: number) => void;
}

export function DruidPicker({ candidates, onSelect }: DruidPickerProps) {
  const soleCandidateId = candidates.length === 1 ? candidates[0].id : null;

  useEffect(() => {
    if (soleCandidateId !== null) onSelect(soleCandidateId);
  }, [soleCandidateId, onSelect]);

  if (candidates.length === 0) {
    return <p>No resto druids detected in this report.</p>;
  }

  if (candidates.length === 1) {
    return null;
  }

  return (
    <ul>
      {candidates.map((candidate) => {
        const label = candidate.isRestoSpec
          ? `${candidate.name} — Restoration (${candidate.healingCastCount} heal casts)`
          : `${candidate.name} (${candidate.healingCastCount} heal casts)`;
        return (
          <li key={candidate.id}>
            <label>
              <input
                type="radio"
                name="druid"
                onChange={() => onSelect(candidate.id)}
              />
              {label}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/app/components/DruidPicker/index.test.tsx`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DruidPicker/index.tsx src/app/components/DruidPicker/index.test.tsx
git commit -m "feat(druid-picker): render candidate picker with single-druid auto-select"
```

---

### Task 5: `DruidDetector` fetch-owning component

**Files:**

- Create: `src/app/components/DruidDetector/index.tsx`
- Test: `src/app/components/DruidDetector/index.test.tsx`

**Interfaces:**

- Consumes: `CastTableEntry`, `fetchCastsTable` type shape from `src/wcl/client.ts` (Task 1); `DruidCandidate`, `detectDruids` from `src/report/druidDetection.ts` (Task 3); `aCastTableEntry` from `src/testUtils/factories.ts` (Task 2)
- Produces: `DruidDetector({ accessToken: string; reportCode: string; fightIds: number[]; fetchCastsTable: (accessToken: string, reportCode: string, fightIds: number[]) => Promise<CastTableEntry[]>; onDruidsDetected: (candidates: DruidCandidate[]) => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/DruidDetector/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DruidDetector } from "./index";
import { aCastTableEntry } from "../../../testUtils/factories";

describe("DruidDetector", () => {
  it("fetches casts and reports detected druids once loaded", async () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const fetchCastsTable = () => Promise.resolve([dassz]);
    const onDruidsDetected = vi.fn();
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={onDruidsDetected}
      />,
    );
    await waitFor(() =>
      expect(onDruidsDetected).toHaveBeenCalledWith([
        { id: 2, name: "Dassz", healingCastCount: 57, isRestoSpec: true },
      ]),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fetchCastsTable = () => new Promise<never>(() => {});
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
      />,
    );
    expect(screen.getByText("Detecting druids…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchCastsTable = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/components/DruidDetector/index.test.tsx`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 3: Implement `DruidDetector`**

Create `src/app/components/DruidDetector/index.tsx` (mirrors `src/app/components/ConnectPanel/index.tsx`'s fetch/loading/error pattern):

```tsx
import { useEffect, useState } from "react";
import type { CastTableEntry } from "../../../wcl/client";
import {
  detectDruids,
  type DruidCandidate,
} from "../../../report/druidDetection";

export interface DruidDetectorProps {
  accessToken: string;
  reportCode: string;
  fightIds: number[];
  fetchCastsTable: (
    accessToken: string,
    reportCode: string,
    fightIds: number[],
  ) => Promise<CastTableEntry[]>;
  onDruidsDetected: (candidates: DruidCandidate[]) => void;
}

type FetchResult =
  | { accessToken: string; candidates: DruidCandidate[] }
  | { accessToken: string; error: string };

export function DruidDetector({
  accessToken,
  reportCode,
  fightIds,
  fetchCastsTable,
  onDruidsDetected,
}: DruidDetectorProps) {
  // Derive a primitive key from the fightIds array so the effect doesn't
  // re-fire on every parent render just because App.tsx passes a fresh
  // array reference (loadedReport.fights.map(...) creates a new array each
  // render). Reconstructing the array from this key inside the effect keeps
  // react-hooks/exhaustive-deps satisfied without a stale, unstable `fightIds`
  // dependency.
  const fightIdsKey = fightIds.join(",");
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const ids = fightIdsKey === "" ? [] : fightIdsKey.split(",").map(Number);
    fetchCastsTable(accessToken, reportCode, ids)
      .then((entries) => {
        const candidates = detectDruids(entries);
        setResult({ accessToken, candidates });
        onDruidsDetected(candidates);
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error ? err.message : "Failed to detect druids.",
        }),
      );
  }, [accessToken, reportCode, fightIdsKey, fetchCastsTable, onDruidsDetected]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Detecting druids…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/app/components/DruidDetector/index.test.tsx`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Run full lint to confirm no hook-dependency warnings**

Run: `npm run lint`
Expected: PASS, no warnings on `src/app/components/DruidDetector/index.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/DruidDetector/index.tsx src/app/components/DruidDetector/index.test.tsx
git commit -m "feat(druid-detector): fetch casts table and detect druids for a report"
```

---

### Task 6: Wire `DruidDetector` and `DruidPicker` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `DruidDetector` (Task 5), `DruidPicker` (Task 4), `DruidCandidate` and `fetchCastsTable` (Tasks 1/3)

- [ ] **Step 1: Update `src/App.tsx`**

Replace the full contents of `src/App.tsx`:

```tsx
import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  type ReportFights,
} from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import type { DruidCandidate } from "./report/druidDetection";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [, setSelectedFightIds] = useState<number[]>([]);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [, setSelectedDruidId] = useState<number | null>(null);

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
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
          onSelectionChange={setSelectedFightIds}
        />
      )}
      {accessToken && loadedReport && report && (
        <DruidDetector
          accessToken={accessToken}
          reportCode={report.reportCode}
          fightIds={loadedReport.fights.map((f) => f.id)}
          fetchCastsTable={fetchCastsTable}
          onDruidsDetected={setDruidCandidates}
        />
      )}
      {druidCandidates !== null && (
        <DruidPicker
          candidates={druidCandidates}
          onSelect={setSelectedDruidId}
        />
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites green (existing `App` has no dedicated test file to update — it's exercised via the E2E smoke test).

- [ ] **Step 4: Manually verify in the dev server**

Run: `npm run dev`, open the printed local URL, connect with a WCL client ID, paste report `4GYHZRdtL3bvhpc8`. Confirm: the fight picker and a "Detecting druids…" message both appear once the report loads; after the fetch resolves, since this report has exactly one resto druid (Dassz), no picker UI should render (auto-selected silently). This confirms the wiring end-to-end against the real API — stop the dev server after checking (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire druid detection and selection into the report flow"
```

---

### Task 7: Close out story 005 in the backlog

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/druid-detection-design.md`
- Delete: `docs/plans/druid-detection-plan.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Grep for references to the spec/plan files before deleting**

Run: `grep -rn "druid-detection-design\|druid-detection-plan" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only matches inside the two files themselves (and this plan file). If anything else references them, update those references first.

- [ ] **Step 2: Mark story 005 done in `docs/backlog.md`**

In `docs/backlog.md`, change the heading:

```markdown
### 005 — Druid auto-detection & selection
```

to:

```markdown
### 005 — Druid auto-detection & selection ✅ Done
```

Also update the "Repo state" section of `CLAUDE.md` (not `docs/backlog.md`) — replace:

```markdown
Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), and story 004 (zone-wide selection) are complete and live. Phase 1 MVP work continues with backlog story 005 (druid auto-detection & selection) next.
```

with:

```markdown
Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), and story 005 (druid auto-detection & selection) are complete and live. Phase 1 MVP work continues with backlog story 006 (event fetching & caching layer) next.
```

- [ ] **Step 3: Delete the spec and plan files**

```bash
rm docs/specs/druid-detection-design.md docs/plans/druid-detection-plan.md
```

- [ ] **Step 4: Verify static analysis still passes**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md CLAUDE.md docs/specs/druid-detection-design.md docs/plans/druid-detection-plan.md
git commit -m "docs: mark story 005 done, delete its spec/plan, point at story 006"
```

(the two `rm`'d files will be staged as deletions by `git add`)

---

## Self-review notes

- **Spec coverage:** WCL client fetch (Task 1), pure detection + threshold rationale (Task 3), presentational picker with auto-select/empty/multi states (Task 4), fetch-owning detector with loading/error states (Task 5), report-wide wiring independent of fight selection (Task 6), paperwork retirement (Task 7) — all design-doc sections have a task.
- **Type consistency:** `CastTableEntry`/`CastTableAbility` (Task 1) → consumed identically in `aCastTableEntry` (Task 2), `detectDruids` (Task 3), and both components (Tasks 4-5). `DruidCandidate` (Task 3) → consumed identically in `DruidPicker` (Task 4), `DruidDetector` (Task 5), and `App.tsx` (Task 6). `fetchCastsTable`'s signature (Task 1) matches `DruidDetector`'s `fetchCastsTable` prop type (Task 5) and its real usage in `App.tsx` (Task 6).
