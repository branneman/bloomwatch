# Threshold Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise LB3-uptime-per-target thresholds, add real judgements to Concurrent LB3 targets and Nature's Swiftness utilization (currently informational-only), add a Swiftmend utilization judgement alongside its existing wasteful-share judgement, fix Consumable Throughput's row-combination to use `mixedJudgement` instead of `worstJudgement`, and fold all of the above into the Lifebloom Discipline / Spell Discipline epic verdicts (including a new weighted-median reduction for per-target LB3 judgements) — in both the live app and the CLI calibration tool.

**Architecture:** Every change follows patterns the codebase already established: `judgeThreshold`/`judgeThresholdBelow` for simple bands, `mixedJudgement` for combining sibling judgements (good+bad reads fair), `weightedMedianJudgement` for reducing many equal-ish-weight items to one representative judgement. No new judgement primitives are needed — this is a threshold/wiring change, not new architecture.

**Tech Stack:** TypeScript, React, Vitest, Testing Library — matches the existing codebase exactly.

## Global Constraints

- Every threshold value must ship with a code comment citing its source (CLAUDE.md principle 3) — see each task's exact comment text below.
- No `compute*` function signature change ships without updating every call site in the same commit — the pre-commit hook runs a full-project `npm run typecheck`, so a task that leaves any file failing to compile cannot be committed split across multiple commits.
- Follow existing test conventions exactly: Vitest `describe`/`it`, factories from `src/testUtils/factories.ts`, `toEqual` for full-object assertions (which means adding a field to a result type breaks every existing `toEqual` literal for that type — each task below lists every such literal that needs updating).
- Design of record: `docs/specs/threshold-recalibration-design.md`. Read it first — this plan implements it section-by-section but does not repeat its rationale.

---

### Task 1: LB3 uptime per target — revise thresholds to 80/60

**Files:**

- Modify: `src/metrics/lb3Uptime.ts`
- Test: `src/metrics/lb3Uptime.test.ts`

**Interfaces:**

- Produces: no signature/shape change — `Lb3TargetResult.judgement` is still a `Judgement`, computed the same way, just against new band values.

- [ ] **Step 1: Update the failing test for the new boundary**

In `src/metrics/lb3Uptime.test.ts`, replace the entire `"judges fair between 75% and 90%, good at or above 90%"` test with:

```ts
it("judges fair between 60% and 80%, good at or above 80%", () => {
  const baseEvents = (dropAt: number, reopenAt: number) => [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: dropAt, stack: 2, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: reopenAt, stack: 3, targetID: 42 }),
  ];

  const goodResult = computeLb3Uptime(
    baseEvents(6000, 6500),
    2,
    LB_IDS,
    0,
    11000,
  );
  expect(goodResult.targets[0].lb3UptimePct).toBe(95);
  expect(goodResult.targets[0].judgement).toBe("good");

  const fairResult = computeLb3Uptime(
    baseEvents(6000, 9000),
    2,
    LB_IDS,
    0,
    11000,
  );
  expect(fairResult.targets[0].lb3UptimePct).toBe(70);
  expect(fairResult.targets[0].judgement).toBe("fair");
});
```

