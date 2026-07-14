# 703 — Shareable report state Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the URL hash the single source of truth for navigation through report → druid → whole-report dashboard → fight → epic detail, so any screen is shareable and the browser's back/forward buttons work everywhere the in-app back-links already do.

**Architecture:** A hand-rolled `pushState`/`popstate` hash router (`src/app/routing/`) exposes a typed `Route` and a `navigate()` function. `App.tsx` becomes the single source of truth for navigation: `ReportDashboard` and `Scorecard` are converted from owning their own `openFightId`/`activeEpic` state to controlled components driven by props from `App.tsx`.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library. No new dependencies.

## Global Constraints

- No new routing library — hand-rolled `history.pushState` + `popstate`, per `docs/specs/703-shareable-report-state-design.md`.
- Druid is identified in the URL by **name** (percent-encoded), not WCL actor ID — exact, case-sensitive match against `DruidCandidate.name`.
- URL shape: `#/r/<reportCode>/d/<druidName>/f/<fightId>/e/<epicId>`, each level optional/shallower.
- Invalid URL state (unmatched druid name, unknown fight ID) silently falls back to the nearest valid screen — no error UI.
- No "whole-report per-epic detail" screen — out of scope (see spec's "Known discrepancy" section).
- Every step that changes code ends with `npm run typecheck && npm run lint` passing and the relevant test command passing, per `docs/testing.md`.
- Full spec: `docs/specs/703-shareable-report-state-design.md` — read it first if anything below is ambiguous.

---

### Task 1: Route type + pure parse/serialize functions

**Files:**

- Modify: `src/app/components/Scorecard/useFightEpicSummaries.ts` (export `EpicId`)
- Create: `src/app/routing/hashRoute.ts`
- Test: `src/app/routing/hashRoute.test.ts`

**Interfaces:**

- Produces: `export type EpicId = keyof FightEpicSummaries;` from `useFightEpicSummaries.ts`.
- Produces: `export type Route = ...` (5-variant discriminated union), `export function parseHash(hash: string): Route`, `export function serializeRoute(route: Route): string` from `hashRoute.ts`.

- [ ] **Step 1: Export `EpicId` from `useFightEpicSummaries.ts`**

In `src/app/components/Scorecard/useFightEpicSummaries.ts`, add this line directly after the `FightEpicSummaries` interface (after line 21):

```ts
export type EpicId = keyof FightEpicSummaries;
```

- [ ] **Step 2: Write the failing test for `parseHash`/`serializeRoute`**

Create `src/app/routing/hashRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseHash, serializeRoute, type Route } from "./hashRoute";

describe("parseHash / serializeRoute", () => {
  const cases: { name: string; hash: string; route: Route }[] = [
    { name: "empty hash", hash: "", route: { screen: "input" } },
    { name: "bare hash", hash: "#", route: { screen: "input" } },
    {
      name: "report only",
      hash: "#/r/4GYHZRdtL3bvhpc8",
      route: { screen: "druidPicker", reportCode: "4GYHZRdtL3bvhpc8" },
    },
    {
      name: "report + druid",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz",
      route: {
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      },
    },
    {
      name: "report + druid + fight",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz/f/6",
      route: {
        screen: "fight",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
        fightId: 6,
      },
    },
    {
      name: "report + druid + fight + epic",
      hash: "#/r/4GYHZRdtL3bvhpc8/d/Dassz/f/6/e/lifebloom",
      route: {
        screen: "fightEpic",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
        fightId: 6,
        epicId: "lifebloom",
      },
    },
  ];

  for (const { name, hash, route } of cases) {
    it(`parses ${name}`, () => {
      expect(parseHash(hash)).toEqual(route);
    });

    it(`serializes ${name} back to the same hash`, () => {
      expect(serializeRoute(route)).toBe(hash === "" ? "#" : hash);
    });
  }

  it("round-trips a druid name with a space and an apostrophe", () => {
    const route: Route = {
      screen: "dashboard",
      reportCode: "4GYHZRdtL3bvhpc8",
      druidName: "O'Bran Leafwhisper",
    };
    expect(parseHash(serializeRoute(route))).toEqual(route);
  });

  it.each([
    "#/r",
    "#/x/CODE",
    "#/r/CODE/d",
    "#/r/CODE/d/Name/f",
    "#/r/CODE/d/Name/f/notanumber",
    "#/r/CODE/d/Name/f/6/e",
    "#/r/CODE/d/Name/f/6/e/notanepic",
    "#/r/CODE/d/Name/f/6/e/gcd/extra",
    "garbage",
  ])("falls back to the input screen for malformed hash %s", (hash) => {
    expect(parseHash(hash)).toEqual({ screen: "input" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/routing/hashRoute.test.ts`
Expected: FAIL — `Cannot find module './hashRoute'`.

- [ ] **Step 4: Implement `hashRoute.ts`**

Create `src/app/routing/hashRoute.ts`:

```ts
import type { EpicId } from "../components/Scorecard/useFightEpicSummaries";

export type Route =
  | { screen: "input" }
  | { screen: "druidPicker"; reportCode: string }
  | { screen: "dashboard"; reportCode: string; druidName: string }
  | {
      screen: "fight";
      reportCode: string;
      druidName: string;
      fightId: number;
    }
  | {
      screen: "fightEpic";
      reportCode: string;
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

const INPUT_ROUTE: Route = { screen: "input" };

export function parseHash(hash: string): Route {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const segments = fragment.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) return INPUT_ROUTE;
  if (segments[0] !== "r" || segments.length < 2) return INPUT_ROUTE;
  const reportCode = decodeURIComponent(segments[1]);

  if (segments.length === 2) return { screen: "druidPicker", reportCode };
  if (segments[2] !== "d" || segments.length < 4) return INPUT_ROUTE;
  const druidName = decodeURIComponent(segments[3]);

  if (segments.length === 4) {
    return { screen: "dashboard", reportCode, druidName };
  }
  if (segments[4] !== "f" || segments.length < 6) return INPUT_ROUTE;
  const fightId = Number.parseInt(segments[5], 10);
  if (Number.isNaN(fightId)) return INPUT_ROUTE;

  if (segments.length === 6) {
    return { screen: "fight", reportCode, druidName, fightId };
  }
  if (segments[6] !== "e" || segments.length < 8) return INPUT_ROUTE;
  const epicIdRaw = decodeURIComponent(segments[7]);
  if (!isEpicId(epicIdRaw)) return INPUT_ROUTE;

  if (segments.length === 8) {
    return {
      screen: "fightEpic",
      reportCode,
      druidName,
      fightId,
      epicId: epicIdRaw,
    };
  }
  return INPUT_ROUTE;
}

export function serializeRoute(route: Route): string {
  switch (route.screen) {
    case "input":
      return "#";
    case "druidPicker":
      return `#/r/${encodeURIComponent(route.reportCode)}`;
    case "dashboard":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}`;
    case "fight":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}`;
    case "fightEpic":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}/e/${route.epicId}`;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/routing/hashRoute.test.ts`
