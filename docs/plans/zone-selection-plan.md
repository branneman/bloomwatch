# Zone-Wide Selection (Story 004) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let the user select a whole raid zone (e.g. "SSC — all bosses") in one click, so a single aggregated scorecard can eventually be built across all of that zone's boss pulls, while individual fights can still be added to or removed from the selection.

**Architecture:** Add `gameZone` to the WCL client's `Fight` type/query; add a pure `groupFightsByZone` module function for deriving per-zone boss-fight-ID lists; convert `FightPicker` from single-select (button + `aria-current`) to multi-select (checkboxes) with a row of zone buttons that replace the current selection with a zone's boss fights; rewire `App.tsx` to hold `selectedFightIds: number[]` instead of a single ID.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library + `@testing-library/user-event`, MSW for Tier 2, Playwright for Tier 5.

## Global Constraints

- Commits follow Conventional Commits (`type(scope): summary`); scope `wcl-client`, `report`, or `fight-picker` depending on the file touched (see `CLAUDE.md`).
- Every commit must pass the full-project pre-commit hook (`npm run typecheck && npm run lint && npm run format:check`) — never bypass it. This hook does **not** run the test suite, so run `npm test` manually at the point each task step says to.
- No hardcoded spell/ability IDs are involved in this story; not applicable here.
- No secrets required for the app's own build/deploy path (principle 2) — this story doesn't touch auth.
- Tier 1 tests are co-located `*.test.ts`; Tier 3 tests are co-located `*.test.tsx`; Tier 2 fixtures must be real captured WCL API payloads, never hand-built (`docs/testing.md`).
- Full design detail lives in `docs/specs/zone-selection-design.md` — this plan implements it task-by-task.
- When the story is marked done in `docs/backlog.md`, its spec (`docs/specs/zone-selection-design.md`) and this plan must be deleted in the same commit (`CLAUDE.md` engineering rule) — that's Task 6.

---

### Task 1: Add `gameZone` to the WCL client's `Fight` type and query

**Files:**

- Modify: `src/wcl/client.ts`
- Modify: `src/testUtils/factories.ts`
- Modify: `test/integration/fixtures/report-fights.json`
- Modify: `test/integration/client.test.ts`

**Interfaces:**

- Produces: `Fight.gameZone: { id: number; name: string } | null` — every later task (`groupFightsByZone`, `FightPicker`, `aFight()`) reads this field.

- [ ] **Step 1: Write the failing tests**

Replace the two fixture-shape assertions and the query-shape assertion in `test/integration/client.test.ts`:

```ts
expect(result.fights[0]).toEqual({
  id: 1,
  name: "Unknown",
  startTime: 760292,
  endTime: 760292,
  encounterID: 0,
  kill: null,
  bossPercentage: null,
  gameZone: { id: 548, name: "Serpentshrine Cavern" },
});
expect(result.fights[5]).toEqual({
  id: 6,
  name: "The Lurker Below",
  startTime: 1879119,
  endTime: 2036920,
  encounterID: 100624,
  kill: true,
  bossPercentage: 0.01,
  gameZone: { id: 548, name: "Serpentshrine Cavern" },
});
```

```ts
it("requests encounterID, kill, bossPercentage, and gameZone for each fight", async () => {
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
  expect(requestBody?.query).toContain("gameZone");
});
```

Update `test/integration/fixtures/report-fights.json` to the real captured shape (confirmed live against report `4GYHZRdtL3bvhpc8` during design — all 6 fights are Serpentshrine Cavern, zone id 548):

