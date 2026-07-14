# Story 402 (Consumable Throughput) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "consumable throughput" metric to the mana economy epic — counts of mana
potions and Dark/Demonic Runes used vs. an expected floor for the fight length, judged red/orange/green,
wired into the existing Scorecard UI.

**Architecture:** A pure metric module (`src/metrics/consumableThroughput.ts`) computes the
result from already-fetched `Casts` events, reusing story 401's `extractManaSamples` for the
"mana dropped below 70%" exemption check. A new card component
(`ConsumableThroughputCard`) fetches and renders it, following the exact fetch/render shape
every existing metric card uses. It's mounted inside `ManaEconomyContent` alongside the existing
`ManaCurveCard`, and folded into the mana economy dashboard widget via `epicSummary.ts` and
`useManaEconomySummary.ts`.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library — matches the rest of the repo
(no new dependencies).

## Global Constraints

- No spell/ability IDs hardcoded — consumables are resolved via `resolvedAbilities` (story 007),
  never by literal gameID in application code (test fixtures may use literal IDs since they're
  simulating already-resolved data).
- Every threshold shown in the UI must state its rationale/source inline (principle 3) — see
  `THRESHOLD` text in Task 2.
- Full-project `npm run typecheck && npm run lint && npm run format:check` must pass before each
  commit (enforced by the pre-commit hook — do not bypass it).
- Design spec: `docs/specs/402-consumable-throughput-design.md` — read it before starting; it
  resolves two judgement calls (Dark/Demonic Rune combined into one "Rune" row; no kill
  restriction, unlike 401) that this plan's code depends on.

---

### Task 1: Metric module — `consumableThroughput.ts`

**Files:**

- Create: `src/metrics/consumableThroughput.ts`
- Test: `src/metrics/consumableThroughput.test.ts`

**Interfaces:**

- Consumes: `extractManaSamples(castEvents, druidId): ManaSample[]` from
  `src/metrics/manaSamples.ts` (existing, unchanged); `worstJudgement` and `Judgement` from
  `src/metrics/judgement.ts` (existing, unchanged); `ResolvedAbility` from
  `src/abilities/resolveAbilities.ts` (existing, unchanged — `{ kind: "consumable"; item:
"Mana Potion" | "Dark Rune" | "Demonic Rune" }` is the relevant variant).
- Produces: `computeConsumableThroughput(castEvents, druidId, resolvedAbilities,
fightDurationMs): ConsumableThroughputResult`, `ConsumableThroughputResult { exempt: boolean;
rows: ConsumableRow[]; judgement: Judgement | null }`, `ConsumableRow { label: "Mana Potion" |
"Rune"; used: number; expectedFloor: number; judgement: Judgement }` — all consumed by Task 2
  (card) and Task 4/5 (summary).

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/consumableThroughput.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeConsumableThroughput } from "./consumableThroughput";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const MANA_POTION_ID = 17531;
const DARK_RUNE_ID = 20520;
const DEMONIC_RUNE_ID = 20521;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [MANA_POTION_ID, { kind: "consumable", item: "Mana Potion" }],
  [DARK_RUNE_ID, { kind: "consumable", item: "Dark Rune" }],
  [DEMONIC_RUNE_ID, { kind: "consumable", item: "Demonic Rune" }],
]);

function aManaSampleEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

function aConsumableCastEvent(
  timestamp: number,
  abilityGameID: number,
  sourceID = DRUID_ID,
) {
  return aCastEvent({
    timestamp,
    sourceID,
    abilityGameID,
    targetID: sourceID,
  });
}

const LOW_MANA_SAMPLE = aManaSampleEvent(500, 6000); // 60% — below the 70% threshold

