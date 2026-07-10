# Active time & GCD utilization (story 101) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the druid their active time and GCD-utilization percentage per selected fight (time spent on the global cooldown or a longer cast, divided by fight duration), judged red/orange/green, per backlog story 101.

**Architecture:** A pure calculation module (`computeGcdUtilization`) derives per-cast GCD cost directly from WCL `Casts` events — pairing `begincast`→`cast` timestamp deltas for cast-time spells, defaulting to the fixed 1.5s GCD for instants — with no hardcoded spell-cast-time table. A new shared `judgement.ts` module provides the red/orange/green threshold helper this and future metric stories reuse. A `GCDUtilizationCard` component fetches events (via the existing story-006 event fetcher, injected as a prop) and renders the result. `App.tsx` wires it in, rendering one card per currently-selected fight.

**Tech Stack:** TypeScript, React 19, Vitest, React Testing Library. No new dependencies.

## Global Constraints

- Never hardcode a spell-cast-time table — GCD cost is derived from `begincast`/`cast` event timestamp deltas (see `docs/specs/gcd-utilization-design.md`).
- R/O/G thresholds: green ≥ 85%, orange 70–85%, red < 70% (backlog story 101). Comment the threshold constants with this citation.
- `docs/testing.md` conventions: Tier 1 tests co-located as `*.test.ts`; Tier 3 as `*.test.tsx`; test factories live in `src/testUtils/factories.ts`.
- Full-project static analysis runs on every commit via the pre-commit hook (`typecheck`, `lint`, `format:check`) — do not bypass it.
- Commits follow Conventional Commits (`type(scope): summary`); scope `gcd` fits this story.

---

### Task 1: Shared R/O/G judgement helper

**Files:**

- Create: `src/metrics/judgement.ts`
- Test: `src/metrics/judgement.test.ts`

**Interfaces:**

- Produces: `export type Judgement = "green" | "orange" | "red";` and `export function judgeThreshold(value: number, thresholds: { greenMin: number; orangeMin: number }): Judgement`. Both are imported by Task 3's `gcdUtilization.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/metrics/judgement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { judgeThreshold } from "./judgement";

