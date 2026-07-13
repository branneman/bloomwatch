# Story 401 (Mana curve & ending mana) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 401 — a "Mana curve & ending mana" metric card in the Mana economy epic, sourced from the druid's own `Casts` events, with a shared resource-sampling helper 402/403 will reuse.

**Architecture:** Follows the exact pattern already used by every prior epic (GCD economy, Lifebloom discipline, Spell discipline): a pure metric module in `src/metrics/`, a `MetricCard`-based card component that fetches its own events, an epic "content" wrapper, a summary function in `epicSummary.ts`, and wiring into `Scorecard`'s dashboard widget + drill-down. The novel piece is a new shared extraction module (`src/metrics/manaSamples.ts`) that decodes a WCL API quirk — see Global Constraints.

**Tech Stack:** Vite + React + TypeScript, Vitest + React Testing Library (co-located tests), no new dependencies.

## Global Constraints

- Full design/rationale reference: `docs/specs/mana-curve-design.md` — read it before starting if anything below is ambiguous; it is the source of truth for the WCL API investigation.
- **The `classResources` field-name quirk (load-bearing, don't re-derive):** on `Casts` events fetched with `includeResources: true`, `classResources[0].type` is the **current** resource amount and `classResources[0].amount` is the **max** pool — the field names are swapped from what they sound like. Live-validated against report `4GYHZRdtL3bvhpc8` fight 6 (Dassz's mana cross-checked against `Resources`-dataType `maxResourceAmount`; a warrior's rage cross-checked against WoW's internal 0–1000 rage scale). `resourceActor` must be `1`: `Casts` events always attach the source's (caster's) own resource state; `Healing` events always attach the target's instead (same convention `docs/testing.md` already documents for `hitPoints`) — Healing events must never be used for the druid's own mana.
- R/O/G thresholds must be documented in code with a comment pointing at their rationale in `docs/backlog.md` (project principle 3) — every judgement function below already includes this.
- Spell/ability IDs are never hardcoded (not applicable to this story — no new ability IDs are introduced).
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) runs full-project via a pre-commit hook — do not bypass it (`--no-verify` is forbidden). If a commit's pre-commit hook fails on formatting, run `npm run format` and re-stage before committing.
- Commits follow Conventional Commits: `type(scope): summary` (e.g. `feat(mana): add mana curve metric`).
- Tests are co-located next to the file under test (`*.test.ts` / `*.test.tsx`), per `docs/testing.md`'s Tier 1 (pure logic) / Tier 3 (React Testing Library) conventions. Use the existing factories in `src/testUtils/factories.ts` (`aCastEvent`, `aFight`) rather than hand-building event objects.
- A story isn't done until its paperwork is retired: the final task in this plan marks story 401 `✅ Done` in `docs/backlog.md` and deletes `docs/specs/mana-curve-design.md` in the same commit.

---

### Task 1: Shared mana-sample extraction — `src/metrics/manaSamples.ts`

**Files:**

- Create: `src/metrics/manaSamples.ts`
- Test: `src/metrics/manaSamples.test.ts`

**Interfaces:**

- Produces: `export interface ManaSample { timestampMs: number; currentMana: number; maxMana: number; }` and `export function extractManaSamples(castEvents: WclEvent[], druidId: number): ManaSample[]` — consumed by Task 2 (`manaCurve.ts`) now, and by a future story-403 module later.
- Consumes: `WclEvent` from `../wcl/events` (existing).

- [ ] **Step 1: Write the failing test**

Create `src/metrics/manaSamples.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractManaSamples } from "./manaSamples";
import { aCastEvent } from "../testUtils/factories";

describe("extractManaSamples", () => {
  it("extracts current/max mana from the druid's own cast events", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
      aCastEvent({
        timestamp: 2000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9529, cost: 28 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([
      { timestampMs: 1000, currentMana: 9689, maxMana: 9815 },
      { timestampMs: 2000, currentMana: 9529, maxMana: 9815 },
    ]);
  });

  it("sorts samples by timestamp regardless of input order", () => {
    const events = [
      aCastEvent({
        timestamp: 2000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9529, cost: 28 }],
      }),
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2).map((s) => s.timestampMs)).toEqual([
      1000, 2000,
    ]);
  });

  it("ignores events from a different source", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 999,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events where resourceActor is not 1 (target's resource, not the caster's)", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 2,
        classResources: [{ amount: 8058, max: 0, type: 6395, cost: 23 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores non-cast events", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        type: "begincast",
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events with no classResources at all", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, resourceActor: 1 }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events with a malformed classResources entry", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: "not a number", type: 9689 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/manaSamples.test.ts`
Expected: FAIL — `Cannot find module './manaSamples'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/metrics/manaSamples.ts`:

