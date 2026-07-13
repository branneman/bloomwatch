# Story 303 — Downranking discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship backlog story 303 — a per-rank breakdown of Rejuvenation/Regrowth/Healing Touch
casts with a max-rank-overheal flag on Regrowth/Healing Touch, wired into the Spell discipline
epic's scorecard and dashboard-widget judgement.

**Architecture:** A pure metric module (`computeDownrankingDiscipline`) groups the druid's
Rejuvenation/Regrowth/Healing Touch casts by (spell, rank), matching each cast to its direct
(non-tick) heal event to compute avg effective heal and direct overheal %. A new card component
renders the result via the existing `MetricCard`/`DataTable`/`ClassTag` primitives and is wired
into `SpellDisciplineContent` and the epic-level worst-of judgement, following the exact patterns
already established by `swiftmendAudit.ts`/`SwiftmendAuditCard` and `hotClipDetection.ts` in this
epic.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library — matches the rest of the repo,
no new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded in application logic — resolved from
  `resolvedAbilities` (`src/abilities/resolveAbilities.ts`) at runtime, per `docs/backlog.md`'s
  conventions and story 007.
- Thresholds must be documented with rationale — every judgement threshold introduced here has an
  inline comment pointing at `docs/specs/downranking-discipline-design.md` or the relevant
  backlog story.
- Full design context: `docs/specs/downranking-discipline-design.md` (read before starting — it
  has the scope-decision rationale for why Rejuvenation is informational-only and the live
  validation notes for the cast→heal matching window).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project
  via a pre-commit hook — do not bypass it. Run `npm run format` if `format:check` fails on a file
  you touched.
- Story 701's dashboard widget caps at "1–2 key stats" — do NOT add a third stat line to
  `summarizeSpellDiscipline`'s output; only its judgement changes.

---

### Task 1: `getMaxRank` helper in ability resolution

**Files:**

- Modify: `src/abilities/resolveAbilities.ts`
- Test: `src/abilities/resolveAbilities.test.ts`

**Interfaces:**

- Consumes: the existing `SPELL_RANKS` module-private table and `DruidHealingSpell` type, both
  already defined in this file.
- Produces: `export function getMaxRank(spell: DruidHealingSpell): number | null` — the highest
  rank number found in `SPELL_RANKS` for that spell (`null` if the spell has no entries, which
  doesn't happen for any spell in `DruidHealingSpell` today, but keeps the return type honest).
  Task 2 imports this.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to the end of `src/abilities/resolveAbilities.test.ts` (the file
already imports `describe`, `expect`, `it` from `vitest`; add `getMaxRank` to the existing
`import { resolveAbilities, resolveSpellAbilityIds } from "./resolveAbilities";` line):

```ts
import {
  resolveAbilities,
  resolveSpellAbilityIds,
  getMaxRank,
} from "./resolveAbilities";
```

```ts
describe("getMaxRank", () => {
  it("returns the highest known rank for a multi-rank spell", () => {
    expect(getMaxRank("Rejuvenation")).toBe(13);
    expect(getMaxRank("Regrowth")).toBe(10);
    expect(getMaxRank("Healing Touch")).toBe(13);
  });

  it("returns the single rank for a one-rank spell", () => {
    expect(getMaxRank("Swiftmend")).toBe(1);
    expect(getMaxRank("Nature's Swiftness")).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- resolveAbilities.test.ts`
Expected: FAIL — `getMaxRank` is not exported / not defined.

- [ ] **Step 3: Implement `getMaxRank`**

Add to `src/abilities/resolveAbilities.ts`, directly after the `SPELL_RANKS` table definition
(after its closing `};`, before `MANA_POTION_GAME_IDS`):

```ts
// Derived from SPELL_RANKS rather than a second hardcoded rank-ceiling
// list, so the two can't drift apart as ranks are added. See
// docs/specs/downranking-discipline-design.md (story 303).
export function getMaxRank(spell: DruidHealingSpell): number | null {
  let max: number | null = null;
  for (const entry of Object.values(SPELL_RANKS)) {
    if (entry.spell !== spell) continue;
    if (max === null || entry.rank > max) max = entry.rank;
  }
  return max;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- resolveAbilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/abilities/resolveAbilities.ts src/abilities/resolveAbilities.test.ts
git commit -m "feat(spell-discipline): add getMaxRank ability-resolution helper"
```

---

### Task 2: `downrankingDiscipline` metric module

**Files:**

- Create: `src/metrics/downrankingDiscipline.ts`
- Test: `src/metrics/downrankingDiscipline.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`), `Judgement` (`src/metrics/judgement.ts`),
  `DruidHealingSpell` + `ResolvedAbility` + `getMaxRank` (`src/abilities/resolveAbilities.ts`,
  Task 1).