(Window is `[1000, 11000]` = 10000ms in both cases, first reached at timestamp 1000. `goodResult`: 500ms down out of 10000ms → 95% → unchanged from before, still good under either band. `fairResult`: 3000ms down (6000→9000) out of 10000ms → 70% → was "fair" under old 75/90 bands too, but now must be verified against the new 80/60 bands: 70% is <80 and >=60 → fair.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: FAIL — `fairResult.targets[0].judgement` is currently `"fair"` too (misleadingly passes by coincidence under old code) but the _comment/intent_ is stale; instead verify the change is meaningful by temporarily confirming `goodResult`/`fairResult` values before touching source. (If this step surprises you because it already passes, that's fine — the real signal is Step 4 below, where the _old_ 90/75 constants would make a 70%-uptime target read "bad", not "fair".) Proceed to Step 3 regardless.

- [ ] **Step 3: Update the thresholds**

In `src/metrics/lb3Uptime.ts`, replace:

```ts
// Good/Fair/Bad thresholds per docs/backlog.md story 201: good >= 90%, fair 75-90%, bad < 75%.
const GOOD_MIN_PCT = 90;
const FAIR_MIN_PCT = 75;
```

with:

```ts
// Good/Fair/Bad thresholds per docs/backlog.md story 201, revised by direct
// request 2026-07-20 (docs/thresholds.md): good >= 80%, fair 60-80%, bad < 60%.
const GOOD_MIN_PCT = 80;
const FAIR_MIN_PCT = 60;
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS (all tests, including the rewritten one)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lb3Uptime.ts src/metrics/lb3Uptime.test.ts
git commit -m "fix(lifebloom): revise LB3 uptime per target to 80/60 good/fair bands"
```

---

### Task 2: Consumable throughput — combine rows via mixedJudgement, not worstJudgement

**Files:**

- Modify: `src/metrics/consumableThroughput.ts`
- Test: `src/metrics/consumableThroughput.test.ts`

**Interfaces:**

- Produces: no shape change — `ConsumableThroughputResult.judgement` is still `Judgement | null`.

- [ ] **Step 1: Update the test that currently asserts worst-of behavior**

In `src/metrics/consumableThroughput.test.ts`, replace the `"takes the fight-level judgement as the worst of both rows"` test with:

```ts
it("reads fair, not a flat bad, when one row is good and the other is bad", () => {
  const events = [
    LOW_MANA_SAMPLE,
    aConsumableCastEvent(1000, MANA_POTION_ID),
    aConsumableCastEvent(2000, MANA_POTION_ID),
    aConsumableCastEvent(3000, MANA_POTION_ID),
  ]; // potions good (3/3), runes bad (0/3)
  const result = computeConsumableThroughput(
    events,
    DRUID_ID,
    RESOLVED_ABILITIES,
    360_000,
  );
  expect(result.judgement).toBe("fair");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/consumableThroughput.test.ts`
Expected: FAIL — actual is `"bad"` (current `worstJudgement` behavior)

- [ ] **Step 3: Swap worstJudgement for mixedJudgement**

In `src/metrics/consumableThroughput.ts`, change the import:

```ts
import { worstJudgement } from "./judgement";
```

to:

```ts
import { mixedJudgement } from "./judgement";
```

and change the final return statement's `judgement` line from:

```ts
    judgement: worstJudgement(rows.map((row) => row.judgement)),
```

to:

```ts
    // mixedJudgement, not worstJudgement — a good potions row and a bad
    // runes row (or vice versa) reads fair, matching every other
    // multi-part judgement in the codebase (see docs/thresholds.md's
    // compounding-factors section). Requested directly, 2026-07-20.
    judgement: mixedJudgement(rows.map((row) => row.judgement)),
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/metrics/consumableThroughput.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metrics/consumableThroughput.ts src/metrics/consumableThroughput.test.ts
git commit -m "fix(mana): combine consumable throughput rows via mixedJudgement, not worst-of"
```

---

### Task 3: Concurrent LB3 targets — add a good-or-null judgement

**Files:**

- Modify: `src/metrics/concurrentLb3Targets.ts`
- Test: `src/metrics/concurrentLb3Targets.test.ts`

**Interfaces:**

- Produces: `ConcurrentLb3Result` gains `judgement: Judgement | null` (only ever `"good"` or `null` — never `"fair"`/`"bad"`).

- [ ] **Step 1: Add failing tests**

In `src/metrics/concurrentLb3Targets.test.ts`, add two new tests at the end of the `describe` block (before the closing `});`):

```ts
it("judges good when 2+ targets held LB3 for at least 50% of the fight", () => {
  const events = [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
    anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
    anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
    anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
    anApplyBuffEvent({ timestamp: 0, targetID: 50 }),
    anApplyBuffStackEvent({ timestamp: 25000, stack: 2, targetID: 50 }),
    anApplyBuffStackEvent({ timestamp: 30000, stack: 3, targetID: 50 }),
  ];

  const result = computeConcurrentLb3Targets(
    events,
    DRUID_ID,
    LB_IDS,
    0,
    100000,
  );

  // Same fixture as the "three-way overlap" test above: levels are
  // 0%=10, 1%=10, 2%=10, 3%=70 -> time at count>=2 is 10+70=80%.
  expect(result.judgement).toBe("good");
});

it("stays unjudged (never fair/bad) just below the 50% time-at-2+ bar", () => {
  const events = [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
    anApplyBuffStackEvent({ timestamp: 4000, stack: 2, targetID: 47 }),
    anApplyBuffStackEvent({ timestamp: 5000, stack: 3, targetID: 47 }),
  ];

  const result = computeConcurrentLb3Targets(events, DRUID_ID, LB_IDS, 0, 9000);

  // Same fixture as the "rounds level percentages" test above: levels
  // are 0%=22, 1%=33, 2%=45 -> time at count>=2 is 45%, just under 50.
  expect(result.judgement).toBeNull();
});
```

- [ ] **Step 2: Update the existing tests' `toEqual` expectations**

Adding a `judgement` field to `ConcurrentLb3Result` breaks every existing full-object `toEqual` assertion in this file (extra key). Update each of the 8 existing `expect(result).toEqual({...})` blocks to add the `judgement` field, computed as: sum the `pct` of every level with `count >= 2`; `"good"` if that sum is `>= 50`, else `null`.

| Test name                                                            | Levels                          | Time at 2+ | `judgement` to add |
| -------------------------------------------------------------------- | ------------------------------- | ---------- | ------------------ |
| "returns zero average/peak and a full-fight level 0 with no events"  | `[{0,100}]`                     | 0%         | `null`             |
| "computes overlapping windows for two maintained targets"            | `[{0,20},{1,10},{2,70}]`        | 70%        | `"good"`           |
| "computes back-to-back non-overlapping windows..."                   | `[{0,40},{1,60}]`               | 0%         | `null`             |
| "excludes a target below the 30% maintained-uptime threshold..."     | `[{0,100}]`                     | 0%         | `null`             |
| "closes an interval still open at fightEnd"                          | `[{0,40},{1,60}]`               | 0%         | `null`             |
| "produces a level-3 segment for a three-way overlap"                 | `[{0,10},{1,10},{2,10},{3,70}]` | 80%        | `"good"`           |
| "rounds level percentages to whole numbers that still sum to 100"    | `[{0,22},{1,33},{2,45}]`        | 45%        | `null`             |
| "ignores events from a different caster and non-Lifebloom abilities" | `[{0,100}]`                     | 0%         | `null`             |

For example, the first one becomes:

```ts
expect(result).toEqual({
  avgConcurrent: 0,
  peakConcurrent: 0,
  levels: [{ count: 0, pct: 100 }],
  judgement: null,
});
```

Apply the same pattern (add `judgement: null` or `judgement: "good"` per the table) to all 8.

- [ ] **Step 3: Run the test file to verify the new tests fail**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: FAIL — `judgement` is `undefined` on the actual result; TS may also fail to compile the new `toEqual` literals until Step 4 lands.

- [ ] **Step 4: Implement the judgement**

In `src/metrics/concurrentLb3Targets.ts`, add the import:

```ts
import { type Judgement } from "./judgement";
```

Add `judgement: Judgement | null;` to the `ConcurrentLb3Result` interface:

```ts
export interface ConcurrentLb3Result {
  avgConcurrent: number;
  peakConcurrent: number;
  levels: ConcurrentLb3Level[];
  judgement: Judgement | null;
}
```

At the end of `computeConcurrentLb3Targets`, just before the `return { avgConcurrent, peakConcurrent, levels };` line, add:

```ts
// Reward-only signal, per docs/backlog.md story 205 (revised story 914,
// direct request 2026-07-20): the "right" number of concurrent targets
// depends on raid healing assignments this app can't see, so below the
// bar stays unjudged rather than penalized — never "fair" or "bad".
const timeAt2PlusPct = levels
  .filter((level) => level.count >= 2)
  .reduce((sum, level) => sum + level.pct, 0);
const judgement: Judgement | null = timeAt2PlusPct >= 50 ? "good" : null;

return { avgConcurrent, peakConcurrent, levels, judgement };
```

- [ ] **Step 5: Run the test file to verify it passes**

Run: `npx vitest run src/metrics/concurrentLb3Targets.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 6: Commit**

```bash
git add src/metrics/concurrentLb3Targets.ts src/metrics/concurrentLb3Targets.test.ts
git commit -m "feat(lifebloom): judge concurrent LB3 targets good when 2+ sustained >=50% of the fight"
```

---

### Task 4: Nature's Swiftness — add a utilization judgement

**Files:**

- Modify: `src/metrics/naturesSwiftnessAudit.ts`
- Test: `src/metrics/naturesSwiftnessAudit.test.ts`

**Interfaces:**

- Produces: `NaturesSwiftnessAuditResult` gains `utilizationPct: number` and `judgement: Judgement`.

- [ ] **Step 1: Update the existing full-object `toEqual` test**

In `src/metrics/naturesSwiftnessAudit.test.ts`, update the first test:

```ts
it("returns no casts and the floor of fight duration over 180s, plus one, with no events", () => {
  const result = computeNaturesSwiftnessAudit(
    [],
    DRUID_ID,
    NS_IDS,
    RESOLVED,
    400000,
  );

  expect(result).toEqual({
    casts: [],
    castCount: 0,
    availableWindows: 3,
    utilizationPct: 0,
    judgement: "bad",
  });
});
```

(400000ms → `floor(400000/180000)+1 = 3` windows, not 1, so the standard bands apply: 0/3 = 0% → bad.)

- [ ] **Step 2: Add new tests for the utilization judgement, including the 1-window exception**

Add at the end of the `describe` block:

```ts
it.each([
  { durationMs: 100000, castCount: 0, expectedPct: 0, expected: "fair" }, // 1 window, unused — reserve is reasonable
  { durationMs: 100000, castCount: 1, expectedPct: 100, expected: "good" }, // 1 window, used
  { durationMs: 200000, castCount: 0, expectedPct: 0, expected: "bad" }, // 2 windows
  { durationMs: 200000, castCount: 1, expectedPct: 50, expected: "fair" },
  { durationMs: 200000, castCount: 2, expectedPct: 100, expected: "good" },
  { durationMs: 400000, castCount: 1, expectedPct: 100 / 3, expected: "bad" }, // 3 windows
  { durationMs: 400000, castCount: 2, expectedPct: 200 / 3, expected: "fair" },
  { durationMs: 400000, castCount: 3, expectedPct: 100, expected: "good" },
])(
  "judges $expected for $castCount casts of the windows available in a $durationMs ms fight",
  ({ durationMs, castCount, expectedPct, expected }) => {
    const castEvents = Array.from({ length: castCount }, (_, i) =>
      aCastEvent({ timestamp: i * 1000, targetID: -1, abilityGameID: 17116 }),
    );

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      durationMs,
    );

    expect(result.utilizationPct).toBeCloseTo(expectedPct, 5);
    expect(result.judgement).toBe(expected);
  },
);
```

- [ ] **Step 3: Run the test file to verify it fails**

Run: `npx vitest run src/metrics/naturesSwiftnessAudit.test.ts`
Expected: FAIL — `utilizationPct`/`judgement` don't exist yet on the result.

- [ ] **Step 4: Implement the judgement**

In `src/metrics/naturesSwiftnessAudit.ts`, add the import:

```ts
import { judgeThreshold, type Judgement } from "./judgement";
```

Add the two new fields to the result interface:

```ts
export interface NaturesSwiftnessAuditResult {
  casts: NaturesSwiftnessCast[];
  castCount: number;
  availableWindows: number;
  utilizationPct: number;
  judgement: Judgement;
}
```

Add a judging helper above `computeNaturesSwiftnessAudit`:

```ts
// good >= 75% / fair 50-75% / bad < 50% of theoretical 3-minute-cooldown
// windows used, per docs/backlog.md story 304 (revised story 914, direct
// request 2026-07-20) — same bands as Swiftmend's utilization judgement
// (src/metrics/swiftmendAudit.ts). One exception: a fight with only 1
// available window (under 3 minutes) can only ever land on 0% or 100%
// utilization, and holding Nature's Swiftness in reserve for a real
// emergency that may just not occur is reasonable on a short fight — so 0
// casts there reads fair, not bad.
function judgeUtilization(
  castCount: number,
  availableWindows: number,
  utilizationPct: number,
): Judgement {
  if (availableWindows === 1) {
    return castCount >= 1 ? "good" : "fair";
  }
  return judgeThreshold(utilizationPct, { goodMin: 75, fairMin: 50 });
}
```

Replace the return statement of `computeNaturesSwiftnessAudit`:

```ts
return {
  casts,
  castCount: casts.length,
  // +1: NS is available at the pull (t=0), then again every cooldown
  // period after — so a fight of any length has at least one window.
  availableWindows:
    Math.floor(fightDurationMs / NATURES_SWIFTNESS_COOLDOWN_MS) + 1,
};
```

with:

```ts
// +1: NS is available at the pull (t=0), then again every cooldown
// period after — so a fight of any length has at least one window (and
// this is therefore always >= 1, never 0).
const availableWindows =
  Math.floor(fightDurationMs / NATURES_SWIFTNESS_COOLDOWN_MS) + 1;
const utilizationPct = (casts.length / availableWindows) * 100;

return {
  casts,
  castCount: casts.length,
  availableWindows,
  utilizationPct,
  judgement: judgeUtilization(casts.length, availableWindows, utilizationPct),
};
```

- [ ] **Step 5: Run the test file to verify it passes**

Run: `npx vitest run src/metrics/naturesSwiftnessAudit.test.ts`
Expected: PASS (all tests, including the 8 new `it.each` cases)

- [ ] **Step 6: Commit**

```bash
git add src/metrics/naturesSwiftnessAudit.ts src/metrics/naturesSwiftnessAudit.test.ts
git commit -m "feat(spell-discipline): judge Nature's Swiftness utilization instead of leaving it informational"
```

---

### Task 5: Swiftmend — add a utilization judgement alongside wasteful share

**Files:**

- Modify: `src/metrics/swiftmendAudit.ts`
- Test: `src/metrics/swiftmendAudit.test.ts`
- Test: `src/metrics/epicSummary.test.ts` (mechanical fixup only — see Step 3)

**Interfaces:**

- Produces: `SwiftmendAuditResult` gains `utilizationPct: number` and `utilizationJudgement: Judgement`.

- [ ] **Step 1: Update the existing full-object `toEqual` test**

In `src/metrics/swiftmendAudit.test.ts`, update the first test:

```ts
it("returns no casts, zero wasteful share, and good judgement with no events", () => {
  const result = computeSwiftmendAudit(
    [],
    [],
    [],
    DRUID_ID,
    SWIFTMEND_IDS,
    REJUV_IDS,
    REGROWTH_IDS,
    341000,
  );

  expect(result).toEqual({
    casts: [],
    swiftmendCastCount: 0,
    wastefulCount: 0,
    wastefulPct: 0,
    judgement: "good",
    availableWindows: 22,
    utilizationPct: 0,
    utilizationJudgement: "bad",
  });
});
```

- [ ] **Step 2: Add a new `it.each` for the utilization bands**

Add after the existing wasteful-share `it.each` block (before `"computes availableWindows as the floor of fight duration over 15s"`):

```ts
it.each([
  { castCount: 20, expectedPct: (20 / 22) * 100, expected: "good" }, // 22 windows in a 341000ms fight
  { castCount: 12, expectedPct: (12 / 22) * 100, expected: "fair" },
  { castCount: 5, expectedPct: (5 / 22) * 100, expected: "bad" },
])(
  "judges $expected utilization for $castCount casts of 22 available windows",
  ({ castCount, expectedPct, expected }) => {
    const castEvents = Array.from({ length: castCount }, (_, i) =>
      aCastEvent({
        timestamp: i * 15000,
        targetID: 50,
        abilityGameID: 18562,
      }),
    );

    const result = computeSwiftmendAudit(
      [],
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.swiftmendCastCount).toBe(castCount);
    expect(result.utilizationPct).toBeCloseTo(expectedPct, 5);
    expect(result.utilizationJudgement).toBe(expected);
  },
);
```

(These casts have no matching buff-removal event, so `result.casts` stays empty and `wastefulPct` stays 0 — only `swiftmendCastCount`/`utilizationPct` are exercised here, same pattern as the existing "skips a Swiftmend cast with no matching HoT removal, but still counts it in swiftmendCastCount" test.)

- [ ] **Step 3: Fix the 5 `SwiftmendAuditResult` literals in `epicSummary.test.ts` so the project still compiles**

`SwiftmendAuditResult` gains 2 required fields; `src/metrics/epicSummary.test.ts` constructs 5 literals of this type (inside `describe("summarizeSpellDiscipline", ...)`). This step is a mechanical fixup only — it does **not** touch `epicSummary.ts`'s logic (that's Task 6). Add `utilizationPct` and `utilizationJudgement` to each of these 5 existing `swiftmendAudit` object literals, per this table:

| Test name                                                                                                     | Add                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| "takes the worst of Rejuvenation's clip judgement and the Swiftmend judgement"                                | `utilizationPct: 90, utilizationJudgement: "good",` |
| "is good when Rejuvenation clips, Swiftmend wasteful share, and downranking are all good"                     | `utilizationPct: 90, utilizationJudgement: "good",` |
| "reads fair (not bad) when Swiftmend's wasteful share is bad but Rejuvenation clips and downranking are good" | `utilizationPct: 90, utilizationJudgement: "good",` |
| "turns fair when downranking has a flag, even if Rejuvenation clips and Swiftmend are good"                   | `utilizationPct: 90, utilizationJudgement: "good",` |
| "excludes Swiftmend's judgement and stat line when hasSwiftmend is false"                                     | `utilizationPct: 0, utilizationJudgement: "bad",`   |

For example, the first one's `swiftmendAudit` literal becomes:

```ts
const swiftmendAudit: SwiftmendAuditResult = {
  casts: [],
  swiftmendCastCount: 6,
  wastefulCount: 0,
  wastefulPct: 0,
  judgement: "good",
  availableWindows: 22,
  utilizationPct: 90,
  utilizationJudgement: "good",
};
```

- [ ] **Step 4: Run both test files to verify Step 1-2 changes fail, then implement**

Run: `npx vitest run src/metrics/swiftmendAudit.test.ts src/metrics/epicSummary.test.ts`
Expected: FAIL — `utilizationPct`/`utilizationJudgement` don't exist yet; TS compile errors on the new/updated literals.

In `src/metrics/swiftmendAudit.ts`, change the import:

```ts
import { judgeThresholdBelow } from "./judgement";
```

to:

```ts
import { judgeThreshold, judgeThresholdBelow } from "./judgement";
```

Add the two new fields to `SwiftmendAuditResult`:

```ts
export interface SwiftmendAuditResult {
  casts: SwiftmendCastResult[];
  swiftmendCastCount: number;
  wastefulCount: number;
  wastefulPct: number;
  judgement: Judgement;
  availableWindows: number;
  utilizationPct: number;
  utilizationJudgement: Judgement;
}
```

Add a judging helper near `judgeWastefulShare`:

```ts
// good >= 75% / fair 50-75% / bad < 50% of theoretical 15s-cooldown windows
// used, per docs/backlog.md story 302, revised by direct request
// 2026-07-20 (docs/thresholds.md) — separate from (and combined with, in
// epicSummary.ts) the wasteful-share judgement above: this measures
// whether Swiftmend was used often enough, not whether each use was
// justified.
function judgeUtilization(utilizationPct: number): Judgement {
  return judgeThreshold(utilizationPct, { goodMin: 75, fairMin: 50 });
}
```

Replace the return statement of `computeSwiftmendAudit`:

```ts
return {
  casts,
  swiftmendCastCount: swiftmendCasts.length,
  wastefulCount,
  wastefulPct,
  judgement: judgeWastefulShare(wastefulPct),
  availableWindows: Math.floor(fightDurationMs / SWIFTMEND_COOLDOWN_MS),
};
```

with:

```ts
const availableWindows = Math.floor(fightDurationMs / SWIFTMEND_COOLDOWN_MS);
const utilizationPct =
  availableWindows === 0 ? 0 : (swiftmendCasts.length / availableWindows) * 100;

return {
  casts,
  swiftmendCastCount: swiftmendCasts.length,
  wastefulCount,
  wastefulPct,
  judgement: judgeWastefulShare(wastefulPct),
  availableWindows,
  utilizationPct,
  utilizationJudgement: judgeUtilization(utilizationPct),
};
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `npx vitest run src/metrics/swiftmendAudit.test.ts src/metrics/epicSummary.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full project typecheck to catch any other literal I missed**

Run: `npm run typecheck`
Expected: PASS. If it fails on a `SwiftmendAuditResult` literal outside the 6 files touched above, add the same 2 fields there too (realistic values matching that test's intent) before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/metrics/swiftmendAudit.ts src/metrics/swiftmendAudit.test.ts src/metrics/epicSummary.test.ts
git commit -m "feat(spell-discipline): judge Swiftmend utilization alongside its existing wasteful-share judgement"
```

---

### Task 6: Wire the new judgements into the Lifebloom Discipline / Spell Discipline epic verdicts

This is the largest task — `summarizeLifebloomDiscipline`/`summarizeSpellDiscipline`'s signatures change, which means every call site (both React hooks, `useFightEpicSummaries.ts`) must be updated in the same commit to keep the project compiling.

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Test: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`
- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.ts`
- Test: `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
- Modify: `src/app/components/Scorecard/useFightEpicSummaries.ts`

**Interfaces:**

- Consumes: `ConcurrentLb3Result.judgement` (Task 3), `SwiftmendAuditResult.utilizationJudgement` (Task 5), `NaturesSwiftnessAuditResult.utilizationPct`/`.judgement` (Task 4), `weightedMedianJudgement`/`mixedJudgement` (already exist in `src/metrics/judgement.ts`, unchanged).
- Produces: `summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent)` — new 5th param. `summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking, hasSwiftmend, naturesSwiftnessAudit, hasNaturesSwiftness)` — 2 new trailing params (the original 4 keep their exact positions, per CLAUDE.md's warning about same-typed adjacent-parameter swaps — the 2 new params are appended, not interleaved).

- [ ] **Step 1: Update `epicSummary.test.ts`'s existing `summarizeLifebloomDiscipline` calls to pass a neutral 5th arg**

Add the import at the top of `src/metrics/epicSummary.test.ts`:

```ts
import type { ConcurrentLb3Result } from "./concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "./naturesSwiftnessAudit";
```

Add a neutral fixture near the top of the file (after the imports, before the first `describe`):

```ts
const NEUTRAL_CONCURRENT: ConcurrentLb3Result = {
  avgConcurrent: 0,
  peakConcurrent: 0,
  levels: [],
  judgement: null,
};