```ts
import type { WclEvent } from "../wcl/events";

export interface ManaSample {
  timestampMs: number;
  currentMana: number;
  maxMana: number;
}

// classResources[0].type is confusingly the *current* resource amount, and
// .amount is the *max* pool — live-validated against report 4GYHZRdtL3bvhpc8
// fight 6 (Dassz's mana, and a warrior's rage), see docs/testing.md.
// resourceActor must be 1: Casts events attach the source's (caster's) own
// resource state; Healing events attach the target's instead (same
// resourceActor convention docs/testing.md documents for hitPoints).
export function extractManaSamples(
  castEvents: WclEvent[],
  druidId: number,
): ManaSample[] {
  const samples: ManaSample[] = [];

  for (const event of castEvents) {
    if (event.sourceID !== druidId) continue;
    if (event.type !== "cast") continue;
    if (event.resourceActor !== 1) continue;

    const classResources = event.classResources;
    if (!Array.isArray(classResources) || classResources.length === 0) continue;

    const resource = classResources[0] as {
      type?: unknown;
      amount?: unknown;
    };
    if (
      typeof resource.type !== "number" ||
      typeof resource.amount !== "number"
    )
      continue;

    samples.push({
      timestampMs: event.timestamp,
      currentMana: resource.type,
      maxMana: resource.amount,
    });
  }

  return samples.sort((a, b) => a.timestampMs - b.timestampMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/manaSamples.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/manaSamples.ts src/metrics/manaSamples.test.ts
git commit -m "feat(mana): add shared mana-sample extraction from Casts events"
```

---

### Task 2: Mana curve metric — `src/metrics/manaCurve.ts`

**Files:**

- Create: `src/metrics/manaCurve.ts`
- Test: `src/metrics/manaCurve.test.ts`

**Interfaces:**

- Consumes: `extractManaSamples`, `ManaSample` from `./manaSamples` (Task 1); `Judgement` from `./judgement` (existing).
- Produces: `export interface ManaCurvePoint { timestampMs: number; pct: number; }`, `export interface ManaCurveResult { points: ManaCurvePoint[]; endingPct: number | null; judgement: Judgement | null; }`, `export function computeManaCurve(castEvents: WclEvent[], druidId: number, isKill: boolean, fightDurationMs: number): ManaCurveResult` — consumed by Task 4 (`ManaCurveCard`), Task 6 (`epicSummary.ts`), Task 7 (`useManaEconomySummary`).

- [ ] **Step 1: Write the failing test**

Create `src/metrics/manaCurve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeManaCurve } from "./manaCurve";
import { aCastEvent } from "../testUtils/factories";

function aManaCastEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: 2,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("computeManaCurve", () => {
  it("builds pct points from mana samples and reports ending pct", () => {
    const events = [aManaCastEvent(1000, 9000), aManaCastEvent(2000, 3000)];

    const result = computeManaCurve(events, 2, true, 120_000);

    expect(result.points).toEqual([
      { timestampMs: 1000, pct: 90 },
      { timestampMs: 2000, pct: 30 },
    ]);
    expect(result.endingPct).toBe(30);
  });

  it("judges green in the middle of the band on a kill ≥ 90s", () => {
    const events = [aManaCastEvent(1000, 2000)]; // 20%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("green");
  });

  it("judges orange just above the green band", () => {
    const events = [aManaCastEvent(1000, 5000)]; // 50%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("orange");
  });

  it("judges orange just below the green band", () => {
    const events = [aManaCastEvent(1000, 200)]; // 2%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("orange");
  });

  it("judges red above 70%", () => {
    const events = [aManaCastEvent(1000, 8000)]; // 80%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("red");
  });

  it("treats exactly 5% and exactly 40% as green (band boundaries)", () => {
    expect(
      computeManaCurve([aManaCastEvent(1000, 500)], 2, true, 120_000).judgement,
    ).toBe("green");
    expect(
      computeManaCurve([aManaCastEvent(1000, 4000)], 2, true, 120_000)
        .judgement,
    ).toBe("green");
  });

  it("is informational (null judgement) on a wipe", () => {
    const events = [aManaCastEvent(1000, 2000)];
    expect(computeManaCurve(events, 2, false, 120_000).judgement).toBeNull();
  });

  it("is informational (null judgement) on a kill under 90s", () => {
    const events = [aManaCastEvent(1000, 2000)];
    expect(computeManaCurve(events, 2, true, 89_999).judgement).toBeNull();
  });

  it("reports null points/endingPct/judgement when the druid has no qualifying samples", () => {
    const result = computeManaCurve([], 2, true, 120_000);
    expect(result).toEqual({ points: [], endingPct: null, judgement: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/manaCurve.test.ts`