```json
{
  "data": {
    "reportData": {
      "report": {
        "title": "SSC+TK 2026-07-07",
        "fights": [
          {
            "id": 1,
            "name": "Unknown",
            "startTime": 760292,
            "endTime": 760292,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          },
          {
            "id": 2,
            "name": "Unknown",
            "startTime": 810565,
            "endTime": 810565,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          },
          {
            "id": 3,
            "name": "Coilfang Frenzy",
            "startTime": 1477307,
            "endTime": 1505939,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          },
          {
            "id": 4,
            "name": "Coilfang Frenzy",
            "startTime": 1754018,
            "endTime": 1763039,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          },
          {
            "id": 5,
            "name": "Unknown",
            "startTime": 1816244,
            "endTime": 1818260,
            "encounterID": 0,
            "kill": null,
            "bossPercentage": null,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          },
          {
            "id": 6,
            "name": "The Lurker Below",
            "startTime": 1879119,
            "endTime": 2036920,
            "encounterID": 100624,
            "kill": true,
            "bossPercentage": 0.01,
            "gameZone": { "id": 548, "name": "Serpentshrine Cavern" }
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- client.test.ts`
Expected: FAIL — actual fixture/result has no `gameZone` key yet, and the query doesn't request it.

- [ ] **Step 3: Write minimal implementation**

In `src/wcl/client.ts`, update the `Fight` interface and the query string:

```ts
export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID: number;
  kill: boolean | null;
  bossPercentage: number | null;
  gameZone: { id: number; name: string } | null;
}
```

```ts
      fights { id name startTime endTime encounterID kill bossPercentage gameZone { id name } }
```

In `src/testUtils/factories.ts`, add a default `gameZone` to `aFight()`:

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
    gameZone: { id: 548, name: "Serpentshrine Cavern" },
    ...overrides,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass. (`FightPicker` and `fightRows` tests still reference the old `Fight` shape only through `aFight()`, which is backward compatible since `gameZone` just has a default now — no other test file should break.)

- [ ] **Step 6: Commit**

```bash
git add src/wcl/client.ts src/testUtils/factories.ts test/integration/fixtures/report-fights.json test/integration/client.test.ts
git commit -m "feat(wcl-client): fetch and parse each fight's gameZone"
```

---

### Task 2: Add `groupFightsByZone` to `fightRows.ts`

**Files:**

- Modify: `src/report/fightRows.ts`
- Test: `src/report/fightRows.test.ts`

**Interfaces:**

- Consumes: `Fight.gameZone` (Task 1), `Fight.encounterID`.
- Produces: `ZoneGroup { zoneId: number; zoneName: string; fightIds: number[] }` and `groupFightsByZone(fights: Fight[]): ZoneGroup[]` — consumed by `FightPicker` in Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `src/report/fightRows.test.ts`:

```ts
describe("groupFightsByZone", () => {
  it("groups boss fights by zone in first-seen order", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 500,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
      aFight({
        id: 2,
        encounterID: 600,
        gameZone: { id: 550, name: "The Eye" },
      }),
      aFight({
        id: 3,
        encounterID: 501,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
    ];
    expect(groupFightsByZone(fights)).toEqual([
      { zoneId: 548, zoneName: "Serpentshrine Cavern", fightIds: [1, 3] },
      { zoneId: 550, zoneName: "The Eye", fightIds: [2] },
    ]);
  });

  it("excludes trash fights from every zone's fightIds", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 0,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
      aFight({
        id: 2,
        encounterID: 500,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
    ];
    expect(groupFightsByZone(fights)).toEqual([
      { zoneId: 548, zoneName: "Serpentshrine Cavern", fightIds: [2] },
    ]);
  });

  it("excludes fights with no gameZone", () => {
    const fights = [aFight({ id: 1, encounterID: 500, gameZone: null })];
    expect(groupFightsByZone(fights)).toEqual([]);
  });

  it("returns an empty array for an all-trash report", () => {
    const fights = [aFight({ id: 1, encounterID: 0 })];
    expect(groupFightsByZone(fights)).toEqual([]);
  });
});
```

Add the `groupFightsByZone` import to the top of the test file:

```ts
import { buildFightRows, formatDuration, groupFightsByZone } from "./fightRows";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- fightRows.test.ts`
Expected: FAIL with "groupFightsByZone is not defined" (or a TypeScript error on the missing export).