Expected: PASS (all cases, including the malformed-hash table).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/Scorecard/useFightEpicSummaries.ts src/app/routing/hashRoute.ts src/app/routing/hashRoute.test.ts
git commit -m "feat(routing): add hash route parse/serialize for story 703"
```

---

### Task 2: `useHashRoute` hook

**Files:**

- Create: `src/app/routing/useHashRoute.ts`
- Test: `src/app/routing/useHashRoute.test.ts`

**Interfaces:**

- Consumes: `parseHash`, `serializeRoute`, `Route` from `./hashRoute` (Task 1).
- Produces: `export function useHashRoute(): { route: Route; navigate: (next: Route) => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/routing/useHashRoute.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useHashRoute } from "./useHashRoute";

describe("useHashRoute", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "#");
  });

  afterEach(() => {
    window.history.pushState(null, "", "#");
  });

  it("initializes route from the current window.location.hash", () => {
    window.history.pushState(null, "", "#/r/4GYHZRdtL3bvhpc8");
    const { result } = renderHook(() => useHashRoute());

    expect(result.current.route).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
    });
  });

  it("navigate() updates window.location.hash and the returned route", () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      result.current.navigate({
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      });
    });

    expect(window.location.hash).toBe("#/r/4GYHZRdtL3bvhpc8/d/Dassz");
    expect(result.current.route).toEqual({
      screen: "dashboard",
      reportCode: "4GYHZRdtL3bvhpc8",
      druidName: "Dassz",
    });
  });

  it("updates route when a popstate event fires (browser back/forward)", () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      result.current.navigate({
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
      });
    });
    act(() => {
      result.current.navigate({
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      });
    });

    // Simulate the browser's own back-button navigation: it moves
    // window.location.hash back to the previous pushState entry and fires
    // popstate — pushState/replaceState never fire this event themselves
    // (see hashRoute design spec), so this is the only way back/forward
    // updates reach the hook.
    act(() => {
      window.history.back();
    });

    expect(result.current.route).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts`
Expected: FAIL — `Cannot find module './useHashRoute'`.

- [ ] **Step 3: Implement `useHashRoute.ts`**

Create `src/app/routing/useHashRoute.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { parseHash, serializeRoute, type Route } from "./hashRoute";