Expected: FAIL — `Cannot find module './manaCurve'`

- [ ] **Step 3: Write the implementation**

Create `src/metrics/manaCurve.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { extractManaSamples } from "./manaSamples";

export interface ManaCurvePoint {
  timestampMs: number;
  pct: number;
}

export interface ManaCurveResult {
  points: ManaCurvePoint[];
  endingPct: number | null;
  judgement: Judgement | null;
}

const MIN_JUDGED_FIGHT_DURATION_MS = 90_000;

// Green 5–40% ending mana, orange 40–70% or 0–5%, red > 70% (hoarding) — kills
// only, per docs/backlog.md story 401. Green sits in the middle of the range,
// so this doesn't fit judgeThreshold/judgeThresholdBelow's monotonic shape.
function judgeManaBand(pct: number): Judgement {
  if (pct > 70) return "red";
  if (pct >= 5 && pct <= 40) return "green";
  return "orange";
}

export function computeManaCurve(
  castEvents: WclEvent[],
  druidId: number,
  isKill: boolean,
  fightDurationMs: number,
): ManaCurveResult {
  const samples = extractManaSamples(castEvents, druidId);
  const points = samples.map((sample) => ({
    timestampMs: sample.timestampMs,
    pct: (sample.currentMana / sample.maxMana) * 100,
  }));

  if (points.length === 0) {
    return { points, endingPct: null, judgement: null };
  }

  const endingPct = points[points.length - 1].pct;
  // Fights under 90s auto-downgrade to informational — short/easy fights make
  // this metric moot, per docs/backlog.md story 401.
  const judged = isKill && fightDurationMs >= MIN_JUDGED_FIGHT_DURATION_MS;

  return {
    points,
    endingPct,
    judgement: judged ? judgeManaBand(endingPct) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/manaCurve.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/manaCurve.ts src/metrics/manaCurve.test.ts
git commit -m "feat(mana): add mana curve metric with kills-only band judgement"
```

---

### Task 3: Mana curve chart primitive — `src/app/components/ui/ManaCurve/`

**Files:**

- Create: `src/app/components/ui/ManaCurve/index.tsx`
- Create: `src/app/components/ui/ManaCurve/index.module.css`
- Test: `src/app/components/ui/ManaCurve/index.test.tsx`

**Interfaces:**

- Produces: `export interface ManaCurveProps { points: { timestampMs: number; pct: number }[]; fightStartMs: number; fightEndMs: number; endingPct: number; }` and `export function ManaCurve(props: ManaCurveProps): JSX.Element` — consumed by Task 4 (`ManaCurveCard`).
- Consumes: nothing from earlier tasks (pure presentational component, takes plain data).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ui/ManaCurve/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCurve } from "./index";

