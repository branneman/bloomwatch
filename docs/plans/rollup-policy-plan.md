# Whole-report rollup policy (story 904) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the whole-report dashboard's worst-of aggregation across fights with a duration-weighted median (plus a fight-count breakdown), so one rough pull no longer single-handedly crushes an otherwise-clean raid night's per-epic verdict — in both the app (`ReportDashboard`) and the CLI calibration tool (`scripts/calibrate.ts`).

**Architecture:** One shared pair of pure functions (`weightedMedianJudgement`, `judgementBreakdown`) added to `src/metrics/judgement.ts`. Two existing call sites — `src/metrics/reportAggregation.ts`'s `worstReadyJudgement` (app) and `scripts/lib/rollup.ts`'s `epicRollupBase` (CLI) — are rewired to call them instead of `worstJudgement`. `ReportDashboard`'s chip strip is updated to pass each fight's duration as weight and render the new breakdown. Nothing about within-fight worst-of aggregation (single-fight scorecard, epic-summary sub-metric combining) changes.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library. No new dependencies.

## Global Constraints

- Full design rationale lives in `docs/specs/rollup-policy-design.md` — read it first if anything below is ambiguous; this plan implements it exactly.
- Spell/ability IDs, thresholds, etc. are not touched by this story — no new judgement threshold values are introduced.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format`/`format:check`) runs full-project via a pre-commit hook — never bypass it (no `--no-verify`).
- Commits follow Conventional Commits (`type(scope): summary`); this story's scope is `rollup`.
- Work happens directly on `main` — no worktree for this story.
- `docs/specs/rollup-policy-design.md` must be deleted in the same commit that finishes closing out the story (Task 5), per this repo's "paperwork retired same commit" convention.
- The pre-commit hook runs `format:check` (Prettier check-only, not autofix) alongside typecheck/lint. If a commit fails on formatting, run `npx prettier --write <the changed files>`, re-stage them, and retry the commit — don't bypass the hook.

---

## Task 1: Shared aggregation policy — `weightedMedianJudgement` / `judgementBreakdown`

**Files:**

- Modify: `src/metrics/judgement.ts`
- Test: `src/metrics/judgement.test.ts`

**Interfaces:**

- Consumes: existing `Judgement` type (`"green" | "orange" | "red"`), already exported from this file.
- Produces:
  - `weightedMedianJudgement(entries: { judgement: Judgement; weightMs: number }[]): Judgement | null`
  - `judgementBreakdown(entries: { judgement: Judgement }[]): Record<Judgement, number>`
  - Both are consumed by Task 2 (app) and Task 4 (CLI).

- [ ] **Step 1: Write the failing tests**

Append to `src/metrics/judgement.test.ts` (keep the existing `judgeThreshold`/`judgeThresholdBelow` describe blocks above this untouched, just add the import and the new blocks below them):

```ts
import { describe, expect, it } from "vitest";
import {
  judgeThreshold,
  judgeThresholdBelow,
  judgementBreakdown,
  weightedMedianJudgement,
} from "./judgement";
```

(Replace the existing single-line import with the one above.)

```ts
describe("weightedMedianJudgement", () => {
  it("returns null for an empty list", () => {
    expect(weightedMedianJudgement([])).toBeNull();
  });

  it("returns null when every entry has zero weight", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "red", weightMs: 0 },
        { judgement: "green", weightMs: 0 },
      ]),
    ).toBeNull();
  });

  it("returns green when green fights account for most of the duration", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 8000 },
        { judgement: "red", weightMs: 1000 },
      ]),
    ).toBe("green");
  });

  it("returns orange when orange-or-worse crosses half the duration but red alone doesn't", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 4000 },
        { judgement: "orange", weightMs: 4000 },
        { judgement: "red", weightMs: 2000 },
      ]),
    ).toBe("orange");
  });

  it("returns red when red alone accounts for more than half the duration", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 3000 },
        { judgement: "red", weightMs: 7000 },
      ]),
    ).toBe("red");
  });

  it("rounds an exact green/red boundary tie toward red", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 5000 },
        { judgement: "red", weightMs: 5000 },
      ]),
    ).toBe("red");
  });

  it("rounds an exact green/orange boundary tie toward orange", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 5000 },
        { judgement: "orange", weightMs: 5000 },
      ]),
    ).toBe("orange");
  });

  it("reproduces story 904's cited GCD economy split without red dominating", () => {
    // docs/backlog.md story 904: a real corpus's GCD economy fights split
    // 33% green / 27% orange / 39% red by fight, but worst-of rollup reads
    // 0% green / 9% orange / 91% red. Modeled here as equal-duration
    // fights so the weighting is uniform and the split is exact.
    const entries: { judgement: Judgement; weightMs: number }[] = [
      ...Array.from({ length: 33 }, () => ({
        judgement: "green" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 27 }, () => ({
        judgement: "orange" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 39 }, () => ({
        judgement: "red" as const,
        weightMs: 1000,
      })),
    ];
    expect(weightedMedianJudgement(entries)).toBe("orange");
  });
});

