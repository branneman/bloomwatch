# HoT Clip Detection (Story 301) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, directly on `main` (no worktree, no executing-plans review-checkpoint session — per this repo's CLAUDE.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship backlog story 301 — a "HoT clip detection" scorecard card that counts Rejuvenation/Regrowth refreshes that clipped remaining ticks, graded independently per spell, and enable the previously-disabled "Spell discipline" epic tile to hold it.

**Architecture:** A new duration-based metric module (`hotClipDetection.ts`) mirrors the existing per-target buff-timeline pattern (`restackTax.ts`) but tracks a single non-stacking aura's expiry per target instead of a stack count. A new generic `DataTable` UI primitive (specified in `docs/design_v2`, not yet built in the real codebase) renders the per-spell breakdown. A new card, content component, and summary hook follow the exact structure of the existing Lifebloom-discipline epic (`RestackTaxCard` → `LifebloomDisciplineContent` → `useLifebloomDisciplineSummary`), and `Scorecard`/`App` are wired the same way the `"lifebloom"` epic already is.

**Tech Stack:** TypeScript, React 19, Vitest, React Testing Library. No new dependencies.

Full design context, including the live WCL data that validated the 12000ms/27000ms duration
constants: `docs/specs/hot-clip-detection-design.md` (deleted by Task 9, per this project's "a
story isn't done until its paperwork is retired" convention — read it now if you want that
validation detail, it won't exist after Task 9).

## Global Constraints

- Spell/ability IDs are never hardcoded in production code — `rejuvenationAbilityIds`/
  `regrowthAbilityIds` are always caller-supplied `Set<number>`s resolved elsewhere (story 007's
  `resolveSpellAbilityIds`). Only test fixtures use literal IDs (Rejuvenation = `26982`,
  Regrowth = `26980` — the max-rank IDs already used elsewhere in this codebase's tests).
- Every R/O/G threshold constant needs a comment pointing at its `docs/backlog.md` story
  rationale (CLAUDE.md principle 3) — the 12000ms/27000ms/3000ms/5%/15% constants in Task 1 all
  need one.
- No server-side code, no secrets — this plan only touches browser-side TypeScript/React and
  Markdown docs.
- Commit messages follow Conventional Commits (`type(scope): summary`); this plan uses scope
  `spell-discipline` for metric/card/epic-wiring changes, `ui` for the new `DataTable`
  primitive, and `app` for the `App.tsx`/`Scorecard.tsx` prop-threading changes.
- `npm run typecheck && npm run lint && npm run format:check` must pass before every commit —
  the pre-commit hook enforces this full-project on every commit. Never bypass it with
  `--no-verify`.
- Run `npm test` (Tiers 1-3, all `*.test.ts`/`*.test.tsx` files) after every task; every existing
  test must stay green.

---

### Task 1: `computeHotClipDetection` metric module

**Files:**

- Create: `src/metrics/hotClipDetection.ts`
- Test: `src/metrics/hotClipDetection.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`), `Judgement`/`judgeThresholdBelow`
  (`src/metrics/judgement.ts`), test factories `aCastEvent`, `anApplyBuffEvent`,
  `aRefreshBuffEvent`, `aRemoveBuffEvent` (`src/testUtils/factories.ts`, all already exist).
- Produces (used by Tasks 2, 4, 6):

  ```ts
  export type HotClipSpell = "Rejuvenation" | "Regrowth";

  export interface HotClipEvent {
    timestampMs: number;
    targetId: number;
    spell: HotClipSpell;
  }

  export interface HotClipSpellResult {
    spell: HotClipSpell;
    castCount: number;
    clipCount: number;
    clipPct: number;
    judgement: Judgement;
  }

  export interface HotClipDetectionResult {
    rejuvenation: HotClipSpellResult;
    regrowth: HotClipSpellResult;
    clipEvents: HotClipEvent[];
  }

  export function computeHotClipDetection(
    buffEvents: WclEvent[],
    castEvents: WclEvent[],
    druidId: number,
    rejuvenationAbilityIds: Set<number>,
    regrowthAbilityIds: Set<number>,
  ): HotClipDetectionResult;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/hotClipDetection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeHotClipDetection } from "./hotClipDetection";
import {
  aCastEvent,
  anApplyBuffEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const REJUV_IDS = new Set([26982]);
const REGROWTH_IDS = new Set([26980]);

describe("computeHotClipDetection", () => {
  it("returns zero casts/clips and green judgement with no events", () => {
    const result = computeHotClipDetection(
      [],
      [],
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );
    expect(result).toEqual({
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 0,
        clipCount: 0,
        clipPct: 0,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 0,
        clipCount: 0,
        clipPct: 0,
        judgement: "green",
      },
      clipEvents: [],
    });
  });

  it("counts a refresh with more than one tick remaining as a clip", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // Rejuvenation lasts 12000ms; refreshing at 5000ms leaves 7000ms (>3000ms) remaining.
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(1);
    expect(result.clipEvents).toEqual([
      { timestampMs: 5000, targetId: 42, spell: "Rejuvenation" },
    ]);
  });

  it("does not count a refresh with exactly one tick (3s) or less remaining", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // 12000ms duration - 9000ms elapsed = exactly 3000ms remaining: not > 3000ms.
      aRefreshBuffEvent({
        timestamp: 9000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 9000, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(0);
  });

  it("does not count a re-application after Swiftmend consumed the HoT as a clip", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // Swiftmend consumes the HoT: a removebuff, never a refreshbuff.
      aRemoveBuffEvent({
        timestamp: 2000,
        targetID: 42,
        abilityGameID: 26982,
      }),
      anApplyBuffEvent({
        timestamp: 2001,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 2001, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(0);
    expect(result.clipEvents).toEqual([]);
  });

  it("tracks Regrowth independently with its own 27s duration", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      // Regrowth lasts 27000ms; refreshing at 20000ms leaves 7000ms (>3000ms) remaining.
      aRefreshBuffEvent({
        timestamp: 20000,
        targetID: 48,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 20000, targetID: 48, abilityGameID: 26980 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.regrowth.clipCount).toBe(1);
    expect(result.rejuvenation.clipCount).toBe(0);
  });

  it("tracks multiple targets independently", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
      anApplyBuffEvent({ timestamp: 0, targetID: 43, abilityGameID: 26982 }),
      // This target's refresh has too little time remaining - not a clip.
      aRefreshBuffEvent({
        timestamp: 11000,
        targetID: 43,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 0, targetID: 43, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 11000, targetID: 43, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(1);
    expect(result.clipEvents).toEqual([
      { timestampMs: 5000, targetId: 42, spell: "Rejuvenation" },
    ]);
  });

  it("ignores casts from other sources and other abilities", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 0,
        targetID: 42,
        sourceID: 99,
        abilityGameID: 26982,
      }),
      aCastEvent({ timestamp: 1000, targetID: 42, abilityGameID: 33763 }),
    ];

    const result = computeHotClipDetection(
      [],
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.castCount).toBe(0);
    expect(result.regrowth.castCount).toBe(0);
  });

  it.each([
    { castCount: 100, expected: "green" },
    { castCount: 20, expected: "orange" },
    { castCount: 7, expected: "orange" },
    { castCount: 5, expected: "red" },
  ])(
    "judges $expected at a $castCount-cast sample with exactly one clip",
    ({ castCount, expected }) => {
      const buffEvents = [
        anApplyBuffEvent({
          timestamp: 0,
          targetID: 42,
          abilityGameID: 26982,
        }),
        aRefreshBuffEvent({
          timestamp: 5000,
          targetID: 42,
          abilityGameID: 26982,
        }),
      ];
      const castEvents = Array.from({ length: castCount }, (_, i) =>
        aCastEvent({ timestamp: i * 1000, targetID: 42, abilityGameID: 26982 }),
      );

      const result = computeHotClipDetection(
        buffEvents,
        castEvents,
        DRUID_ID,
        REJUV_IDS,
        REGROWTH_IDS,
      );

      expect(result.rejuvenation.clipCount).toBe(1);
      expect(result.rejuvenation.judgement).toBe(expected);
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/hotClipDetection.test.ts`
Expected: FAIL — `Cannot find module './hotClipDetection'`.

- [ ] **Step 3: Write the implementation**

Create `src/metrics/hotClipDetection.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow } from "./judgement";

// Rejuvenation duration, TBC Classic, constant across all ranks (only mana
// cost/heal-per-tick scale by rank) — live-validated against report
// 4GYHZRdtL3bvhpc8 fight 34: 6 natural full-duration instances all landed at
// 12006-12023ms. See docs/testing.md's known-reports table.
const REJUVENATION_DURATION_MS = 12_000;

// Regrowth's HoT component duration (9 ticks), same live validation: 4
// natural full-duration instances all landed at 26971-27009ms, cross-checked
// against periodic Healing-event tick timestamps for one instance.
const REGROWTH_DURATION_MS = 27_000;

// "> 1 tick (> 3s) remaining" per docs/backlog.md story 301 — both spells
// tick every 3s.
const CLIP_THRESHOLD_MS = 3_000;

export type HotClipSpell = "Rejuvenation" | "Regrowth";

export interface HotClipEvent {
  timestampMs: number;
  targetId: number;
  spell: HotClipSpell;
}

export interface HotClipSpellResult {
  spell: HotClipSpell;
  castCount: number;
  clipCount: number;
  clipPct: number;
  judgement: Judgement;
}

export interface HotClipDetectionResult {
  rejuvenation: HotClipSpellResult;
  regrowth: HotClipSpellResult;
  clipEvents: HotClipEvent[];
}

// Green < 5%, orange 5-15%, red > 15% of that spell's casts, per
// docs/backlog.md story 301.
function judgeClipPct(clipPct: number): Judgement {
  return judgeThresholdBelow(clipPct, { greenMax: 5, orangeMax: 15 });
}

function computeSpellResult(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  abilityIds: Set<number>,
  spell: HotClipSpell,
  durationMs: number,
): { result: HotClipSpellResult; clipEvents: HotClipEvent[] } {
  const relevantBuffEvents = buffEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.abilityGameID !== undefined &&
        abilityIds.has(event.abilityGameID) &&
        event.targetID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const expiryByTarget = new Map<number, number>();
  const clipEvents: HotClipEvent[] = [];

  for (const event of relevantBuffEvents) {
    const targetId = event.targetID as number;

    if (event.type === "applybuff") {
      expiryByTarget.set(targetId, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "refreshbuff") {
      const expiry = expiryByTarget.get(targetId);
      if (
        expiry !== undefined &&
        expiry - event.timestamp > CLIP_THRESHOLD_MS
      ) {
        clipEvents.push({ timestampMs: event.timestamp, targetId, spell });
      }
      expiryByTarget.set(targetId, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "removebuff") {
      // Covers both natural expiry and Swiftmend consumption — either way
      // there's nothing to clip against until the next applybuff.
      expiryByTarget.delete(targetId);
    }
  }

  const castCount = castEvents.filter(
    (event) =>
      event.sourceID === druidId &&
      event.type === "cast" &&
      event.abilityGameID !== undefined &&
      abilityIds.has(event.abilityGameID),
  ).length;

  const clipCount = clipEvents.length;
  const clipPct = castCount === 0 ? 0 : (clipCount / castCount) * 100;

  return {
    result: {
      spell,
      castCount,
      clipCount,
      clipPct,
      judgement: judgeClipPct(clipPct),
    },
    clipEvents,
  };
}

export function computeHotClipDetection(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): HotClipDetectionResult {
  const rejuv = computeSpellResult(
    buffEvents,
    castEvents,
    druidId,
    rejuvenationAbilityIds,
    "Rejuvenation",
    REJUVENATION_DURATION_MS,
  );
  const regrowth = computeSpellResult(
    buffEvents,
    castEvents,
    druidId,
    regrowthAbilityIds,
    "Regrowth",
    REGROWTH_DURATION_MS,
  );

  const clipEvents = [...rejuv.clipEvents, ...regrowth.clipEvents].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  return {
    rejuvenation: rejuv.result,
    regrowth: regrowth.result,
    clipEvents,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/hotClipDetection.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/hotClipDetection.ts src/metrics/hotClipDetection.test.ts
git commit -m "feat(spell-discipline): add computeHotClipDetection metric (story 301)"
```

---

### Task 2: `summarizeSpellDiscipline` in `epicSummary.ts`

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`

**Interfaces:**

- Consumes: `HotClipDetectionResult`, `worstJudgement` (already in this file), `EpicSummary`
  (already in this file) — from Task 1.
- Produces (used by Task 6):

  ```ts
  export function summarizeSpellDiscipline(
    hotClips: HotClipDetectionResult,
  ): EpicSummary;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/metrics/epicSummary.test.ts`, adding this import alongside the existing ones at
the top of the file:

```ts
import { summarizeSpellDiscipline } from "./epicSummary";
import type { HotClipDetectionResult } from "./hotClipDetection";
```

(Add `summarizeSpellDiscipline` to the existing `import { worstJudgement, summarizeGcdEconomy, summarizeLifebloomDiscipline } from "./epicSummary";` line instead of a separate import statement.)

Then append this new `describe` block at the end of the file, before the final closing of the
file:

```ts
describe("summarizeSpellDiscipline", () => {
  it("takes the worst-of judgement and formats both spells' clip rates", () => {
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
        judgement: "orange",
      },
      clipEvents: [],
    };

    expect(summarizeSpellDiscipline(hotClips)).toEqual({
      judgement: "orange",
      stats: ["Rejuvenation clips: 6.3%", "Regrowth clips: 13.6%"],
    });
  });

  it("is green when both spells are green", () => {
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
        judgement: "green",
      },
      clipEvents: [],
    };

    expect(summarizeSpellDiscipline(hotClips).judgement).toBe("green");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — `summarizeSpellDiscipline is not a function` (or a TS error if run through
`npm test`, since `summarizeSpellDiscipline` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

In `src/metrics/epicSummary.ts`, add this import at the top alongside the existing metric-result
imports:

```ts
import type { HotClipDetectionResult } from "./hotClipDetection";
```

Then append this function at the end of the file:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
): EpicSummary {
  const judgement = worstJudgement([
    hotClips.rejuvenation.judgement,
    hotClips.regrowth.judgement,
  ]);
  return {
    judgement,
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Regrowth clips: ${hotClips.regrowth.clipPct.toFixed(1)}%`,
    ],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts
git commit -m "feat(spell-discipline): add summarizeSpellDiscipline (story 301)"
```

---

### Task 3: `DataTable` shared UI primitive

**Files:**

- Create: `src/app/components/ui/DataTable/index.tsx`
- Create: `src/app/components/ui/DataTable/index.module.css`
- Test: `src/app/components/ui/DataTable/index.test.tsx`

**Interfaces:**

- Consumes: nothing project-specific (plain React).
- Produces (used by Task 4):

  ```ts
  export interface DataTableProps {
    columns: string[];
    rows: ReactNode[][];
  }
  export function DataTable({ columns, rows }: DataTableProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/ui/DataTable/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "./index";

describe("DataTable", () => {
  it("renders a header row and one row per data row", () => {
    render(
      <DataTable
        columns={["Spell", "Casts", "Clips", "Clip %"]}
        rows={[
          ["Rejuvenation", "64", "4", "6.3%"],
          ["Regrowth", "22", "3", "13.6%"],
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Spell" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Clip %" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rejuvenation")).toBeInTheDocument();
    expect(screen.getByText("13.6%")).toBeInTheDocument();
  });

  it("renders React-node cells, not just strings", () => {
    render(
      <DataTable
        columns={["Spell", "Verdict"]}
        rows={[["Rejuvenation", <span key="v">Orange</span>]]}
      />,
    );

    expect(screen.getByText("Orange")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/ui/DataTable/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ui/DataTable/index.module.css`:

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-small-size);
}

.headerCell {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}

.cell {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  color: var(--text-h);
}

.table tbody tr:last-child .cell {
  border-bottom: none;
}
```

Create `src/app/components/ui/DataTable/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface DataTableProps {
  columns: string[];
  rows: ReactNode[][];
}

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} className={styles.headerCell}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={styles.cell}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/ui/DataTable/index.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/DataTable
git commit -m "feat(ui): add DataTable primitive (story 301)"
```

---

### Task 4: `HotClipDetectionCard` component

**Files:**

- Create: `src/app/components/HotClipDetectionCard/index.tsx`
- Test: `src/app/components/HotClipDetectionCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeHotClipDetection`, `HotClipDetectionResult` (Task 1); `worstJudgement`
  (`src/metrics/epicSummary.ts`); `DataTable` (Task 3); `MetricCard` (`src/app/components/ui/MetricCard`);
  `formatDuration` (`src/report/fightRows.ts`); `buildFightTimeUrl` (`src/report/wclLinks.ts`);
  `Fight` (`src/wcl/client.ts`); `WclEvent`/`WclEventDataType` (`src/wcl/events.ts`);
  `EventFetcherFight` (`src/wcl/eventCache.ts`).
- Produces (used by Task 5):

  ```ts
  export interface HotClipDetectionCardProps {
    accessToken: string;
    reportCode: string;
    fight: Fight;
    druidId: number;
    rejuvenationAbilityIds: Set<number>;
    regrowthAbilityIds: Set<number>;
    targetNames: Map<number, string>;
    fetchEvents: (
      accessToken: string,
      reportCode: string,
      fight: EventFetcherFight,
      dataType: WclEventDataType,
    ) => Promise<WclEvent[]>;
  }
  export function HotClipDetectionCard(
    props: HotClipDetectionCardProps,
  ): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/HotClipDetectionCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HotClipDetectionCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  aRefreshBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[], castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> =>
    Promise.resolve(dataType === "Casts" ? castEvents : buffEvents);
}