describe("ManaCurve", () => {
  it("renders an accessible chart labeled with the ending percentage", () => {
    render(
      <ManaCurve
        points={[
          { timestampMs: 0, pct: 90 },
          { timestampMs: 5000, pct: 30 },
        ]}
        fightStartMs={0}
        fightEndMs={10000}
        endingPct={30}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Mana curve, ending at 30%" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/ManaCurve/index.test.tsx`
Expected: FAIL — `Cannot find module './index'` (or a resolved-but-empty-module error; the file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ui/ManaCurve/index.module.css`:

```css
.chart {
  display: block;
  margin-bottom: var(--space-2);
}

.area {
  fill: var(--accent-bg);
  stroke: none;
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}

.endMarker {
  fill: var(--text-h);
}
```

Create `src/app/components/ui/ManaCurve/index.tsx`:

```tsx
import styles from "./index.module.css";

export interface ManaCurveProps {
  points: { timestampMs: number; pct: number }[];
  fightStartMs: number;
  fightEndMs: number;
  endingPct: number;
}

const WIDTH = 640;
const HEIGHT = 140;
const PAD = 8;

function toXY(t: number, pct: number): [number, number] {
  const x = PAD + t * (WIDTH - PAD * 2);
  const y = PAD + (1 - pct / 100) * (HEIGHT - PAD * 2);
  return [x, y];
}

export function ManaCurve({
  points,
  fightStartMs,
  fightEndMs,
  endingPct,
}: ManaCurveProps) {
  const fightDurationMs = fightEndMs - fightStartMs;
  const normalized = points.map((point) => ({
    t: (point.timestampMs - fightStartMs) / fightDurationMs,
    pct: point.pct,
  }));

  const linePath = normalized
    .map((point, index) => {
      const [x, y] = toXY(point.t, point.pct);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${linePath} L${(WIDTH - PAD).toFixed(1)},${(
    HEIGHT - PAD
  ).toFixed(1)} L${PAD.toFixed(1)},${(HEIGHT - PAD).toFixed(1)} Z`;
  const [endX, endY] = toXY(1, endingPct);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={styles.chart}
      role="img"
      aria-label={`Mana curve, ending at ${Math.round(endingPct)}%`}
    >
      <path d={areaPath} className={styles.area} />
      <path d={linePath} className={styles.line} />
      <circle cx={endX} cy={endY} r="4.5" className={styles.endMarker} />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/ManaCurve/index.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/ManaCurve/
git commit -m "feat(mana): add ManaCurve SVG chart primitive"
```

---

### Task 4: Mana curve card — `src/app/components/ManaCurveCard/`

**Files:**

- Create: `src/app/components/ManaCurveCard/index.tsx`
- Test: `src/app/components/ManaCurveCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeManaCurve`, `ManaCurveResult` from `../../../metrics/manaCurve` (Task 2); `ManaCurve` from `../ui/ManaCurve` (Task 3); `MetricCard` from `../ui/MetricCard` (existing); `Fight` from `../../../wcl/client` (existing); `EventFetcherFight`, `WclEvent`, `WclEventDataType` from existing WCL modules.
- Produces: `export interface ManaCurveCardProps { accessToken: string; reportCode: string; fight: Fight; druidId: number; fetchEvents: (...) => Promise<WclEvent[]>; }` and `export function ManaCurveCard(props: ManaCurveCardProps): JSX.Element` — consumed by Task 5 (`ManaEconomyContent`).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ManaCurveCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCurveCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

function aManaCastEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: 2,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("ManaCurveCard", () => {
  it("renders the ending mana percentage and judgement chip for a qualifying kill", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [aManaCastEvent(1000, 9000), aManaCastEvent(2000, 2000)];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows an informational note instead of a judgement chip on a wipe", async () => {
    const fight = aFight({
      id: 6,
      kill: false,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [aManaCastEvent(1000, 2000)];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    expect(screen.getByText("Informational — not a kill")).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
  });

  it("shows a no-data message when the druid has zero mana samples", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No mana samples were found for this druid this fight.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Informational — no mana data"),
    ).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ManaCurveCard
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
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <ManaCurveCard
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ManaCurveCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ManaCurveCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeManaCurve,
  type ManaCurveResult,
} from "../../../metrics/manaCurve";
import { MetricCard } from "../ui/MetricCard";
import { ManaCurve } from "../ui/ManaCurve";

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_elemental_primal_mana.jpg";

const THRESHOLD =
  "Green 5–40% ending mana, orange 40–70% or 0–5%, red > 70% (hoarding) — kills only. Fights under 90s, and wipes, auto-downgrade to informational: short/easy fights make this metric moot. Ending mana is read from the druid's last cast of the fight, so it may be stale if that cast landed well before the kill.";

export interface ManaCurveCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: ManaCurveResult }
  | { accessToken: string; error: string };

function informationalNote(fight: Fight): string | undefined {
  if (fight.kill !== true) return "Informational — not a kill";
  if (fight.endTime - fight.startTime < 90_000)
    return "Informational — fight under 90s";
  return undefined;
}

export function ManaCurveCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: ManaCurveCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
      true,
    )
      .then((events) => {
        const computed = computeManaCurve(
          events,
          druidId,
          fight.kill === true,
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
              : "Failed to calculate the mana curve.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    fight.kill,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Mana curve & ending mana"
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
        title="Mana curve & ending mana"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { points, endingPct, judgement } = result.result;

  if (endingPct === null) {
    return (
      <MetricCard
        icon={ICON}
        title="Mana curve & ending mana"
        note="Informational — no mana data"
        threshold={THRESHOLD}
      >
        <p>No mana samples were found for this druid this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Mana curve & ending mana"
      value={`Ending mana: ${Math.round(endingPct)}%`}
      judgement={judgement}
      note={judgement === null ? informationalNote(fight) : undefined}
      threshold={THRESHOLD}
    >
      <ManaCurve
        points={points}
        fightStartMs={fight.startTime}
        fightEndMs={fight.endTime}
        endingPct={endingPct}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ManaCurveCard/index.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ManaCurveCard/
git commit -m "feat(mana): add ManaCurveCard"
```

---

### Task 5: Epic content wrapper — `src/app/components/ManaEconomyContent/`

**Files:**

- Create: `src/app/components/ManaEconomyContent/index.tsx`
- Create: `src/app/components/ManaEconomyContent/index.module.css`
- Test: `src/app/components/ManaEconomyContent/index.test.tsx`

**Interfaces:**

- Consumes: `ManaCurveCard` from `../ManaCurveCard` (Task 4).
- Produces: `export interface ManaEconomyContentProps { accessToken: string; reportCode: string; fight: Fight; druidId: number; fetchEvents: (...) => Promise<WclEvent[]>; }` and `export function ManaEconomyContent(props: ManaEconomyContentProps): JSX.Element` — consumed by Task 8 (`Scorecard`).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ManaEconomyContent/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaEconomyContent } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("ManaEconomyContent", () => {
  it("renders the mana curve card", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ManaEconomyContent/index.module.css`:

```css
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

Create `src/app/components/ManaEconomyContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { ManaCurveCard } from "../ManaCurveCard";
import styles from "./index.module.css";

export interface ManaEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function ManaEconomyContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: ManaEconomyContentProps) {
  return (
    <div className={styles.group}>
      <ManaCurveCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ManaEconomyContent/
git commit -m "feat(mana): add ManaEconomyContent wrapper"
```

---

### Task 6: Epic summary — `summarizeManaEconomy` in `src/metrics/epicSummary.ts`

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`

**Interfaces:**

- Consumes: `ManaCurveResult` from `./manaCurve` (Task 2); `worstJudgement`, `EpicSummary` (already defined in this file).
- Produces: `export function summarizeManaEconomy(manaCurve: ManaCurveResult): EpicSummary` — consumed by Task 7 (`useManaEconomySummary`).

- [ ] **Step 1: Write the failing test**

Add to `src/metrics/epicSummary.test.ts` (append after the existing `summarizeSpellDiscipline` describe block, and add the import alongside the other type imports at the top of the file):

```ts
import type { ManaCurveResult } from "./manaCurve";
```

```ts
describe("summarizeManaEconomy", () => {
  it("reports the mana curve's own judgement and ending mana stat", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    expect(summarizeManaEconomy(manaCurve)).toEqual({
      judgement: "green",
      stats: ["Ending mana: 20%"],
    });
  });

  it("reports a no-data stat and defaults to green when there are no samples", () => {
    const manaCurve: ManaCurveResult = {
      points: [],
      endingPct: null,
      judgement: null,
    };
    expect(summarizeManaEconomy(manaCurve)).toEqual({
      judgement: "green",
      stats: ["Ending mana: no data"],
    });
  });
});
```

Also add `summarizeManaEconomy` to the existing named import from `"./epicSummary"` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — `summarizeManaEconomy is not exported` / `Cannot find module './manaCurve'` import error is not expected (manaCurve.ts exists from Task 2) but `summarizeManaEconomy` does not exist yet.

- [ ] **Step 3: Write the implementation**

In `src/metrics/epicSummary.ts`, add the import alongside the other result-type imports near the top:

```ts
import type { ManaCurveResult } from "./manaCurve";
```

Then append this function at the end of the file, after `summarizeSpellDiscipline`:

```ts
export function summarizeManaEconomy(manaCurve: ManaCurveResult): EpicSummary {
  return {
    judgement: worstJudgement([manaCurve.judgement]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts
git commit -m "feat(mana): add summarizeManaEconomy"
```

---

### Task 7: Dashboard summary hook — `src/app/components/Scorecard/useManaEconomySummary.ts`

**Files:**

- Create: `src/app/components/Scorecard/useManaEconomySummary.ts`
- Test: `src/app/components/Scorecard/useManaEconomySummary.test.ts`

**Interfaces:**

- Consumes: `computeManaCurve` from `../../../metrics/manaCurve` (Task 2); `summarizeManaEconomy` from `../../../metrics/epicSummary` (Task 6); `EpicSummaryStatus` from `./epicSummaryStatus` (existing).
- Produces: `export function useManaEconomySummary(accessToken: string, reportCode: string, fight: Fight, druidId: number, fetchEvents: (...) => Promise<WclEvent[]>): EpicSummaryStatus` — consumed by Task 8 (`Scorecard`).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/Scorecard/useManaEconomySummary.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("useManaEconomySummary", () => {
  it("starts loading, then reports the mana curve's judgement and stat line", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      judgement: "green",
      stats: ["Ending mana: 20%"],
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: FAIL — `Cannot find module './useManaEconomySummary'`

- [ ] **Step 3: Write the implementation**

Create `src/app/components/Scorecard/useManaEconomySummary.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeManaCurve } from "../../../metrics/manaCurve";
import { summarizeManaEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useManaEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
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
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
      true,
    )
      .then((events) => {
        const manaCurve = computeManaCurve(
          events,
          druidId,
          fight.kill === true,
          fight.endTime - fight.startTime,
        );
        setState({
          accessToken,
          summary: { status: "ready", ...summarizeManaEconomy(manaCurve) },
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
                : "Failed to summarize mana economy.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    fight.kill,
    druidId,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useManaEconomySummary.ts src/app/components/Scorecard/useManaEconomySummary.test.ts
git commit -m "feat(mana): add useManaEconomySummary hook"
```

---

### Task 8: Wire the Mana economy widget into `Scorecard`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `ManaEconomyContent` from `../ManaEconomyContent` (Task 5); `useManaEconomySummary` from `./useManaEconomySummary` (Task 7).

- [ ] **Step 1: Write the failing test (update the existing overview test)**

In `src/app/components/Scorecard/index.test.tsx`, replace this block (currently around line 54-66):

```tsx
expect(screen.getByRole("button", { name: /GCD economy/ })).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Lifebloom discipline/ }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Spell discipline/ }),
).toBeInTheDocument();
for (const label of ["Mana economy", "Death forensics", "Prep hygiene"]) {
  expect(screen.getByText(label)).toBeInTheDocument();
}
expect(screen.getAllByText("Not yet available")).toHaveLength(3);
```

with:

```tsx
expect(screen.getByRole("button", { name: /GCD economy/ })).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Lifebloom discipline/ }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Spell discipline/ }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Mana economy/ }),
).toBeInTheDocument();
for (const label of ["Death forensics", "Prep hygiene"]) {
  expect(screen.getByText(label)).toBeInTheDocument();
}
expect(screen.getAllByText("Not yet available")).toHaveLength(2);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — there is no "Mana economy" button yet (it's still a disabled widget with no `onOpen`, so it doesn't render as a `button`), and only 2 "Not yet available" widgets are expected but 3 currently render.

- [ ] **Step 3: Write the implementation**

In `src/app/components/Scorecard/index.tsx`:

Add two imports alongside the existing content/hook imports (after the `SpellDisciplineContent`/`useSpellDisciplineSummary` imports):

```tsx
import { ManaEconomyContent } from "../ManaEconomyContent";
import { useManaEconomySummary } from "./useManaEconomySummary";
```

Replace the `DISABLED_EPICS` block:

```tsx
const DISABLED_EPICS: { id: EpicId; label: string; icon: string }[] = [
  {
    id: "mana",
    label: "Mana economy",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg",
  },
  {
    id: "death",
    label: "Death forensics",
    icon: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg",
  },
  {
    id: "prep",
    label: "Prep hygiene",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg",
  },
];
```

with:

```tsx
const MANA_ECONOMY_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg";

const DISABLED_EPICS: { id: EpicId; label: string; icon: string }[] = [
  {
    id: "death",
    label: "Death forensics",
    icon: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg",
  },
  {
    id: "prep",
    label: "Prep hygiene",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg",
  },
];
```

Add the hook call after `spellSummary` is computed:

```tsx
const manaSummary = useManaEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

Add a new `Widget` right after the "Spell discipline" `Widget` and before `{DISABLED_EPICS.map(...)}`:

```tsx
<Widget
  icon={MANA_ECONOMY_ICON}
  label="Mana economy"
  onOpen={() => setActiveEpic("mana")}
  judgement={manaSummary.status === "ready" ? manaSummary.judgement : undefined}
  stats={manaSummary.status === "ready" ? manaSummary.stats : undefined}
  note={
    manaSummary.status === "loading"
      ? "Calculating…"
      : manaSummary.status === "error"
        ? manaSummary.error
        : undefined
  }
/>
```

Add a new detail block right after the `activeEpic === "spell"` block and before the closing `<div className={styles.footer}>`:

```tsx
{
  activeEpic === "mana" && (
    <div className={styles.detail}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => setActiveEpic(null)}
      >
        ← All metrics
      </button>
      <div className={styles.epicHeader}>
        <SpellIcon src={MANA_ECONOMY_ICON} />
        <h2 className={styles.epicTitle}>Mana economy</h2>
        {manaSummary.status === "ready" && (
          <JudgementChip judgement={manaSummary.judgement} />
        )}
      </div>
      <ManaEconomyContent
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full Tier 1-3 suite**

Run: `npm test`
Expected: PASS (all tests, including every file created/modified in Tasks 1-8)

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/
git commit -m "feat(mana): wire the mana economy widget into the Scorecard dashboard"
```

---

### Task 9: Record the validated WCL API finding in `docs/testing.md`

**Files:**

- Modify: `docs/testing.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Append the finding to the `4GYHZRdtL3bvhpc8` table row**

In `docs/testing.md`, find the `4GYHZRdtL3bvhpc8` row's cell (it currently ends with `...the basis for story 303's downranking discipline metric matching casts to their direct heal events without needing per-spell ability-ID splits for ticks.`). Append this sentence immediately before the closing `|` of that cell, in the same style as the other "Also validated..." sentences:

```
 Also validated (fight 6, Dassz) that `Casts` events fetched with `includeResources: true` carry a `classResources` array whose `.type` field is actually the *current* resource amount and whose `.amount` field is the *max* pool (cross-checked against `maxResourceAmount` on Dassz's own `Resources`-dataType regen events, and against a warrior in the same fight whose `.amount` read a constant `1000` — WoW's internal 0-1000 rage scale) — and that `resourceActor` on `Casts` events always attaches the source's (caster's) own resource state, while on `Healing` events it always attaches the target's instead — the basis for story 401's mana curve sampling the druid's own mana from `Casts` events only, never `Healing` events.
```

- [ ] **Step 2: Format and verify**

Run: `npm run format`
Run: `npm run format:check`
Expected: no unformatted files reported.

- [ ] **Step 3: Commit**

```bash
git add docs/testing.md
git commit -m "docs: record the classResources/resourceActor finding validated for story 401"
```

---

### Task 10: Close out story 401

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/mana-curve-design.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Mark story 401 done**

In `docs/backlog.md`, change the heading:

```
### 401 — Mana curve & ending mana
```

to:

```
### 401 — Mana curve & ending mana ✅ Done
```

- [ ] **Step 2: Confirm nothing else references the design spec**

Run: `grep -rn "mana-curve-design" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only `docs/backlog.md`'s "Design specs go in..." convention sentence and `docs/plans/mana-curve-plan.md` (this plan) reference the filename pattern generically — no other file names this specific spec. If anything else does, update it before deleting.

- [ ] **Step 3: Delete the design spec**

```bash
rm docs/specs/mana-curve-design.md
```

- [ ] **Step 4: Run full verification**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass, no errors.

Run: `npm test`
Expected: all Tier 1-3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md
git add -A docs/specs/mana-curve-design.md
git commit -m "docs: mark story 401 done and retire its design spec"
```

(Note: `git add -A docs/specs/mana-curve-design.md` stages the deletion — `git rm` would also work equally well here since the file was already removed with `rm`.)

- [ ] **Step 6: Decide next steps with the user**

This plan does not push to a remote or open a PR — stop here and let the user decide how to integrate the work (per the repo's fast-forward-only merge convention). Do not run `git push` or create a PR unless the user explicitly asks.