describe("computeConsumableThroughput", () => {
  it("is exempt with no rows or judgement when mana never drops below 70%", () => {
    const events = [aManaSampleEvent(500, 8000)]; // 80%, never below 70%
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      300_000,
    );
    expect(result).toEqual({ exempt: true, rows: [], judgement: null });
  });

  it("computes the floor as fight duration / 120s, floored", () => {
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        120_000,
      ).rows[0].expectedFloor,
    ).toBe(1);
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        119_999,
      ).rows[0].expectedFloor,
    ).toBe(0);
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        241_000,
      ).rows[0].expectedFloor,
    ).toBe(2);
  });

  it("counts Dark Rune and Demonic Rune together as one Rune row", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, DARK_RUNE_ID),
      aConsumableCastEvent(2000, DEMONIC_RUNE_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      120_000,
    );
    const runeRow = result.rows.find((row) => row.label === "Rune");
    expect(runeRow?.used).toBe(2);
    expect(result.rows).toHaveLength(2); // Mana Potion + Rune, never 3
  });

  it("judges green when used meets or exceeds the floor", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
      aConsumableCastEvent(3000, MANA_POTION_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3
    );
    expect(result.rows.find((row) => row.label === "Mana Potion")).toEqual({
      label: "Mana Potion",
      used: 3,
      expectedFloor: 3,
      judgement: "green",
    });
  });

  it("judges orange when used is exactly one below the floor", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3
    );
    expect(
      result.rows.find((row) => row.label === "Mana Potion")?.judgement,
    ).toBe("orange");
  });

  it("judges red when used is two or more below the floor", () => {
    const result = computeConsumableThroughput(
      [LOW_MANA_SAMPLE],
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3, 0 used
    );
    expect(
      result.rows.find((row) => row.label === "Mana Potion")?.judgement,
    ).toBe("red");
    expect(result.rows.find((row) => row.label === "Rune")?.judgement).toBe(
      "red",
    );
  });

  it("takes the fight-level judgement as the worst of both rows", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
      aConsumableCastEvent(3000, MANA_POTION_ID),
    ]; // potions green (3/3), runes red (0/3)
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000,
    );
    expect(result.judgement).toBe("red");
  });

  it("judges normally on what would be a wipe — there is no kill restriction", () => {
    // The function takes no kill/outcome flag at all, unlike computeManaCurve — this
    // test documents that omission is deliberate (docs/backlog.md story 402 has no
    // kill restriction, unlike 401's). Meeting the floor on both consumables still
    // yields a real green judgement, not an informational/null one.
    const result = computeConsumableThroughput(
      [
        LOW_MANA_SAMPLE,
        aConsumableCastEvent(1000, MANA_POTION_ID),
        aConsumableCastEvent(2000, MANA_POTION_ID),
        aConsumableCastEvent(3000, MANA_POTION_ID),
        aConsumableCastEvent(4000, DARK_RUNE_ID),
        aConsumableCastEvent(5000, DEMONIC_RUNE_ID),
        aConsumableCastEvent(6000, DARK_RUNE_ID),
      ],
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000,
    );
    expect(result.judgement).toBe("green");
  });

  it("ignores casts from other players and non-consumable abilities", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID, 99), // different source
      aCastEvent({ timestamp: 2000, sourceID: DRUID_ID, abilityGameID: 33763 }), // Lifebloom
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      120_000,
    );
    expect(result.rows.every((row) => row.used === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/consumableThroughput.test.ts`
Expected: FAIL — `Cannot find module './consumableThroughput'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/metrics/consumableThroughput.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import { extractManaSamples } from "./manaSamples";

// Backlog story 402: expected floor = fight duration / 120s (each consumable's own
// cooldown), for fights where mana dropped below 70% at any point; fights that never
// did are exempt. Dark Rune and Demonic Rune share one in-game cooldown (using either
// puts both on cooldown), so they're counted together as one "Rune" row rather than
// judged separately — see docs/specs/402-consumable-throughput-design.md's judgement
// call 1.
const FLOOR_INTERVAL_MS = 120_000;
const MANA_DROP_THRESHOLD_PCT = 70;

export type ConsumableLabel = "Mana Potion" | "Rune";

export interface ConsumableRow {
  label: ConsumableLabel;
  used: number;
  expectedFloor: number;
  judgement: Judgement;
}

export interface ConsumableThroughputResult {
  exempt: boolean; // mana never dropped below 70% — informational only, no rows
  rows: ConsumableRow[];
  judgement: Judgement | null; // null when exempt
}

// Green >= floor, orange = floor - 1, red <= floor - 2, per docs/backlog.md story 402.
function judgeAgainstFloor(used: number, floor: number): Judgement {
  if (used >= floor) return "green";
  if (used === floor - 1) return "orange";
  return "red";
}

export function computeConsumableThroughput(
  castEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fightDurationMs: number,
): ConsumableThroughputResult {
  const manaSamples = extractManaSamples(castEvents, druidId);
  const droppedBelowThreshold = manaSamples.some(
    (sample) =>
      (sample.currentMana / sample.maxMana) * 100 < MANA_DROP_THRESHOLD_PCT,
  );

  if (!droppedBelowThreshold) {
    return { exempt: true, rows: [], judgement: null };
  }

  const floor = Math.floor(fightDurationMs / FLOOR_INTERVAL_MS);

  let potionCount = 0;
  let runeCount = 0;
  for (const event of castEvents) {
    if (event.sourceID !== druidId || event.type !== "cast") continue;
    if (event.abilityGameID === undefined) continue;
    const ability = resolvedAbilities.get(event.abilityGameID);
    if (!ability || ability.kind !== "consumable") continue;
    if (ability.item === "Mana Potion") potionCount++;
    else runeCount++; // Dark Rune or Demonic Rune — shared cooldown, one bucket
  }

  const rows: ConsumableRow[] = [
    {
      label: "Mana Potion",
      used: potionCount,
      expectedFloor: floor,
      judgement: judgeAgainstFloor(potionCount, floor),
    },
    {
      label: "Rune",
      used: runeCount,
      expectedFloor: floor,
      judgement: judgeAgainstFloor(runeCount, floor),
    },
  ];

  return {
    exempt: false,
    rows,
    judgement: worstJudgement(rows.map((row) => row.judgement)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/consumableThroughput.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/metrics/consumableThroughput.ts src/metrics/consumableThroughput.test.ts
git commit -m "feat(mana): add consumable throughput metric module"
```

---

### Task 2: `ConsumableThroughputCard` component

**Files:**

- Create: `src/app/components/ConsumableThroughputCard/index.tsx`
- Test: `src/app/components/ConsumableThroughputCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeConsumableThroughput` and `ConsumableThroughputResult` from Task 1;
  `MetricCard` (`src/app/components/ui/MetricCard`, existing, props `icon?, title, value?,
judgement?: Judgement | null, note?: string, threshold, children?`); `DataTable` (existing,
  props `columns: string[], rows: ReactNode[][]`); `JudgementChip` (existing, props `judgement:
Judgement`); `Fight` from `src/wcl/client.ts`; `WclEvent`/`WclEventDataType` from
  `src/wcl/events.ts`; `EventFetcherFight` from `src/wcl/eventCache.ts`; `ResolvedAbility` from
  `src/abilities/resolveAbilities.ts`.
- Produces: `ConsumableThroughputCard` React component, `ConsumableThroughputCardProps` — both
  consumed by Task 3 (`ManaEconomyContent`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/ConsumableThroughputCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumableThroughputCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";

const DRUID_ID = 2;
const MANA_POTION_ID = 17531;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [MANA_POTION_ID, { kind: "consumable", item: "Mana Potion" }],
]);

function aManaSampleEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("ConsumableThroughputCard", () => {
  it("renders a table row per consumable with its judgement chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 }); // floor 3
    const events = [
      aManaSampleEvent(500, 6000), // 60% — triggers judging
      aCastEvent({
        timestamp: 1000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
      aCastEvent({
        timestamp: 2000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
      aCastEvent({
        timestamp: 3000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
    expect(screen.getByText("Rune")).toBeInTheDocument();
    // "Red" appears twice: the card's own header chip (fight-level judgement is the
    // worst-of, which is red because of the 0/3 rune row) plus the rune row's own chip.
    expect(screen.getAllByText("Green")).toHaveLength(1); // potions row, 3/3
    expect(screen.getAllByText("Red")).toHaveLength(2); // header chip + rune row, 0/3
  });

  it("shows an informational note instead of a table when mana never drops below 70%", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const events = [aManaSampleEvent(500, 9000)]; // 90%, never below 70%
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Informational — mana never dropped below 70%"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Mana Potion")).not.toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
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

Run: `npx vitest run src/app/components/ConsumableThroughputCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'` (the component doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ConsumableThroughputCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeConsumableThroughput,
  type ConsumableThroughputResult,
} from "../../../metrics/consumableThroughput";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { JudgementChip } from "../ui/JudgementChip";

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_sealofkings.jpg";

const THRESHOLD =
  "Expected floor per consumable = ⌊fight duration / 120s⌋, for fights where mana dropped below 70% at any point (fights that never did are exempt). Green ≥ floor, orange = floor − 1, red ≤ floor − 2. Dark Rune and Demonic Rune share one in-game cooldown, so they're counted together as one Rune row rather than judged separately.";

export interface ConsumableThroughputCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: ConsumableThroughputResult }
  | { accessToken: string; error: string };

export function ConsumableThroughputCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: ConsumableThroughputCardProps) {
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
        const computed = computeConsumableThroughput(
          events,
          druidId,
          resolvedAbilities,
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
              : "Failed to calculate consumable throughput.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    resolvedAbilities,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Consumable throughput"
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
        title="Consumable throughput"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { exempt, rows, judgement } = result.result;

  if (exempt) {
    return (
      <MetricCard
        icon={ICON}
        title="Consumable throughput"
        note="Informational — mana never dropped below 70%"
        threshold={THRESHOLD}
      >
        <p>
          Mana never dropped below 70% this fight, so no consumable floor
          applies.
        </p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Consumable throughput"
      judgement={judgement}
      threshold={THRESHOLD}
    >
      <DataTable
        columns={["Consumable", "Used", "Expected floor", "Judgement"]}
        rows={rows.map((row) => [
          row.label,
          `${row.used}`,
          `${row.expectedFloor}`,
          <JudgementChip judgement={row.judgement} />,
        ])}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/ConsumableThroughputCard/index.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/app/components/ConsumableThroughputCard/
git commit -m "feat(mana): add ConsumableThroughputCard component"
```

---

### Task 3: Wire `ConsumableThroughputCard` into `ManaEconomyContent`

**Files:**

- Modify: `src/app/components/ManaEconomyContent/index.tsx`
- Modify: `src/app/components/ManaEconomyContent/index.test.tsx`

**Interfaces:**

- Consumes: `ConsumableThroughputCard` from Task 2.
- Produces: `ManaEconomyContent` now requires a `resolvedAbilities: Map<number,
ResolvedAbility>` prop — consumed by Task 6 (`Scorecard/index.tsx`).

- [ ] **Step 1: Update the test to expect both cards**

Replace the contents of `src/app/components/ManaEconomyContent/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaEconomyContent } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("ManaEconomyContent", () => {
  it("renders the mana curve and consumable throughput cards", async () => {
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
        resolvedAbilities={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: FAIL — TypeScript error / missing prop `resolvedAbilities`, and the "Consumable
throughput" heading isn't found because the card isn't mounted yet.

- [ ] **Step 3: Update the component**

Replace the contents of `src/app/components/ManaEconomyContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { ManaCurveCard } from "../ManaCurveCard";
import { ConsumableThroughputCard } from "../ConsumableThroughputCard";
import styles from "./index.module.css";

export interface ManaEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
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
  resolvedAbilities,
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
      <ConsumableThroughputCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: fails at typecheck until Task 6 updates `Scorecard/index.tsx`'s call site — **skip
this step's commit for now and continue to Task 4**; `ManaEconomyContent`'s only caller
(`Scorecard/index.tsx`) is fixed in Task 6. Do not commit Task 3 in isolation.

---

### Task 4: Fold consumable throughput into the mana economy dashboard summary

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`

**Interfaces:**

- Consumes: `ConsumableThroughputResult` from Task 1.
- Produces: `summarizeManaEconomy(manaCurve: ManaCurveResult, consumableThroughput:
ConsumableThroughputResult): EpicSummary` (signature change — second parameter added) —
  consumed by Task 5 (`useManaEconomySummary`).

- [ ] **Step 1: Update the failing tests**

In `src/metrics/epicSummary.test.ts`, add the import and replace the `summarizeManaEconomy`
describe block:

```ts
import type { ConsumableThroughputResult } from "./consumableThroughput";
```

(add this alongside the other `import type` lines near the top of the file)

Replace the existing `describe("summarizeManaEconomy", ...)` block with:

```ts
describe("summarizeManaEconomy", () => {
  const EXEMPT_CONSUMABLES: ConsumableThroughputResult = {
    exempt: true,
    rows: [],
    judgement: null,
  };

  it("reports the mana curve's own judgement and ending mana stat when consumables are exempt", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    expect(summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES)).toEqual({
      judgement: "green",
      stats: ["Ending mana: 20%", "Consumables: not mana-constrained"],
    });
  });

  it("reports a no-data stat and defaults to green when there are no samples", () => {
    const manaCurve: ManaCurveResult = {
      points: [],
      endingPct: null,
      judgement: null,
    };
    expect(summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES)).toEqual({
      judgement: "green",
      stats: ["Ending mana: no data", "Consumables: not mana-constrained"],
    });
  });

  it("formats the potion/rune stat line and takes the worst-of judgement", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    const consumableThroughput: ConsumableThroughputResult = {
      exempt: false,
      rows: [
        {
          label: "Mana Potion",
          used: 2,
          expectedFloor: 2,
          judgement: "green",
        },
        { label: "Rune", used: 0, expectedFloor: 1, judgement: "red" },
      ],
      judgement: "red",
    };
    expect(summarizeManaEconomy(manaCurve, consumableThroughput)).toEqual({
      judgement: "red",
      stats: ["Ending mana: 20%", "Potions: 2/2, Runes: 0/1"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — TypeScript error, `summarizeManaEconomy` expects 1 argument but got 2.

- [ ] **Step 3: Update the implementation**

In `src/metrics/epicSummary.ts`, add the import (alongside the other `import type` lines near
the top):

```ts
import type { ConsumableThroughputResult } from "./consumableThroughput";
```

Replace the existing `summarizeManaEconomy` function:

```ts
export function summarizeManaEconomy(
  manaCurve: ManaCurveResult,
  consumableThroughput: ConsumableThroughputResult,
): EpicSummary {
  const consumablesStat = consumableThroughput.exempt
    ? "Consumables: not mana-constrained"
    : consumableThroughput.rows
        .map(
          (row) =>
            `${row.label === "Mana Potion" ? "Potions" : "Runes"}: ${row.used}/${row.expectedFloor}`,
        )
        .join(", ");

  return {
    judgement: worstJudgement([
      manaCurve.judgement,
      consumableThroughput.judgement,
    ]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
      consumablesStat,
    ],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS (all tests in the file, including the unrelated `describe` blocks above it).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck` — expected to still fail at `useManaEconomySummary.ts`'s call site
(fixed next in Task 5). **Skip this step's commit for now and continue to Task 5.**

---

### Task 5: Compute consumable throughput in the mana economy summary hook

**Files:**

- Modify: `src/app/components/Scorecard/useManaEconomySummary.ts`
- Modify: `src/app/components/Scorecard/useManaEconomySummary.test.ts`

**Interfaces:**

- Consumes: `computeConsumableThroughput` from Task 1, updated `summarizeManaEconomy` from Task 4.
- Produces: `useManaEconomySummary` now requires a `resolvedAbilities: Map<number,
ResolvedAbility>` parameter (inserted before `fetchEvents`, matching
  `useSpellDisciplineSummary`'s existing parameter order) — consumed by Task 6
  (`Scorecard/index.tsx`).

- [ ] **Step 1: Update the failing tests**

Replace the contents of `src/app/components/Scorecard/useManaEconomySummary.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("useManaEconomySummary", () => {
  it("starts loading, then reports the worst-of judgement and both stat lines", async () => {
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
        new Map(),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Mana at 20% is below the 70% threshold, so consumables are judged: floor =
    // 120_000/120_000 = 1, 0 potions and 0 runes used -> both rows orange (one below
    // floor), which is the worst-of against the mana curve's own "green".
    expect(result.current).toEqual({
      status: "ready",
      judgement: "orange",
      stats: ["Ending mana: 20%", "Potions: 0/1, Runes: 0/1"],
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
        new Map(),
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: FAIL — TypeScript error (extra argument) and the first test's `judgement`/`stats`
assertions don't match the current single-metric output.

- [ ] **Step 3: Update the implementation**

Replace the contents of `src/app/components/Scorecard/useManaEconomySummary.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeManaCurve } from "../../../metrics/manaCurve";
import { computeConsumableThroughput } from "../../../metrics/consumableThroughput";
import { summarizeManaEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useManaEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
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
        const consumableThroughput = computeConsumableThroughput(
          events,
          druidId,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeManaEconomy(manaCurve, consumableThroughput),
          },
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
    resolvedAbilities,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full static analysis** (still expected to fail)

Run: `npm run typecheck`
Expected: fails only at `Scorecard/index.tsx`'s two call sites (`useManaEconomySummary(...)` and
`<ManaEconomyContent ... />`), fixed next in Task 6. **Skip this step's commit for now and
continue to Task 6.**

---

### Task 6: Wire `resolvedAbilities` through `Scorecard/index.tsx`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`

**Interfaces:**

- Consumes: updated `useManaEconomySummary` (Task 5) and `ManaEconomyContent` (Task 3).
  `resolvedAbilities` is already a `ScorecardProps` field (used by `SpellDisciplineContent`
  already) — no new prop is added to `Scorecard` itself.

- [ ] **Step 1: Update the `useManaEconomySummary` call site**

In `src/app/components/Scorecard/index.tsx`, find:

```ts
const manaSummary = useManaEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

Replace with:

```ts
const manaSummary = useManaEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
);
```

- [ ] **Step 2: Update the `ManaEconomyContent` render call site**

In the same file, find:

```tsx
<ManaEconomyContent
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  fetchEvents={fetchEvents}
/>
```

Replace with:

```tsx
<ManaEconomyContent
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  resolvedAbilities={resolvedAbilities}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file, including `Scorecard/index.test.tsx` (its `fetchEvents` mocks
return `[]` or unrelated Lifebloom events regardless of `dataType`, and it asserts widget
presence/labels rather than exact mana-economy stat text, so it's unaffected by this change).

- [ ] **Step 4: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors — this is also the point where Tasks 3, 4, and 5's
previously-skipped commits land together with this one.

```bash
git add src/app/components/ManaEconomyContent/ src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts src/app/components/Scorecard/useManaEconomySummary.ts src/app/components/Scorecard/useManaEconomySummary.test.ts src/app/components/Scorecard/index.tsx
git commit -m "feat(mana): wire consumable throughput into the mana economy widget"
```

---

### Task 7: Paperwork — retire the spec/plan, mark 402 done

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/402-consumable-throughput-design.md`
- Delete: `docs/plans/402-consumable-throughput-plan.md`
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Mark story 402 done in the backlog**

In `docs/backlog.md`, find the heading:

```md
### 402 — Consumable throughput
```

Replace with:

```md
### 402 — Consumable throughput ✅ Done
```

- [ ] **Step 2: Confirm nothing else references the spec/plan paths**

Run: `grep -rn "402-consumable-throughput" --include='*.md' .`
Expected: only `docs/backlog.md`'s own line (if any) and the two files about to be deleted — no
other doc links to them.

- [ ] **Step 3: Delete the spec and plan**

```bash
git rm docs/specs/402-consumable-throughput-design.md docs/plans/402-consumable-throughput-plan.md
```

- [ ] **Step 4: Update `CLAUDE.md`'s Repo state paragraph**

In `CLAUDE.md`, find the sentence:

```
Epic E (mana economy) has story 401 (mana curve & ending mana) done; stories 402-404 remain.
```

Replace with:

```
Epic E (mana economy) has stories 401 (mana curve & ending mana) and 402 (consumable throughput) done; stories 403-404 remain.
```

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 402 done, retire its design spec and plan"
```