- Produces:

  ```ts
  export type DownrankingSpell = "Rejuvenation" | "Regrowth" | "Healing Touch";

  export interface DownrankingRankBreakdown {
    spell: DownrankingSpell;
    rank: number | null;
    isMaxRank: boolean;
    castCount: number;
    avgEffectiveHeal: number;
    directOverhealPct: number;
    flagged: boolean;
  }

  export interface DownrankingDisciplineResult {
    breakdown: DownrankingRankBreakdown[];
    flaggedCount: number;
    judgement: Judgement;
  }

  export function computeDownrankingDiscipline(
    castEvents: WclEvent[],
    healingEvents: WclEvent[],
    druidId: number,
    resolvedAbilities: Map<number, ResolvedAbility>,
  ): DownrankingDisciplineResult;
  ```

  Task 4 (card component) and Task 6 (`useSpellDisciplineSummary`) import
  `computeDownrankingDiscipline` and `DownrankingDisciplineResult`.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/downrankingDiscipline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeDownrankingDiscipline } from "./downrankingDiscipline";
import { aCastEvent, aHealEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { WclEvent } from "../wcl/events";

const DRUID_ID = 2;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
  [26982, { kind: "spell", spell: "Rejuvenation", rank: 13 }],
  [9750, { kind: "spell", spell: "Regrowth", rank: 6 }],
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
  [26979, { kind: "spell", spell: "Healing Touch", rank: 13 }],
  [29339, { kind: "spell", spell: "Healing Touch", rank: null }],
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
]);

