# Whole-report dashboard (702) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fight-picker → confirm → druid-picker → stacked-scorecards flow with `docs/design_v3`'s connect → load report → pick druid → whole-report dashboard flow, folding story 003 (fight picker) into the new dashboard's own per-boss list instead of keeping it as a separate screen.

**Architecture:** A new `ReportDashboard` component owns a per-boss list (built from cheap fight metadata, always clickable) and an epic-level chip strip, both filled in progressively as a new `useFightEpicSummaries` hook (wrapping the six existing per-epic summary hooks) resolves per fight. Clicking a row reuses the existing `Scorecard` component unmodified for the inline drill-down. `App.tsx` drops its fight-selection state entirely; `FightPicker` and its dead zone-grouping helper are deleted.

**Tech Stack:** React + TypeScript (Vite), Vitest + React Testing Library, existing WCL client/event-cache layer — no new dependencies.

## Global Constraints

- Full-project `npm run typecheck && npm run lint && npm run format:check` must pass before every commit (pre-commit hook enforces this already — don't bypass it).
- Conventional Commits: `type(scope): summary` — use `feat(dashboard)` / `refactor(scorecard)` / `test` / `docs` as appropriate per task.
- No spell/ability IDs are introduced in this plan — nothing here touches ability resolution.
- Every new pure function/hook gets a Tier 1 test; every new/changed component gets a Tier 3 test, per `docs/testing.md`.
- Reference doc for the full rationale: `docs/specs/702-whole-report-dashboard-design.md` (this plan implements it, with one simplification found during planning — see Task 4's note on reusing `Scorecard` unmodified instead of extracting a renamed `ScorecardContent`).

---

### Task 1: Cross-fight judgement aggregation helpers

**Files:**

- Create: `src/metrics/reportAggregation.ts`
- Test: `src/metrics/reportAggregation.test.ts`

**Interfaces:**

- Consumes: `EpicSummaryStatus` (`src/app/components/Scorecard/epicSummaryStatus.ts`), `Judgement`/`worstJudgement` (`src/metrics/judgement.ts`) — both already exist, unchanged.
- Produces: `OverallJudgementStatus` type, `combineFightEpicStatus(statuses: EpicSummaryStatus[]): OverallJudgementStatus`, `worstReadyJudgement(statuses: EpicSummaryStatus[]): Judgement | null` — consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/metrics/reportAggregation.test.ts
import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  worstReadyJudgement,
} from "./reportAggregation";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

const loading: EpicSummaryStatus = { status: "loading" };
const green: EpicSummaryStatus = {
  status: "ready",
  judgement: "green",
  stats: [],
};
const orange: EpicSummaryStatus = {
  status: "ready",
  judgement: "orange",
  stats: [],
};
const red: EpicSummaryStatus = { status: "ready", judgement: "red", stats: [] };
const errored: EpicSummaryStatus = { status: "error", error: "boom" };

describe("combineFightEpicStatus", () => {
  it("stays loading until every epic has resolved", () => {
    expect(combineFightEpicStatus([green, loading, red])).toEqual({
      status: "loading",
    });
  });

  it("reports the worst-of judgement once every epic is ready", () => {
    expect(combineFightEpicStatus([green, orange, green])).toEqual({
      status: "ready",
      judgement: "orange",
    });
  });

  it("reports green when every epic is ready and green", () => {
    expect(combineFightEpicStatus([green, green])).toEqual({
      status: "ready",
      judgement: "green",
    });
  });

  it("surfaces an error immediately, even if other epics are still loading", () => {
    expect(combineFightEpicStatus([loading, errored, green])).toEqual({
      status: "error",
      error: "boom",
    });
  });
});

describe("worstReadyJudgement", () => {
  it("returns null when nothing has resolved yet", () => {
    expect(worstReadyJudgement([loading, loading])).toBeNull();
  });

  it("ignores not-yet-ready entries and reports the worst of the rest", () => {
    expect(worstReadyJudgement([green, loading, red])).toBe("red");
  });

  it("ignores errored entries the same as loading ones", () => {
    expect(worstReadyJudgement([green, errored])).toBe("green");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: FAIL — `Cannot find module './reportAggregation'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/metrics/reportAggregation.ts
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

export type OverallJudgementStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement };

// One fight's six epic summaries -> a single overall status for that fight's
// row chip. Waits for every epic to resolve before judging — unlike
// worstReadyJudgement below — since a single fight's own verdict shouldn't
// flash a falsely-good color just because some epics haven't loaded yet.
export function combineFightEpicStatus(
  statuses: EpicSummaryStatus[],
): OverallJudgementStatus {
  const errored = statuses.find(
    (s): s is Extract<EpicSummaryStatus, { status: "error" }> =>
      s.status === "error",
  );
  if (errored) return errored;

  if (statuses.some((s) => s.status !== "ready")) return { status: "loading" };

  const ready = statuses as Extract<EpicSummaryStatus, { status: "ready" }>[];
  return {
    status: "ready",
    judgement: worstJudgement(ready.map((s) => s.judgement)),
  };
}

// One epic's judgement across every fight in the report -> a single strip
// chip. Progressive: counts only fights whose this-epic summary has resolved
// so far, ignoring ones still loading or errored, so the chip can appear
// before the whole report finishes computing and can only get worse (more
// accurate) as more fights resolve, never falsely better.
export function worstReadyJudgement(
  statuses: EpicSummaryStatus[],
): Judgement | null {
  const ready = statuses.filter(
    (s): s is Extract<EpicSummaryStatus, { status: "ready" }> =>
      s.status === "ready",
  );
  if (ready.length === 0) return null;
  return worstJudgement(ready.map((s) => s.judgement));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/reportAggregation.ts src/metrics/reportAggregation.test.ts
git commit -m "feat(dashboard): add cross-fight judgement aggregation helpers"
```

---

### Task 2: `useFightEpicSummaries` combinator hook

**Files:**

- Create: `src/app/components/Scorecard/useFightEpicSummaries.ts`
- Test: `src/app/components/Scorecard/useFightEpicSummaries.test.ts`

**Interfaces:**

- Consumes: the six existing hooks in `src/app/components/Scorecard/use*.ts` (`useGcdEconomySummary`, `useLifebloomDisciplineSummary`, `useSpellDisciplineSummary`, `useManaEconomySummary`, `useDeathForensicsSummary`, `usePrepHygieneSummary`) — unchanged, exact signatures as already in the codebase.
- Produces: `FightEpicSummaries` interface (`{ gcd, lifebloom, spell, mana, death, prep: EpicSummaryStatus }`) and `useFightEpicSummaries(...)` — consumed by Task 3 (Scorecard refactor) and Task 4 (`ReportDashboard`'s per-row hook use).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/components/Scorecard/useFightEpicSummaries.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFightEpicSummaries } from "./useFightEpicSummaries";
import { aFight } from "../../../testUtils/factories";

describe("useFightEpicSummaries", () => {
  it("starts every epic loading, then resolves all six once their fetches settle", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useFightEpicSummaries(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        new Set([33763]),
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Set([17116]),
        new Map(),
        new Map(),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({
      gcd: { status: "loading" },
      lifebloom: { status: "loading" },
      spell: { status: "loading" },
      mana: { status: "loading" },
      death: { status: "loading" },
      prep: { status: "loading" },
    });

    await waitFor(() =>
      expect(
        Object.values(result.current).every((s) => s.status === "ready"),
      ).toBe(true),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useFightEpicSummaries.test.ts`
Expected: FAIL — `Cannot find module './useFightEpicSummaries'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/components/Scorecard/useFightEpicSummaries.ts
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
import { usePrepHygieneSummary } from "./usePrepHygieneSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

export interface FightEpicSummaries {
  gcd: EpicSummaryStatus;
  lifebloom: EpicSummaryStatus;
  spell: EpicSummaryStatus;
  mana: EpicSummaryStatus;
  death: EpicSummaryStatus;
  prep: EpicSummaryStatus;
}

type FetchEvents = (
  accessToken: string,
  reportCode: string,
  fight: EventFetcherFight,
  dataType: WclEventDataType,
  includeResources?: boolean,
) => Promise<WclEvent[]>;

// Wraps the six per-epic summary hooks Scorecard needs for its widget grid,
// so both Scorecard and ReportDashboard's per-fight rows can get all six
// without each re-writing the same six hook calls in the same order.
export function useFightEpicSummaries(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fetchEvents: FetchEvents,
): FightEpicSummaries {
  const gcd = useGcdEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const lifebloom = useLifebloomDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const spell = useSpellDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    resolvedAbilities,
    fetchEvents,
  );
  const mana = useManaEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
  );
  const death = useDeathForensicsSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const prep = usePrepHygieneSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );

  return { gcd, lifebloom, spell, mana, death, prep };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useFightEpicSummaries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useFightEpicSummaries.ts src/app/components/Scorecard/useFightEpicSummaries.test.ts
git commit -m "feat(dashboard): add useFightEpicSummaries combinator hook"
```

---

### Task 3: Refactor `Scorecard` to use the combinator hook

Pure internal refactor — no prop or behavior change, so the existing `src/app/components/Scorecard/index.test.tsx` must keep passing unmodified.

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx:86-139` (the six individual hook calls)

**Interfaces:**

- Consumes: `useFightEpicSummaries` from Task 2.
- Produces: no external change — `Scorecard`'s props and rendering are identical.

- [ ] **Step 1: Confirm the existing test currently passes (baseline)**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (this is the safety net for the refactor below, not a new test)

- [ ] **Step 2: Replace the six hook calls with one combinator call**

In `src/app/components/Scorecard/index.tsx`, remove these imports:

```typescript
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
import { usePrepHygieneSummary } from "./usePrepHygieneSummary";
```

replace with:

```typescript
import { useFightEpicSummaries } from "./useFightEpicSummaries";
```

and replace this block:

```typescript
const gcdSummary = useGcdEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
const lifebloomSummary = useLifebloomDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
);
const spellSummary = useSpellDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  resolvedAbilities,
  fetchEvents,
);
const manaSummary = useManaEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
);
const deathSummary = useDeathForensicsSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  fetchEvents,
);
const prepSummary = usePrepHygieneSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

with:

```typescript
const {
  gcd: gcdSummary,
  lifebloom: lifebloomSummary,
  spell: spellSummary,
  mana: manaSummary,
  death: deathSummary,
  prep: prepSummary,
} = useFightEpicSummaries(
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
);
```

Every downstream reference (`gcdSummary.status`, `lifebloomSummary.judgement`, etc., in the widget grid and detail views below) is unchanged — only where these six variables come from has changed.

- [ ] **Step 3: Run the existing test to confirm no regression**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS, identical to Step 1 — proves the refactor is behavior-preserving.

- [ ] **Step 4: Run full-project static analysis**

Run: `npm run typecheck && npm run lint`
Expected: no errors (the six now-unused hook files under `Scorecard/` are still imported by `useFightEpicSummaries.ts`, so nothing is orphaned).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/index.tsx
git commit -m "refactor(scorecard): adopt useFightEpicSummaries combinator hook"
```

---

### Task 4: `ReportDashboard` component

This is the whole-report dashboard (702) and folds in 003's fight list — there is no separate fight-picker screen. Rows render immediately from fight metadata and are clickable before any judgement resolves; each row's chip and the epic strip fill in progressively via Task 2's hook and Task 1's aggregation helpers. Clicking a row reuses the existing `Scorecard` component **unmodified** for the inline drill-down — its existing `onBackToFights`/`onStartOver` props already match exactly what's needed here (close the drill-down / reset the whole report), so no `ScorecardContent` extraction or rename is needed, simplifying the design in `docs/specs/702-whole-report-dashboard-design.md`.

**Files:**

- Modify: `src/app/components/ui/Shell/index.tsx` (widen the `width` prop to allow 920, matching `docs/design_v3`'s wider dashboard shell)
- Create: `src/app/components/ReportDashboard/index.tsx`
- Create: `src/app/components/ReportDashboard/index.module.css`
- Test: `src/app/components/ReportDashboard/index.test.tsx`

**Interfaces:**

- Consumes: `combineFightEpicStatus`/`worstReadyJudgement` (Task 1), `useFightEpicSummaries`/`FightEpicSummaries` (Task 2), `Scorecard` (unchanged, `src/app/components/Scorecard/index.tsx`), `buildFightRows`/`formatDuration` (`src/report/fightRows.ts`, unchanged), `Badge`/`JudgementChip`/`Alert`/`Shell` (`src/app/components/ui/*`, unchanged).
- Produces: `ReportDashboard` component + `ReportDashboardProps` — consumed by Task 5's `App.tsx` rewiring.

- [ ] **Step 1: Widen `Shell`'s width union**

In `src/app/components/ui/Shell/index.tsx`, change:

```typescript
export interface ShellProps {
  width?: 760 | 800;
  children: ReactNode;
}
```

to:

```typescript
export interface ShellProps {
  width?: 760 | 800 | 920;
  children: ReactNode;
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// src/app/components/ReportDashboard/index.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportDashboard } from "./index";
import { aFight } from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
};

const baseProps = {
  accessToken: "test-token",
  reportCode: "4GYHZRdtL3bvhpc8",
  reportTitle: "SSC+TK 2026-07-07",
  druidId: 101,
  druid,
  lifebloomAbilityIds: new Set<number>([33763]),
  rejuvenationAbilityIds: new Set<number>([26982]),
  regrowthAbilityIds: new Set<number>([26980]),
  swiftmendAbilityIds: new Set<number>([18562]),
  naturesSwiftnessAbilityIds: new Set<number>([17116]),
  resolvedAbilities: new Map(),
  targetNames: new Map(),
  actorClasses: new Map(),
  initialFightId: null,
  onStartOver: vi.fn(),
};

describe("ReportDashboard", () => {
  it("renders every non-trash fight immediately and lets you click in before any judgement resolves", () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Trash pack", encounterID: 0 }),
    ];
    const fetchEvents = () => new Promise<never>(() => {}); // never resolves

    render(
      <ReportDashboard {...baseProps} fights={fights} fetchEvents={fetchEvents} />,
    );

    const row = screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ });
    expect(row).toBeInTheDocument();
    expect(screen.queryByText(/Trash pack/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Calculating…").length).toBeGreaterThan(0);
  });

  it("opens a fight's scorecard on row click, and returns to the fight list via ← All fights", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const user = userEvent.setup();

    render(
      <ReportDashboard {...baseProps} fights={fights} fetchEvents={fetchEvents} />,
    );

    await user.click(screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }));

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All fights" }));

    expect(
      screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
    ).not.toBeInTheDocument();
  });

  it("shows each fight's own worst-of judgement once its six epics resolve", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard {...baseProps} fights={fights} fetchEvents={fetchEvents} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
      ).toHaveTextContent(/Green|Orange|Red/),
    );
  });

  it("opens directly on the fight named by initialFightId (a #fight= deep link)", async () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Leotheras the Blind", kill: true }),
    ];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        initialFightId={2}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Leotheras the Blind/)).toBeInTheDocument();
  });

  it("shows six aggregated epic chips that resolve once every fight's data is in", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard {...baseProps} fights={fights} fetchEvents={fetchEvents} />,
    );

    for (const label of [
      "GCD economy",
      "Lifebloom discipline",
      "Spell discipline",
      "Mana economy",
      "Death forensics",
      "Prep hygiene",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 4: Write the CSS module**

```css
/* src/app/components/ReportDashboard/index.module.css */
.summaryLine {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-bottom: var(--space-5);
}

.chipStrip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-small-size);
}

.chipLabel {
  color: var(--text-h);
}

.calculating {
  font-size: var(--text-small-size);
  color: var(--text);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  box-sizing: border-box;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.row:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.rowLabel {
  flex: 1;
  color: var(--text-h);
}

.duration {
  font-size: var(--text-small-size);
  color: var(--text);
  font-family: var(--mono);
}
```

- [ ] **Step 5: Write the implementation**

```tsx
// src/app/components/ReportDashboard/index.tsx
import { useCallback, useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import type { DruidCandidate } from "../../../report/druidDetection";
import { buildFightRows, formatDuration } from "../../../report/fightRows";
import {
  combineFightEpicStatus,
  worstReadyJudgement,
} from "../../../metrics/reportAggregation";
import {
  useFightEpicSummaries,
  type FightEpicSummaries,
} from "../Scorecard/useFightEpicSummaries";
import { Scorecard } from "../Scorecard";
import { Badge } from "../ui/Badge";
import { JudgementChip } from "../ui/JudgementChip";
import { Alert } from "../ui/Alert";
import styles from "./index.module.css";

export interface ReportDashboardProps {
  accessToken: string;
  reportCode: string;
  reportTitle: string;
  fights: Fight[];
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  targetNames: Map<number, string>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  initialFightId: number | null;
  onStartOver: () => void;
}

const EPIC_META: { id: keyof FightEpicSummaries; label: string }[] = [
  { id: "gcd", label: "GCD economy" },
  { id: "lifebloom", label: "Lifebloom discipline" },
  { id: "spell", label: "Spell discipline" },
  { id: "mana", label: "Mana economy" },
  { id: "death", label: "Death forensics" },
  { id: "prep", label: "Prep hygiene" },
];

function epicKey(s: FightEpicSummaries[keyof FightEpicSummaries]): string {
  return s.status === "ready" ? `ready:${s.judgement}` : s.status;
}

interface FightRowProps {
  fight: Fight;
  pullNumber: number | null;
  onOpen: (fightId: number) => void;
  onSummaries: (fightId: number, summaries: FightEpicSummaries) => void;
  accessToken: string;
  reportCode: string;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReportDashboardProps["fetchEvents"];
}

function FightRow({
  fight,
  pullNumber,
  onOpen,
  onSummaries,
  accessToken,
  reportCode,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
}: FightRowProps) {
  const summaries = useFightEpicSummaries(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
  );

  // Reports to the parent whenever any epic's resolved status actually
  // changes, collapsed to short keys so the effect doesn't refire on
  // unrelated parent re-renders — same trick DruidDetector uses for its
  // fightIds prop (see src/app/components/DruidDetector/index.tsx).
  const summaryDeps = EPIC_META.map(({ id }) => epicKey(summaries[id]));
  useEffect(() => {
    onSummaries(fight.id, summaries);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryDeps flattens `summaries` into stable string keys; `summaries` itself is a fresh object every render and would refire this effect every render if listed directly
  }, [fight.id, onSummaries, ...summaryDeps]);

  const overall = combineFightEpicStatus(
    EPIC_META.map(({ id }) => summaries[id]),
  );
  const label =
    pullNumber === null ? fight.name : `Pull ${pullNumber} — ${fight.name}`;
  const duration = formatDuration(fight.endTime - fight.startTime);

  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => onOpen(fight.id)}
    >
      <span className={styles.rowLabel}>{label}</span>
      {fight.kill === true ? (
        <Badge tone="kill">Kill</Badge>
      ) : fight.kill === false ? (
        <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
      ) : null}
      <span className={styles.duration}>{duration}</span>
      {overall.status === "ready" ? (
        <JudgementChip judgement={overall.judgement} />
      ) : overall.status === "error" ? (
        <span className={styles.calculating}>{overall.error}</span>
      ) : (
        <span className={styles.calculating}>Calculating…</span>
      )}
    </button>
  );
}

export function ReportDashboard({
  accessToken,
  reportCode,
  reportTitle,
  fights,
  druidId,
  druid,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  targetNames,
  actorClasses,
  fetchEvents,
  initialFightId,
  onStartOver,
}: ReportDashboardProps) {
  const [openFightId, setOpenFightId] = useState<number | null>(initialFightId);
  const [summariesByFight, setSummariesByFight] = useState<
    Map<number, FightEpicSummaries>
  >(new Map());

  const handleSummaries = useCallback(
    (fightId: number, summaries: FightEpicSummaries) => {
      setSummariesByFight((prev) => {
        const next = new Map(prev);
        next.set(fightId, summaries);
        return next;
      });
    },
    [],
  );

  const rows = buildFightRows(fights).filter((row) => !row.isTrash);
  const openFight = rows.find((row) => row.fight.id === openFightId)?.fight;

  if (openFight) {
    return (
      <Scorecard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={openFight}
        druidId={druidId}
        druid={druid}
        lifebloomAbilityIds={lifebloomAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        resolvedAbilities={resolvedAbilities}
        targetNames={targetNames}
        actorClasses={actorClasses}
        fetchEvents={fetchEvents}
        onBackToFights={() => setOpenFightId(null)}
        onStartOver={onStartOver}
      />
    );
  }

  const allSummaries = Array.from(summariesByFight.values());
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} — Restoration`
    : druid.name;

  return (
    <div>
      <h2>{reportTitle}</h2>
      <p className={styles.summaryLine}>
        {druidLabel} · {rows.length} non-trash boss{" "}
        {rows.length === 1 ? "fight" : "fights"} aggregated automatically. Click
        a fight for its full single-fight scorecard.
      </p>

      <div className={styles.chipStrip}>
        {EPIC_META.map(({ id, label }) => {
          const judgement = worstReadyJudgement(allSummaries.map((s) => s[id]));
          return (
            <div key={id} className={styles.chip}>
              <span className={styles.chipLabel}>{label}</span>
              {judgement === null ? (
                <span className={styles.calculating}>Calculating…</span>
              ) : (
                <JudgementChip judgement={judgement} />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.rows}>
        {rows.map(({ fight, pullNumber }) => (
          <FightRow
            key={fight.id}
            fight={fight}
            pullNumber={pullNumber}
            onOpen={setOpenFightId}
            onSummaries={handleSummaries}
            accessToken={accessToken}
            reportCode={reportCode}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            resolvedAbilities={resolvedAbilities}
            actorClasses={actorClasses}
            fetchEvents={fetchEvents}
          />
        ))}
      </div>

      <Alert tone="warning">
        This dashboard can&apos;t judge target selection, assignment adherence,
        or positioning — only your process, aggregated across the report.
      </Alert>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: Run full-project static analysis**

Run: `npm run typecheck && npm run lint && npm run format`
Expected: no errors (the `eslint-disable` line above should be the only lint suppression, matching the existing `DruidDetector` precedent)

- [ ] **Step 8: Commit**

```bash
git add src/app/components/ui/Shell/index.tsx src/app/components/ReportDashboard/
git commit -m "feat(dashboard): add ReportDashboard with per-boss list and epic chip strip"
```

---

### Task 5: Wire `ReportDashboard` into `App.tsx`; retire `FightPicker`

**Files:**

- Modify: `src/App.tsx` (full rewrite of the post-report flow)
- Modify: `src/App.test.tsx` (full rewrite of the affected scenarios)
- Delete: `src/app/components/FightPicker/index.tsx`
- Delete: `src/app/components/FightPicker/index.module.css`
- Delete: `src/app/components/FightPicker/index.test.tsx`
- Modify: `src/report/fightRows.ts:29-52` (delete `ZoneGroup`/`groupFightsByZone` — dead once `FightPicker` is gone)
- Modify: `src/report/fightRows.test.ts:1-2,59-111` (delete the `groupFightsByZone` describe block and its import)

**Interfaces:**

- Consumes: `ReportDashboard` (Task 4), `buildFightRows` (unchanged, still exported from `fightRows.ts`).
- Produces: no new exports — this is the integration point.

- [ ] **Step 1: Delete `FightPicker` and the dead zone-grouping helper**

```bash
git rm -r src/app/components/FightPicker
```

In `src/report/fightRows.ts`, delete the `ZoneGroup` interface and `groupFightsByZone` function (lines 29-52 — everything from `export interface ZoneGroup` to the end of the file). The file should end after `formatDuration`.

In `src/report/fightRows.test.ts`, delete the `groupFightsByZone` import and its `describe` block (the whole `describe("groupFightsByZone", ...)` block at the end of the file).

- [ ] **Step 2: Rewrite `App.test.tsx` for the new flow**

Replace the entire file with:

```tsx
// src/App.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
  type ReportAbility,
} from "./wcl/client";
import { fetchEventsPage } from "./wcl/events";
import {
  aReportFights,
  aFight,
  aCastTableEntry,
  aReportAbility,
} from "./testUtils/factories";

vi.mock("./wcl/client", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchReportFights: vi.fn(),
  fetchCastsTable: vi.fn(),
  fetchMasterDataAbilities: vi.fn(),
}));

vi.mock("./wcl/events", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEventsPage: vi.fn(),
}));

// Matches useWclAuth's ACCESS_TOKEN_STORAGE_KEY (src/wcl/useWclAuth.ts) —
// simulating an already-authenticated session the same way test/e2e/smoke.spec.ts does.
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";
const REPORT_CODE = "4GYHZRdtL3bvhpc8";
const REPORT_TITLE = "SSC+TK 2026-07-07";

function setUpHappyPathMocks() {
  vi.mocked(fetchReportFights).mockResolvedValue(
    aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
  );
  vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
  vi.mocked(fetchMasterDataAbilities).mockResolvedValue([
    aReportAbility(),
    aReportAbility({
      gameID: 33763,
      name: "Lifebloom",
      icon: "spell_nature_lifebloom.jpg",
    }),
  ]);
  vi.mocked(fetchEventsPage).mockResolvedValue({
    events: [],
    nextPageTimestamp: null,
  });
}

async function loadReport(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
  await user.click(screen.getByRole("button", { name: "Load report" }));
  await screen.findByRole("heading", { name: REPORT_TITLE });
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the Connect screen when there is no access token, with no Client ID required upfront", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("WCL API Client ID"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Optional: Use your own WCL API Client ID instead",
      }),
    ).toBeInTheDocument();
  });

  it("reveals the optional own-Client-ID field when its disclosure is expanded", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", {
        name: "Optional: Use your own WCL API Client ID instead",
      }),
    );

    expect(screen.getByLabelText("WCL API Client ID")).toBeInTheDocument();
  });

  it("renders the report-input screen (not Connect) once a token is present but no report is loaded", () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");

    render(<App />);

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("detects druids across the whole report immediately once it loads, with no fight-selection step first", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(vi.mocked(fetchCastsTable)).toHaveBeenCalledWith(
      "test-token",
      REPORT_CODE,
      [1],
      expect.anything(),
    );
    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
  });

  it("excludes trash fights from the fights it detects druids across", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({
        title: REPORT_TITLE,
        fights: [
          aFight({ id: 1, encounterID: 0, name: "Trash" }),
          aFight({ id: 2 }),
        ],
      }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(vi.mocked(fetchCastsTable)).toHaveBeenCalledWith(
      "test-token",
      REPORT_CODE,
      [2],
      expect.anything(),
    );
  });

  it("requires picking a druid before continuing to the dashboard, when more than one is detected", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      await screen.findByRole("button", { name: "View report dashboard" }),
    ).toBeDisabled();

    await user.click(screen.getAllByRole("radio")[0]);

    expect(
      screen.getByRole("button", { name: "View report dashboard" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "View report dashboard" }),
    );

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("returns to the report-input screen after clicking Load different WCL report on the druid-pick screen", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);
    await screen.findByRole("button", { name: "View report dashboard" });

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(screen.queryByText(REPORT_TITLE)).not.toBeInTheDocument();
  });

  it("fetches master data abilities exactly once per report, even when that fetch is still in flight when the report finishes loading", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    // Master data intentionally never resolves in this test: it models the
    // real-world case (a large report's ability list is slower than the
    // small fights query) where the fetch is still in flight at the exact
    // moment `loadedReport` flips and the app transitions screens.
    vi.mocked(fetchMasterDataAbilities).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByRole("heading", { name: REPORT_TITLE });

    expect(vi.mocked(fetchMasterDataAbilities)).toHaveBeenCalledTimes(1);
  });

  it("still resolves master data abilities fetched before the report finished loading, not aborted by the later transition to the dashboard", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    let resolveMasterData: (abilities: ReportAbility[]) => void;
    // Mirrors real fetch()'s AbortSignal contract (reject with AbortError
    // once the signal fires) — a mock that ignores the signal can't
    // reproduce a bug that only exists because of that contract.
    vi.mocked(fetchMasterDataAbilities).mockImplementation(
      (_accessToken, _reportCode, signal) =>
        new Promise<ReportAbility[]>((resolve, reject) => {
          resolveMasterData = resolve;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByRole("heading", { name: REPORT_TITLE });

    resolveMasterData!([
      aReportAbility(),
      aReportAbility({
        gameID: 33763,
        name: "Lifebloom",
        icon: "spell_nature_lifebloom.jpg",
      }),
    ]);

    // Sole candidate auto-advances straight to the dashboard once
    // resolvedAbilities is the last piece the gate was waiting on — no
    // "View report dashboard" click needed.
    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("jumps straight to the whole-report dashboard once the sole druid auto-selects, with no button click needed", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    // Sole-candidate auto-select (DruidPicker returns null) shouldn't leave a
    // bare "Druid" heading with nothing under it — see Fix 4 (pre-702).
    expect(
      screen.queryByRole("heading", { name: "Druid" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View report dashboard" }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("drills into a fight's scorecard from the whole-report dashboard, and back to the fight list via ← All fights", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    const row = await screen.findByRole("button", {
      name: /Pull 1 — Coilfang Frenzy/,
    });
    await user.click(row);

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All fights" }));

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the rate-limit fallback banner (without unmounting the current screen) when a request hits the default client's rate limit, and lets the user submit their own Client ID", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockRejectedValue(
      new WclApiError(429, "rate limited"),
    );
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));

    await screen.findByRole("heading", { name: REPORT_TITLE });
    await screen.findByText(/temporarily over capacity/);

    await user.type(
      screen.getByLabelText("WCL API Client ID"),
      "my-own-client-id",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(localStorage.getItem("wcl_client_id")).toBe("my-own-client-id");
    expect(
      screen.getByRole("heading", { name: REPORT_TITLE }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the new test file to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (current `App.tsx` still has the old fight-picker/confirm flow, so labels like "View report dashboard" don't exist yet)

- [ ] **Step 4: Rewrite `App.tsx`**

Replace the whole file with:

```tsx
// src/App.tsx
import { useCallback, useMemo, useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  type ReportFights,
  type CastTableEntry,
} from "./wcl/client";
import { createEventFetcher } from "./wcl/eventCache";
import {
  resolveSpellAbilityIds,
  type ResolvedAbility,
} from "./abilities/resolveAbilities";
import { buildFightRows } from "./report/fightRows";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import { AbilityResolver } from "./app/components/AbilityResolver";
import { ReportDashboard } from "./app/components/ReportDashboard";
import { Shell } from "./app/components/ui/Shell";
import { Button } from "./app/components/ui/Button";
import { Alert } from "./app/components/ui/Alert";
import { Disclosure } from "./app/components/ui/Disclosure";
import { OwnClientIdField } from "./app/components/OwnClientIdField";
import { withRateLimitDetection } from "./wcl/client";
import type { DruidCandidate } from "./report/druidDetection";
import type { ActorClass } from "./metrics/innervateAudit";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

function App() {
  const { connect, accessToken, authError, rateLimited, reportRateLimited } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [selectedDruidId, setSelectedDruidId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [actorClasses, setActorClasses] = useState<Map<number, ActorClass>>(
    new Map(),
  );
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [dashboardRequested, setDashboardRequested] = useState(false);
  const [eventFetcher] = useState(() => createEventFetcher());

  const wrappedFetchReportFights = useMemo(
    () => withRateLimitDetection(fetchReportFights, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchCastsTable = useMemo(
    () => withRateLimitDetection(fetchCastsTable, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchMasterDataAbilities = useMemo(
    () => withRateLimitDetection(fetchMasterDataAbilities, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchEvents = useMemo(
    () => withRateLimitDetection(eventFetcher.fetchEvents, reportRateLimited),
    [eventFetcher, reportRateLimited],
  );

  function resetReportState() {
    setLoadedReport(null);
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setActorClasses(new Map());
    setResolvedAbilities(null);
    setDashboardRequested(false);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    resetReportState();
  }

  function handleStartOver() {
    setReport(null);
    resetReportState();
  }

  const handleEntriesLoaded = useCallback((entries: CastTableEntry[]) => {
    setActorNames(new Map(entries.map((e) => [e.id, e.name])));
    setActorClasses(
      new Map(entries.map((e) => [e.id, { class: e.type, specIcon: e.icon }])),
    );
  }, []);

  const nonTrashFightIds = useMemo(
    () =>
      loadedReport
        ? buildFightRows(loadedReport.fights)
            .filter((row) => !row.isTrash)
            .map((row) => row.fight.id)
        : [],
    [loadedReport],
  );

  const lifebloomAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Lifebloom")
        : null,
    [resolvedAbilities],
  );
  const rejuvenationAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Rejuvenation")
        : null,
    [resolvedAbilities],
  );
  const regrowthAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Regrowth")
        : null,
    [resolvedAbilities],
  );
  const swiftmendAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Swiftmend")
        : null,
    [resolvedAbilities],
  );
  const naturesSwiftnessAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Nature's Swiftness")
        : null,
    [resolvedAbilities],
  );

  const selectedDruid =
    druidCandidates?.find((d) => d.id === selectedDruidId) ?? null;

  const canGetDashboard =
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    naturesSwiftnessAbilityIds !== null &&
    resolvedAbilities !== null;

  // A single candidate has no picker to interact with (DruidPicker
  // auto-selects it silently) — requiring a "View report dashboard" click on
  // top of that would be a confirmation step with nothing left to confirm.
  // Updated directly during render (React's "adjusting state" pattern)
  // rather than in an effect, since it's purely derived from already-
  // rendered state and naturally settles once dashboardRequested flips true.
  if (druidCandidates?.length === 1 && canGetDashboard && !dashboardRequested) {
    setDashboardRequested(true);
  }

  return (
    <>
      {!accessToken && (
        <Shell>
          <div className={styles.connectHeader}>
            <img src={logo} width={40} height={40} alt="" />
            <h1>Bloomwatch</h1>
          </div>
          <p className={styles.tagline}>
            Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
            scorecard that judges your process — not another parse percentile
            that healing, being zero-sum, can&apos;t fairly measure.
          </p>
          <Button onClick={() => connect()}>
            Connect to Warcraft Logs (WCL)
          </Button>
          <Disclosure summary="Optional: Use your own WCL API Client ID instead">
            <OwnClientIdField onConnect={connect} />
          </Disclosure>
          {authError && <Alert tone="warning">{authError}</Alert>}
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.
          </p>
        </Shell>
      )}

      {accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
            The shared connection is temporarily over capacity — too many people
            are using Bloomwatch&apos;s default connection right now. Register
            your own free WCL API client to keep going; it only takes a minute.
          </Alert>
          <OwnClientIdField onConnect={connect} />
        </Shell>
      )}

      {accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
          {/* Rendered for the whole lifetime of `report` (not just while
              !loadedReport) rather than only on the first screen: its fetch
              can still be in flight when loadedReport resolves (masterData
              is a bigger query than the fights list), and unmounting a
              component aborts its in-flight fetch (see ConnectPanel/
              AbilityResolver's AbortSignal cleanup) — mounting it here once,
              for the whole flow, means that abort only ever fires for a
              genuine report change/reset, never for a normal screen
              transition. */}
          {report && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}

          {!loadedReport && (
            <Shell>
              <ReportInput onSubmit={handleReportSubmit} />
              {report && (
                <ConnectPanel
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  fetchReportFights={wrappedFetchReportFights}
                  onReportLoaded={setLoadedReport}
                />
              )}
            </Shell>
          )}

          {report && loadedReport && !dashboardRequested && (
            <Shell>
              <h2>{loadedReport.title}</h2>
              <button
                type="button"
                className={styles.backLink}
                onClick={handleStartOver}
              >
                Load different WCL report
              </button>
              <DruidDetector
                accessToken={accessToken}
                reportCode={report.reportCode}
                fightIds={nonTrashFightIds}
                fetchCastsTable={wrappedFetchCastsTable}
                onDruidsDetected={setDruidCandidates}
                onEntriesLoaded={handleEntriesLoaded}
              />
              {druidCandidates !== null &&
                (druidCandidates.length > 1 ? (
                  <div className={styles.druidSection}>
                    <h3>Druid</h3>
                    <DruidPicker
                      candidates={druidCandidates}
                      selectedDruidId={selectedDruidId}
                      onSelect={setSelectedDruidId}
                    />
                  </div>
                ) : (
                  <DruidPicker
                    candidates={druidCandidates}
                    selectedDruidId={selectedDruidId}
                    onSelect={setSelectedDruidId}
                  />
                ))}
              <Button
                disabled={!canGetDashboard}
                onClick={() => setDashboardRequested(true)}
              >
                View report dashboard
              </Button>
            </Shell>
          )}

          {report &&
            loadedReport &&
            dashboardRequested &&
            selectedDruid !== null &&
            lifebloomAbilityIds !== null &&
            rejuvenationAbilityIds !== null &&
            regrowthAbilityIds !== null &&
            swiftmendAbilityIds !== null &&
            naturesSwiftnessAbilityIds !== null &&
            resolvedAbilities !== null && (
              <Shell width={920}>
                <ReportDashboard
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  reportTitle={loadedReport.title}
                  fights={loadedReport.fights}
                  druidId={selectedDruid.id}
                  druid={selectedDruid}
                  lifebloomAbilityIds={lifebloomAbilityIds}
                  rejuvenationAbilityIds={rejuvenationAbilityIds}
                  regrowthAbilityIds={regrowthAbilityIds}
                  swiftmendAbilityIds={swiftmendAbilityIds}
                  naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
                  resolvedAbilities={resolvedAbilities}
                  targetNames={actorNames}
                  actorClasses={actorClasses}
                  fetchEvents={wrappedFetchEvents}
                  initialFightId={report.fightId}
                  onStartOver={handleStartOver}
                />
              </Shell>
            )}
        </div>
      )}
    </>
  );
}

export default App;
```

- [ ] **Step 5: Run the full test file to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 6: Run the full test suite and full-project static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass — this also catches any stale reference to the deleted `FightPicker`/`groupFightsByZone`.

- [ ] **Step 7: Commit**

```bash
git add -A src/App.tsx src/App.test.tsx src/report/fightRows.ts src/report/fightRows.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): wire the whole-report dashboard into App.tsx, retire FightPicker

Replaces the fight-picker -> confirm -> druid-picker -> stacked-scorecards
flow with connect -> load report -> pick druid -> whole-report dashboard
(702). Story 003's fight list is folded into the dashboard's own per-boss
list instead of remaining a separate screen.
EOF
)"
```

---

### Task 6: Retire the paperwork

Per `CLAUDE.md`: "a story isn't done until its paperwork is retired" — mark 702 (and 003's superseding note) done in the backlog, update `CLAUDE.md`'s repo-state summary, and delete this plan and its design spec in the same commit.

**Files:**

- Modify: `docs/backlog.md` (mark 702 `✅ Done`; update 003's heading/note to point at 702 instead of describing still-pending work; update the "Suggested path" line if 702 was the next unimplemented story in it)
- Modify: `CLAUDE.md` ("Repo state" paragraph)
- Delete: `docs/specs/702-whole-report-dashboard-design.md`
- Delete: `docs/plans/702-whole-report-dashboard-plan.md` (this file)

- [ ] **Step 1: Update `docs/backlog.md`**

Change the `### 702 — Whole-report dashboard` heading to `### 702 — Whole-report dashboard ✅ Done`.

Update 003's heading to `### 003 — Fight list & selection ✅ Done` and revise its trailing "Note" paragraph (the one starting "these criteria were trimmed after initial ship") to state that 003's fight-picker screen has now been retired entirely — its acceptance criteria are satisfied by 702's per-boss list instead of a standalone screen, and the old multi-select/zone/trash-toggle behavior this note originally flagged as leftover cleanup work is now gone.

- [ ] **Step 2: Update `CLAUDE.md`**

In the "Repo state" section, add 702 and update 003's description to the retired list, following the paragraph's existing prose style (see how 301/401-404 etc. are folded into running sentences already).

- [ ] **Step 3: Delete the spec and this plan**

```bash
git rm docs/specs/702-whole-report-dashboard-design.md docs/plans/702-whole-report-dashboard-plan.md
```

- [ ] **Step 4: Run full-project static analysis one last time**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark stories 702 and 003 done, retire their design spec and plan"
```
