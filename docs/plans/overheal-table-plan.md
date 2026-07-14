# HoT-aware overheal table (story 404) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-spell overheal table (backlog story 404) to the Mana Economy epic, judging
Lifebloom blooms and direct heals against strict thresholds while showing HoT-tick overheal as
lenient, informational-only context.

**Architecture:** A new pure-logic metrics module (`src/metrics/overhealTable.ts`) classifies
each of the druid's `heal` events into one of six spell/portion rows (by resolved spell name
and the event's `tick` flag), sums amount/overheal per row, and judges Bloom/Direct rows against
their own thresholds. A new presentational card (`OverhealTableCard`) fetches `Healing` events
and renders the result as a `DataTable`, following the exact same fetch/loading/error shape as
the existing `DownrankingDisciplineCard`/`ConsumableThroughputCard`. The card is wired into
`ManaEconomyContent` (full detail view) and its judgement is folded into
`useManaEconomySummary`/`epicSummary.summarizeManaEconomy` (dashboard widget worst-of).

**Tech Stack:** TypeScript, React 19, Vitest, React Testing Library. No new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded — this module reads spell identity from the existing
  `resolvedAbilities: Map<number, ResolvedAbility>` (per `CLAUDE.md` / backlog story 007), the
  same lookup `src/metrics/downrankingDiscipline.ts` already uses.
- Bloom overheal judged green < 40%, orange 40–70%, red > 70% (backlog story 404).
- Direct heal overheal (Regrowth direct, Healing Touch, Swiftmend) judged green < 30%, orange
  30–50%, red > 50% (backlog story 404).