const NEUTRAL_NS: NaturesSwiftnessAuditResult = {
  casts: [],
  castCount: 0,
  availableWindows: 1,
  utilizationPct: 0,
  judgement: "fair",
};
```

In `describe("summarizeLifebloomDiscipline", ...)`, add `NEUTRAL_CONCURRENT` as a 5th argument to all 4 existing `summarizeLifebloomDiscipline(lb3, refresh, blooms, restack)` calls, e.g.:

```ts
    expect(
      summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, NEUTRAL_CONCURRENT),
    ).toEqual({ ... }); // unchanged expected value
```

Do this for all 4 (the assertions themselves — the expected `judgement`/`stats` values — stay exactly as they are today; only the function call gains the 5th arg).

- [ ] **Step 2: Add 2 new tests for the weighted-median reduction and the concurrent fold-in**

Add inside `describe("summarizeLifebloomDiscipline", ...)`:

```ts
it("reduces 3 similarly-weighted per-target judgements (good/fair/good) to good before combining with other good siblings", () => {
  // Real-world motivating case: 3 well-maintained targets at 96%/75%/94%
  // uptime (good/fair/good under the 80/60 bands) should read as
  // excellent Lifebloom discipline, not "fair" from a flat worst-of.
  const lb3: Lb3UptimeResult = {
    targets: [
      {
        targetId: 1,
        lbUptimePct: 96,
        lb3UptimeMs: 96000,
        windowMs: 100000,
        lb3UptimePct: 96,
        judgement: "good",
      },
      {
        targetId: 2,
        lbUptimePct: 75,
        lb3UptimeMs: 75000,
        windowMs: 100000,
        lb3UptimePct: 75,
        judgement: "fair",
      },
      {
        targetId: 3,
        lbUptimePct: 94,
        lb3UptimeMs: 94000,
        windowMs: 100000,
        lb3UptimePct: 94,
        judgement: "good",
      },
    ],
  };
  const refresh: RefreshCadenceResult = {
    intervalCount: 5,
    medianMs: 6400,
    judgement: "good",
    buckets: [],
  };
  const blooms: AccidentalBloomsResult = {
    accidentalBlooms: [],
    count: 0,
    judgement: "good",
  };
  const restack: RestackTaxResult = {
    casts: [],
    castCount: 0,
    estimatedMana: 0,
    judgement: "good",
  };
  const concurrent: ConcurrentLb3Result = {
    avgConcurrent: 2.4,
    peakConcurrent: 3,
    levels: [],
    judgement: "good",
  };

  expect(
    summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent)
      .judgement,
  ).toBe("good");
});