export function useHashRoute(): {
  route: Route;
  navigate: (next: Route) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    function handlePopState() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = serializeRoute(next);
    if (hash !== window.location.hash) {
      window.history.pushState(null, "", hash);
    }
    setRoute(next);
  }, []);

  return { route, navigate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts`
Expected: PASS (all 3 tests, including the simulated `window.history.back()`).

Note: `window.history.back()` in jsdom is asynchronous (it queues a task); if the third test is flaky, await a microtask tick before the assertion, e.g. wrap the `act` callback in `async () => { window.history.back(); await Promise.resolve(); }` and make the `it` callback `async`.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/routing/useHashRoute.ts src/app/routing/useHashRoute.test.ts
git commit -m "feat(routing): add useHashRoute hook for story 703"
```

---

### Task 3: `ReportDashboard` becomes a controlled component

**Files:**

- Modify: `src/app/components/ReportDashboard/index.tsx`
- Test: `src/app/components/ReportDashboard/index.test.tsx`

**Interfaces:**

- Consumes: `EpicId` from `../Scorecard/useFightEpicSummaries` (Task 1).
- Produces: `ReportDashboardProps` gains `openFightId: number | null`, `onOpenFight: (fightId: number) => void`, `onCloseFight: () => void`, `activeEpicId: EpicId | null`, `onSelectEpic: (epicId: EpicId | null) => void`; loses `initialFightId`.

- [ ] **Step 1: Update the test file for the new controlled props**

Replace `src/app/components/ReportDashboard/index.test.tsx` in full:

```tsx
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
  openFightId: null as number | null,
  onOpenFight: vi.fn(),
  onCloseFight: vi.fn(),
  activeEpicId: null,
  onSelectEpic: vi.fn(),
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
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    const row = screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ });
    expect(row).toBeInTheDocument();
    expect(screen.queryByText(/Trash pack/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Calculating…").length).toBeGreaterThan(0);
  });

  it("calls onOpenFight on row click; rendering the fight's scorecard once openFightId is set is the parent's job", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onOpenFight = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    );
    expect(onOpenFight).toHaveBeenCalledWith(1);

    rerender(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
        openFightId={1}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    ).not.toBeInTheDocument();
  });

  it("calls onCloseFight when ← All fights is clicked from an open fight", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onCloseFight = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onCloseFight={onCloseFight}
      />,
    );

    await user.click(screen.getByRole("button", { name: "← All fights" }));
    expect(onCloseFight).toHaveBeenCalledOnce();
  });

  it("shows each fight's own worst-of judgement once its six epics resolve", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
      ).toHaveTextContent(/Good|Fair|Bad/),
    );
  });

  it("opens directly on the fight named by openFightId", async () => {
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
        openFightId={2}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Leotheras the Blind/)).toBeInTheDocument();
  });

  it("passes activeEpicId/onSelectEpic through to the open fight's Scorecard", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const events = [];
    const fetchEvents = () => Promise.resolve(events);
    const onSelectEpic = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onSelectEpic={onSelectEpic}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    expect(onSelectEpic).toHaveBeenCalledWith("gcd");
  });

  it("shows six aggregated epic chips that resolve once every fight's data is in", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: FAIL — type errors / `onOpenFight`, `onCloseFight`, `activeEpicId`, `onSelectEpic` don't exist on `ReportDashboardProps` yet, and clicking a row doesn't call `onOpenFight`.

- [ ] **Step 3: Update `ReportDashboard/index.tsx`**

In `src/app/components/ReportDashboard/index.tsx`:

Change the import on line 14-17 to also pull in `EpicId`:

```tsx
import {
  useFightEpicSummaries,
  type FightEpicSummaries,
  type EpicId,
} from "../Scorecard/useFightEpicSummaries";
```

Replace the `ReportDashboardProps` interface (lines 24-48) — remove `initialFightId: number | null;` and add the five controlled-component props in its place, so the full interface reads:

```tsx
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
  openFightId: number | null;
  onOpenFight: (fightId: number) => void;
  onCloseFight: () => void;
  activeEpicId: EpicId | null;
  onSelectEpic: (epicId: EpicId | null) => void;
  onStartOver: () => void;
}
```

Replace the `ReportDashboard` function's destructured props and body (from `export function ReportDashboard({` through the end of the file) with:

```tsx
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
  openFightId,
  onOpenFight,
  onCloseFight,
  activeEpicId,
  onSelectEpic,
  onStartOver,
}: ReportDashboardProps) {
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
        activeEpic={activeEpicId}
        onSelectEpic={onSelectEpic}
        onBackToFights={onCloseFight}
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
            onOpen={onOpenFight}
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

(This removes the `const [openFightId, setOpenFightId] = useState<number | null>(initialFightId);` line and the `useState` import is still needed for `summariesByFight` — leave the top `import { useCallback, useEffect, useState } from "react";` line unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: errors will surface in `App.tsx` and `Scorecard/index.tsx` (not yet updated) — that's expected at this point in the plan; confirm the _only_ errors are about `initialFightId`/`activeEpic` mismatches in those two files, not in `ReportDashboard` itself or its test.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ReportDashboard/index.tsx src/app/components/ReportDashboard/index.test.tsx
git commit -m "refactor(report-dashboard): make ReportDashboard a controlled component for story 703"
```

---

### Task 4: `Scorecard` becomes a controlled component

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Test: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `EpicId` from `./useFightEpicSummaries` (Task 1).
- Produces: `ScorecardProps` gains `activeEpic: EpicId | null`, `onSelectEpic: (epicId: EpicId | null) => void`.

- [ ] **Step 1: Update the test file for the new controlled props**

Replace `src/app/components/Scorecard/index.test.tsx` in full:

```tsx
// src/app/components/Scorecard/index.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Scorecard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";
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
  druidId: 101,
  druid,
  lifebloomAbilityIds: new Set([33763]),
  rejuvenationAbilityIds: new Set([26982]),
  regrowthAbilityIds: new Set([26980]),
  swiftmendAbilityIds: new Set([18562]),
  naturesSwiftnessAbilityIds: new Set([17116]),
  resolvedAbilities: new Map(),
  targetNames: new Map(),
  actorClasses: new Map(),
  activeEpic: null,
  onSelectEpic: vi.fn(),
  onBackToFights: vi.fn(),
  onStartOver: vi.fn(),
};

describe("Scorecard", () => {
  it("renders the fight header, all 6 epic widgets, and the footer", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const onBackToFights = vi.fn();
    const onStartOver = vi.fn();
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onBackToFights={onBackToFights}
        onStartOver={onStartOver}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Lady Vashj \(Kill, 5:41\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fernwhisper — Restoration")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Spell discipline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mana economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Death forensics/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Prep hygiene/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not yet available")).not.toBeInTheDocument();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /can't judge target selection/,
    );

    const buttonNames = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttonNames.indexOf("Load different WCL report")).toBeLessThan(
      buttonNames.indexOf("← All fights"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "← All fights" }));
    expect(onBackToFights).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("calls onSelectEpic('gcd') when the GCD economy widget is clicked; rendering the detail once activeEpic is set is the parent's job", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 10000,
    });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 101, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 101, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);
    const onSelectEpic = vi.fn();

    const { rerender } = render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onSelectEpic={onSelectEpic}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /GCD economy/ }),
      ).toHaveTextContent("Bad"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /GCD economy/ }));
    expect(onSelectEpic).toHaveBeenCalledWith("gcd");

    rerender(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onSelectEpic={onSelectEpic}
        activeEpic="gcd"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "← All metrics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Lifebloom discipline/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "← All fights" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load different WCL report" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All metrics" }));
    expect(onSelectEpic).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — `activeEpic`/`onSelectEpic` don't exist on `ScorecardProps` yet.

- [ ] **Step 3: Update `Scorecard/index.tsx`**

In `src/app/components/Scorecard/index.tsx`:

Change the top import from `import { useState } from "react";` to nothing (the file no longer needs any React hook import directly — `useFightEpicSummaries` is a custom hook imported separately below) — remove that line entirely.

Change the `useFightEpicSummaries` import (currently `import { useFightEpicSummaries } from "./useFightEpicSummaries";`) to also import the shared `EpicId`:

```tsx
import { useFightEpicSummaries, type EpicId } from "./useFightEpicSummaries";
```

Delete the local type alias (`type EpicId = "gcd" | "lifebloom" | "spell" | "mana" | "death" | "prep";`).

In the `ScorecardProps` interface, add two fields right after `actorClasses: Map<number, ActorClass>;`:

```tsx
  activeEpic: EpicId | null;
  onSelectEpic: (epicId: EpicId | null) => void;
```

In the `Scorecard` function's destructured parameters, add `activeEpic` and `onSelectEpic` (in the same position as the interface above), and delete the line `const [activeEpic, setActiveEpic] = useState<EpicId | null>(null);`.

Replace every `setActiveEpic("gcd")` with `onSelectEpic("gcd")`, `setActiveEpic("lifebloom")` with `onSelectEpic("lifebloom")`, `setActiveEpic("spell")` with `onSelectEpic("spell")`, `setActiveEpic("mana")` with `onSelectEpic("mana")`, `setActiveEpic("death")` with `onSelectEpic("death")`, `setActiveEpic("prep")` with `onSelectEpic("prep")` (six `Widget onOpen` callbacks), and every `setActiveEpic(null)` with `onSelectEpic(null)` (six "← All metrics" `onClick` callbacks).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: remaining errors should only be in `App.tsx` now (not yet updated) — confirm no errors remain in `Scorecard/` or `ReportDashboard/`.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx
git commit -m "refactor(scorecard): make Scorecard a controlled component for story 703"
```

---

### Task 5: Wire `useHashRoute` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**

- Consumes: `useHashRoute` (Task 2), `EpicId` (Task 1), `ReportDashboard`'s new controlled props (Task 3).

- [ ] **Step 1: Add hash-reset hygiene and new tests to `App.test.tsx`**

In `src/App.test.tsx`, add `window.history.pushState(null, "", "#");` to both `beforeEach` blocks (the one in `describe("App", ...)` around line 69-74, and the one in `describe("App — Onboarding", ...)` around line 378-382) — right after `sessionStorage.clear();` in each — so hash state from one test never leaks into the next:

```ts
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.pushState(null, "", "#");
  vi.clearAllMocks();
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
});
```

(and the analogous 3-line version without the `localStorage.setItem` in the Onboarding describe block.)

Add a new `describe("App — shareable URL state", ...)` block at the end of the file (after the closing `});` of `describe("App — Onboarding", ...)`):

```tsx
describe("App — shareable URL state", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("updates the URL hash as the user navigates report → druid → dashboard → fight → epic", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}`,
    );

    await user.click(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    );
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1`,
    );

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1/e/gcd`,
    );
  });

  it("moves back a screen via the browser back button, same as the in-app back-link", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);
    await user.click(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    );
    await screen.findByRole("button", { name: /GCD economy/ });

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    await screen.findByRole("heading", { name: "GCD utilization" });

    await act(async () => {
      window.history.back();
    });

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "GCD utilization" }),
    ).not.toBeInTheDocument();
  });

  it("resumes directly on a deep-linked fight+epic screen, skipping the report-input step", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1/e/lifebloom`,
    );

    render(<App />);

    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Lifebloom discipline" }),
    ).toBeInTheDocument();
  });

  it("falls back to the druid picker when the URL names a druid that isn't a detected candidate", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("NotARealDruid")}`,
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: "View report dashboard" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/r/${REPORT_CODE}`);
  });

  it("falls back to the dashboard when the URL names a fight that isn't in this report", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/999`,
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}`,
    );
  });
});
```

Add `act` to the `@testing-library/react` import at the top of the file (line 2), needed by the "moves back a screen" test above: `import { act, render, screen } from "@testing-library/react";`.

`setUpHappyPathMocks` defaults `aCastTableEntry()` to `{ id: 2, name: "Dassz", ... }` (see `src/testUtils/factories.ts`) — that's why `"Dassz"` is hardcoded in the new tests above as the sole auto-selected druid's name.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `App.tsx` doesn't use `useHashRoute` yet, so the hash never updates and deep links aren't honored.

- [ ] **Step 3: Rewrite `App.tsx`**

Replace `src/App.tsx` in full:

```tsx
// src/App.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Onboarding } from "./app/components/Onboarding";
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
import { useHashRoute } from "./app/routing/useHashRoute";
import type { EpicId } from "./app/components/Scorecard/useFightEpicSummaries";
import type { DruidCandidate } from "./report/druidDetection";
import type { ActorClass } from "./metrics/innervateAudit";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";