- HoT-tick rows (Rejuvenation, Regrowth's HoT portion) carry no judgement — informational only.
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) must pass
  full-project before every commit (pre-commit hook enforces this already — don't bypass it).
- Every new/changed file follows `docs/testing.md`'s tiers: pure logic → Tier 1
  (`*.test.ts`, co-located), React component → Tier 3 (`*.test.tsx`, co-located, React Testing
  Library, fake data via props).

---

## File Structure

| File                                                                       | Responsibility                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/metrics/overhealTable.ts`                                             | Pure computation: classify heal events into rows, sum, judge. **Create.**                                                       |
| `src/metrics/overhealTable.test.ts`                                        | Tier 1 tests for the above. **Create.**                                                                                         |
| `src/app/components/OverhealTableCard/index.tsx`                           | Fetches `Healing` events, renders `MetricCard` + `DataTable`. **Create.**                                                       |
| `src/app/components/OverhealTableCard/index.test.tsx`                      | Tier 3 tests for the above. **Create.**                                                                                         |
| `src/app/components/ManaEconomyContent/index.tsx`                          | Add `OverhealTableCard` as a third card. **Modify.**                                                                            |
| `src/app/components/ManaEconomyContent/index.test.tsx`                     | Assert the third card renders. **Modify.**                                                                                      |
| `src/app/components/Scorecard/useManaEconomySummary.ts`                    | Fetch `Healing` events too; fold overheal judgement into the widget's worst-of. **Modify.**                                     |
| `src/app/components/Scorecard/useManaEconomySummary.test.ts`               | Cover the new fetch/judgement. **Modify.**                                                                                      |
| `src/metrics/epicSummary.ts`                                               | `summarizeManaEconomy` takes a third `OverhealTableResult` argument. **Modify.**                                                |
| `src/metrics/epicSummary.test.ts`                                          | Update all `summarizeManaEconomy` calls/expectations for the new argument. **Modify.**                                          |
| `docs/backlog.md`                                                          | Mark story 404 `✅ Done`; update the "Repo state" epic-E line. **Modify (final task).**                                         |
| `CLAUDE.md`                                                                | Update the "Repo state" paragraph's story list. **Modify (final task).**                                                        |
| `docs/specs/overheal-table-design.md`, `docs/plans/overheal-table-plan.md` | Retired (deleted) once shipped, per `CLAUDE.md`'s "a story isn't done until its paperwork is retired." **Delete (final task).** |

---

## Task 1: `overhealTable.ts` metrics module

**Files:**

- Create: `src/metrics/overhealTable.ts`
- Test: `src/metrics/overhealTable.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts` — has `type`, `sourceID`, `targetID`,
  `abilityGameID`, `amount`, `overheal`, `tick`), `ResolvedAbility` / `DruidHealingSpell`
  (`src/abilities/resolveAbilities.ts`), `Judgement`, `judgeThresholdBelow`, `worstJudgement`
  (`src/metrics/judgement.ts`).
- Produces: `OverhealCategory = "hot-tick" | "bloom" | "direct"`, `OverhealRow { category:
OverhealCategory; spell: string; amount: number; overheal: number; overhealPct: number;
judgement: Judgement | null }`, `OverhealTableResult { rows: OverhealRow[]; judgement:
Judgement }`, `computeOverhealTable(healingEvents: WclEvent[], druidId: number,
resolvedAbilities: Map<number, ResolvedAbility>): OverhealTableResult`. Task 2 (the card) and
  Task 4 (`useManaEconomySummary`/`epicSummary`) both import these exact names.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/overhealTable.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeOverhealTable } from "./overhealTable";
import { aHealEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
  [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
]);

describe("computeOverhealTable", () => {
  it("returns no rows and a green judgement with no events", () => {
    const result = computeOverhealTable([], DRUID_ID, RESOLVED_ABILITIES);
    expect(result).toEqual({ rows: [], judgement: "green" });
  });

  it("aggregates Rejuvenation's periodic ticks into one informational hot-tick row", () => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 3627,
        amount: 300,
        overheal: 200,
        tick: true,
      }),
      aHealEvent({
        abilityGameID: 3627,
        amount: 300,
        overheal: 200,
        tick: true,
      }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "hot-tick",
        spell: "Rejuvenation",
        amount: 600,
        overheal: 400,
        overhealPct: 40,
        judgement: null,
      },
    ]);
    expect(result.judgement).toBe("green");
  });

  it("splits Regrowth into a hot-tick row (ticks) and a direct row (the non-tick heal)", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 26980, amount: 780, overheal: 220 }), // direct
      aHealEvent({
        abilityGameID: 26980,
        amount: 390,
        overheal: 610,
        tick: true,
      }), // HoT portion
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "hot-tick",
        spell: "Regrowth (HoT portion)",
        amount: 390,
        overheal: 610,
        overhealPct: 61,
        judgement: null,
      },
      {
        category: "direct",
        spell: "Regrowth (direct)",
        amount: 780,
        overheal: 220,
        overhealPct: 22,
        judgement: "green",
      },
    ]);
  });

  it("counts only Lifebloom's non-tick bloom event, ignoring its periodic ticks entirely", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }), // bloom
      aHealEvent({
        abilityGameID: 33763,
        amount: 50,
        overheal: 950,
        tick: true,
      }), // periodic tick, not reported
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "bloom",
        spell: "Lifebloom",
        amount: 670,
        overheal: 330,
        overhealPct: 33,
        judgement: "green",
      },
    ]);
  });

  it("reports Healing Touch and Swiftmend as direct rows", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 9758, amount: 420, overheal: 580 }),
      aHealEvent({ abilityGameID: 18562, amount: 810, overheal: 190 }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "direct",
        spell: "Healing Touch",
        amount: 420,
        overheal: 580,
        overhealPct: 58,
        judgement: "red",
      },
      {
        category: "direct",
        spell: "Swiftmend",
        amount: 810,
        overheal: 190,
        overhealPct: 19,
        judgement: "green",
      },
    ]);
  });

  it.each([
    { overhealPct: 39, expected: "green" },
    { overhealPct: 40, expected: "orange" },
    { overhealPct: 70, expected: "orange" },
    { overhealPct: 71, expected: "red" },
  ])(
    "judges a Bloom row at $overhealPct% overheal as $expected",
    ({ overhealPct, expected }) => {
      const healingEvents = [
        aHealEvent({
          abilityGameID: 33763,
          amount: 100 - overhealPct,
          overheal: overhealPct,
        }),
      ];

      const result = computeOverhealTable(
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.rows[0].judgement).toBe(expected);
    },
  );

  it.each([
    { overhealPct: 29, expected: "green" },
    { overhealPct: 30, expected: "orange" },
    { overhealPct: 50, expected: "orange" },
    { overhealPct: 51, expected: "red" },
  ])(
    "judges a Direct row at $overhealPct% overheal as $expected",
    ({ overhealPct, expected }) => {
      const healingEvents = [
        aHealEvent({
          abilityGameID: 18562,
          amount: 100 - overhealPct,
          overheal: overhealPct,
        }),
      ];

      const result = computeOverhealTable(
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.rows[0].judgement).toBe(expected);
    },
  );

  it("sorts rows HoT tick, then Bloom, then Direct, regardless of input order", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 18562, amount: 100, overheal: 0 }), // Swiftmend (direct)
      aHealEvent({ abilityGameID: 33763, amount: 100, overheal: 0 }), // Lifebloom (bloom)
      aHealEvent({
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }), // Rejuvenation (hot-tick)
      aHealEvent({ abilityGameID: 9758, amount: 100, overheal: 0 }), // Healing Touch (direct)
      aHealEvent({
        abilityGameID: 26980,
        amount: 100,
        overheal: 0,
        tick: true,
      }), // Regrowth HoT (hot-tick)
      aHealEvent({ abilityGameID: 26980, amount: 100, overheal: 0 }), // Regrowth direct (direct)
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows.map((row) => row.spell)).toEqual([
      "Rejuvenation",
      "Regrowth (HoT portion)",
      "Lifebloom",
      "Regrowth (direct)",
      "Healing Touch",
      "Swiftmend",
    ]);
  });

  it("takes the worst-of judgement across Bloom and Direct rows only, ignoring HoT-tick rows", () => {
    const healingEvents = [
      // Rejuvenation at 90% overheal — informational, must not turn this red.
      aHealEvent({
        abilityGameID: 3627,
        amount: 10,
        overheal: 90,
        tick: true,
      }),
      // Lifebloom bloom at 33% — green.
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
      // Swiftmend at 60% — red.
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.judgement).toBe("red");
  });

  it("ignores heal events from other sources and from untracked spells", () => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 26980,
        amount: 100,
        overheal: 0,
        sourceID: 99,
      }),
      aHealEvent({ abilityGameID: 17116, amount: 100, overheal: 0 }), // Nature's Swiftness has no heal of its own; treat as untracked
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/overhealTable.test.ts`
Expected: FAIL — `Cannot find module './overhealTable'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `src/metrics/overhealTable.ts`**

```typescript
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow, worstJudgement } from "./judgement";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