- [ ] **Step 3: Write minimal implementation**

Append to `src/report/fightRows.ts`:

```ts
export interface ZoneGroup {
  zoneId: number;
  zoneName: string;
  fightIds: number[];
}

export function groupFightsByZone(fights: Fight[]): ZoneGroup[] {
  const groups: ZoneGroup[] = [];
  const indexByZoneId = new Map<number, number>();

  for (const fight of fights) {
    if (fight.encounterID === 0 || fight.gameZone === null) continue;
    const { id: zoneId, name: zoneName } = fight.gameZone;
    const existingIndex = indexByZoneId.get(zoneId);
    if (existingIndex === undefined) {
      indexByZoneId.set(zoneId, groups.length);
      groups.push({ zoneId, zoneName, fightIds: [fight.id] });
    } else {
      groups[existingIndex].fightIds.push(fight.id);
    }
  }

  return groups;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- fightRows.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/report/fightRows.ts src/report/fightRows.test.ts
git commit -m "feat(report): add groupFightsByZone for zone-wide selection"
```

---

### Task 3: Convert `FightPicker` to multi-select with zone buttons

**Files:**

- Modify: `src/app/components/FightPicker/index.tsx`
- Modify: `src/app/components/FightPicker/index.test.tsx`

**Interfaces:**

- Consumes: `groupFightsByZone` (Task 2), `buildFightRows`/`formatDuration` (existing).
- Produces: `FightPickerProps { fights: Fight[]; initialFightId: number | null; onSelectionChange: (fightIds: number[]) => void }` — consumed by `App.tsx` in Task 4. Replaces the old `onSelectFight: (fightId: number) => void` prop entirely (no callers left after Task 4, so no back-compat shim).

- [ ] **Step 1: Write the failing tests**

Replace `src/app/components/FightPicker/index.test.tsx` in full:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FightPicker } from "./index";
import { aFight } from "../../../testUtils/factories";

const sscZone = { id: 548, name: "Serpentshrine Cavern" };
const tkZone = { id: 550, name: "The Eye" };

const trash = aFight({
  id: 1,
  name: "Trash",
  encounterID: 0,
  kill: null,
  bossPercentage: null,
  startTime: 0,
  endTime: 5000,
  gameZone: sscZone,
});
const bossKill = aFight({
  id: 2,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 90000,
  gameZone: sscZone,
});
const bossWipe = aFight({
  id: 3,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: false,
  bossPercentage: 34.2,
  startTime: 0,
  endTime: 60000,
  gameZone: sscZone,
});
const tkBoss = aFight({
  id: 4,
  name: "Al'ar",
  encounterID: 600,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 120000,
  gameZone: tkZone,
});