describe("judgementBreakdown", () => {
  it("counts fights per judgement bucket", () => {
    expect(
      judgementBreakdown([
        { judgement: "green" },
        { judgement: "green" },
        { judgement: "orange" },
        { judgement: "red" },
      ]),
    ).toEqual({ green: 2, orange: 1, red: 1 });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(judgementBreakdown([])).toEqual({ green: 0, orange: 0, red: 0 });
  });
});
```

Note: `weightedMedianJudgement`'s test entries use `Judgement` as a type — add `import type { Judgement } from "./judgement";` is unnecessary since the test file is already inside the same module scope importing `judgementBreakdown`/`weightedMedianJudgement` from `./judgement`; add a `type Judgement` import alongside the value imports:

```ts
import {
  judgeThreshold,
  judgeThresholdBelow,
  judgementBreakdown,
  weightedMedianJudgement,
  type Judgement,
} from "./judgement";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/judgement.test.ts`
Expected: FAIL — `weightedMedianJudgement`/`judgementBreakdown` are not exported yet.

- [ ] **Step 3: Implement the functions**

Append to `src/metrics/judgement.ts` (after the existing `worstJudgement` function, keep everything above it unchanged):

```ts
// Duration-weighted median across a report's fights for one epic — story
// 904. Walks from the worst bucket down using >= comparisons, which is
// what encodes "round toward red on an exact 50% tie": the median is
// already the mechanism pulling the rollup toward leniency, so ties
// shouldn't add more of that. See docs/thresholds.md's compounding-factors
// section for the full rationale (also formerly docs/specs/
// rollup-policy-design.md, retired once this shipped).
export function weightedMedianJudgement(
  entries: { judgement: Judgement; weightMs: number }[],
): Judgement | null {
  const total = entries.reduce((acc, e) => acc + e.weightMs, 0);
  if (total === 0) return null;
  const half = total / 2;
  const redWeight = entries
    .filter((e) => e.judgement === "red")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (redWeight >= half) return "red";
  const orangeWeight = entries
    .filter((e) => e.judgement === "orange")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (redWeight + orangeWeight >= half) return "orange";
  return "green";
}