export type OverhealCategory = "hot-tick" | "bloom" | "direct";

export interface OverhealRow {
  category: OverhealCategory;
  spell: string;
  amount: number;
  overheal: number;
  overhealPct: number;
  judgement: Judgement | null;
}

export interface OverhealTableResult {
  rows: OverhealRow[];
  judgement: Judgement;
}

// Bloom overheal per docs/backlog.md story 404: green < 40%, orange 40-70%, red > 70%.
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 40, orangeMax: 70 });
}

// Direct heal overheal per docs/backlog.md story 404: green < 30%, orange 30-50%, red > 50%.
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 });
}

// Fixed row identity: which category a spell/portion belongs to, its display label, and
// (for Bloom/Direct) its judging function. HoT-tick rows have no judging function -- they're
// informational only, since high overheal is inherent to a HoT ticking on already-topped
// targets. Order here is also the table's fixed row order (HoT tick, then Bloom, then Direct),
// matching docs/design_v2/source/epic-e.jsx's reference layout.
interface RowSpec {
  category: OverhealCategory;
  spell: string;
  judge: ((overhealPct: number) => Judgement) | null;
}

const REJUVENATION_TICK: RowSpec = {
  category: "hot-tick",
  spell: "Rejuvenation",
  judge: null,
};
const REGROWTH_TICK: RowSpec = {
  category: "hot-tick",
  spell: "Regrowth (HoT portion)",
  judge: null,
};
const LIFEBLOOM_BLOOM: RowSpec = {
  category: "bloom",
  spell: "Lifebloom",
  judge: judgeBloomOverheal,
};
const REGROWTH_DIRECT: RowSpec = {
  category: "direct",
  spell: "Regrowth (direct)",
  judge: judgeDirectOverheal,
};
const HEALING_TOUCH: RowSpec = {
  category: "direct",
  spell: "Healing Touch",
  judge: judgeDirectOverheal,
};
const SWIFTMEND: RowSpec = {
  category: "direct",
  spell: "Swiftmend",
  judge: judgeDirectOverheal,
};

const ROW_ORDER: RowSpec[] = [
  REJUVENATION_TICK,
  REGROWTH_TICK,
  LIFEBLOOM_BLOOM,
  REGROWTH_DIRECT,
  HEALING_TOUCH,
  SWIFTMEND,
];