describe("FightPicker", () => {
  it("hides trash fights by default", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Trash/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pull 1 — Coilfang Frenzy/)).toBeInTheDocument();
  });

  it("reveals trash fights when the toggle is checked", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(screen.getByText(/Trash/)).toBeInTheDocument();
  });

  it("shows kill and wipe status distinctly, with boss HP% on a wipe", () => {
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText(/Pull 1 — Coilfang Frenzy/),
    ).toHaveAccessibleName(/Kill/);
    expect(
      screen.getByLabelText(/Pull 2 — Coilfang Frenzy/),
    ).toHaveAccessibleName(/Wipe \(34%\)/);
  });

  it("toggling a fight's checkbox calls onSelectionChange with just that fight", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([3]);
    expect(screen.getByLabelText(/Wipe/)).toBeChecked();

    await user.click(screen.getByLabelText(/Kill/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);
  });

  it("unchecking a fight removes just that fight from the selection", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={2}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);

    await user.click(screen.getByLabelText(/Kill/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([3]);
  });

  it("pre-selects a boss fight from initialFightId without enabling the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={2}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).not.toBeChecked();
    expect(screen.getByLabelText(/Coilfang Frenzy/)).toBeChecked();
  });

  it("pre-selects a trash fight from initialFightId and auto-enables the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={1}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
    expect(screen.getByLabelText(/Trash/)).toBeChecked();
  });

  it("renders one button per zone present among boss fights, with boss counts", () => {
    render(
      <FightPicker
        fights={[trash, bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "The Eye (1)" }),
    ).toBeInTheDocument();
  });

  it("clicking a zone button selects exactly that zone's boss fights", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);
    expect(screen.getByLabelText(/Kill/)).toBeChecked();
    expect(screen.getByLabelText(/Wipe/)).toBeChecked();
    expect(screen.getByLabelText(/Al'ar/)).not.toBeChecked();
  });

  it("replaces a prior zone selection when a different zone button is clicked", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "The Eye (1)" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([4]);
    expect(screen.getByLabelText(/Kill/)).not.toBeChecked();
    expect(screen.getByLabelText(/Wipe/)).not.toBeChecked();
    expect(screen.getByLabelText(/Al'ar/)).toBeChecked();
  });

  it("keeps the rest of a zone selection after unchecking one of its fights", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2]);
    expect(screen.getByLabelText(/Kill/)).toBeChecked();
  });

  it("never counts trash fights in a zone button, even when shown", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(
      screen.getByRole("button", { name: "Serpentshrine Cavern (1)" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- FightPicker`
Expected: FAIL — `onSelectionChange` prop doesn't exist yet, rows are still buttons (not checkboxes), no zone buttons render.

- [ ] **Step 3: Write minimal implementation**

Replace `src/app/components/FightPicker/index.tsx` in full:

```tsx
import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import {
  buildFightRows,
  formatDuration,
  groupFightsByZone,
} from "../../../report/fightRows";

export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectionChange: (fightIds: number[]) => void;
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
  onSelectionChange,
}: FightPickerProps) {
  const [showTrash, setShowTrash] = useState(() =>
    isInitialFightTrash(fights, initialFightId),
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(initialFightId === null ? [] : [initialFightId]),
  );

  const rows = buildFightRows(fights).filter(
    (row) => !row.isTrash || showTrash,
  );
  const zones = groupFightsByZone(fights);

  function commitSelection(next: Set<number>) {
    setSelectedIds(next);
    onSelectionChange(fights.map((f) => f.id).filter((id) => next.has(id)));
  }

  function toggleFight(fightId: number) {
    const next = new Set(selectedIds);
    if (next.has(fightId)) {
      next.delete(fightId);
    } else {
      next.add(fightId);
    }
    commitSelection(next);
  }

  function selectZone(fightIds: number[]) {
    commitSelection(new Set(fightIds));
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
      {zones.length > 0 && (
        <ul>
          {zones.map((zone) => (
            <li key={zone.zoneId}>
              <button type="button" onClick={() => selectZone(zone.fightIds)}>
                {zone.zoneName} ({zone.fightIds.length})
              </button>
            </li>
          ))}
        </ul>
      )}
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
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.has(fight.id)}
                  onChange={() => toggleFight(fight.id)}
                />
                {text}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- FightPicker`
Expected: PASS

- [ ] **Step 5: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: FAIL on `src/App.tsx` (still uses the old `onSelectFight` prop) — that's expected here; Task 4 fixes it. Confirm the failure is isolated to `App.tsx`/its usage of `FightPicker`, not `FightPicker`'s own test file.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/FightPicker/index.tsx src/app/components/FightPicker/index.test.tsx
git commit -m "feat(fight-picker): multi-select fights with per-zone bulk selection"
```

---

### Task 4: Wire `App.tsx` to the multi-select `FightPicker`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `FightPickerProps` (Task 3).

- [ ] **Step 1: Update the component**

In `src/App.tsx`, replace the selection state and prop wiring:

```tsx
const [selectedFightIds, setSelectedFightIds] = useState<number[]>([]);

function handleReportSubmit(parsed: ParsedReport) {
  setReport(parsed);
  setLoadedReport(null);
  setSelectedFightIds([]);
}
```

```tsx
{
  loadedReport && (
    <FightPicker
      fights={loadedReport.fights}
      initialFightId={report?.fightId ?? null}
      onSelectionChange={setSelectedFightIds}
    />
  );
}
```

There is no `App.test.tsx` in the repo (confirmed by listing `src/`), so no test file needs updating for this task — the change is exercised by `FightPicker`'s own tests (Task 3) plus the Tier 5 smoke test (Task 5).

- [ ] **Step 2: Run full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass — no leftover reference to `selectedFightId`/`onSelectFight`/`setSelectedFightId` anywhere (`grep -rn "onSelectFight\|selectedFightId" src` should return nothing).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(fight-picker): wire App to multi-select fight IDs"
```

---

### Task 5: Update the Tier 5 smoke test for checkbox selection

**Files:**

- Modify: `test/e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: `FightPicker`'s rendered markup (Task 3) — a checkbox per fight row, accessible name `Pull N — <fight name>[ — Kill|Wipe (%)][ — m:ss]`.

- [ ] **Step 1: Replace the fight-selection assertion**

Replace the final block of `test/e2e/smoke.spec.ts` (from `const firstBossFight = ...` to the end of the test):

```ts
const firstBossFight = page
  .getByRole("checkbox", {
    name: /^Pull \d+/,
  })
  .first();
await expect(firstBossFight).toBeVisible();
await firstBossFight.click();
await expect(firstBossFight).toBeChecked();
```

- [ ] **Step 2: Run the smoke test locally**

Run: `npm run test:e2e`
Expected: PASS (requires `WCL_TEST_ACCESS_TOKEN` in `.env.local`, per `docs/testing.md`; the test auto-skips otherwise — confirm it actually ran, not skipped, by checking the reporter output names the test rather than "skipped").

- [ ] **Step 3: Commit**

```bash
git add test/e2e/smoke.spec.ts
git commit -m "test(e2e): assert fight selection via checkbox, not aria-current button"
```

---

### Task 6: Mark story 004 done and retire the spec/plan

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/zone-selection-design.md`
- Delete: `docs/plans/zone-selection-plan.md`

- [ ] **Step 1: Mark the story done**

In `docs/backlog.md`, change the story 004 heading:

```diff
-### 004 — Zone-wide selection
+### 004 — Zone-wide selection ✅ Done
```

- [ ] **Step 2: Update the repo-state note**

In `CLAUDE.md`, update the `## Repo state` section's final sentence:

```diff
-Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), and story 003 (fight list & selection) are complete and live. Phase 1 MVP work continues with backlog story 004 (zone-wide selection) next.
+Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), and story 004 (zone-wide selection) are complete and live. Phase 1 MVP work continues with backlog story 005 (druid auto-detection & selection) next.
```

- [ ] **Step 3: Delete the spec and plan**

```bash
git rm docs/specs/zone-selection-design.md docs/plans/zone-selection-plan.md
```

Before deleting, confirm nothing else references these paths:

```bash
grep -rn "zone-selection-design\|zone-selection-plan" --include="*.md" --include="*.ts" --include="*.tsx" .
```

Expected: no output (besides the files themselves, already removed from the search by `git rm`).

- [ ] **Step 4: Run full test suite and static analysis one last time**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 004 done, delete its spec/plan, point at story 005"
```

Note: this is one logical change (backlog + CLAUDE.md + two deletions) but `git rm` in Step 3 already staged the deletions — `git add` here only needs the two modified docs; the commit picks up everything staged.

---

## Final Step: Push

After Task 6's commit, push the branch (per the user's request to batch all of story 004's commits into a single push, minimizing CI runs):

```bash
git push
```