it("keeps the epic at fair when the weighted median genuinely favors the weaker target", () => {
  const lb3: Lb3UptimeResult = {
    targets: [
      {
        targetId: 1,
        lbUptimePct: 96,
        lb3UptimeMs: 9600,
        windowMs: 10000,
        lb3UptimePct: 96,
        judgement: "good",
      },
      {
        targetId: 2,
        lbUptimePct: 65,
        lb3UptimeMs: 58500,
        windowMs: 90000,
        lb3UptimePct: 65,
        judgement: "fair",
      },
    ],
  };
  const refresh: RefreshCadenceResult = {
    intervalCount: 5,
    medianMs: 6400,
    judgement: "good",
    buckets: [],
  };
  const blooms: AccidentalBloomsResult = {
    accidentalBlooms: [],
    count: 0,
    judgement: "good",
  };
  const restack: RestackTaxResult = {
    casts: [],
    castCount: 0,
    estimatedMana: 0,
    judgement: "good",
  };

  expect(
    summarizeLifebloomDiscipline(
      lb3,
      refresh,
      blooms,
      restack,
      NEUTRAL_CONCURRENT,
    ).judgement,
  ).toBe("fair");
});
```

(Second test: target 2's `windowMs` of 90000 dominates target 1's 10000, so the weighted median lands on "fair" — proving the reduction is a genuine weighted calculation, not always "good".)

- [ ] **Step 3: Update `epicSummary.test.ts`'s existing `summarizeSpellDiscipline` calls to pass 2 neutral trailing args**

In `describe("summarizeSpellDiscipline", ...)`, add `NEUTRAL_NS, false` as 5th/6th arguments to all 5 existing `summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking, hasSwiftmend)` calls, e.g.:

```ts
    expect(
      summarizeSpellDiscipline(
        hotClips,
        swiftmendAudit,
        GOOD_DOWNRANKING,
        true,
        NEUTRAL_NS,
        false,
      ),
    ).toEqual({ ... }); // unchanged expected value
```

Apply to all 5 (including the `.judgement`-only assertions) — expected values stay unchanged.

- [ ] **Step 4: Add 3 new tests for the Nature's Swiftness and Swiftmend-utilization fold-in**

Add inside `describe("summarizeSpellDiscipline", ...)`:

```ts
const GOOD_SWIFTMEND: SwiftmendAuditResult = {
  casts: [],
  swiftmendCastCount: 20,
  wastefulCount: 0,
  wastefulPct: 0,
  judgement: "good",
  availableWindows: 22,
  utilizationPct: 90,
  utilizationJudgement: "good",
};
const GOOD_HOT_CLIPS: HotClipDetectionResult = {
  rejuvenation: {
    spell: "Rejuvenation",
    castCount: 100,
    clipCount: 1,
    clipPct: 1,
    judgement: "good",
  },
  regrowth: { spell: "Regrowth", castCount: 30, clipCount: 0, clipPct: 0 },
  clipEvents: [],
};

it("folds Nature's Swiftness's judgement in when the build is eligible", () => {
  const badNS: NaturesSwiftnessAuditResult = {
    casts: [],
    castCount: 0,
    availableWindows: 2,
    utilizationPct: 0,
    judgement: "bad",
  };

  const result = summarizeSpellDiscipline(
    GOOD_HOT_CLIPS,
    GOOD_SWIFTMEND,
    GOOD_DOWNRANKING,
    true,
    badNS,
    true,
  );

  expect(result.judgement).toBe("fair");
});

it("excludes Nature's Swiftness's judgement when the build can't reach its talent", () => {
  const badNS: NaturesSwiftnessAuditResult = {
    casts: [],
    castCount: 0,
    availableWindows: 2,
    utilizationPct: 0,
    judgement: "bad",
  };

  const result = summarizeSpellDiscipline(
    GOOD_HOT_CLIPS,
    GOOD_SWIFTMEND,
    GOOD_DOWNRANKING,
    true,
    badNS,
    false,
  );

  expect(result.judgement).toBe("good");
});

it("folds Swiftmend's utilization judgement in separately from its wasteful-share judgement", () => {
  const swiftmendGoodWastefulBadUtilization: SwiftmendAuditResult = {
    ...GOOD_SWIFTMEND,
    utilizationPct: 20,
    utilizationJudgement: "bad",
  };

  const result = summarizeSpellDiscipline(
    GOOD_HOT_CLIPS,
    swiftmendGoodWastefulBadUtilization,
    GOOD_DOWNRANKING,
    true,
    NEUTRAL_NS,
    false,
  );

  expect(result.judgement).toBe("fair");
});
```

- [ ] **Step 5: Run `epicSummary.test.ts` to verify the new/updated tests fail**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — TS compile errors (wrong argument count) and/or wrong runtime values.

- [ ] **Step 6: Implement the `epicSummary.ts` changes**

Update the imports at the top of `src/metrics/epicSummary.ts`:

```ts
import {
  mixedJudgement,
  weightedMedianJudgement,
  type Judgement,
} from "./judgement";
```

(adds `weightedMedianJudgement` to the existing import) and add:

```ts
import type { ConcurrentLb3Result } from "./concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "./naturesSwiftnessAudit";
```

Replace `summarizeLifebloomDiscipline`:

```ts
export function summarizeLifebloomDiscipline(
  lb3: Lb3UptimeResult,
  refresh: RefreshCadenceResult,
  blooms: AccidentalBloomsResult,
  restack: RestackTaxResult,
  concurrent: ConcurrentLb3Result,
): EpicSummary {
  // Per-target LB3 judgements are reduced to one representative judgement
  // via weightedMedianJudgement (weighted by each target's own tracked-
  // uptime window) before joining the other siblings below — added
  // 2026-07-19, direct request. Previously every target was folded in
  // flatly alongside refresh/blooms/restack, which meant a fight with
  // several well-maintained targets and just one middling one (no target
  // actually "bad") fell back to strict worst-of and read "fair" even
  // when the middling target's weight was small — see docs/thresholds.md's
  // compounding-factors section for the motivating real example.
  const lb3Reduced = weightedMedianJudgement(
    lb3.targets.map((target) => ({
      judgement: target.judgement,
      weightMs: target.windowMs,
    })),
  );

  const judgement = mixedJudgement([
    lb3Reduced,
    refresh.judgement,
    blooms.judgement,
    restack.judgement,
    concurrent.judgement,
  ]);

  const cadenceStat =
    refresh.medianMs === null
      ? "Refresh cadence: no refreshes"
      : `Refresh cadence: ${(refresh.medianMs / 1000).toFixed(1)}s median`;

  return {
    judgement,
    stats: [formatLb3UptimeStat(lb3.targets), cadenceStat],
  };
}
```

Replace `summarizeSpellDiscipline`:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
  downranking: DownrankingDisciplineResult,
  hasSwiftmend: boolean,
  naturesSwiftnessAudit: NaturesSwiftnessAuditResult,
  hasNaturesSwiftness: boolean,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the mixedJudgement calc
  // (per docs/backlog.md story 303 — see docs/thresholds.md's
  // compounding-factors section for the full rationale, formerly its own
  // design doc, retired once this shipped) but doesn't get its own stat
  // line — story 701 caps a dashboard widget at 1-2 stats. Swiftmend's
  // judgements/stat line are excluded entirely (not scored, not shown as
  // a spurious good) when the druid's build can't reach Swiftmend's
  // talent — story 903c. Swiftmend now contributes two judgements when
  // eligible (wasteful share and utilization, story 302 revised direct
  // request 2026-07-20) and Nature's Swiftness contributes its own
  // utilization judgement when the build can reach its talent (story 304
  // revised story 914, same date) — neither gets its own stat line, same
  // precedent as downranking.
  return {
    judgement: mixedJudgement([
      hotClips.rejuvenation.judgement,
      ...(hasSwiftmend
        ? [swiftmendAudit.judgement, swiftmendAudit.utilizationJudgement]
        : []),
      downranking.judgement,
      ...(hasNaturesSwiftness ? [naturesSwiftnessAudit.judgement] : []),
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      ...(hasSwiftmend
        ? [`Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`]
        : []),
    ],
  };
}
```

- [ ] **Step 7: Run `epicSummary.test.ts` to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS

- [ ] **Step 8: Wire `useLifebloomDisciplineSummary.ts`**

In `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`, add the import:

```ts
import { computeConcurrentLb3Targets } from "../../../metrics/concurrentLb3Targets";
```

Inside the `.then(([buffEvents, castEvents, healEvents]) => { ... })` callback, after the existing `restack` computation and before `setState(...)`, add:

```ts
const concurrent = computeConcurrentLb3Targets(
  buffEvents,
  druidId,
  lifebloomAbilityIds,
  fight.startTime,
  fight.endTime,
);
```

Change the `summarizeLifebloomDiscipline` call inside `setState`:

```ts
            ...summarizeLifebloomDiscipline(lb3, refresh, blooms, restack),
```

to:

```ts
            ...summarizeLifebloomDiscipline(
              lb3,
              refresh,
              blooms,
              restack,
              concurrent,
            ),
```

- [ ] **Step 9: Wire `useSpellDisciplineSummary.ts`**

In `src/app/components/Scorecard/useSpellDisciplineSummary.ts`:

Add the import:

```ts
import { computeNaturesSwiftnessAudit } from "../../../metrics/naturesSwiftnessAudit";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";
```

(adds `NATURES_SWIFTNESS_MIN_RESTORATION` to the existing `archetypeDetection` import).

Add a new parameter `naturesSwiftnessAbilityIds: Set<number>` to the function signature, right after `swiftmendAbilityIds`:

```ts
export function useSpellDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
```

Inside the `.then(([buffEvents, castEvents, healingEvents, combatantInfoEvents]) => { ... })` callback, after the existing `const hasSwiftmend = ...` line, add:

```ts
const hasNaturesSwiftness = restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
```

After the existing `swiftmendAudit` computation and before `downranking`, add:

```ts
const naturesSwiftnessAudit = computeNaturesSwiftnessAudit(
  castEvents,
  druidId,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  fight.endTime - fight.startTime,
);
```

Change the `summarizeSpellDiscipline` call inside `setState`:

```ts
            ...summarizeSpellDiscipline(
              hotClips,
              swiftmendAudit,
              downranking,
              hasSwiftmend,
            ),
```

to:

```ts
            ...summarizeSpellDiscipline(
              hotClips,
              swiftmendAudit,
              downranking,
              hasSwiftmend,
              naturesSwiftnessAudit,
              hasNaturesSwiftness,
            ),
```

Add `naturesSwiftnessAbilityIds` to the `useEffect` dependency array (alongside `swiftmendAbilityIds`).

- [ ] **Step 10: Update `useSpellDisciplineSummary.test.ts`'s 3 existing calls**