describe("HotClipDetectionCard", () => {
  it("shows per-spell casts/clips/clip% and a merged clip list once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
    ];

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT clip detection" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Rejuvenation")).toBeInTheDocument(),
    );
    expect(screen.getByText("Regrowth")).toBeInTheDocument();
    expect(screen.getByText("50.0% clipped")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(
      screen.getByText("0:05 — Rejuvenation on Offtank"),
    ).toBeInTheDocument();
  });

  it("shows a message when there are no HoT clips", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No HoT clips this fight.")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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

Run: `npx vitest run src/app/components/HotClipDetectionCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/HotClipDetectionCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeHotClipDetection,
  type HotClipDetectionResult,
} from "../../../metrics/hotClipDetection";
import { worstJudgement } from "../../../metrics/epicSummary";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";

export interface HotClipDetectionCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: HotClipDetectionResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_empoweredrejuvination.jpg";

const THRESHOLD =
  "A refresh counts as a clip if the existing aura had > 1 tick (> 3s) remaining. Clips consumed by Swiftmend are excluded — that's audited separately by story 302. Green < 5%, orange 5-15%, red > 15% of that spell's casts.";

export function HotClipDetectionCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  targetNames,
  fetchEvents,
}: HotClipDetectionCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
    ])
      .then(([buffEvents, castEvents]) => {
        const computed = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate HoT clip detection.",
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
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard icon={ICON} title="HoT clip detection" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="HoT clip detection" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { rejuvenation, regrowth, clipEvents } = result.result;
  const judgement = worstJudgement([
    rejuvenation.judgement,
    regrowth.judgement,
  ]);
  const totalCasts = rejuvenation.castCount + regrowth.castCount;
  const totalClips = rejuvenation.clipCount + regrowth.clipCount;
  const overallPct = totalCasts === 0 ? 0 : (totalClips / totalCasts) * 100;

  return (
    <MetricCard
      icon={ICON}
      title="HoT clip detection"
      value={`${overallPct.toFixed(1)}% clipped`}
      pct={overallPct}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      <DataTable
        columns={["Spell", "Casts", "Clips", "Clip %"]}
        rows={[
          [
            rejuvenation.spell,
            `${rejuvenation.castCount}`,
            `${rejuvenation.clipCount}`,
            `${rejuvenation.clipPct.toFixed(1)}%`,
          ],
          [
            regrowth.spell,
            `${regrowth.castCount}`,
            `${regrowth.clipCount}`,
            `${regrowth.clipPct.toFixed(1)}%`,
          ],
        ]}
      />
      {clipEvents.length === 0 ? (
        <p>No HoT clips this fight.</p>
      ) : (
        <ul
          style={{
            margin: "8px 0 0",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {clipEvents.map((clip) => (
            <li key={`${clip.timestampMs}-${clip.targetId}-${clip.spell}`}>
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  clip.timestampMs,
                  clip.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(clip.timestampMs - fight.startTime)} —{" "}
                {clip.spell} on{" "}
                {targetNames.get(clip.targetId) ?? `Target #${clip.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/HotClipDetectionCard/index.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/HotClipDetectionCard
git commit -m "feat(spell-discipline): add HotClipDetectionCard (story 301)"
```

---

### Task 5: `SpellDisciplineContent` component

**Files:**

- Create: `src/app/components/SpellDisciplineContent/index.tsx`
- Create: `src/app/components/SpellDisciplineContent/index.module.css`
- Test: `src/app/components/SpellDisciplineContent/index.test.tsx`

**Interfaces:**

- Consumes: `HotClipDetectionCard` (Task 4); `Fight`, `WclEvent`/`WclEventDataType`,
  `EventFetcherFight` (same as Task 4).
- Produces (used by Task 7):

  ```ts
  export interface SpellDisciplineContentProps {
    accessToken: string;
    reportCode: string;
    fight: Fight;
    druidId: number;
    rejuvenationAbilityIds: Set<number>;
    regrowthAbilityIds: Set<number>;
    targetNames: Map<number, string>;
    fetchEvents: (
      accessToken: string,
      reportCode: string,
      fight: EventFetcherFight,
      dataType: WclEventDataType,
    ) => Promise<WclEvent[]>;
  }
  export function SpellDisciplineContent(
    props: SpellDisciplineContentProps,
  ): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/app/components/SpellDisciplineContent/index.test.tsx`:

```tsx
// src/app/components/SpellDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpellDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("SpellDisciplineContent", () => {
  it("renders the HoT clip detection card", () => {
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
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT clip detection" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/SpellDisciplineContent/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/SpellDisciplineContent/index.module.css`:

```css
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

Create `src/app/components/SpellDisciplineContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { HotClipDetectionCard } from "../HotClipDetectionCard";
import styles from "./index.module.css";

export interface SpellDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function SpellDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
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
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/SpellDisciplineContent/index.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/SpellDisciplineContent
git commit -m "feat(spell-discipline): add SpellDisciplineContent (story 301)"
```

---

### Task 6: `useSpellDisciplineSummary` hook

**Files:**

- Create: `src/app/components/Scorecard/useSpellDisciplineSummary.ts`
- Test: `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`

**Interfaces:**

- Consumes: `computeHotClipDetection` (Task 1); `summarizeSpellDiscipline` (Task 2);
  `EpicSummaryStatus` (`src/app/components/Scorecard/epicSummaryStatus.ts`, already exists);
  `Fight`, `WclEvent`/`WclEventDataType`, `EventFetcherFight` (same as Task 4).
- Produces (used by Task 7):

  ```ts
  export function useSpellDisciplineSummary(
    accessToken: string,
    reportCode: string,
    fight: Fight,
    druidId: number,
    rejuvenationAbilityIds: Set<number>,
    regrowthAbilityIds: Set<number>,
    fetchEvents: (
      accessToken: string,
      reportCode: string,
      fight: EventFetcherFight,
      dataType: WclEventDataType,
    ) => Promise<WclEvent[]>,
  ): EpicSummaryStatus;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`:

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

Run: `npx vitest run src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
Expected: FAIL — `Cannot find module './useSpellDisciplineSummary'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/Scorecard/useSpellDisciplineSummary.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeHotClipDetection } from "../../../metrics/hotClipDetection";
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
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
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
    ])
      .then(([buffEvents, castEvents]) => {
        const hotClips = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeSpellDiscipline(hotClips),
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
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useSpellDisciplineSummary.ts src/app/components/Scorecard/useSpellDisciplineSummary.test.ts
git commit -m "feat(spell-discipline): add useSpellDisciplineSummary hook (story 301)"
```

---

### Task 7: Wire the "Spell discipline" epic into `Scorecard`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `SpellDisciplineContent` (Task 5), `useSpellDisciplineSummary` (Task 6).
- Produces (used by Task 8): `ScorecardProps` gains two new required fields,
  `rejuvenationAbilityIds: Set<number>` and `regrowthAbilityIds: Set<number>`.

- [ ] **Step 1: Update the failing test expectations**

In `src/app/components/Scorecard/index.test.tsx`, update both `render(<Scorecard ... />)` calls
to add the two new required props right after `lifebloomAbilityIds={new Set([33763])}`:

```tsx
        lifebloomAbilityIds={new Set([33763])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
```

In the first test (`"renders the fight header, all 6 epic widgets, and the footer"`), replace:

```tsx
for (const label of [
  "Spell discipline",
  "Mana economy",
  "Death forensics",
  "Prep hygiene",
]) {
  expect(screen.getByText(label)).toBeInTheDocument();
}
expect(screen.getAllByText("Not yet available")).toHaveLength(4);
expect(
  screen.queryByRole("button", { name: /Spell discipline/ }),
).not.toBeInTheDocument();
```

with:

```tsx
expect(
  screen.getByRole("button", { name: /Spell discipline/ }),
).toBeInTheDocument();
for (const label of ["Mana economy", "Death forensics", "Prep hygiene"]) {
  expect(screen.getByText(label)).toBeInTheDocument();
}
expect(screen.getAllByText("Not yet available")).toHaveLength(3);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — TypeScript error (missing required props) and/or the updated assertions failing
against the still-disabled "Spell discipline" tile.

- [ ] **Step 3: Update the implementation**

In `src/app/components/Scorecard/index.tsx`:

Add these imports alongside the existing `LifebloomDisciplineContent`/
`useLifebloomDisciplineSummary` imports:

```ts
import { SpellDisciplineContent } from "../SpellDisciplineContent";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
```

Add the two new required props to `ScorecardProps`, right after `lifebloomAbilityIds`:

```ts
lifebloomAbilityIds: Set<number>;
rejuvenationAbilityIds: Set<number>;
regrowthAbilityIds: Set<number>;
```

Remove the `"spell"` entry from `DISABLED_EPICS`, leaving only `mana`, `death`, `prep`:

```ts
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

Add a `SPELL_DISCIPLINE_ICON` constant right after `GCD_ECONOMY_ICON`:

```ts
const SPELL_DISCIPLINE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg";
```

Destructure the two new props in the `Scorecard` function signature, right after
`lifebloomAbilityIds`:

```ts
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
```

Add the summary hook call right after `lifebloomSummary`:

```ts
const spellSummary = useSpellDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  fetchEvents,
);
```

Add a `Widget` for the spell epic right after the `lifebloom` `Widget` (inside the
`{activeEpic === null && (...)}` grid, before `{DISABLED_EPICS.map(...)}`):

```tsx
<Widget
  icon={SPELL_DISCIPLINE_ICON}
  label="Spell discipline"
  onOpen={() => setActiveEpic("spell")}
  judgement={
    spellSummary.status === "ready" ? spellSummary.judgement : undefined
  }
  stats={spellSummary.status === "ready" ? spellSummary.stats : undefined}
  note={
    spellSummary.status === "loading"
      ? "Calculating…"
      : spellSummary.status === "error"
        ? spellSummary.error
        : undefined
  }
/>
```

Add a detail block for `activeEpic === "spell"` right after the `activeEpic === "lifebloom"`
block:

```tsx
{
  activeEpic === "spell" && (
    <div className={styles.detail}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => setActiveEpic(null)}
      >
        ← All epics
      </button>
      <div className={styles.epicHeader}>
        <SpellIcon src={SPELL_DISCIPLINE_ICON} />
        <h2 className={styles.epicTitle}>Spell discipline</h2>
        {spellSummary.status === "ready" && (
          <JudgementChip judgement={spellSummary.judgement} />
        )}
      </div>
      <SpellDisciplineContent
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in `LifebloomDisciplineContent`, `App.test.tsx`, or elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx
git commit -m "feat(spell-discipline): enable Spell discipline epic tile (story 301)"
```

---

### Task 8: Resolve Rejuvenation/Regrowth ability IDs in `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `resolveSpellAbilityIds` (`src/abilities/resolveAbilities.ts`, already imported),
  `ScorecardProps` (Task 7).
- Produces: nothing further downstream — this is the last task that touches app wiring.

- [ ] **Step 1: Update the implementation**

In `src/App.tsx`, add these two `useMemo` calls right after the existing
`lifebloomAbilityIds` one:

```ts
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
```

Update `canGetScorecard` to also require the two new sets:

```ts
const canGetScorecard =
  selectedDruid !== null &&
  lifebloomAbilityIds !== null &&
  rejuvenationAbilityIds !== null &&
  regrowthAbilityIds !== null &&
  selectedFightIds.length > 0;
```

Update the Scorecard-rendering guard condition to also check the two new sets, and pass them as
props. Change:

```tsx
{
  report &&
    loadedReport &&
    scorecardRequested &&
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    loadedReport.fights
      .filter((f) => selectedFightIds.includes(f.id))
      .map((f) => (
        <Shell width={800} key={f.id}>
          <Scorecard
            accessToken={accessToken}
            reportCode={report.reportCode}
            fight={f}
            druidId={selectedDruid.id}
            druid={selectedDruid}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={actorNames}
            fetchEvents={wrappedFetchEvents}
            onStartOver={handleStartOver}
          />
        </Shell>
      ));
}
```

to:

```tsx
{
  report &&
    loadedReport &&
    scorecardRequested &&
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    loadedReport.fights
      .filter((f) => selectedFightIds.includes(f.id))
      .map((f) => (
        <Shell width={800} key={f.id}>
          <Scorecard
            accessToken={accessToken}
            reportCode={report.reportCode}
            fight={f}
            druidId={selectedDruid.id}
            druid={selectedDruid}
            lifebloomAbilityIds={lifebloomAbilityIds}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            targetNames={actorNames}
            fetchEvents={wrappedFetchEvents}
            onStartOver={handleStartOver}
          />
        </Shell>
      ));
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — `App.test.tsx`'s existing mocks (`aReportAbility()` defaults to Rejuvenation
gameID `26982`; Regrowth isn't in the mocked ability list, so `regrowthAbilityIds` resolves to
an empty-but-non-null `Set`) satisfy the new `canGetScorecard` checks without any test changes.

- [ ] **Step 3: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): resolve Rejuvenation/Regrowth ability IDs for Spell discipline (story 301)"
```

---

### Task 9: Docs housekeeping — close out story 301

**Files:**

- Modify: `docs/backlog.md`
- Modify: `docs/testing.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/hot-clip-detection-design.md`
- Delete: `docs/plans/hot-clip-detection-plan.md` (this file)

**Interfaces:** none — docs only.

- [ ] **Step 1: Mark story 301 done in the backlog**

In `docs/backlog.md`, change:

```md
### 301 — HoT clip detection (Rejuvenation & Regrowth)
```

to:

```md
### 301 — HoT clip detection (Rejuvenation & Regrowth) ✅ Done
```

- [ ] **Step 2: Record the live-data validation in the testing doc**

In `docs/testing.md`'s known-reports table, the `4GYHZRdtL3bvhpc8` row's "Notable for" cell
already ends with `"...the detection story 203's accidental-bloom counter depends on."`. Append
this sentence to the end of that same cell (same row, same report code — this is a new fight
within an already-listed report, not a new row):

```
Also validated (fight 34, Lady Vashj) that Rejuvenation's duration is a constant 12000ms and Regrowth's HoT component is a constant 27000ms across every observed natural-expiry instance, both cross-checked against periodic Healing-event tick timestamps (3000ms apart) — the duration constants story 301's HoT clip detection depends on. Also confirmed Swiftmend consumption fires `removebuff`, never `refreshbuff`, on the HoT it consumes — the basis for 301 excluding Swiftmend-consumed HoTs from clip detection with no special-case code.
```

- [ ] **Step 3: Update the repo-state summary**

In `CLAUDE.md`'s "Repo state" section, change:

```
...story 701 (single-fight scorecard), and story 008 (default API client fallback) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D starting with story 301.
```

to:

```
...story 701 (single-fight scorecard), story 008 (default API client fallback), and story 301 (HoT clip detection) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D, story 302 next.
```

- [ ] **Step 4: Delete the retired spec and plan**

```bash
git rm docs/specs/hot-clip-detection-design.md docs/plans/hot-clip-detection-plan.md
```

- [ ] **Step 5: Confirm nothing else references the deleted files**

Run: `grep -rn "hot-clip-detection-design\|hot-clip-detection-plan" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: no output (besides the files themselves, which are now deleted).

- [ ] **Step 6: Run full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/backlog.md docs/testing.md CLAUDE.md
git commit -m "docs: close out story 301 (HoT clip detection)"
```