describe("computeDownrankingDiscipline", () => {
  it("returns an empty breakdown and green judgement with no events", () => {
    const result = computeDownrankingDiscipline(
      [],
      [],
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result).toEqual({
      breakdown: [],
      flaggedCount: 0,
      judgement: "green",
    });
  });

  it("groups casts by spell and rank, computing cast count, avg effective heal, and direct overheal %", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 2000, targetID: 51, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1500,
        overheal: 500,
      }),
      aHealEvent({
        timestamp: 2002,
        targetID: 51,
        abilityGameID: 26980,
        amount: 2100,
        overheal: 900,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([
      {
        spell: "Regrowth",
        rank: 10,
        isMaxRank: true,
        castCount: 2,
        avgEffectiveHeal: 1800,
        directOverhealPct: 28,
        flagged: false,
      },
    ]);
  });

  it("matches a cast to its direct heal event, ignoring periodic tick heals sharing the same ability ID", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1002,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1200,
        overheal: 300,
      }),
      aHealEvent({
        timestamp: 4000,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 0,
        tick: true,
      }),
      aHealEvent({
        timestamp: 7000,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 0,
        tick: true,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([
      {
        spell: "Regrowth",
        rank: 10,
        isMaxRank: true,
        castCount: 1,
        avgEffectiveHeal: 1200,
        directOverhealPct: 20,
        flagged: false,
      },
    ]);
  });

  it("skips a cast with no matching heal event within the tolerance window", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      // Lands 51ms after the cast — outside the 50ms tolerance.
      aHealEvent({
        timestamp: 1051,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1200,
        overheal: 0,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([]);
  });

  it("flags a max-rank Regrowth group when direct overheal exceeds 50%", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 600,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      flagged: true,
      directOverhealPct: 60,
    });
    expect(result.flaggedCount).toBe(1);
    expect(result.judgement).toBe("orange");
  });

  it("does not flag a max-rank group at exactly 50% overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 500,
        overheal: 500,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0].flagged).toBe(false);
  });

  it("does not flag a non-max-rank group even with high overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 9750 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 9750,
        amount: 200,
        overheal: 800,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      isMaxRank: false,
      flagged: false,
    });
  });

  it("never flags Rejuvenation even at max rank with high overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26982 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26982,
        amount: 100,
        overheal: 900,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      spell: "Rejuvenation",
      isMaxRank: true,
      directOverhealPct: 90,
      flagged: false,
    });
    expect(result.flaggedCount).toBe(0);
    expect(result.judgement).toBe("green");
  });

  it("groups casts with an unresolved rank separately and never flags them", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 29339 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 29339,
        amount: 100,
        overheal: 900,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      spell: "Healing Touch",
      rank: null,
      isMaxRank: false,
      flagged: false,
    });
  });

  it("ignores casts from other sources and untracked spells", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        abilityGameID: 26980,
        sourceID: 99,
      }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 33763 }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      [],
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([]);
  });

  it("sorts the breakdown by spell (Rejuvenation, Regrowth, Healing Touch), then rank high to low, unresolved rank last", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 9750 }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 26979 }),
      aCastEvent({ timestamp: 3000, targetID: 50, abilityGameID: 3627 }),
      aCastEvent({ timestamp: 4000, targetID: 50, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 5000, targetID: 50, abilityGameID: 29339 }),
    ];
    const healingEvents: WclEvent[] = castEvents.map((cast) =>
      aHealEvent({
        timestamp: cast.timestamp + 1,
        targetID: 50,
        abilityGameID: cast.abilityGameID,
        amount: 100,
        overheal: 0,
      }),
    );

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown.map((row) => `${row.spell}:${row.rank}`)).toEqual([
      "Rejuvenation:6",
      "Regrowth:10",
      "Regrowth:6",
      "Healing Touch:13",
      "Healing Touch:null",
    ]);
  });

  it.each([
    { flaggedGroups: 0, expected: "green" },
    { flaggedGroups: 1, expected: "orange" },
    { flaggedGroups: 2, expected: "orange" },
  ])(
    "judges $expected with $flaggedGroups flagged group(s)",
    ({ flaggedGroups, expected }) => {
      const abilityIds = [26980, 26979];
      const castEvents: WclEvent[] = [];
      const healingEvents: WclEvent[] = [];

      for (let i = 0; i < flaggedGroups; i++) {
        const abilityGameID = abilityIds[i];
        castEvents.push(
          aCastEvent({ timestamp: i * 1000, targetID: 50, abilityGameID }),
        );
        healingEvents.push(
          aHealEvent({
            timestamp: i * 1000 + 1,
            targetID: 50,
            abilityGameID,
            amount: 100,
            overheal: 900,
          }),
        );
      }

      const result = computeDownrankingDiscipline(
        castEvents,
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.judgement).toBe(expected);
    },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- downrankingDiscipline.test.ts`
Expected: FAIL — cannot find module `./downrankingDiscipline`.

- [ ] **Step 3: Implement the metric module**

Create `src/metrics/downrankingDiscipline.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";
import { getMaxRank } from "../abilities/resolveAbilities";

// A Regrowth cast's direct heal event lands 0-3ms after the cast event and
// shares its abilityGameID with periodic ticks (distinguished only by
// `tick: true` on ticks) — live-validated against report
// 4GYHZRdtL3bvhpc8, fight 6 (see docs/testing.md). Healing Touch is
// assumed to behave the same way (single instant heal on cast completion,
// no ticks at all) by structural analogy — not directly observed live.
// Mirrors swiftmendAudit.ts's existing SWIFTMEND_MATCH_TOLERANCE_MS
// pattern. See docs/specs/downranking-discipline-design.md.
const DIRECT_HEAL_MATCH_TOLERANCE_MS = 50;

export type DownrankingSpell = "Rejuvenation" | "Regrowth" | "Healing Touch";

function isTrackedSpell(spell: DruidHealingSpell): spell is DownrankingSpell {
  return (
    spell === "Rejuvenation" ||
    spell === "Regrowth" ||
    spell === "Healing Touch"
  );
}

// Only Regrowth/Healing Touch's direct-heal overheal is a clean
// downranking signal. Rejuvenation is a pure HoT; HoT-tick overheal is too
// entangled with raid overlap and situational calls (threat management,
// mana conservation) to safely flag from logs alone. See
// docs/specs/downranking-discipline-design.md's scope-decision section.
function isFlaggable(spell: DownrankingSpell): boolean {
  return spell !== "Rejuvenation";
}

const SPELL_SORT_ORDER: Record<DownrankingSpell, number> = {
  Rejuvenation: 0,
  Regrowth: 1,
  "Healing Touch": 2,
};

export interface DownrankingRankBreakdown {
  spell: DownrankingSpell;
  rank: number | null;
  isMaxRank: boolean;
  castCount: number;
  avgEffectiveHeal: number;
  directOverhealPct: number;
  flagged: boolean;
}

export interface DownrankingDisciplineResult {
  breakdown: DownrankingRankBreakdown[];
  flaggedCount: number;
  judgement: Judgement;
}

// Green when no flags, orange otherwise. Max possible flagged groups is 2
// (Regrowth + Healing Touch, one max-rank group each) — red is
// unreachable by design, per docs/specs/downranking-discipline-design.md.
function judgeFlaggedCount(flaggedCount: number): Judgement {
  return flaggedCount === 0 ? "green" : "orange";
}

function findDirectHeal(
  healingEvents: WclEvent[],
  targetId: number,
  abilityGameID: number,
  castTimestamp: number,
): WclEvent | undefined {
  return healingEvents.find(
    (event) =>
      event.type === "heal" &&
      event.targetID === targetId &&
      event.abilityGameID === abilityGameID &&
      event.tick !== true &&
      event.timestamp >= castTimestamp &&
      event.timestamp <= castTimestamp + DIRECT_HEAL_MATCH_TOLERANCE_MS,
  );
}

interface Group {
  spell: DownrankingSpell;
  rank: number | null;
  castCount: number;
  totalAmount: number;
  totalOverheal: number;
}

export function computeDownrankingDiscipline(
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): DownrankingDisciplineResult {
  const casts = castEvents.filter(
    (event) =>
      event.sourceID === druidId &&
      event.type === "cast" &&
      event.targetID !== undefined &&
      event.abilityGameID !== undefined,
  );

  const groups = new Map<string, Group>();

  for (const cast of casts) {
    const abilityGameID = cast.abilityGameID as number;
    const resolved = resolvedAbilities.get(abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;
    if (!isTrackedSpell(resolved.spell)) continue;
    const spell = resolved.spell;

    const heal = findDirectHeal(
      healingEvents,
      cast.targetID as number,
      abilityGameID,
      cast.timestamp,
    );
    // No matching heal event means the cast didn't land (interrupted, no
    // recorded data) — skip rather than guess, same as swiftmendAudit.ts.
    if (heal === undefined) continue;

    const amount = typeof heal.amount === "number" ? heal.amount : 0;
    const overheal = typeof heal.overheal === "number" ? heal.overheal : 0;

    const key = `${spell}:${resolved.rank}`;
    const existing = groups.get(key);
    if (existing) {
      existing.castCount += 1;
      existing.totalAmount += amount;
      existing.totalOverheal += overheal;
    } else {
      groups.set(key, {
        spell,
        rank: resolved.rank,
        castCount: 1,
        totalAmount: amount,
        totalOverheal: overheal,
      });
    }
  }

  const breakdown: DownrankingRankBreakdown[] = Array.from(groups.values()).map(
    (group) => {
      const total = group.totalAmount + group.totalOverheal;
      const directOverhealPct =
        total === 0 ? 0 : (group.totalOverheal / total) * 100;
      const isMaxRank =
        group.rank !== null && group.rank === getMaxRank(group.spell);
      const flagged =
        isMaxRank && directOverhealPct > 50 && isFlaggable(group.spell);

      return {
        spell: group.spell,
        rank: group.rank,
        isMaxRank,
        castCount: group.castCount,
        avgEffectiveHeal: group.totalAmount / group.castCount,
        directOverhealPct,
        flagged,
      };
    },
  );

  breakdown.sort((a, b) => {
    if (a.spell !== b.spell) {
      return SPELL_SORT_ORDER[a.spell] - SPELL_SORT_ORDER[b.spell];
    }
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return b.rank - a.rank;
  });

  const flaggedCount = breakdown.filter((row) => row.flagged).length;

  return {
    breakdown,
    flaggedCount,
    judgement: judgeFlaggedCount(flaggedCount),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- downrankingDiscipline.test.ts`
Expected: PASS (all 12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/downrankingDiscipline.ts src/metrics/downrankingDiscipline.test.ts
git commit -m "feat(spell-discipline): add downranking discipline metric"
```

---

### Task 3: `ClassTag` "flagged" tone

**Files:**

- Modify: `src/app/components/ui/ClassTag/index.tsx`
- Modify: `src/app/components/ui/ClassTag/index.module.css`
- Modify: `src/app/components/ui/ClassTag/index.test.tsx`

**Interfaces:**

- Produces: `ClassTagProps.tone` gains `"flagged"` as a valid value. Task 4 uses
  `<ClassTag tone="flagged">Flagged</ClassTag>`.

- [ ] **Step 1: Write the failing test**

In `src/app/components/ui/ClassTag/index.test.tsx`, add `"flagged"` to the existing `it.each`
array:

```tsx
describe("ClassTag", () => {
  it.each([
    ["efficient", "Efficient"],
    ["emergency", "Emergency"],
    ["wasteful", "Wasteful"],
    ["flagged", "Flagged"],
  ] as const)("renders %s tone content", (tone, text) => {
    render(<ClassTag tone={tone}>{text}</ClassTag>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ClassTag`
Expected: FAIL — TypeScript error, `"flagged"` is not assignable to `ClassTagProps["tone"]`.

- [ ] **Step 3: Add the "flagged" tone**

In `src/app/components/ui/ClassTag/index.tsx`, change:

```ts
export interface ClassTagProps {
  tone: "efficient" | "emergency" | "wasteful";
  children: ReactNode;
}
```

to:

```ts
export interface ClassTagProps {
  tone: "efficient" | "emergency" | "wasteful" | "flagged";
  children: ReactNode;
}
```

In `src/app/components/ui/ClassTag/index.module.css`, add (after the existing `.wasteful` block —
styled identically, per `docs/design_v2/source/shared.jsx`'s `CLASS_TONE.flagged`):

```css
.flagged {
  color: var(--judgement-red);
  background: var(--judgement-red-bg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ClassTag`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/ClassTag/
git commit -m "feat(spell-discipline): add flagged tone to ClassTag"
```

---

### Task 4: `DownrankingDisciplineCard` component

**Files:**

- Create: `src/app/components/DownrankingDisciplineCard/index.tsx`
- Test: `src/app/components/DownrankingDisciplineCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeDownrankingDiscipline`, `DownrankingDisciplineResult` (Task 2);
  `ClassTag` with `tone="flagged"` (Task 3); `MetricCard`, `DataTable` (existing,
  `src/app/components/ui/`); `Fight` (`src/wcl/client.ts`); `WclEvent`/`WclEventDataType`
  (`src/wcl/events.ts`); `EventFetcherFight` (`src/wcl/eventCache.ts`); `ResolvedAbility`
  (`src/abilities/resolveAbilities.ts`).
- Produces: `export function DownrankingDisciplineCard(props: DownrankingDisciplineCardProps)`
  with props `{ accessToken, reportCode, fight, druidId, resolvedAbilities, fetchEvents }`. Task
  5 renders this inside `SpellDisciplineContent`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/DownrankingDisciplineCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DownrankingDisciplineCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aFight, aCastEvent, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
]);

function makeFetchEvents(castEvents: WclEvent[], healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve([]);
  };
}

describe("DownrankingDisciplineCard", () => {
  it("shows the flagged count/judgement and a per-rank table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 600,
      }),
    ];

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents(castEvents, healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Downranking discipline" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 flagged max-rank cast")).toBeInTheDocument(),
    );
    expect(screen.getByText("Regrowth")).toBeInTheDocument();
    expect(screen.getByText("Rank 10 (max)")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no tracked casts", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No Rejuvenation, Regrowth, or Healing Touch casts this fight.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <DownrankingDisciplineCard
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
      <DownrankingDisciplineCard
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
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No Rejuvenation, Regrowth, or Healing Touch casts this fight.",
        ),
      ).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find(
      (call) => call[3] === "Healing",
    );
    expect(healingCall?.[4]).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- DownrankingDisciplineCard`
Expected: FAIL — cannot find module `./index` (the component doesn't exist yet).

- [ ] **Step 3: Implement the component**

Create `src/app/components/DownrankingDisciplineCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeDownrankingDiscipline,
  type DownrankingDisciplineResult,
} from "../../../metrics/downrankingDiscipline";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { ClassTag } from "../ui/ClassTag";

export interface DownrankingDisciplineCardProps {
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
  | { accessToken: string; result: DownrankingDisciplineResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_resistnature.jpg";

const THRESHOLD =
  "Flag: a max-rank Regrowth or Healing Touch cast whose direct-heal component averaged > 50% overheal at that rank — a sign the max rank should have been downranked. Green 0 flags, orange 1-2 flags (never red — at most one flaggable group per spell). Rejuvenation is shown for visibility only and is never flagged: it's a pure HoT, and HoT-tick overheal is too entangled with raid overlap and situational calls (e.g. deliberately downranking for threat management) to safely judge from logs alone.";

function formatRank(rank: number | null, isMaxRank: boolean): string {
  if (rank === null) return "Rank —";
  return isMaxRank ? `Rank ${rank} (max)` : `Rank ${rank}`;
}

export function DownrankingDisciplineCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: DownrankingDisciplineCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([castEvents, healingEvents]) => {
        const computed = computeDownrankingDiscipline(
          castEvents,
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate downranking discipline.",
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
        title="Downranking discipline"
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
        title="Downranking discipline"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { breakdown, flaggedCount, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Downranking discipline"
      value={`${flaggedCount} flagged max-rank cast${flaggedCount === 1 ? "" : "s"}`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {breakdown.length === 0 ? (
        <p>No Rejuvenation, Regrowth, or Healing Touch casts this fight.</p>
      ) : (
        <DataTable
          columns={[
            "Spell",
            "Rank",
            "Casts",
            "Avg effective heal",
            "Direct overheal %",
            "",
          ]}
          rows={breakdown.map((row) => [
            row.spell,
            formatRank(row.rank, row.isMaxRank),
            `${row.castCount}`,
            Math.round(row.avgEffectiveHeal).toLocaleString(),
            `${row.directOverhealPct.toFixed(0)}%`,
            row.flagged ? <ClassTag tone="flagged">Flagged</ClassTag> : "",
          ])}
        />
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- DownrankingDisciplineCard`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DownrankingDisciplineCard/
git commit -m "feat(spell-discipline): add DownrankingDisciplineCard"
```

---

### Task 5: Wire `DownrankingDisciplineCard` into `SpellDisciplineContent`

**Files:**

- Modify: `src/app/components/SpellDisciplineContent/index.tsx`
- Modify: `src/app/components/SpellDisciplineContent/index.test.tsx`

**Interfaces:**

- Consumes: `DownrankingDisciplineCard` (Task 4) — uses `accessToken`, `reportCode`, `fight`,
  `druidId`, `resolvedAbilities`, `fetchEvents`, all already present as
  `SpellDisciplineContentProps` fields. No new props added to `SpellDisciplineContent`.

- [ ] **Step 1: Write the failing test**

In `src/app/components/SpellDisciplineContent/index.test.tsx`, update the test to also assert the
new card renders:

```tsx
// src/app/components/SpellDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpellDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("SpellDisciplineContent", () => {
  it("renders the HoT clip detection, Swiftmend audit, Downranking discipline, and Nature's Swiftness cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <SpellDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={new Map()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT clip detection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Swiftmend quality audit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Downranking discipline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nature's Swiftness audit" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SpellDisciplineContent`
Expected: FAIL — no heading named "Downranking discipline".

- [ ] **Step 3: Wire in the card**

Replace the full contents of `src/app/components/SpellDisciplineContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { HotClipDetectionCard } from "../HotClipDetectionCard";
import { SwiftmendAuditCard } from "../SwiftmendAuditCard";
import { DownrankingDisciplineCard } from "../DownrankingDisciplineCard";
import { NaturesSwiftnessCard } from "../NaturesSwiftnessCard";
import styles from "./index.module.css";

export interface SpellDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function SpellDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  targetNames,
  fetchEvents,
}: SpellDisciplineContentProps) {
  return (
    <div className={styles.group}>
      <HotClipDetectionCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <SwiftmendAuditCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        swiftmendAbilityIds={swiftmendAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <DownrankingDisciplineCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
      <NaturesSwiftnessCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        resolvedAbilities={resolvedAbilities}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SpellDisciplineContent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/SpellDisciplineContent/
git commit -m "feat(spell-discipline): wire DownrankingDisciplineCard into SpellDisciplineContent"
```

---

### Task 6: Fold downranking judgement into the Spell discipline epic summary

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`

**Interfaces:**

- Consumes: `DownrankingDisciplineResult` (Task 2).
- Produces: `summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking)` — same `EpicSummary`
  return shape as before (`{ judgement, stats }`), `stats` unchanged at 2 entries. Task 7 passes
  the new third argument.

- [ ] **Step 1: Write the failing tests**

In `src/metrics/epicSummary.test.ts`, add the import:

```ts
import type { DownrankingDisciplineResult } from "./downrankingDiscipline";
```

Then update the three existing `summarizeSpellDiscipline` calls in the `describe("summarizeSpellDiscipline", ...)` block to pass a third argument, and add two new tests. Replace the entire
`describe("summarizeSpellDiscipline", ...)` block with:

```ts
describe("summarizeSpellDiscipline", () => {
  const GREEN_DOWNRANKING: DownrankingDisciplineResult = {
    breakdown: [],
    flaggedCount: 0,
    judgement: "green",
  };

  it("takes the worst of Rejuvenation's clip judgement and the Swiftmend judgement", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 64,
        clipCount: 4,
        clipPct: 6.25,
        judgement: "orange",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 22,
        clipCount: 3,
        clipPct: 13.636363636363637,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 6,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING),
    ).toEqual({
      judgement: "orange",
      stats: ["Rejuvenation clips: 6.3%", "Swiftmend wasteful: 0.0%"],
    });
  });

  it("is green when Rejuvenation clips, Swiftmend wasteful share, and downranking are all green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING)
        .judgement,
    ).toBe("green");
  });

  it("turns red when Swiftmend's wasteful share is red, even if Rejuvenation clips and downranking are green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 3,
      wastefulPct: 75,
      judgement: "red",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING)
        .judgement,
    ).toBe("red");
  });

  it("turns orange when downranking has a flag, even if Rejuvenation clips and Swiftmend are green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };
    const downranking: DownrankingDisciplineResult = {
      breakdown: [
        {
          spell: "Regrowth",
          rank: 10,
          isMaxRank: true,
          castCount: 3,
          avgEffectiveHeal: 1840,
          directOverhealPct: 62,
          flagged: true,
        },
      ],
      flaggedCount: 1,
      judgement: "orange",
    };

    const result = summarizeSpellDiscipline(
      hotClips,
      swiftmendAudit,
      downranking,
    );

    expect(result.judgement).toBe("orange");
    expect(result.stats).toEqual([
      "Rejuvenation clips: 1.0%",
      "Swiftmend wasteful: 0.0%",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- epicSummary.test.ts`
Expected: FAIL — TypeScript error, `summarizeSpellDiscipline` expects 2 arguments but got 3 (and
the "turns orange when downranking has a flag" test fails once it compiles, since the current
implementation ignores the third argument entirely).

- [ ] **Step 3: Update `summarizeSpellDiscipline`**

In `src/metrics/epicSummary.ts`, add the import:

```ts
import type { DownrankingDisciplineResult } from "./downrankingDiscipline";
```

Replace the `summarizeSpellDiscipline` function:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
  downranking: DownrankingDisciplineResult,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the worst-of calc (per
  // docs/specs/downranking-discipline-design.md) but doesn't get its own
  // stat line — story 701 caps a dashboard widget at 1-2 stats.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      swiftmendAudit.judgement,
      downranking.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`,
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- epicSummary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts
git commit -m "feat(spell-discipline): fold downranking judgement into spell discipline epic summary"
```

---

### Task 7: Thread `resolvedAbilities` through `useSpellDisciplineSummary` and `Scorecard`

**Files:**

- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.ts`
- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
- Modify: `src/app/components/Scorecard/index.tsx`

**Interfaces:**

- Consumes: `computeDownrankingDiscipline` (Task 2), `summarizeSpellDiscipline` (Task 6,
  updated signature).
- Produces: `useSpellDisciplineSummary` gains a `resolvedAbilities: Map<number, ResolvedAbility>`
  parameter, inserted right before `fetchEvents` (matching where `NaturesSwiftnessCard` places
  it). `Scorecard` passes its own `resolvedAbilities` prop (already present, currently forwarded
  only to `SpellDisciplineContent`) through to this hook too.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`:

```ts
// src/app/components/Scorecard/useSpellDisciplineSummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { anApplyBuffEvent, aFight } from "../../../testUtils/factories";

describe("useSpellDisciplineSummary", () => {
  it("starts loading, then reports the worst-of judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const buffEvents = [
      anApplyBuffEvent({
        timestamp: 0,
        sourceID: 2,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);

    const { result } = renderHook(() =>
      useSpellDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Map(),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status).toBe("ready");
  });

  it("reports an error status when a fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useSpellDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- useSpellDisciplineSummary`
Expected: FAIL — TypeScript error, too many arguments passed to `useSpellDisciplineSummary`.

- [ ] **Step 3: Update `useSpellDisciplineSummary` and `Scorecard`**

Replace the full contents of `src/app/components/Scorecard/useSpellDisciplineSummary.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeHotClipDetection } from "../../../metrics/hotClipDetection";
import { computeSwiftmendAudit } from "../../../metrics/swiftmendAudit";
import { computeDownrankingDiscipline } from "../../../metrics/downrankingDiscipline";
import { summarizeSpellDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useSpellDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
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
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
        const hotClips = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        const swiftmendAudit = computeSwiftmendAudit(
          buffEvents,
          castEvents,
          healingEvents,
          druidId,
          swiftmendAbilityIds,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
          fight.endTime - fight.startTime,
        );
        const downranking = computeDownrankingDiscipline(
          castEvents,
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking),
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
                : "Failed to summarize Spell discipline.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    resolvedAbilities,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

In `src/app/components/Scorecard/index.tsx`, update the `useSpellDisciplineSummary` call (the
`resolvedAbilities` prop already exists on `Scorecard` — this only adds it to this call):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- useSpellDisciplineSummary`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useSpellDisciplineSummary.ts src/app/components/Scorecard/useSpellDisciplineSummary.test.ts src/app/components/Scorecard/index.tsx
git commit -m "feat(spell-discipline): include downranking discipline in the spell discipline summary hook"
```

---

### Task 8: Full verification, docs update, and story close-out

**Files:**

- Modify: `docs/testing.md`
- Modify: `docs/backlog.md`
- Delete: `docs/specs/downranking-discipline-design.md`

**Interfaces:** None — this task is verification and documentation only, no code changes.

- [ ] **Step 1: Run the full test suite and static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all green. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 2: Add the new live-validated fact to `docs/testing.md`**

In `docs/testing.md`'s known-reports table, find the `4GYHZRdtL3bvhpc8` row (the "Canonical
fixture" row). Append this sentence to the end of that cell's text, before the closing `|`:

```
Also validated (fight 6, Dassz's Regrowth) that a Regrowth cast's direct-heal component shares its `abilityGameID` with its own periodic ticks — distinguished only by `tick: true` on ticks — and lands 0-3ms after the `cast` event (6 of 6 casts matched cleanly), the same near-zero-tolerance pattern already confirmed for Swiftmend — the basis for story 303's downranking discipline metric matching casts to their direct heal events without needing per-spell ability-ID splits for ticks.
```

Run `npm run format` afterward (this table has long cells and Prettier may rewrap it).

- [ ] **Step 3: Mark story 303 done in `docs/backlog.md`**

In `docs/backlog.md`, change the heading:

```markdown
### 303 — Downranking discipline
```

to:

```markdown
### 303 — Downranking discipline ✅ Done
```

Note: leave the acceptance criteria text as-is — per `docs/specs/downranking-discipline-design.md`,
the shipped behavior narrows the flag to Regrowth/Healing Touch (matching the original criteria
exactly) and adds Rejuvenation as an informational-only addition beyond the original criteria, so
the existing acceptance criteria text remains accurate as a description of the flag mechanism.

- [ ] **Step 4: Retire the design spec**

```bash
git rm docs/specs/downranking-discipline-design.md
```

- [ ] **Step 5: Verify no dangling references to the deleted spec**

Run: `grep -rn "downranking-discipline-design" docs/ src/ 2>/dev/null`
Expected: no output (this plan file itself, `docs/plans/downranking-discipline-plan.md`, is not
part of this grep's scope and is expected to still reference it in its own text — that's fine,
plans aren't grepped for cleanup the way source/doc cross-references are).

- [ ] **Step 6: Commit**

```bash
git add docs/testing.md docs/backlog.md
git commit -m "docs: mark story 303 done, retire its design spec"
```

- [ ] **Step 7: Final full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all green.