In `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`, add a `new Set([17116])` argument (a plausible Nature's Swiftness ability ID, matching the convention used elsewhere in this test file for `swiftmendAbilityIds`) right after the existing `new Set([18562])` (`swiftmendAbilityIds`) argument in all 3 `useSpellDisciplineSummary(...)` calls, e.g.:

```ts
const { result } = renderHook(() =>
  useSpellDisciplineSummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Set([26982]),
    new Set([26980]),
    new Set([18562]),
    new Set([17116]),
    new Map(),
    fetchEvents,
  ),
);
```

- [ ] **Step 11: Wire `useFightEpicSummaries.ts`**

In `src/app/components/Scorecard/useFightEpicSummaries.ts`, change the `useSpellDisciplineSummary` call:

```ts
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
```

to:

```ts
const spell = useSpellDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  fetchEvents,
);
```

(`naturesSwiftnessAbilityIds` is already a parameter of `useFightEpicSummaries` — no signature change needed there, just passing an already-available value one level deeper.)

- [ ] **Step 12: Run the full test suite and typecheck**

Run: `npx vitest run src/metrics/epicSummary.test.ts src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts src/app/components/Scorecard/useSpellDisciplineSummary.test.ts src/app/components/Scorecard/useFightEpicSummaries.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts \
  src/app/components/Scorecard/useLifebloomDisciplineSummary.ts \
  src/app/components/Scorecard/useSpellDisciplineSummary.ts \
  src/app/components/Scorecard/useSpellDisciplineSummary.test.ts \
  src/app/components/Scorecard/useFightEpicSummaries.ts
git commit -m "feat(epic-summary): fold concurrent LB3, Swiftmend utilization, and NS utilization into epic verdicts; reduce per-target LB3 via weighted median"
```

---

### Task 7: SwiftmendAuditCard — show the utilization judgement inline

**Files:**

- Modify: `src/app/components/SwiftmendAuditCard/index.tsx`
- Test: `src/app/components/SwiftmendAuditCard/index.test.tsx`

- [ ] **Step 1: Add a failing test**

In `src/app/components/SwiftmendAuditCard/index.test.tsx`, add a new test after the first one (`"shows the wasteful count/judgement and a per-cast table once loaded"`):

```ts
  it("shows the utilization judgement chip next to the usage sentence", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 30000 }); // 2 available 15s windows
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 9501,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 9500, targetID: 50, abilityGameID: 18562 }),
    ];

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents, [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "1 Swiftmend cast of 2 possible 15s windows — 50% utilization",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Fair")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/SwiftmendAuditCard/index.test.tsx`
Expected: FAIL — the sentence still says "(informational)" and there's no "Fair" chip in the body.

- [ ] **Step 3: Implement**

In `src/app/components/SwiftmendAuditCard/index.tsx`, add the import:

```ts
import { JudgementChip } from "../ui/JudgementChip";
```

Update the `THRESHOLD` constant:

```ts
const THRESHOLD =
  "Classification: efficient (consumed HoT ≤ 3s remaining, regardless of HP), emergency (not efficient, and target ≤ 50% HP), wasteful (neither). Good < 40% wasteful, fair 40-80%, bad > 80% of Swiftmend casts. Target HP% is read from the most recent Healing event on that target before the cast — if damage landed in the gap between that sample and the cast, the true HP may have been lower than shown. Utilization (casts vs. 15s-cooldown availability): good ≥75%, fair 50-75%, bad <50%.";
```

Replace the destructuring of `result.result`:

```ts
const {
  casts,
  swiftmendCastCount,
  wastefulCount,
  wastefulPct,
  judgement,
  availableWindows,
} = result.result;

const utilizationPct =
  availableWindows === 0 ? 0 : (swiftmendCastCount / availableWindows) * 100;
```

with:

```ts
const {
  casts,
  swiftmendCastCount,
  wastefulCount,
  wastefulPct,
  judgement,
  availableWindows,
  utilizationPct,
  utilizationJudgement,
} = result.result;
```

Replace the final `<p>` element (the utilization sentence) at the bottom of the returned JSX:

```tsx
<p>
  {swiftmendCastCount} Swiftmend{swiftmendCastCount === 1 ? "" : "s"} cast of{" "}
  {availableWindows} possible 15s windows — {utilizationPct.toFixed(0)}%
  utilization (informational).
</p>
```

with:

```tsx
<p
  style={{
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  }}
>
  <span>
    {swiftmendCastCount} Swiftmend{swiftmendCastCount === 1 ? "" : "s"} cast of{" "}
    {availableWindows} possible 15s windows — {utilizationPct.toFixed(0)}%
    utilization
  </span>
  <JudgementChip judgement={utilizationJudgement} />
</p>
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/app/components/SwiftmendAuditCard/index.test.tsx`
Expected: PASS (all tests — double check the existing "shows the wasteful count/judgement..." test at the top, which renders a 341000ms fight with 1 Swiftmend cast and doesn't assert on the utilization sentence text, still passes unmodified)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/SwiftmendAuditCard/index.tsx src/app/components/SwiftmendAuditCard/index.test.tsx
git commit -m "feat(ui): show Swiftmend utilization as a judged inline chip instead of informational text"
```

---

### Task 8: NaturesSwiftnessCard — make utilization the card's real judgement

**Files:**

- Modify: `src/app/components/NaturesSwiftnessCard/index.tsx`
- Test: `src/app/components/NaturesSwiftnessCard/index.test.tsx`

- [ ] **Step 1: Add a failing test**

In `src/app/components/NaturesSwiftnessCard/index.test.tsx`, add a new test after the first one:

```ts
  it("shows a judgement chip instead of the informational note once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 400000 }); // 3 available windows
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 1500, targetID: 50, abilityGameID: 9758 }),
    ];

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    // 1 cast of 3 windows = 33% -> bad, per the standard (non-1-window) bands.
    await waitFor(() => expect(screen.getByText("Bad")).toBeInTheDocument());
    expect(
      screen.queryByText("Informational — no judgement"),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/NaturesSwiftnessCard/index.test.tsx`
Expected: FAIL — no "Bad" text exists; "Informational — no judgement" is still shown.

- [ ] **Step 3: Implement**

In `src/app/components/NaturesSwiftnessCard/index.tsx`, update the `THRESHOLD` constant:

```ts
const THRESHOLD =
  "Reports casts vs. theoretical availability (3 min cooldown). Utilization: good ≥75%, fair 50-75%, bad <50% — except fights with only 1 available window (under 3 minutes), where holding it in reserve is reasonable: 0 casts reads fair, 1 cast reads good. Unused-while-available during a raid death is cross-referenced separately in the death forensics audit.";
```

Update the destructuring:

```ts
const { casts, castCount, availableWindows } = result.result;
```

to:

```ts
const { casts, castCount, availableWindows, judgement } = result.result;
```

Replace the final `<MetricCard>` call (the one rendering real data, at the bottom of the component) — remove its `note="Informational — no judgement"` prop and add `judgement={judgement}`:

```tsx
  return (
    <MetricCard
      icon={ICON}
      title="Nature's Swiftness audit"
      value={`Used ${castCount}× of ${availableWindows} available windows`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
```

(Leave every other `<MetricCard>` call in this file — the loading, error, and ineligible-placeholder states — exactly as they are, still with `note="Informational — no judgement"`; only the final ready-state render changes.)

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/app/components/NaturesSwiftnessCard/index.test.tsx`
Expected: PASS (all tests — the first existing test, which has `castCount: 1`/`availableWindows: 3` too, now also renders a "Bad" chip; it doesn't assert against that text's absence, so it still passes)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/NaturesSwiftnessCard/index.tsx src/app/components/NaturesSwiftnessCard/index.test.tsx
git commit -m "feat(ui): give Nature's Swiftness a real judgement chip instead of staying informational-only"
```

---

### Task 9: ConcurrentTargetsCard — show a Good chip when earned

**Files:**

- Modify: `src/app/components/ConcurrentTargetsCard/index.tsx`
- Test: `src/app/components/ConcurrentTargetsCard/index.test.tsx`

- [ ] **Step 1: Add a failing test**

In `src/app/components/ConcurrentTargetsCard/index.test.tsx`, add a new test after the first one:

```ts
  it("shows a Good chip (not the informational note) when 2+ targets held LB3 for at least 50% of the fight", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
    ];

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Good")).toBeInTheDocument());
    expect(
      screen.queryByText("Informational — no judgement"),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: FAIL — no "Good" chip; "Informational — no judgement" is always shown today.

- [ ] **Step 3: Implement**

In `src/app/components/ConcurrentTargetsCard/index.tsx`, update the `THRESHOLD` constant:

```ts
const THRESHOLD =
  "Good when 2+ targets held Lifebloom's 3rd stack for at least 50% of the fight — a reward-only signal recognizing multi-target maintenance as the skill it is. Never fair or bad: anything below that bar may simply reflect your raid healing assignment, not weaker play.";
```

Update the destructuring:

```ts
const { avgConcurrent, peakConcurrent, levels } = result.result;
```

to:

```ts
const { avgConcurrent, peakConcurrent, levels, judgement } = result.result;
```

Update the final `<MetricCard>` call (the ready-state render):

```tsx
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Concurrent LB3 targets"
      value={`Avg ${avgConcurrent.toFixed(1)} · Peak ${peakConcurrent}`}
      judgement={judgement}
      note={judgement === null ? "Informational — no judgement" : undefined}
      threshold={THRESHOLD}
    >
```

(`MetricCard` already prefers `judgement` over `note` when both are set — see `src/app/components/ui/MetricCard/index.tsx` — so passing both is safe, but being explicit with the ternary keeps the "informational" label accurate: it should only show when there's truly no judgement.)

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard/index.test.tsx`
Expected: PASS (all tests, including the existing "shows average, peak, and level breakdown once loaded, with no judgement chip" test, which stays valid since its fixture never reaches 50% time at 2+ targets)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConcurrentTargetsCard/index.tsx src/app/components/ConcurrentTargetsCard/index.test.tsx
git commit -m "feat(ui): show a Good chip on concurrent LB3 targets when 2+ sustained >=50% of the fight"
```

---

### Task 10: CLI calibration tool — relocate concurrent/NS data into their epics, add pooled utilization stats

**Files:**

- Modify: `scripts/lib/types.ts`
- Modify: `scripts/lib/calibrateReport.ts`
- Modify: `scripts/lib/rollup.ts`
- Test: `scripts/lib/rollup.test.ts`

**Interfaces:**

- Produces: `LifebloomDisciplineMetrics` gains `concurrentLb3Targets: ConcurrentLb3Result`; `SpellDisciplineMetrics` gains `naturesSwiftnessAudit: NaturesSwiftnessAuditResult`; `FightResult.informational` and `InformationalRollup`/`DruidRollup.informational` are removed entirely; `LifebloomDisciplineRollup` gains `concurrentLb3AvgPooled: number | null` and `concurrentLb3PeakMax: number`; `SpellDisciplineRollup` gains `swiftmendUtilizationPctPooled: number | null`, `naturesSwiftnessCastsTotal: number`, `naturesSwiftnessAvailableWindowsTotal: number`, `naturesSwiftnessUtilizationPctPooled: number | null`.

- [ ] **Step 1: Update `scripts/lib/types.ts`**

Add `concurrentLb3Targets: ConcurrentLb3Result;` to `LifebloomDisciplineMetrics`:

```ts
export interface LifebloomDisciplineMetrics {
  lb3Uptime: Lb3UptimeResult;
  refreshCadence: RefreshCadenceResult;
  accidentalBlooms: AccidentalBloomsResult;
  restackTax: RestackTaxResult;
  concurrentLb3Targets: ConcurrentLb3Result;
}
```

Add `naturesSwiftnessAudit: NaturesSwiftnessAuditResult;` to `SpellDisciplineMetrics`:

```ts
export interface SpellDisciplineMetrics {
  hotClipDetection: HotClipDetectionResult;
  swiftmendAudit: SwiftmendAuditResult;
  downrankingDiscipline: DownrankingDisciplineResult;
  naturesSwiftnessAudit: NaturesSwiftnessAuditResult;
}
```

Remove the `informational` field from `FightResult`:

```ts
export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  hasNaturesSwiftness: boolean;
  epics: {
    gcdEconomy: EpicResult<GcdEconomyMetrics>;
    lifebloomDiscipline: EpicResult<LifebloomDisciplineMetrics>;
    spellDiscipline: EpicResult<SpellDisciplineMetrics>;
    manaEconomy: EpicResult<ManaEconomyMetrics>;
    deathForensics: EpicResult<DeathForensicsMetrics>;
    prepHygiene: EpicResult<PrepHygieneMetrics>;
  };
}
```

(deletes the `informational: { concurrentLb3Targets: ...; naturesSwiftnessAudit: ...; }` block that followed `epics` before).

Add the 2 new fields to `LifebloomDisciplineRollup`:

```ts
export interface LifebloomDisciplineRollup extends EpicRollupBase {
  lb3UptimeByTarget: LifebloomTargetRollup[];
  refreshCadenceMedianMsPooled: number | null;
  refreshCadenceBuckets: RefreshCadenceBucketRollup[];
  accidentalBloomsTotal: number;
  restackTaxCastsTotal: number;
  restackTaxEstimatedManaTotal: number;
  concurrentLb3AvgPooled: number | null;
  concurrentLb3PeakMax: number;
}
```

Add the 4 new fields to `SpellDisciplineRollup`:

```ts
export interface SpellDisciplineRollup extends EpicRollupBase {
  rejuvenationClipPctPooled: number | null;
  regrowthClipPctPooled: number | null;
  swiftmendWastefulPctPooled: number | null;
  swiftmendUtilizationPctPooled: number | null;
  downrankingFlaggedTotal: number;
  naturesSwiftnessCastsTotal: number;
  naturesSwiftnessAvailableWindowsTotal: number;
  naturesSwiftnessUtilizationPctPooled: number | null;
}
```

Delete the `InformationalRollup` interface entirely, and remove `informational: InformationalRollup;` from `DruidRollup`:

```ts
export interface DruidRollup {
  gcdEconomy: GcdEconomyRollup;
  lifebloomDiscipline: LifebloomDisciplineRollup;
  spellDiscipline: SpellDisciplineRollup;
  manaEconomy: ManaEconomyRollup;
  deathForensics: DeathForensicsRollup;
  prepHygiene: PrepHygieneRollup;
}
```

- [ ] **Step 2: Update `scripts/lib/calibrateReport.ts`**

Delete the `safeInformational` function entirely (it becomes unused):

```ts
function safeInformational<T>(compute: () => T, fallback: T): T {
  try {
    ...
  } ...
}
```

In the `lifebloomDiscipline` block, add the `computeConcurrentLb3Targets` call and thread it through:

```ts
const lifebloomDiscipline = toEpicResult<LifebloomDisciplineMetrics>(() => {
  const lb3Uptime = computeLb3Uptime(
    buffEvents,
    druidId,
    ctx.lifebloomAbilityIds,
    fight.startTime,
    fight.endTime,
  );
  const refreshCadence = computeRefreshCadence(
    buffEvents,
    druidId,
    ctx.lifebloomAbilityIds,
  );
  const accidentalBlooms = computeAccidentalBlooms(
    buffEvents,
    healingEvents,
    druidId,
    ctx.lifebloomAbilityIds,
  );
  const restackTax = computeRestackTax(
    buffEvents,
    castEvents,
    druidId,
    ctx.lifebloomAbilityIds,
    durationMs,
  );
  const concurrentLb3Targets = computeConcurrentLb3Targets(
    buffEvents,
    druidId,
    ctx.lifebloomAbilityIds,
    fight.startTime,
    fight.endTime,
  );
  return {
    summary: summarizeLifebloomDiscipline(
      lb3Uptime,
      refreshCadence,
      accidentalBlooms,
      restackTax,
      concurrentLb3Targets,
    ),
    metrics: {
      lb3Uptime,
      refreshCadence,
      accidentalBlooms,
      restackTax,
      concurrentLb3Targets,
    },
  };
});
```

In the `spellDiscipline` block, add the `computeNaturesSwiftnessAudit` call and thread it through (note `hasNaturesSwiftness` is already computed above this block, right after `hasSwiftmend`):

```ts
const spellDiscipline = toEpicResult<SpellDisciplineMetrics>(() => {
  const hotClipDetection = computeHotClipDetection(
    buffEvents,
    castEvents,
    druidId,
    ctx.rejuvenationAbilityIds,
    ctx.regrowthAbilityIds,
  );
  const swiftmendAudit = computeSwiftmendAudit(
    buffEvents,
    castEvents,
    healingEvents,
    druidId,
    ctx.swiftmendAbilityIds,
    ctx.rejuvenationAbilityIds,
    ctx.regrowthAbilityIds,
    durationMs,
  );
  const downrankingDiscipline = computeDownrankingDiscipline(
    castEvents,
    healingEvents,
    druidId,
    ctx.resolvedAbilities,
  );
  const naturesSwiftnessAudit = computeNaturesSwiftnessAudit(
    castEvents,
    druidId,
    ctx.naturesSwiftnessAbilityIds,
    ctx.resolvedAbilities,
    durationMs,
  );
  return {
    summary: summarizeSpellDiscipline(
      hotClipDetection,
      swiftmendAudit,
      downrankingDiscipline,
      hasSwiftmend,
      naturesSwiftnessAudit,
      hasNaturesSwiftness,
    ),
    metrics: {
      hotClipDetection,
      swiftmendAudit,
      downrankingDiscipline,
      naturesSwiftnessAudit,
    },
  };
});
```

Delete the trailing `informational: { concurrentLb3Targets: safeInformational(...), naturesSwiftnessAudit: safeInformational(...) }` block from the function's final returned object (the `computeConcurrentLb3Targets`/`computeNaturesSwiftnessAudit` imports stay — they're now used above instead).

- [ ] **Step 3: Update `scripts/lib/rollup.ts`**

Remove `InformationalRollup` from the `import type { ... } from "./types"` block at the top.

In the "--- Lifebloom discipline ---" section, add tracking variables alongside the existing ones (`accidentalBloomsTotal`, etc.) and accumulate inside the existing `for (const entry of lbReady) { ... }` loop:

```ts
let accidentalBloomsTotal = 0;
let restackTaxCastsTotal = 0;
let restackTaxEstimatedManaTotal = 0;
const concurrentEntries: { value: number; weightMs: number }[] = [];
let concurrentPeakMax = 0;
for (const entry of lbReady) {
  for (const target of entry.metrics.lb3Uptime.targets) {
    const list = targetWindows.get(target.targetId) ?? [];
    list.push({ value: target.lb3UptimePct, weightMs: target.windowMs });
    targetWindows.set(target.targetId, list);
  }
  if (entry.metrics.refreshCadence.medianMs !== null) {
    refreshMedians.push({
      value: entry.metrics.refreshCadence.medianMs,
      weight: entry.metrics.refreshCadence.intervalCount,
    });
  }
  for (const bucket of entry.metrics.refreshCadence.buckets) {
    bucketTotals[bucket.label] += bucket.count;
  }
  accidentalBloomsTotal += entry.metrics.accidentalBlooms.count;
  restackTaxCastsTotal += entry.metrics.restackTax.castCount;
  restackTaxEstimatedManaTotal += entry.metrics.restackTax.estimatedMana;
  concurrentEntries.push({
    value: entry.metrics.concurrentLb3Targets.avgConcurrent,
    weightMs: entry.durationMs,
  });
  if (entry.metrics.concurrentLb3Targets.peakConcurrent > concurrentPeakMax) {
    concurrentPeakMax = entry.metrics.concurrentLb3Targets.peakConcurrent;
  }
}
```

Add the 2 new fields to the `lifebloomDiscipline` object construction:

```ts
const lifebloomDiscipline: LifebloomDisciplineRollup = {
  ...epicRollupBase(fights.length, lbReady),
  lb3UptimeByTarget,
  refreshCadenceMedianMsPooled: countWeightedAverage(refreshMedians),
  refreshCadenceBuckets,
  accidentalBloomsTotal,
  restackTaxCastsTotal,
  restackTaxEstimatedManaTotal,
  concurrentLb3AvgPooled: durationWeightedAverage(concurrentEntries),
  concurrentLb3PeakMax: concurrentPeakMax,
};
```

In the "--- Spell discipline ---" section, add a `swiftmendUtilizationEntries` array accumulated in the existing `for (const entry of spellReady) { ... }` loop:

```ts
const rejuvEntries: { value: number; weight: number }[] = [];
const regrowthEntries: { value: number; weight: number }[] = [];
const swiftmendEntries: { value: number; weight: number }[] = [];
const swiftmendUtilizationEntries: { value: number; weight: number }[] = [];
let downrankingFlaggedTotal = 0;
for (const entry of spellReady) {
  rejuvEntries.push({
    value: entry.metrics.hotClipDetection.rejuvenation.clipPct,
    weight: entry.metrics.hotClipDetection.rejuvenation.castCount,
  });
  regrowthEntries.push({
    value: entry.metrics.hotClipDetection.regrowth.clipPct,
    weight: entry.metrics.hotClipDetection.regrowth.castCount,
  });
  swiftmendEntries.push({
    value: entry.metrics.swiftmendAudit.wastefulPct,
    weight: entry.metrics.swiftmendAudit.casts.length,
  });
  swiftmendUtilizationEntries.push({
    value: entry.metrics.swiftmendAudit.utilizationPct,
    weight: entry.metrics.swiftmendAudit.availableWindows,
  });
  downrankingFlaggedTotal += entry.metrics.downrankingDiscipline.flaggedCount;
}
```

Right after that loop (still inside the "--- Spell discipline ---" section, before constructing the `spellDiscipline` object), add the Nature's-Swiftness-eligible pooling — mirrors the exact talent-eligibility gate story 907 established, now reading from the relocated epic metrics instead of the old `informational` bag:

```ts
// Story 907: a fight where this druid's build can't reach Nature's
// Swiftness's 20-Restoration requirement has no real availability --
// computeNaturesSwiftnessAudit's cooldown-based availableWindows
// estimate is fictitious there (the player could never actually cast
// it), so this pool excludes those fights the same way story 903c
// already excludes them from the live app's NaturesSwiftnessCard.
const naturesSwiftnessEntries: {
  castCount: number;
  availableWindows: number;
}[] = [];
for (const f of fights) {
  if (!f.hasNaturesSwiftness) continue;
  const epic = f.epics.spellDiscipline;
  if (!isReady(epic)) continue;
  naturesSwiftnessEntries.push({
    castCount: epic.metrics.naturesSwiftnessAudit.castCount,
    availableWindows: epic.metrics.naturesSwiftnessAudit.availableWindows,
  });
}
const naturesSwiftnessCastsTotal = sum(
  naturesSwiftnessEntries.map((e) => e.castCount),
);
const naturesSwiftnessAvailableWindowsTotal = sum(
  naturesSwiftnessEntries.map((e) => e.availableWindows),
);
const naturesSwiftnessUtilizationPctPooled = countWeightedAverage(
  naturesSwiftnessEntries.map((e) => ({
    value:
      e.availableWindows === 0 ? 0 : (e.castCount / e.availableWindows) * 100,
    weight: e.availableWindows,
  })),
);
```

Add the 4 new fields to the `spellDiscipline` object construction:

```ts
const spellDiscipline: SpellDisciplineRollup = {
  ...epicRollupBase(fights.length, spellReady),
  rejuvenationClipPctPooled: countWeightedAverage(rejuvEntries),
  regrowthClipPctPooled: countWeightedAverage(regrowthEntries),
  swiftmendWastefulPctPooled: countWeightedAverage(swiftmendEntries),
  swiftmendUtilizationPctPooled: countWeightedAverage(
    swiftmendUtilizationEntries,
  ),
  downrankingFlaggedTotal,
  naturesSwiftnessCastsTotal,
  naturesSwiftnessAvailableWindowsTotal,
  naturesSwiftnessUtilizationPctPooled,
};
```

Delete the entire "--- Informational (no epic judgement) ---" block (the `concurrentEntries`/`informational` construction that used to sit near the end of `rollupDruid`, right before the final `return`) — **careful:** this plan reuses the name `concurrentEntries` for the new Lifebloom-block variable above; make sure only the _old_, now-dead block (the one reading `f.informational.concurrentLb3Targets.avgConcurrent` directly off `fights`, not `lbReady`) is deleted, not the new one just added.

Remove `informational,` from the final `return { gcdEconomy, lifebloomDiscipline, spellDiscipline, manaEconomy, deathForensics, prepHygiene, informational };` statement, leaving:

```ts
return {
  gcdEconomy,
  lifebloomDiscipline,
  spellDiscipline,
  manaEconomy,
  deathForensics,
  prepHygiene,
};
```

- [ ] **Step 4: Update `scripts/lib/rollup.test.ts`**

Remove the `informational: { ... }` block from the `aFightResult` helper function's returned object:

```ts
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
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: PASS (unchanged behavior — this file never constructs a "ready" lifebloomDiscipline/spellDiscipline result, so none of its assertions are affected by the relocated fields)

Run: `npm run typecheck`
Expected: PASS

Run: `grep -rn "\.informational\b" scripts/ src/` to confirm no dangling references remain.
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts scripts/lib/rollup.ts scripts/lib/rollup.test.ts
git commit -m "refactor(calibrate): move concurrent LB3 / Nature's Swiftness data into their epics, pool the new utilization judgements"
```

---

### Task 11: Docs — thresholds.md, backlog.md story 914, CLAUDE.md

**Files:**

- Modify: `docs/thresholds.md`
- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Lifebloom discipline table and add a calibration-review paragraph**

In `docs/thresholds.md`, change the `LB3 uptime per target` row:

```
| LB3 uptime per target            | good / fair / bad                     | ≥90% / 75–90% / <75%                                                                             | story 201 | `src/metrics/lb3Uptime.ts`                                                                                                                                                                                                                             |
```

to:

```
| LB3 uptime per target            | good / fair / bad                     | ≥80% / 60–80% / <60%                                                                             | story 201, revised direct request 2026-07-20 | `src/metrics/lb3Uptime.ts`                                                                                                                                                                                                                             |
```

Change the `Concurrent LB3 targets` row:

```
| Concurrent LB3 targets           | —                                     | informational only, no Good/Fair/Bad                                                             | story 205 | `src/metrics/concurrentLb3Targets.ts`                                                                                                                                                                                                                  |
```

to:

```
| Concurrent LB3 targets           | good / — (never fair/bad)             | ≥50% of fight time with 2+ targets holding LB3 = good; otherwise unjudged                        | story 205, revised story 914 | `src/metrics/concurrentLb3Targets.ts`                                                                                                                                                                                                                  |
```

Add a new paragraph after the existing story 902 calibration-review paragraph (at the end of the "Lifebloom discipline (epic C)" section, before the `## Spell discipline` heading):

```markdown
**Revised by direct request, 2026-07-20 (not a new corpus calibration):**

- **LB3 uptime per target: good/fair boundary loosened 90%/75% → 80%/60%.** Requested directly.
- **Per-target LB3 judgements are now reduced to one representative judgement via `weightedMedianJudgement`** (weighted by each target's own tracked-uptime window) **before joining Lifebloom Discipline's other siblings**, instead of every target being folded in flatly alongside refresh cadence / blooms / re-stack tax. Motivating real example: `mtRh3kJ9YMLazyvQ` fight 44 (druid Olklo) — 3 targets at 96%/75%/94% uptime (good/fair/good under the new bands), no target genuinely bad, used to read "fair" under flat worst-of; now reads "good" since the one fair target carries only ~1/3 of the total tracked weight. See the compounding-factors section below for the general rule.
- **Concurrent LB3 targets gained a real judgement** (story 205, resolving one of story 914's four bullets): good when 2+ targets held LB3's 3rd stack for at least 50% of the fight, otherwise unjudged — never fair or bad, since anything below that bar may simply reflect a raid-healing assignment rather than weaker play. Folds into the Lifebloom Discipline epic verdict as a 5th sibling (a `null` judgement is filtered out, so it can only ever help).
```

- [ ] **Step 2: Update the Spell discipline table and add a calibration-review paragraph**

Add a new row right after the `Swiftmend wasteful share` row:

```
| Swiftmend utilization     | good / fair / bad                | ≥75% / 50–75% / <50% of 15s-cooldown windows used                                     | story 302, revised direct request 2026-07-20 | `src/metrics/swiftmendAudit.ts`                                                                |
```

Change the `Nature's Swiftness` row:

```
| Nature's Swiftness       | —                                | informational only, no Good/Fair/Bad (situational by design)                          | story 304                    | `src/metrics/naturesSwiftnessAudit.ts`                                                         |
```

to:

```
| Nature's Swiftness utilization | good / fair / bad          | ≥75% / 50–75% / <50% of 3min-cooldown windows used (1-window fights: 0 casts = fair, 1 cast = good) | story 304, revised story 914 | `src/metrics/naturesSwiftnessAudit.ts`                                                         |
```

Add a new paragraph after the existing story 909 calibration-review paragraph (at the end of the "Spell discipline (epic D)" section, before the `## Mana economy` heading):

```markdown
**Revised by direct request, 2026-07-20 (not a new corpus calibration):**

- **Swiftmend gained a second judgement, utilization** (usage vs. its 15s-cooldown availability, previously informational context only): good ≥75%, fair 50-75%, bad <50%. Folds into Spell Discipline's epic verdict alongside its existing wasteful-share judgement, gated the same way (druid's build must reach Swiftmend's 30-Restoration talent requirement).
- **Nature's Swiftness gained a real judgement** (story 304, resolving one of story 914's four bullets), same bands as Swiftmend above, with one exception: a fight with only 1 available window (under 3 minutes) can only ever land on 0% or 100% utilization, and holding Nature's Swiftness in reserve for a real emergency that may just not occur is reasonable on a short fight — so 0 casts there reads fair, not bad. Folds into Spell Discipline's epic verdict, gated by the druid's build reaching Nature's Swiftness's 20-Restoration talent requirement.
```

- [ ] **Step 3: Add a compounding-factors bullet for the Consumable Throughput fix**

In `docs/thresholds.md`'s "## Compounding factors" section, add a new bullet at the end (after the existing "Epic verdicts also read fair..." bullet):

```markdown
- **Consumable throughput's own row-combination fixed to match every other multi-part judgement — added 2026-07-20.** `computeConsumableThroughput` (`src/metrics/consumableThroughput.ts`) combined its Mana Potion and Rune rows via strict `worstJudgement`, the one remaining multi-part metric in the codebase not using `mixedJudgement`'s good+bad-reads-fair rule. Now consistent: a good potions row and a bad runes row (or vice versa) reads fair, not a flat bad.
```

- [ ] **Step 4: Mark 2 of story 914's 4 bullets resolved**

In `docs/backlog.md`, find the `### 914 — Revisit metrics currently left un-judged (informational-only)` section. Immediately after the existing "**Concurrent LB3 targets (story 205).**" bullet, insert:

```markdown
**Resolved 2026-07-20:** added a real judgement — good when 2+ targets held LB3's 3rd stack for at least 50% of the fight, otherwise unjudged (never fair/bad, since below that bar may simply reflect a raid-healing assignment). See `docs/thresholds.md`'s Lifebloom discipline section.
```

Immediately after the existing "**Nature's Swiftness usage (story 304).**" bullet, insert:

```markdown
**Resolved 2026-07-20:** added a real judgement based on utilization (casts vs. 3-minute-cooldown availability) — good ≥75%, fair 50-75%, bad <50%, with a 1-available-window exception (0 casts reads fair, not bad, since holding it in reserve on a short fight is reasonable). The separate emergency-availability check story 501's death forensics already performs was confirmed still correctly wired against story 903c's talent-eligibility gating; no changes needed there. See `docs/thresholds.md`'s Spell discipline section.
```

Leave the story's own header status as `🔲 Todo` — Regrowth clip share and HoT-tick overheal, its other two bullets, remain unresolved.

- [ ] **Step 5: Append a closing summary to CLAUDE.md's Repo State paragraph**

In `CLAUDE.md`, find the end of the giant "## Repo state" paragraph (it currently ends with the sentence about the mixed-good-and-bad-reads-fair rule extended to `epicSummary.ts`'s 5 multi-metric functions). Append (same paragraph, no line break — matches the existing style of one continuously-growing paragraph):

```
 A follow-up threshold-recalibration pass the same week, requested directly (not a new corpus calibration), revised LB3 uptime per target's good/fair bands 90%/75% → 80%/60%, and — motivated by a real fight where 3 well-maintained targets (96%/75%/94% uptime) used to read "fair" under flat worst-of — changed how per-target LB3 judgements fold into the Lifebloom Discipline epic verdict: they're now reduced to one representative judgement via `weightedMedianJudgement` (weighted by each target's own tracked-uptime window) before joining the epic's other siblings, rather than every target being flattened in alongside them. The same pass resolved 2 of story 914's 4 "revisit informational-only metrics" bullets: Concurrent LB3 targets gained a real judgement (good when 2+ targets sustained LB3's 3rd stack for at least 50% of the fight, otherwise unjudged — never fair/bad, since the right number depends on raid healing assignments this app can't see), and Nature's Swiftness gained a utilization judgement (good/fair/bad bands matching Swiftmend's own, with a 1-available-window exception for sub-3-minute fights where holding it in reserve is reasonable). Swiftmend itself gained a second judgement, utilization, alongside its existing wasteful-share judgement. Both Swiftmend judgements and Nature's Swiftness's now fold into Spell Discipline's epic verdict (gated by the same Restoration-point talent-eligibility thresholds story 903c already established); Concurrent LB3 targets folds into Lifebloom Discipline's. `scripts/lib/calibrateReport.ts`/`rollup.ts` were restructured to match — concurrent-targets and Nature's-Swiftness data moved out of a separate `informational`-only bag and into their real epics' metrics, gaining pooled `swiftmendUtilizationPctPooled`/`naturesSwiftnessUtilizationPctPooled` stats alongside the existing pooled figures. A drive-by fix in the same pass: `computeConsumableThroughput`'s own Mana-Potion/Rune row combination was using strict `worstJudgement` instead of `mixedJudgement`, the one remaining multi-part metric not following the established good+bad-reads-fair pattern — now consistent with the rest of the codebase.
```

- [ ] **Step 6: Commit**

```bash
git add docs/thresholds.md docs/backlog.md CLAUDE.md
git commit -m "docs: record threshold recalibration, resolve 2 of story 914's bullets"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (covers both `src/` and `scripts/` per `tsconfig.scripts.json`)

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `npm test` (or the project's equivalent full-suite command per `docs/testing.md`)
Expected: PASS, 0 failures

- [ ] **Step 4: Grep for dangling references**

Run: `grep -rn "informational" scripts/ docs/testing.md`
Expected: no output (confirms Task 10's removal of `FightResult.informational`/`InformationalRollup` left nothing dangling)

Run: `grep -rn "docs/specs/threshold-recalibration-design.md\|docs/plans/threshold-recalibration-plan.md" docs/ CLAUDE.md`
Expected: no output other than this plan/spec's own filenames if intentionally cross-referenced — if `docs/thresholds.md` or `CLAUDE.md` reference the spec/plan path directly (they shouldn't, per Task 11's exact text above), fix before proceeding.

- [ ] **Step 5: Delete the spec and plan documents (per CLAUDE.md's "a story isn't done until its paperwork is retired" convention)**

```bash
rm docs/specs/threshold-recalibration-design.md docs/plans/threshold-recalibration-plan.md
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: retire threshold-recalibration spec/plan now that the work has shipped"
```