function App() {
  const { connect, accessToken, authError, rateLimited, reportRateLimited } =
    useWclAuth();
  const { route, navigate } = useHashRoute();
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [pickedDruidId, setPickedDruidId] = useState<number | null>(null);
  const [pendingFightId, setPendingFightId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [actorClasses, setActorClasses] = useState<Map<number, ActorClass>>(
    new Map(),
  );
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [eventFetcher] = useState(() => createEventFetcher());
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_SEEN_KEY) === "true",
  );

  const reportCode = route.screen === "input" ? null : route.reportCode;

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
    setActorNames(new Map());
    setActorClasses(new Map());
    setResolvedAbilities(null);
    setPickedDruidId(null);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    resetReportState();
    setPendingFightId(parsed.fightId);
    navigate({ screen: "druidPicker", reportCode: parsed.reportCode });
  }

  function handleStartOver() {
    resetReportState();
    setPendingFightId(null);
    navigate({ screen: "input" });
  }

  function dismissOnboarding() {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    setOnboardingDismissed(true);
  }

  function reopenOnboarding() {
    setOnboardingDismissed(false);
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

  const abilitiesReady =
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    naturesSwiftnessAbilityIds !== null &&
    resolvedAbilities !== null;

  const pickedDruid =
    druidCandidates?.find((d) => d.id === pickedDruidId) ?? null;

  const routeDruidName =
    route.screen === "dashboard" ||
    route.screen === "fight" ||
    route.screen === "fightEpic"
      ? route.druidName
      : null;
  const selectedDruid =
    routeDruidName !== null
      ? (druidCandidates?.find((d) => d.name === routeDruidName) ?? null)
      : null;

  const openFightId =
    route.screen === "fight" || route.screen === "fightEpic"
      ? route.fightId
      : null;
  const activeEpicId = route.screen === "fightEpic" ? route.epicId : null;

  function handleOpenFight(fightId: number) {
    if (reportCode === null || selectedDruid === null) return;
    navigate({
      screen: "fight",
      reportCode,
      druidName: selectedDruid.name,
      fightId,
    });
  }

  function handleCloseFight() {
    if (reportCode === null || selectedDruid === null) return;
    navigate({
      screen: "dashboard",
      reportCode,
      druidName: selectedDruid.name,
    });
  }

  function handleSelectEpic(epicId: EpicId | null) {
    if (reportCode === null || selectedDruid === null) return;
    if (route.screen !== "fight" && route.screen !== "fightEpic") return;
    const fightId = route.fightId;
    if (epicId === null) {
      navigate({
        screen: "fight",
        reportCode,
        druidName: selectedDruid.name,
        fightId,
      });
    } else {
      navigate({
        screen: "fightEpic",
        reportCode,
        druidName: selectedDruid.name,
        fightId,
        epicId,
      });
    }
  }

  function advanceFromPicker(druidName: string) {
    if (route.screen !== "druidPicker") return;
    if (pendingFightId !== null) {
      navigate({
        screen: "fight",
        reportCode: route.reportCode,
        druidName,
        fightId: pendingFightId,
      });
      setPendingFightId(null);
    } else {
      navigate({
        screen: "dashboard",
        reportCode: route.reportCode,
        druidName,
      });
    }
  }

  // Sole candidate has no picker UI to click through (DruidPicker returns
  // null and self-selects) — advance the moment abilities are also ready, no
  // button click needed. navigate() has a genuine side effect (pushState),
  // so — unlike a plain setState "adjusting state" pattern — this belongs in
  // an effect, not inline in the render body.
  useEffect(() => {
    if (druidCandidates === null || druidCandidates.length !== 1) return;
    if (!abilitiesReady) return;
    advanceFromPicker(druidCandidates[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advanceFromPicker closes over route/pendingFightId/navigate, all fresh every render; re-running only when druidCandidates or abilitiesReady actually change (not on every render) is the intent.
  }, [druidCandidates, abilitiesReady]);

  // A route that already names a druid (e.g. a shared link) is confirmed or
  // silently rejected the moment candidates resolve — no picker shown
  // either way, per story 703's "silently fall back" decision.
  useEffect(() => {
    if (
      route.screen !== "dashboard" &&
      route.screen !== "fight" &&
      route.screen !== "fightEpic"
    ) {
      return;
    }
    if (druidCandidates === null) return;
    if (druidCandidates.some((d) => d.name === route.druidName)) return;
    navigate({ screen: "druidPicker", reportCode: route.reportCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable (useCallback with no deps in useHashRoute); route/druidCandidates are the only real inputs.
  }, [route, druidCandidates]);

  // A fightId the loaded report doesn't actually have (stale/bad link)
  // falls back to the dashboard once the report's fights are known.
  useEffect(() => {
    if (route.screen !== "fight" && route.screen !== "fightEpic") return;
    if (loadedReport === null) return;
    if (nonTrashFightIds.includes(route.fightId)) return;
    navigate({
      screen: "dashboard",
      reportCode: route.reportCode,
      druidName: route.druidName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable; route/loadedReport/nonTrashFightIds are the only real inputs.
  }, [route, loadedReport, nonTrashFightIds]);

  return (
    <>
      {!onboardingDismissed && (
        <Shell width={820}>
          <Onboarding onContinue={dismissOnboarding} />
        </Shell>
      )}

      {onboardingDismissed && !accessToken && (
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
            made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={reopenOnboarding}
            >
              About
            </button>
          </p>
        </Shell>
      )}

      {onboardingDismissed && accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
            The shared connection is temporarily over capacity — too many people
            are using Bloomwatch&apos;s default connection right now. Register
            your own free WCL API client to keep going; it only takes a minute.
          </Alert>
          <OwnClientIdField onConnect={connect} />
        </Shell>
      )}

      {onboardingDismissed && accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
          {/* Rendered for the whole lifetime of a known reportCode (not just
              while !loadedReport), same reasoning as before 703: its fetch
              can still be in flight when loadedReport resolves, and
              unmounting a component aborts its in-flight fetch. */}
          {reportCode && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}

          {/* Also rendered for the whole lifetime of a loaded report, not
              just while the druid-pick screen is showing — a route that
              resumes straight to the dashboard/fight/epic screen (a shared
              link) never shows that screen at all, but still needs this to
              run so druidCandidates ever resolves. */}
          {loadedReport && reportCode && (
            <DruidDetector
              accessToken={accessToken}
              reportCode={reportCode}
              fightIds={nonTrashFightIds}
              fetchCastsTable={wrappedFetchCastsTable}
              onDruidsDetected={setDruidCandidates}
              onEntriesLoaded={handleEntriesLoaded}
            />
          )}

          {route.screen === "input" && (
            <Shell>
              <ReportInput onSubmit={handleReportSubmit} />
            </Shell>
          )}

          {reportCode && !loadedReport && (
            <Shell>
              <ConnectPanel
                accessToken={accessToken}
                reportCode={reportCode}
                fetchReportFights={wrappedFetchReportFights}
                onReportLoaded={setLoadedReport}
              />
            </Shell>
          )}

          {loadedReport && route.screen === "druidPicker" && (
            <Shell>
              <h2>{loadedReport.title}</h2>
              <button
                type="button"
                className={styles.backLink}
                onClick={handleStartOver}
              >
                Load different WCL report
              </button>
              {druidCandidates !== null &&
                (druidCandidates.length > 1 ? (
                  <div className={styles.druidSection}>
                    <h3>Druid</h3>
                    <DruidPicker
                      candidates={druidCandidates}
                      selectedDruidId={pickedDruidId}
                      onSelect={setPickedDruidId}
                    />
                  </div>
                ) : (
                  <DruidPicker
                    candidates={druidCandidates}
                    selectedDruidId={pickedDruidId}
                    onSelect={setPickedDruidId}
                  />
                ))}
              <Button
                disabled={!(pickedDruid !== null && abilitiesReady)}
                onClick={() =>
                  pickedDruid && advanceFromPicker(pickedDruid.name)
                }
              >
                View report dashboard
              </Button>
            </Shell>
          )}

          {loadedReport &&
            reportCode &&
            selectedDruid !== null &&
            resolvedAbilities !== null &&
            lifebloomAbilityIds !== null &&
            rejuvenationAbilityIds !== null &&
            regrowthAbilityIds !== null &&
            swiftmendAbilityIds !== null &&
            naturesSwiftnessAbilityIds !== null && (
              <Shell width={920}>
                <ReportDashboard
                  accessToken={accessToken}
                  reportCode={reportCode}
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
                  openFightId={openFightId}
                  onOpenFight={handleOpenFight}
                  onCloseFight={handleCloseFight}
                  activeEpicId={activeEpicId}
                  onSelectEpic={handleSelectEpic}
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

- [ ] **Step 4: Run the full test suite to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all tests in all three `describe` blocks — the pre-existing ones and the new "shareable URL state" block).

- [ ] **Step 5: Run the whole project's test suite**

Run: `npm test`
Expected: PASS. This catches any other file that referenced the old `ReportDashboard`/`Scorecard` prop shapes.

- [ ] **Step 6: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format`
Expected: no errors; `format` may rewrite whitespace in the files touched above — re-stage after.

- [ ] **Step 7: Manually verify in the browser**

Run: `npm run dev`, open the printed local URL, connect, load a real report (or `4GYHZRdtL3bvhpc8` if you have `WCL_TEST_ACCESS_TOKEN` per `CLAUDE.md`), and confirm:

- The address bar's hash updates at each step (report → druid → dashboard → fight → epic).
- The browser back button moves back a screen at each level.
- Copying the URL at the fight-epic level, closing the tab, and pasting it into a fresh tab (already authenticated) resumes directly on that screen.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(routing): drive App navigation from the URL hash for story 703"
```

---

### Task 6: Retire the paperwork

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/703-shareable-report-state-design.md`
- Delete: `docs/plans/703-shareable-report-state-plan.md` (this file)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Confirm nothing else references the spec/plan paths**

Run: `grep -rn "703-shareable-report-state" docs/ src/ --include="*.md" --include="*.ts" --include="*.tsx"`
Expected: only `docs/backlog.md`'s own story-703 entry (unless something else already links it — if so, fix that reference first, per `CLAUDE.md`'s convention).

- [ ] **Step 2: Mark story 703 done in the backlog**

In `docs/backlog.md`, change the heading `### 703 — Shareable report state` (currently around line 381) to `### 703 — Shareable report state ✅ Done`.

Also update the "Repo state" paragraph in `CLAUDE.md` to mention story 703 is complete, appending to the existing sentence listing completed stories (matching the style already used for 702/705), e.g. adding after the existing 705 mention: `Story 703 (shareable report state, epic H) is done too — the URL hash is now the single source of truth for navigation through report/druid/fight/epic selection, and the browser's back/forward buttons work throughout the flow.`

- [ ] **Step 3: Delete the spec and this plan file**

```bash
rm docs/specs/703-shareable-report-state-design.md
rm docs/plans/703-shareable-report-state-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git add -u docs/specs docs/plans
git commit -m "docs: mark story 703 done and retire its spec/plan"
```