// How many fights landed in each judgement bucket — a fight-count (not
// duration-weighted) companion to weightedMedianJudgement above, so a
// rollup headline can still show what drove it (story 904's diagnostic-
// value requirement) without the raw worst-of dominating the headline
// itself.
export function judgementBreakdown(
  entries: { judgement: Judgement }[],
): Record<Judgement, number> {
  return {
    green: entries.filter((e) => e.judgement === "green").length,
    orange: entries.filter((e) => e.judgement === "orange").length,
    red: entries.filter((e) => e.judgement === "red").length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/judgement.test.ts`
Expected: PASS, all tests including the pre-existing `judgeThreshold`/`judgeThresholdBelow` ones.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/judgement.ts src/metrics/judgement.test.ts
git commit -m "feat(rollup): add duration-weighted median judgement policy

Shared by the app's whole-report rollup and the CLI calibration tool's
rollup (both wired up in follow-on commits) — story 904."
```

---

## Task 2: App-side rollup — `rollupEpicJudgement` replaces `worstReadyJudgement`

**Files:**

- Modify: `src/metrics/reportAggregation.ts`
- Test: `src/metrics/reportAggregation.test.ts`

**Interfaces:**

- Consumes: `weightedMedianJudgement`, `judgementBreakdown` from Task 1 (`./judgement`); existing `EpicSummaryStatus` type from `../app/components/Scorecard/epicSummaryStatus`.
- Produces:
  - `export interface EpicRollup { judgement: Judgement; breakdown: Record<Judgement, number> }`
  - `rollupEpicJudgement(entries: { status: EpicSummaryStatus; weightMs: number }[]): EpicRollup | null`
  - Consumed by Task 3 (`ReportDashboard`).
- `combineFightEpicStatus` is unchanged — still exported with the same signature, still used by `ReportDashboard`'s `FightRow`.

- [ ] **Step 1: Write the failing tests**

In `src/metrics/reportAggregation.test.ts`, replace the `import` block and the `worstReadyJudgement` describe block. The `combineFightEpicStatus` describe block and the `loading`/`green`/`orange`/`red`/`errored` constants above it stay exactly as they are.

Replace:

```ts
import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  worstReadyJudgement,
} from "./reportAggregation";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";
```

with:

```ts
import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  rollupEpicJudgement,
} from "./reportAggregation";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";
```

Replace the entire `describe("worstReadyJudgement", ...)` block (the last block in the file) with:

```ts
describe("rollupEpicJudgement", () => {
  it("returns null when nothing has resolved yet", () => {
    expect(
      rollupEpicJudgement([
        { status: loading, weightMs: 1000 },
        { status: loading, weightMs: 1000 },
      ]),
    ).toBeNull();
  });

  it("ignores not-yet-ready and errored entries, aggregating only the ready ones", () => {
    expect(
      rollupEpicJudgement([
        { status: green, weightMs: 9000 },
        { status: loading, weightMs: 9000 },
        { status: errored, weightMs: 9000 },
        { status: red, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "green",
      breakdown: { green: 1, orange: 0, red: 1 },
    });
  });

  it("reports a duration-weighted median, not a worst-of, across ready fights", () => {
    expect(
      rollupEpicJudgement([
        { status: green, weightMs: 8000 },
        { status: green, weightMs: 8000 },
        { status: red, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "green",
      breakdown: { green: 2, orange: 0, red: 1 },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: FAIL — `rollupEpicJudgement` is not exported yet (`worstReadyJudgement` no longer exists either, so the import itself fails).

- [ ] **Step 3: Implement `rollupEpicJudgement`**

Replace the full contents of `src/metrics/reportAggregation.ts` with:

```ts
import type { Judgement } from "./judgement";
import {
  worstJudgement,
  weightedMedianJudgement,
  judgementBreakdown,
} from "./judgement";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

export type OverallJudgementStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement };

// One fight's six epic summaries -> a single overall status for that fight's
// row chip. Waits for every epic to resolve before judging — unlike
// rollupEpicJudgement below — since a single fight's own verdict shouldn't
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

export interface EpicRollup {
  judgement: Judgement;
  breakdown: Record<Judgement, number>;
}

// One epic's judgement across every fight in the report -> a single strip
// chip, plus how many fights landed in each bucket (story 904) so a user
// can still see what drove the result even though the headline is a
// duration-weighted median rather than a raw worst-of. Progressive: counts
// only fights whose this-epic summary has resolved so far, ignoring ones
// still loading or errored, so the chip can appear before the whole report
// finishes computing and can only get more accurate as more fights resolve.
export function rollupEpicJudgement(
  entries: { status: EpicSummaryStatus; weightMs: number }[],
): EpicRollup | null {
  const ready = entries.filter(
    (
      e,
    ): e is {
      status: Extract<EpicSummaryStatus, { status: "ready" }>;
      weightMs: number;
    } => e.status.status === "ready",
  );
  if (ready.length === 0) return null;
  const judgement = weightedMedianJudgement(
    ready.map((e) => ({ judgement: e.status.judgement, weightMs: e.weightMs })),
  );
  if (judgement === null) return null;
  return {
    judgement,
    breakdown: judgementBreakdown(
      ready.map((e) => ({ judgement: e.status.judgement })),
    ),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: PASS, all tests including `combineFightEpicStatus`'s unchanged block.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/reportAggregation.ts src/metrics/reportAggregation.test.ts
git commit -m "feat(rollup): replace worstReadyJudgement with rollupEpicJudgement

Uses the duration-weighted median policy from src/metrics/judgement.ts
instead of worst-of, and returns a fight-count breakdown alongside the
judgement — story 904. ReportDashboard is wired up in the next commit."
```

---

## Task 3: `ReportDashboard` — wire up the new rollup and render the breakdown

**Files:**

- Modify: `src/app/components/ReportDashboard/index.tsx`
- Modify: `src/app/components/ReportDashboard/index.module.css`
- Test: `src/app/components/ReportDashboard/index.test.tsx`

**Interfaces:**

- Consumes: `rollupEpicJudgement`, `EpicRollup` from Task 2 (`../../../metrics/reportAggregation`).
- Produces: no new exports — this is a leaf UI component. Renders a chip strip where each chip shows a `JudgementChip` plus a `X green · Y orange · Z red` text line (non-zero buckets only).

- [ ] **Step 1: Write the failing test**

In `src/app/components/ReportDashboard/index.test.tsx`:

1. Fix the two existing lines that read a chip's full text through `.chipLabel`'s parent. Because the label and the new breakdown text will share a wrapper `<div>` that is _not_ the same element as the outer `.chip` (which also contains the `JudgementChip`), reaching only one level up no longer captures the judgement text. Change both occurrences of:

   ```ts
   (label) => screen.getByText(label).parentElement?.textContent,
   ```

   to:

   ```ts
   (label) => screen.getByText(label).parentElement?.parentElement?.textContent,
   ```

   (There are two occurrences — one building `soloChipText`, one building `comboChipText`, inside the `"excludes an off-role fight's judgements from the aggregate strip and labels its row"` test.)

2. Add a new test at the end of the `describe("ReportDashboard", ...)` block, right before the final closing `});`:

```ts
  it("shows a fight-count breakdown next to each aggregate chip once every fight resolves", async () => {
    const cleanFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const deadlyFight = aFight({
      id: 2,
      name: "Leotheras the Blind",
      kill: true,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      if (dataType === "Casts") return Promise.resolve([]);
      if (fight.id === 2 && dataType === "Buffs") {
        return Promise.resolve([
          anApplyBuffEvent({
            sourceID: 101,
            targetID: 55,
            abilityGameID: 33763,
            timestamp: deadlyFight.startTime,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Deaths") {
        return Promise.resolve([
          aDeathEvent({
            targetID: 55,
            timestamp: deadlyFight.startTime + 10000,
          }),
        ]);
      }
      return Promise.resolve([]);
    };

    render(
      <ReportDashboard
        {...baseProps}
        fights={[cleanFight, deadlyFight]}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    const deathChipText = screen.getByText("Death forensics").parentElement
      ?.parentElement?.textContent;
    expect(deathChipText).toContain("1 green");
    expect(deathChipText).toContain("1 red");
  });
```

This reuses the exact death/buff event shapes already proven in the `"excludes an off-role fight's..."` test above it: `cleanFight` gets zero death events (green Death Forensics, matching `worstJudgement([])`'s empty-array default), `deadlyFight` gets one maintained-target death with both cooldowns unspent (red Death Forensics).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: FAIL — the new test fails because the chip strip doesn't render a breakdown yet, and the two fixed lines in the off-role test still pass (they're a structural fix, not new behavior) so only the new test should fail at this point.

- [ ] **Step 3: Implement the component and CSS changes**

In `src/app/components/ReportDashboard/index.tsx`:

Replace the import:

```ts
import {
  combineFightEpicStatus,
  worstReadyJudgement,
} from "../../../metrics/reportAggregation";
```

with:

```ts
import {
  combineFightEpicStatus,
  rollupEpicJudgement,
} from "../../../metrics/reportAggregation";
import type { Judgement } from "../../../metrics/judgement";
```

Add this helper function near `epicKey` (right after it):

```ts
function formatJudgementBreakdown(
  breakdown: Record<Judgement, number>,
): string {
  const parts: string[] = [];
  if (breakdown.green > 0) parts.push(`${breakdown.green} green`);
  if (breakdown.orange > 0) parts.push(`${breakdown.orange} orange`);
  if (breakdown.red > 0) parts.push(`${breakdown.red} red`);
  return parts.join(" · ");
}
```

Replace:

```ts
const onRoleRows = rows.filter(
  (row) => healingRoleByFight.get(row.fight.id) !== false,
);
const allSummaries = onRoleRows
  .map((row) => summariesByFight.get(row.fight.id))
  .filter((s): s is FightEpicSummaries => s !== undefined);
```

with:

```ts
const onRoleRows = rows.filter(
  (row) => healingRoleByFight.get(row.fight.id) !== false,
);
const onRoleEntries = onRoleRows
  .map((row) => {
    const summaries = summariesByFight.get(row.fight.id);
    return summaries === undefined
      ? undefined
      : { fight: row.fight, summaries };
  })
  .filter(
    (e): e is { fight: Fight; summaries: FightEpicSummaries } =>
      e !== undefined,
  );
```

Replace:

```tsx
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
```

with:

```tsx
<div className={styles.chipStrip}>
  {EPIC_META.map(({ id, label }) => {
    const rollup = rollupEpicJudgement(
      onRoleEntries.map((e) => ({
        status: e.summaries[id],
        weightMs: e.fight.endTime - e.fight.startTime,
      })),
    );
    return (
      <div key={id} className={styles.chip}>
        <div className={styles.chipInfo}>
          <span className={styles.chipLabel}>{label}</span>
          {rollup !== null && (
            <span className={styles.chipBreakdown}>
              {formatJudgementBreakdown(rollup.breakdown)}
            </span>
          )}
        </div>
        {rollup === null ? (
          <span className={styles.calculating}>Calculating…</span>
        ) : (
          <JudgementChip judgement={rollup.judgement} />
        )}
      </div>
    );
  })}
</div>
```

In `src/app/components/ReportDashboard/index.module.css`, replace:

```css
.chipLabel {
  color: var(--text-h);
}
```

with:

```css
.chipInfo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chipLabel {
  color: var(--text-h);
}

.chipBreakdown {
  color: var(--text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS, every test in the file (including the fixed off-role test and the new breakdown test).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ReportDashboard/index.tsx src/app/components/ReportDashboard/index.module.css src/app/components/ReportDashboard/index.test.tsx
git commit -m "feat(rollup): show fight-count breakdown on ReportDashboard's chip strip

Wires the chip strip to rollupEpicJudgement (duration-weighted median)
instead of worst-of, and renders a 'N green · N orange · N red' line
next to each chip so the diagnostic value of the old worst-of headline
isn't lost — story 904."
```

---

## Task 4: CLI rollup — `scripts/lib/rollup.ts` + `scripts/lib/types.ts`

**Files:**

- Modify: `scripts/lib/rollup.ts`
- Modify: `scripts/lib/types.ts`
- Test: `scripts/lib/rollup.test.ts` (new)

**Interfaces:**

- Consumes: `weightedMedianJudgement`, `judgementBreakdown` from Task 1 (`../../src/metrics/judgement`).
- Produces: `EpicRollupBase` (in `scripts/lib/types.ts`) gains `judgementBreakdown: Record<Judgement, number>`, which every epic's rollup interface (`GcdEconomyRollup`, `LifebloomDisciplineRollup`, `SpellDisciplineRollup`, `ManaEconomyRollup`, `DeathForensicsRollup`, `PrepHygieneRollup`) inherits via `extends EpicRollupBase` — no changes needed to those six interfaces themselves.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/rollup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rollupDruid } from "./rollup";
import type { EpicResult, FightResult, GcdEconomyMetrics } from "./types";
import type { Judgement } from "../../src/metrics/judgement";

function erroredEpic(): { status: "error"; error: string } {
  return { status: "error", error: "not exercised by this test" };
}

function readyGcd(
  judgement: Judgement,
  durationMs: number,
): EpicResult<GcdEconomyMetrics> {
  return {
    status: "ready",
    judgement,
    stats: [],
    metrics: {
      gcdUtilization: {
        activeTimeMs: 0,
        fightDurationMs: durationMs,
        utilizationPct: 0,
        judgement,
      },
      idleGaps: {
        gaps: [],
        longestGaps: [],
        totalDeadTimeMs: 0,
        fightDurationMs: durationMs,
        deadTimePct: 0,
        judgement,
      },
    },
  };
}

function aFightResult(
  fightId: number,
  durationMs: number,
  gcdJudgement: Judgement,
): FightResult {
  return {
    fightId,
    bossName: "Test Boss",
    kill: true,
    bossPercentage: null,
    pullNumber: 1,
    durationMs,
    hasNaturesSwiftness: false,
    epics: {
      gcdEconomy: readyGcd(gcdJudgement, durationMs),
      lifebloomDiscipline: erroredEpic(),
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
    informational: {
      concurrentLb3Targets: { avgConcurrent: 0, peakConcurrent: 0, levels: [] },
      naturesSwiftnessAudit: { casts: [], castCount: 0, availableWindows: 0 },
    },
  };
}

describe("rollupDruid", () => {
  it("reports the duration-weighted median judgement for an epic, not a worst-of", () => {
    const fights: FightResult[] = [
      aFightResult(1, 8000, "green"),
      aFightResult(2, 1000, "red"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgement).toBe("green");
  });

  it("exposes a fight-count breakdown alongside the judgement", () => {
    const fights: FightResult[] = [
      aFightResult(1, 5000, "green"),
      aFightResult(2, 5000, "green"),
      aFightResult(3, 5000, "red"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      green: 2,
      orange: 0,
      red: 1,
    });
  });

  it("returns a null judgement and all-zero breakdown when no fights are ready for that epic", () => {
    const rollup = rollupDruid([]);
    expect(rollup.gcdEconomy.judgement).toBeNull();
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      green: 0,
      orange: 0,
      red: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: FAIL — `rollup.gcdEconomy.judgementBreakdown` is `undefined` (type error at compile time even before the assertion, since `EpicRollupBase` doesn't have that field yet — vitest will report a TS error).

- [ ] **Step 3: Implement the wiring**

In `scripts/lib/types.ts`, replace:

```ts
export interface EpicRollupBase {
  judgement: Judgement | null;
  fightsReady: number;
  fightsErrored: number;
}
```

with:

```ts
export interface EpicRollupBase {
  judgement: Judgement | null;
  judgementBreakdown: Record<Judgement, number>;
  fightsReady: number;
  fightsErrored: number;
}
```

In `scripts/lib/rollup.ts`, replace the import line:

```ts
import { worstJudgement, type Judgement } from "../../src/metrics/judgement";
```

with:

```ts
import {
  weightedMedianJudgement,
  judgementBreakdown,
  type Judgement,
} from "../../src/metrics/judgement";
```

Delete the now-unused `rollupJudgement` function entirely (it was the first function in the file, right after the imports):

```ts
function rollupJudgement(judgements: Judgement[]): Judgement | null {
  // worstJudgement([]) defaults to "green" (its reduce's seed value) — wrong
  // here, since "no fights ready" must not read as a clean pass.
  if (judgements.length === 0) return null;
  return worstJudgement(judgements);
}
```

Replace `epicRollupBase`:

```ts
function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  return {
    judgement: rollupJudgement(ready.map((r) => r.judgement)),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}
```

with:

```ts
function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  return {
    judgement: weightedMedianJudgement(
      ready.map((r) => ({ judgement: r.judgement, weightMs: r.durationMs })),
    ),
    judgementBreakdown: judgementBreakdown(
      ready.map((r) => ({ judgement: r.judgement })),
    ),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}
```

`Judgement` remains used elsewhere in the file (`ReadyEntry<M>.judgement: Judgement`), so keep it in the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: PASS, all three tests.

- [ ] **Step 5: Typecheck the scripts project**

`scripts/` is covered by a separate `tsconfig.scripts.json`, run it directly to catch anything the vitest run didn't:

Run: `npx tsc --noEmit -p tsconfig.scripts.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/rollup.ts scripts/lib/types.ts scripts/lib/rollup.test.ts
git commit -m "feat(rollup): apply duration-weighted median policy to the CLI rollup

scripts/lib/rollup.ts's epicRollupBase now uses the same
weightedMedianJudgement/judgementBreakdown policy as the app (story
904), replacing the old worst-of rollupJudgement wrapper. EpicRollupBase
gains judgementBreakdown, flowing into calibrate.ts's JSON output for
every epic."
```

---

## Task 5: Close out the story — docs and full verification

**Files:**

- Modify: `docs/thresholds.md`
- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/rollup-policy-design.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `docs/thresholds.md`'s compounding-factors bullet**

Replace the bullet (in the "Compounding factors" section):

```markdown
- **Worst-of aggregation, three levels deep.** `epicSummary.ts` rolls every metric in an epic up to a single judgement via `worstJudgement` (worst wins, ties toward red). `lb3Uptime.ts` does this per-target before that. `702`'s whole-report dashboard does it again per-fight across a whole raid night. A single red sub-metric — one target's LB3 dipping to 74% for one fight — can be the sole reason an entire epic, or an entire raid night's aggregate, reads red, even if every other target/fight/metric was green.
```

with:

```markdown
- **Worst-of aggregation, two levels deep — revised 2026-07-19 (story 904).** `epicSummary.ts` still rolls every metric in an epic up to a single judgement via `worstJudgement` (worst wins, ties toward red), and `lb3Uptime.ts` still does this per-target before that — a single red sub-metric, like one target's LB3 dipping to 74% for one fight, can still be the sole reason a single fight's own epic reads red. But `702`'s whole-report dashboard no longer compounds that a third time across a whole raid night: it now takes a duration-weighted median of each epic's per-fight judgements (`weightedMedianJudgement` in `src/metrics/judgement.ts`, shared with `scripts/lib/rollup.ts`'s CLI rollup), with a fight-count breakdown shown alongside each chip so a user can still see what drove the result. Motivating corpus data: GCD economy was 33% green / 27% orange / 39% red per fight but 0% green / 9% orange / 91% red under the old worst-of rollup; spell discipline was 70% green per-fight but only 35% green at rollup.
```

- [ ] **Step 2: Mark story 904 done in `docs/backlog.md`**

Replace:

```markdown
### 904 — Overhaul whole-report rollup policy 🔲 Todo

I want the whole-report dashboard's per-epic judgement to stop being a strict worst-of across every fight, so that one rough pull in an otherwise-clean 10-13-fight raid night doesn't single-handedly crush the whole night's verdict to red. Real corpus data showed this starkly: GCD economy was 33% green/27% orange/39% red _per fight_, but 0% green/9% orange/91% red at the worst-of rollup; spell discipline was 70% green per-fight but only 35% green at rollup. The threshold values aren't the problem here — the aggregation is.

**Acceptance criteria**

- A replacement aggregation mechanism is designed and documented (open question as of this writing — no mechanism has been chosen yet; candidates to evaluate include a duration-weighted or count-weighted blend per metric, matching `scripts/lib/rollup.ts`'s existing per-metric pooling rules, versus a "mostly green with call-outs" summary that surfaces the number of red/orange fights without letting the worst one dominate the headline verdict).
- Whatever mechanism is chosen still lets a user drill into which specific fight(s) drove a bad result — this story must not lose the diagnostic value the current (harsh) worst-of policy at least provides honestly.
- The per-fight scorecard (701) is unaffected — this story is scoped to 702's whole-report rollup and `scripts/lib/rollup.ts`'s judgement pooling, not single-fight judging.
```

with:

```markdown
### 904 — Overhaul whole-report rollup policy ✅ Done

I want the whole-report dashboard's per-epic judgement to stop being a strict worst-of across every fight, so that one rough pull in an otherwise-clean 10-13-fight raid night doesn't single-handedly crush the whole night's verdict to red. Real corpus data showed this starkly: GCD economy was 33% green/27% orange/39% red _per fight_, but 0% green/9% orange/91% red at the worst-of rollup; spell discipline was 70% green per-fight but only 35% green at rollup. The threshold values aren't the problem here — the aggregation is.

Implemented as a duration-weighted median (`weightedMedianJudgement`) plus a fight-count breakdown (`judgementBreakdown`), both new pure functions in `src/metrics/judgement.ts`, shared by the app's `ReportDashboard` chip strip (`rollupEpicJudgement` in `src/metrics/reportAggregation.ts`) and `scripts/lib/rollup.ts`'s CLI rollup — one policy, not two. Chosen over a percentage-band cutoff scheme specifically to avoid needing new arbitrary sourced constants (a median needs none); chosen over a per-metric numeric-pool-and-rejudge approach because several metrics (accidental blooms, restack tax, downranking flags) are judged as raw per-fight event counts that can't be meaningfully pooled and re-judged against a single-fight threshold. See `docs/thresholds.md`'s revised compounding-factors bullet for the full mechanism.

**Acceptance criteria**

- A replacement aggregation mechanism is designed and documented (open question as of this writing — no mechanism has been chosen yet; candidates to evaluate include a duration-weighted or count-weighted blend per metric, matching `scripts/lib/rollup.ts`'s existing per-metric pooling rules, versus a "mostly green with call-outs" summary that surfaces the number of red/orange fights without letting the worst one dominate the headline verdict).
- Whatever mechanism is chosen still lets a user drill into which specific fight(s) drove a bad result — this story must not lose the diagnostic value the current (harsh) worst-of policy at least provides honestly.
- The per-fight scorecard (701) is unaffected — this story is scoped to 702's whole-report rollup and `scripts/lib/rollup.ts`'s judgement pooling, not single-fight judging.
```

- [ ] **Step 3: Add story 904 to `CLAUDE.md`'s "Repo state" narrative**

`CLAUDE.md`'s "Repo state" section is a single long paragraph, one sentence per completed story, ending with the most recently completed one. Append a new sentence to the end of that paragraph (after the sentence ending "...left unflagged too since a failed talent read can't honestly be called either supported or unsupported."):

```
 Story 904 (overhaul whole-report rollup policy, epic I) is done too — the whole-report dashboard's per-epic verdict is now a duration-weighted median across that epic's fights (`weightedMedianJudgement` in `src/metrics/judgement.ts`) instead of a strict worst-of, with a fight-count breakdown rendered alongside each chip so a single bad pull no longer silently dominates the headline while still being visible; the same policy is shared by `scripts/lib/rollup.ts`'s CLI calibration rollup via the same function.
```

(Verify the exact preceding sentence text first — search `CLAUDE.md` for "unsupported." to confirm the append point, since this paragraph grows with each story and the exact tail text may have shifted slightly since this plan was written.)

- [ ] **Step 4: Delete the design spec**

```bash
git rm docs/specs/rollup-policy-design.md
```

- [ ] **Step 5: Full verification pass**

Run each of the following and confirm clean output before committing:

```bash
npm run typecheck
npm run lint
npm run format:check
npx vitest run
```

Expected: all four succeed with no errors and no failing tests.

- [ ] **Step 6: Commit**

```bash
git add docs/thresholds.md docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 904, retire its rollup-policy design spec

Marks 904 done in the backlog with a findings summary, revises
docs/thresholds.md's compounding-factors bullet to describe the new
duration-weighted median rollup, and records the change in CLAUDE.md's
repo-state narrative. Design spec deleted per this repo's
paperwork-retired-same-commit convention."
```