describe("judgeThreshold", () => {
  it("returns green at or above greenMin", () => {
    expect(judgeThreshold(85, { greenMin: 85, orangeMin: 70 })).toBe("green");
    expect(judgeThreshold(100, { greenMin: 85, orangeMin: 70 })).toBe("green");
  });

  it("returns orange between orangeMin (inclusive) and greenMin (exclusive)", () => {
    expect(judgeThreshold(70, { greenMin: 85, orangeMin: 70 })).toBe("orange");
    expect(judgeThreshold(84.9, { greenMin: 85, orangeMin: 70 })).toBe(
      "orange",
    );
  });

  it("returns red below orangeMin", () => {
    expect(judgeThreshold(69.9, { greenMin: 85, orangeMin: 70 })).toBe("red");
    expect(judgeThreshold(0, { greenMin: 85, orangeMin: 70 })).toBe("red");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/judgement.test.ts`
Expected: FAIL — `src/metrics/judgement.ts` does not exist (`Failed to resolve import "./judgement"` or similar).

- [ ] **Step 3: Write the implementation**

Create `src/metrics/judgement.ts`:

```ts
export type Judgement = "green" | "orange" | "red";

// Higher value is better (e.g. GCD utilization %, LB3 uptime %).
export function judgeThreshold(
  value: number,
  thresholds: { greenMin: number; orangeMin: number },
): Judgement {
  if (value >= thresholds.greenMin) return "green";
  if (value >= thresholds.orangeMin) return "orange";
  return "red";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/metrics/judgement.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/judgement.ts src/metrics/judgement.test.ts
git commit -m "feat(gcd): add shared R/O/G judgement helper"
```

---

### Task 2: Cast/begincast test event factories

**Files:**

- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Consumes: `WclEvent` type from `src/wcl/events.ts` (already defined: `{ timestamp: number; type: string; sourceID?: number; targetID?: number; abilityGameID?: number; fight: number; [key: string]: unknown }`).
- Produces: `export function aCastEvent(overrides?: Partial<WclEvent>): WclEvent` and `export function aBegincastEvent(overrides?: Partial<WclEvent>): WclEvent`, both used by Task 3's and Task 4's tests.

- [ ] **Step 1: Add the import and two factory functions**

Replace the full contents of `src/testUtils/factories.ts` with:

```ts
import type {
  Fight,
  ReportFights,
  CastTableEntry,
  ReportAbility,
} from "../wcl/client";
import type { WclEvent } from "../wcl/events";

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

export function aReportFights(
  overrides: Partial<ReportFights> = {},
): ReportFights {
  return {
    title: "SSC+TK 2026-07-07",
    fights: [aFight()],
    ...overrides,
  };
}

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

export function aReportAbility(
  overrides: Partial<ReportAbility> = {},
): ReportAbility {
  return {
    gameID: 26982,
    name: "Rejuvenation",
    icon: "spell_nature_rejuvenation.jpg",
    type: "8",
    ...overrides,
  };
}

export function aCastEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1880311,
    type: "cast",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aBegincastEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1942970,
    type: "begincast",
    sourceID: 2,
    targetID: -1,
    abilityGameID: 26980,
    fight: 6,
    ...overrides,
  };
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npm run typecheck`
Expected: no errors (this file has no existing test of its own — `docs/testing.md`'s test-data-strategy section documents factories as hand-built helpers exercised indirectly through the modules that consume them, which happens in Task 3 and Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/testUtils/factories.ts
git commit -m "test(gcd): add cast/begincast event factories"
```

---

### Task 3: GCD utilization calculation module

**Files:**

- Create: `src/metrics/gcdUtilization.ts`
- Test: `src/metrics/gcdUtilization.test.ts`

**Interfaces:**

- Consumes: `Judgement`, `judgeThreshold` from `./judgement` (Task 1); `WclEvent` from `../wcl/events`; `aCastEvent`, `aBegincastEvent` from `../testUtils/factories` (Task 2).
- Produces: `export const GCD_MS = 1500;`, `export interface GcdUtilizationResult { activeTimeMs: number; fightDurationMs: number; utilizationPct: number; judgement: Judgement }`, and `export function computeGcdUtilization(events: WclEvent[], druidId: number, fightStart: number, fightEnd: number): GcdUtilizationResult`. Both the interface and function are imported by Task 4's `GCDUtilizationCard`.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/gcdUtilization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeGcdUtilization } from "./gcdUtilization";
import { aCastEvent, aBegincastEvent } from "../testUtils/factories";

describe("computeGcdUtilization", () => {
  it("costs 1.5s GCD per instant cast", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 774 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(4500);
    expect(result.fightDurationMs).toBe(10000);
    expect(result.utilizationPct).toBe(45);
    expect(result.judgement).toBe("red");
  });

  it("uses the begincast-to-cast delta as the cost for a cast-time spell", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(2000);
  });

  it("ignores an interrupted cast (begincast with no following cast)", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(0);
  });

  it("clamps a cast-time delta below the GCD floor up to 1.5s", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 1200, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(1500);
  });

  it("clamps utilizationPct to 100 without clamping activeTimeMs", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      aCastEvent({ timestamp: i * 1500, sourceID: 2, abilityGameID: 33763 }),
    );
    const result = computeGcdUtilization(events, 2, 0, 5000);
    expect(result.activeTimeMs).toBe(15000);
    expect(result.utilizationPct).toBe(100);
  });

  it("ignores casts from other actors", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 99, abilityGameID: 33763 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/gcdUtilization.test.ts`
Expected: FAIL — `src/metrics/gcdUtilization.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/metrics/gcdUtilization.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";

// TBC's fixed global cooldown in milliseconds — does not scale with haste.
export const GCD_MS = 1500;

// R/O/G thresholds per docs/backlog.md story 101: green >= 85%, orange 70-85%, red < 70%.
const GREEN_MIN_PCT = 85;
const ORANGE_MIN_PCT = 70;

export interface GcdUtilizationResult {
  activeTimeMs: number;
  fightDurationMs: number;
  utilizationPct: number;
  judgement: Judgement;
}

export function computeGcdUtilization(
  events: WclEvent[],
  druidId: number,
  fightStart: number,
  fightEnd: number,
): GcdUtilizationResult {
  const pending = new Map<number, number>();
  let activeTimeMs = 0;

  for (const event of events) {
    if (event.sourceID !== druidId) continue;
    if (event.abilityGameID === undefined) continue;

    if (event.type === "begincast") {
      pending.set(event.abilityGameID, event.timestamp);
      continue;
    }

    if (event.type === "cast") {
      const begincastTimestamp = pending.get(event.abilityGameID);
      if (begincastTimestamp !== undefined) {
        activeTimeMs += Math.max(event.timestamp - begincastTimestamp, GCD_MS);
        pending.delete(event.abilityGameID);
      } else {
        activeTimeMs += GCD_MS;
      }
    }
  }

  const fightDurationMs = fightEnd - fightStart;
  const utilizationPct = Math.min(100, (activeTimeMs / fightDurationMs) * 100);

  return {
    activeTimeMs,
    fightDurationMs,
    utilizationPct,
    judgement: judgeThreshold(utilizationPct, {
      greenMin: GREEN_MIN_PCT,
      orangeMin: ORANGE_MIN_PCT,
    }),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/gcdUtilization.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/gcdUtilization.ts src/metrics/gcdUtilization.test.ts
git commit -m "feat(gcd): compute GCD utilization from cast events"
```

---

### Task 4: GCDUtilizationCard component

**Files:**

- Create: `src/app/components/GCDUtilizationCard/index.tsx`
- Test: `src/app/components/GCDUtilizationCard/index.test.tsx`

**Interfaces:**

- Consumes: `Fight` from `../../../wcl/client`; `WclEvent`, `WclEventDataType` from `../../../wcl/events`; `EventFetcherFight` from `../../../wcl/eventCache` (existing, story 006); `computeGcdUtilization`, `GcdUtilizationResult` from `../../../metrics/gcdUtilization` (Task 3); `formatDuration` from `../../../report/fightRows` (existing, story 003 — `formatDuration(ms: number): string`, e.g. `formatDuration(3000)` returns `"0:03"`).
- Produces: `export interface GCDUtilizationCardProps { accessToken: string; reportCode: string; fight: Fight; druidId: number; fetchEvents: (accessToken: string, reportCode: string, fight: EventFetcherFight, dataType: WclEventDataType) => Promise<WclEvent[]> }` and `export function GCDUtilizationCard(props: GCDUtilizationCardProps): JSX.Element`. Consumed by Task 5 (`App.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/GCDUtilizationCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GCDUtilizationCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("GCDUtilizationCard", () => {
  it("renders the computed active time and GCD utilization once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 10000,
    });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The Lurker Below" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("GCD utilization: 30% — Red"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Active time: 0:03")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
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
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/GCDUtilizationCard/index.test.tsx`
Expected: FAIL — `src/app/components/GCDUtilizationCard/index.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/GCDUtilizationCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeGcdUtilization,
  type GcdUtilizationResult,
} from "../../../metrics/gcdUtilization";
import { formatDuration } from "../../../report/fightRows";

export interface GCDUtilizationCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: GcdUtilizationResult }
  | { accessToken: string; error: string };

const JUDGEMENT_LABEL: Record<GcdUtilizationResult["judgement"], string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function GCDUtilizationCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GCDUtilizationCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const computed = computeGcdUtilization(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate GCD utilization.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Calculating…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  const { activeTimeMs, utilizationPct, judgement } = result.result;

  return (
    <section>
      <h3>{fight.name}</h3>
      <p>Active time: {formatDuration(activeTimeMs)}</p>
      <p>
        GCD utilization: {Math.round(utilizationPct)}% —{" "}
        {JUDGEMENT_LABEL[judgement]}
      </p>
      <p>
        Ceiling: ~40 casts/min at 0% haste (60s ÷ 1.5s GCD) — 100% is a
        theoretical maximum, not a target.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/GCDUtilizationCard/index.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GCDUtilizationCard/index.tsx src/app/components/GCDUtilizationCard/index.test.tsx
git commit -m "feat(gcd): add GCDUtilizationCard component"
```

---

### Task 5: Wire GCDUtilizationCard into App.tsx

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `createEventFetcher` from `./wcl/eventCache` (existing, story 006, `createEventFetcher(): { fetchEvents: (...) => Promise<WclEvent[]> }`); `GCDUtilizationCard`, `GCDUtilizationCardProps` from `./app/components/GCDUtilizationCard` (Task 4).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Replace the full contents of `src/App.tsx`**

```tsx
import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  type ReportFights,
} from "./wcl/client";
import { createEventFetcher } from "./wcl/eventCache";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import { GCDUtilizationCard } from "./app/components/GCDUtilizationCard";
import type { DruidCandidate } from "./report/druidDetection";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [selectedFightIds, setSelectedFightIds] = useState<number[]>([]);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [selectedDruidId, setSelectedDruidId] = useState<number | null>(null);
  const [eventFetcher] = useState(() => createEventFetcher());

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
      {accessToken &&
        report &&
        loadedReport &&
        selectedDruidId !== null &&
        selectedFightIds.length > 0 && (
          <div>
            {loadedReport.fights
              .filter((f) => selectedFightIds.includes(f.id))
              .map((f) => (
                <GCDUtilizationCard
                  key={f.id}
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  fight={f}
                  druidId={selectedDruidId}
                  fetchEvents={eventFetcher.fetchEvents}
                />
              ))}
          </div>
        )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass — typecheck clean, lint clean, formatting clean, full test suite (including the new Task 1/3/4 tests) green.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(gcd): wire GCDUtilizationCard into App"
```

---

### Task 6: Close out the story

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/gcd-utilization-design.md`
- Delete: `docs/plans/gcd-utilization-plan.md`

**Interfaces:** none — documentation-only task.

- [ ] **Step 1: Mark story 101 done in the backlog**

In `docs/backlog.md`, change the heading `### 101 — Active time & GCD utilization` to `### 101 — Active time & GCD utilization ✅ Done`.

Also update the suggested-path pointer a few lines above it — change:

```
**Suggested path from the current state (101 next):**
```

to:

```
**Suggested path from the current state (102 next):**
```

- [ ] **Step 2: Update the "Repo state" line in `CLAUDE.md`**

In `CLAUDE.md`, in the "Repo state" section, change:

```
... and story 007 (ability resolution table) are complete and live. Phase 1 MVP work continues with backlog story 101 (active time & GCD utilization) next.
```

to:

```
... story 007 (ability resolution table), and story 101 (active time & GCD utilization) are complete and live. Phase 1 MVP work continues with backlog story 102 (idle-gap detection) next.
```

- [ ] **Step 3: Confirm no other file references the spec/plan paths, then delete them**

Run: `grep -rn "gcd-utilization-design.md\|gcd-utilization-plan.md" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: no output (or only self-references inside the two files being deleted).

```bash
git rm docs/specs/gcd-utilization-design.md docs/plans/gcd-utilization-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 101 done, delete its spec/plan, point at story 102"
```