// Classifies one heal event into its RowSpec, or null if it's out of scope for this table
// (Nature's Swiftness/Innervate/Tranquility heals, or a Lifebloom periodic tick -- which isn't
// reported as its own row per the design reference).
function classify(
  spell: ResolvedAbility & { kind: "spell" },
  tick: boolean,
): RowSpec | null {
  switch (spell.spell) {
    case "Rejuvenation":
      // Rejuvenation is a pure HoT -- in practice every one of its heal events carries
      // tick: true, but filter explicitly rather than assuming, for consistency with
      // every other spell's classification below.
      return tick ? REJUVENATION_TICK : null;
    case "Regrowth":
      return tick ? REGROWTH_TICK : REGROWTH_DIRECT;
    case "Lifebloom":
      return tick ? null : LIFEBLOOM_BLOOM;
    case "Healing Touch":
      return HEALING_TOUCH;
    case "Swiftmend":
      return SWIFTMEND;
    default:
      return null;
  }
}

interface Accumulator {
  amount: number;
  overheal: number;
}

export function computeOverhealTable(
  healingEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): OverhealTableResult {
  const totals = new Map<RowSpec, Accumulator>();

  for (const event of healingEvents) {
    if (event.type !== "heal") continue;
    if (event.sourceID !== druidId) continue;
    if (event.targetID === undefined) continue;
    if (event.abilityGameID === undefined) continue;

    const resolved = resolvedAbilities.get(event.abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;

    const rowSpec = classify(resolved, event.tick === true);
    if (rowSpec === null) continue;

    const existing = totals.get(rowSpec) ?? { amount: 0, overheal: 0 };
    existing.amount += typeof event.amount === "number" ? event.amount : 0;
    existing.overheal +=
      typeof event.overheal === "number" ? event.overheal : 0;
    totals.set(rowSpec, existing);
  }

  const rows: OverhealRow[] = [];
  for (const rowSpec of ROW_ORDER) {
    const totalsForRow = totals.get(rowSpec);
    if (totalsForRow === undefined) continue;

    const total = totalsForRow.amount + totalsForRow.overheal;
    const overhealPct =
      total === 0 ? 0 : Math.round((totalsForRow.overheal / total) * 100);

    rows.push({
      category: rowSpec.category,
      spell: rowSpec.spell,
      amount: totalsForRow.amount,
      overheal: totalsForRow.overheal,
      overhealPct,
      judgement: rowSpec.judge === null ? null : rowSpec.judge(overhealPct),
    });
  }

  return {
    rows,
    judgement: worstJudgement(rows.map((row) => row.judgement)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/overhealTable.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/overhealTable.ts src/metrics/overhealTable.test.ts
git commit -m "feat(mana): add HoT-aware overheal table metric module"
```

---

## Task 2: `OverhealTableCard` component

**Files:**

- Create: `src/app/components/OverhealTableCard/index.tsx`
- Test: `src/app/components/OverhealTableCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeOverhealTable`, `OverhealTableResult` (Task 1); `MetricCard`
  (`../ui/MetricCard`), `DataTable` (`../ui/DataTable`), `JudgementChip` (`../ui/JudgementChip`);
  `Fight` (`../../../wcl/client`), `WclEvent`/`WclEventDataType` (`../../../wcl/events`),
  `EventFetcherFight` (`../../../wcl/eventCache`), `ResolvedAbility`
  (`../../../abilities/resolveAbilities`) — same prop shape as
  `src/app/components/DownrankingDisciplineCard/index.tsx`.
- Produces: `OverhealTableCard` (React component), `OverhealTableCardProps` — Task 3
  (`ManaEconomyContent`) renders this with `{ accessToken, reportCode, fight, druidId,
resolvedAbilities, fetchEvents }`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/OverhealTableCard/index.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverhealTableCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aFight, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
]);

function makeFetchEvents(healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve([]);
  };
}

describe("OverhealTableCard", () => {
  it("shows the judgement and a per-spell table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT-aware overheal table" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Lifebloom")).toBeInTheDocument());
    expect(screen.getByText("Bloom")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("Swiftmend")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("renders a dash instead of a chip for informational HoT-tick rows", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
    ]);
    const healingEvents = [
      aHealEvent({
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Rejuvenation")).toBeInTheDocument());
    expect(screen.getByText("HoT tick (informational)")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no heals to report", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No heals to report this fight.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
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
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
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

  it("requests Healing events with includeResources: true", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = vi.fn().mockResolvedValue([]);

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No heals to report this fight.")).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find((call) => call[3] === "Healing");
    expect(healingCall?.[4]).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/OverhealTableCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement `src/app/components/OverhealTableCard/index.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeOverhealTable,
  type OverhealCategory,
  type OverhealTableResult,
} from "../../../metrics/overhealTable";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { JudgementChip } from "../ui/JudgementChip";

export interface OverhealTableCardProps {
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
  | { accessToken: string; result: OverhealTableResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_lightningoverload.jpg";

const THRESHOLD =
  "Separate thresholds by heal type. Bloom overheal (Lifebloom): green < 40%, orange 40-70%, red > 70%. Direct heal overheal (Regrowth direct, Healing Touch, Swiftmend): green < 30%, orange 30-50%, red > 50%. HoT tick overheal (Rejuvenation, Regrowth's HoT portion) is shown for context only, with no judgement of its own — high overheal is inherent to HoTs whose ticks often land on a target other healers are also topping off.";

const CATEGORY_LABEL: Record<OverhealCategory, string> = {
  "hot-tick": "HoT tick (informational)",
  bloom: "Bloom",
  direct: "Direct",
};

export function OverhealTableCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: OverhealTableCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Healing",
      true,
    )
      .then((healingEvents) => {
        const computed = computeOverhealTable(healingEvents, druidId, resolvedAbilities);
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the overheal table.",
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
      <MetricCard icon={ICON} title="HoT-aware overheal table" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="HoT-aware overheal table" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { rows, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="HoT-aware overheal table"
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {rows.length === 0 ? (
        <p>No heals to report this fight.</p>
      ) : (
        <DataTable
          columns={["Category", "Spell", "Overheal %", "Judgement"]}
          rows={rows.map((row) => [
            CATEGORY_LABEL[row.category],
            row.spell,
            `${row.overhealPct}%`,
            row.judgement === null ? "—" : <JudgementChip judgement={row.judgement} />,
          ])}
        />
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/OverhealTableCard/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/OverhealTableCard
git commit -m "feat(mana): add OverhealTableCard component"
```

---

## Task 3: Wire `OverhealTableCard` into `ManaEconomyContent`

**Files:**

- Modify: `src/app/components/ManaEconomyContent/index.tsx`
- Modify: `src/app/components/ManaEconomyContent/index.test.tsx`

**Interfaces:**

- Consumes: `OverhealTableCard` (Task 2).
- Produces: no new props on `ManaEconomyContent` — it already receives `resolvedAbilities` and
  passes it straight through, same as it already does for `ConsumableThroughputCard`.

- [ ] **Step 1: Update the test to expect the third card**

Edit `src/app/components/ManaEconomyContent/index.test.tsx` — extend the existing test's
`events` fixture with a Lifebloom heal event, and add assertions for the new heading and its
row (replace the whole `it(...)` block with):

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaEconomyContent } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aCastEvent, aFight, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
]);

describe("ManaEconomyContent", () => {
  it("renders the mana curve, consumable throughput, and overheal table cards", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
    ];
    const fetchEvents = (
      _accessToken: string,
      _reportCode: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> => {
      if (dataType === "Healing") return Promise.resolve(healingEvents);
      return Promise.resolve(castEvents);
    };

    render(
      <ManaEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "HoT-aware overheal table" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText("Lifebloom")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: FAIL — no heading named "HoT-aware overheal table" (the card isn't wired in yet).

- [ ] **Step 3: Add the card to `ManaEconomyContent`**

Edit `src/app/components/ManaEconomyContent/index.tsx`:

```typescript
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { ManaCurveCard } from "../ManaCurveCard";
import { ConsumableThroughputCard } from "../ConsumableThroughputCard";
import { OverhealTableCard } from "../OverhealTableCard";
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
      <OverhealTableCard
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
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ManaEconomyContent
git commit -m "feat(mana): wire overheal table into mana economy detail view"
```

---

## Task 4: Fold the overheal judgement into the dashboard widget

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/useManaEconomySummary.ts`
- Modify: `src/app/components/Scorecard/useManaEconomySummary.test.ts`

**Interfaces:**

- Consumes: `computeOverhealTable`, `OverhealTableResult` (Task 1).
- Produces: `summarizeManaEconomy(manaCurve, consumableThroughput, overhealTable):
EpicSummary` (new third parameter) — no other module calls this function besides
  `useManaEconomySummary.ts`, so this is a contained signature change.

- [ ] **Step 1: Update `epicSummary.test.ts`'s `summarizeManaEconomy` calls**

Edit `src/metrics/epicSummary.test.ts`: add the import and an `OVERHEAL_TABLE_GREEN` fixture,
then pass it as the third argument to all three existing `summarizeManaEconomy` calls in the
`describe("summarizeManaEconomy", ...)` block (around lines 337–392):

```typescript
import type { OverhealTableResult } from "./overhealTable";
```

(add alongside the other `import type` lines near the top of the file, e.g. right after the
`ConsumableThroughputResult` import)

```typescript
describe("summarizeManaEconomy", () => {
  const EXEMPT_CONSUMABLES: ConsumableThroughputResult = {
    exempt: true,
    rows: [],
    judgement: null,
  };
  const OVERHEAL_TABLE_GREEN: OverhealTableResult = {
    rows: [],
    judgement: "green",
  };

  it("reports the mana curve's own judgement and ending mana stat when consumables are exempt", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    expect(
      summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES, OVERHEAL_TABLE_GREEN),
    ).toEqual({
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
    expect(
      summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES, OVERHEAL_TABLE_GREEN),
    ).toEqual({
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
    expect(
      summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        OVERHEAL_TABLE_GREEN,
      ),
    ).toEqual({
      judgement: "red",
      stats: ["Ending mana: 20%", "Potions: 2/2, Runes: 0/1"],
    });
  });

  it("folds the overheal table's judgement into the worst-of without adding a stat line", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    const overhealTable: OverhealTableResult = {
      rows: [
        {
          category: "direct",
          spell: "Swiftmend",
          amount: 400,
          overheal: 600,
          overhealPct: 60,
          judgement: "red",
        },
      ],
      judgement: "red",
    };
    const result = summarizeManaEconomy(
      manaCurve,
      EXEMPT_CONSUMABLES,
      overhealTable,
    );
    expect(result.judgement).toBe("red");
    expect(result.stats).toEqual([
      "Ending mana: 20%",
      "Consumables: not mana-constrained",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — `summarizeManaEconomy` doesn't accept a third argument yet (TypeScript error
surfaced as a test failure, or the extra argument is silently ignored and the new test's
worst-of assertion fails).

- [ ] **Step 3: Update `summarizeManaEconomy` in `epicSummary.ts`**

Edit `src/metrics/epicSummary.ts` — add the import near the other `import type` lines:

```typescript
import type { OverhealTableResult } from "./overhealTable";
```

Replace the existing `summarizeManaEconomy` function with:

```typescript
export function summarizeManaEconomy(
  manaCurve: ManaCurveResult,
  consumableThroughput: ConsumableThroughputResult,
  overhealTable: OverhealTableResult,
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
    // overhealTable's judgement joins the worst-of calc (per docs/backlog.md story 404) but
    // doesn't get its own stat line — story 701 caps a dashboard widget at 1-2 stats, same
    // precedent as Downranking Discipline joining Spell Discipline's worst-of silently.
    judgement: worstJudgement([
      manaCurve.judgement,
      consumableThroughput.judgement,
      overhealTable.judgement,
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `useManaEconomySummary.test.ts`**

Edit `src/app/components/Scorecard/useManaEconomySummary.test.ts` — the existing single-fetch
mock needs to branch on `dataType` now that a second data type (`Healing`) is requested:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useManaEconomySummary } from "./useManaEconomySummary";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aCastEvent, aFight, aHealEvent } from "../../../testUtils/factories";

function makeFetchEvents(castEvents: WclEvent[], healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve(castEvents);
  };
}

describe("useManaEconomySummary", () => {
  it("starts loading, then reports the worst-of judgement and both stat lines", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Map(),
        makeFetchEvents(castEvents, []),
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Mana at 20% is below the 70% threshold, so consumables are judged: floor =
    // 120_000/120_000 = 1, 0 potions and 0 runes used -> both rows orange (one below
    // floor), which is the worst-of against the mana curve's own "green" and the (empty,
    // green-default) overheal table.
    expect(result.current).toEqual({
      status: "ready",
      judgement: "orange",
      stats: ["Ending mana: 20%", "Potions: 0/1, Runes: 0/1"],
    });
  });

  it("folds a red overheal-table judgement into the worst-of", async () => {
    // kill: false keeps the mana curve's own judgement null (informational only,
    // regardless of ending mana), isolating the overheal table as the only judged
    // signal besides consumables.
    const fight = aFight({
      id: 6,
      kill: false,
      startTime: 0,
      endTime: 120_000,
    });
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        // classResources[0].type is the *current* mana, .amount is the *max* pool (see
        // manaSamples.ts) -- 9000/10000 = 90%, which never drops below the 70% consumable
        // threshold, so consumableThroughput.judgement is also null (exempt).
        classResources: [{ amount: 10000, max: 0, type: 9000, cost: 0 }],
      }),
    ];
    const healingEvents = [
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
    ]);

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        resolvedAbilities,
        makeFetchEvents(castEvents, healingEvents),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Mana curve judgement is null (not a kill) and consumables are exempt (null) -- the
    // overheal table's Swiftmend row at 60% overheal is red, which must win the worst-of.
    expect(result.current).toMatchObject({ status: "ready", judgement: "red" });
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

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: FAIL — the hook only fetches `Casts` today, so the new red-overheal test can't see
any `Healing` events and won't reach `judgement: "red"`.

- [ ] **Step 7: Update `useManaEconomySummary.ts`**

Replace `src/app/components/Scorecard/useManaEconomySummary.ts` in full:

```typescript
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeManaCurve } from "../../../metrics/manaCurve";
import { computeConsumableThroughput } from "../../../metrics/consumableThroughput";
import { computeOverhealTable } from "../../../metrics/overhealTable";
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
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([castEvents, healingEvents]) => {
        const manaCurve = computeManaCurve(
          castEvents,
          druidId,
          fight.kill === true,
          fight.endTime - fight.startTime,
        );
        const consumableThroughput = computeConsumableThroughput(
          castEvents,
          druidId,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        const overhealTable = computeOverhealTable(
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeManaEconomy(
              manaCurve,
              consumableThroughput,
              overhealTable,
            ),
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

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts src/metrics/epicSummary.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts \
        src/app/components/Scorecard/useManaEconomySummary.ts \
        src/app/components/Scorecard/useManaEconomySummary.test.ts
git commit -m "feat(mana): fold overheal table judgement into mana economy widget"
```

---

## Task 5: Full verification, retire paperwork, mark story done

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/overheal-table-design.md`
- Delete: `docs/plans/overheal-table-plan.md`

- [ ] **Step 1: Run the full test suite and static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: everything passes, including all pre-existing tests (no regressions in
`downrankingDiscipline`, `hotClipDetection`, `swiftmendAudit`, `Scorecard`, etc.).

- [ ] **Step 2: Mark story 404 done in `docs/backlog.md`**

Change the heading `### 404 — HoT-aware overheal table` to
`### 404 — HoT-aware overheal table ✅ Done`.

- [ ] **Step 3: Update the "Repo state" paragraph in `CLAUDE.md`**

Find the sentence `Epic E (mana economy) has stories 401 (mana curve & ending mana) and 402
(consumable throughput) done; stories 403-404 remain.` and replace it with:

```
Epic E (mana economy) has stories 401 (mana curve & ending mana), 402 (consumable throughput),
and 404 (HoT-aware overheal table) done, implemented ahead of 403 (Innervate audit) — the
maintainer isn't yet convinced 403's premise (auditing the druid's own Innervate usage) is the
right shape, since Innervate is often assigned to a mana-starved caster rather than kept by the
druid; story 403 remains open pending that decision.
```

- [ ] **Step 4: Grep for any other references to the retiring docs before deleting them**

Run: `grep -rn "overheal-table-design\|overheal-table-plan" docs CLAUDE.md src`
Expected: only the two files themselves match (no dangling references elsewhere). If anything
else references them, fix that reference first.

- [ ] **Step 5: Delete the spec and plan**

```bash
rm docs/specs/overheal-table-design.md docs/plans/overheal-table-plan.md
```

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git add -u docs/specs docs/plans
git commit -m "docs: mark story 404 done, retire its design spec and plan"
```
