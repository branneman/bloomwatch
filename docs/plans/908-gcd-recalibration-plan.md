# 908 — Recalibrate GCD economy thresholds against exemplars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate GCD economy's two thresholds (GCD utilization, idle-gap dead time) against the real story-901 deep-resto exemplar corpus, adjusting only the idle-gap green boundary where the evidence supports it, and record the findings permanently.

**Architecture:** A single threshold-constant change plus documentation. No new detection logic, no new WCL fetches, no UI changes — the analysis itself (already run during design) used data `scripts/calibrate.ts` had already computed into `calibration-data/classic/*.json`.

**Tech Stack:** TypeScript constant + Vitest unit test; Markdown documentation (`docs/thresholds.md`, `docs/backlog.md`).

## Global Constraints

- Spec: `docs/specs/908-gcd-recalibration-design.md` (read it before starting — this plan implements it verbatim).
- Findings (already established, don't re-derive): GCD utilization needs **no change** (81% green / 11% orange / 7% red on 167 real exemplar kill-fights, median 98.3%). Idle-gap dead time's green boundary moves from 5% to 7% (red ceiling stays 15%), shifting the same sample from 56/28/16 to 64/20/16.
- Every threshold value needs a sourced code comment per `CLAUDE.md` principle 3 ("judgement is visible and sourced").
- Full-project static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs via pre-commit hook — don't bypass it.

---

### Task 1: Adjust the idle-gap green threshold

**Files:**

- Modify: `src/metrics/idleGaps.ts`
- Test: `src/metrics/idleGaps.test.ts`

**Interfaces:**

- Consumes: nothing new — `judgeThresholdBelow` (`src/metrics/judgement.ts`) is already imported and used unchanged.
- Produces: nothing new — `GREEN_MAX_PCT`'s value changes, its name and the shape of `computeIdleGaps`'s return type are untouched, so every existing consumer (`GcdEconomyContent`, `IdleGapsCard`, `scripts/lib/calibrateReport.ts`) is unaffected by anything other than the judgement boundary itself moving.

- [ ] **Step 1: Write the failing test**

Add this test to `src/metrics/idleGaps.test.ts`, directly after the existing `"judges orange between 5% and 15%, red above 15%"` test (after line 84, before the `"ignores casts from other actors"` test):

```ts
it("judges 6% dead time green after story 908's recalibration (was orange under the old 5% boundary)", () => {
  const events = [
    aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
    aCastEvent({ timestamp: 7500, sourceID: 2, abilityGameID: 33763 }),
  ];
  const result = computeIdleGaps(events, 2, 0, 100000);
  expect(result.deadTimePct).toBeCloseTo(6);
  expect(result.judgement).toBe("green");
});
```

(This uses the same interval-math pattern as the existing tests in this file: a single gap of `7500 - 1500 = 6000ms` dead time out of a 100000ms fight = 6.0%.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/idleGaps.test.ts`
Expected: FAIL — `result.judgement` is `"orange"` under the current `GREEN_MAX_PCT = 5`, not `"green"`.

- [ ] **Step 3: Update the threshold constant**

In `src/metrics/idleGaps.ts`, replace:

```ts
// R/O/G thresholds per docs/backlog.md story 102: green < 5%, orange 5-15%, red > 15%.
const GREEN_MAX_PCT = 5;
const ORANGE_MAX_PCT = 15;
```

with:

```ts
// R/O/G thresholds per docs/backlog.md story 102: green < 7%, orange 7-15%, red > 15%.
// Green boundary revised 5% -> 7% by story 908's exemplar recalibration
// (167 real deep-resto kill-fights: median dead time 4.0%, but only 56%
// landed green under the old 5% line; 7% better matches real elite play
// without loosening what counts as genuinely bad idle time).
const GREEN_MAX_PCT = 7;
const ORANGE_MAX_PCT = 15;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/metrics/idleGaps.test.ts`
Expected: all tests PASS, including the new one.

- [ ] **Step 5: Run full project verification**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three PASS.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/idleGaps.ts src/metrics/idleGaps.test.ts
git commit -m "fix(gcd-economy): recalibrate idle-gap green threshold against real exemplars"
```

---

### Task 2: Document the calibration review in `docs/thresholds.md`

**Files:**

- Modify: `docs/thresholds.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the GCD economy table's idle-gap row**

In `docs/thresholds.md`, find the "GCD economy (epic B)" table (currently at lines 7-13) and replace the idle-gap dead time row:

```markdown
| Idle-gap dead time | green / orange / red | <5% / 5–15% / >15% | story 102 | `src/metrics/idleGaps.ts` |
```

with:

```markdown
| Idle-gap dead time | green / orange / red | <7% / 7–15% / >15% | story 102, revised story 908 | `src/metrics/idleGaps.ts` |
```

(Leave the GCD utilization row and the idle-gap definition row unchanged — neither value changed.)

- [ ] **Step 2: Add a dated calibration-review paragraph**

Immediately after the GCD economy table (after the "Idle-gap definition" row, before the `## Lifebloom discipline (epic C)` heading), insert this paragraph, matching the format of the existing "Calibration review (story 902, 2026-07)" paragraph under Lifebloom discipline:

```markdown
**Calibration review (story 908, 2026-07):** reviewed against the same story-901 exemplar corpus 902 used (22 real `classic.warcraftlogs.com` reports, talent-confirmed deep-resto) — 167 real kill-fights (duration > 30s, Karazhan's non-boss "Chess Event" excluded) computed via `scripts/calibrate.ts`.

- **GCD utilization: no change.** 81% green / 11% orange / 7% red across the sample, median 98.3% — strong, real validation that the current 85%/70% bands already fit known-good deep-resto play, the same character of finding 902 made for refresh cadence.
- **Idle-gap dead time: green boundary revised 5% → 7%.** The old boundary sat almost exactly on the sample's median (4.0%), so only 56% of genuinely elite pulls landed green; moving only the green line (red ceiling stays 15%, so what counts as genuinely bad idle time is unchanged) shifts the sample to 64% green / 20% orange / 16% red, a real improvement in fit backed by the percentile curve (p60 ≈ 5.9%, p70 ≈ 9.5%).
```

- [ ] **Step 3: Run full project verification**

Run: `npm run format:check`
Expected: PASS (Markdown table formatting matters to Prettier in this repo).

- [ ] **Step 4: Commit**

```bash
git add docs/thresholds.md
git commit -m "docs: record story 908's GCD-economy calibration review in the threshold catalog"
```

---

### Task 3: Retire this story's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/908-gcd-recalibration-design.md`
- Delete: `docs/plans/908-gcd-recalibration-plan.md` (this file)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add story 908 to the backlog, already marked done**

In `docs/backlog.md`, insert a new story immediately after story 907 (after its acceptance criteria, before the `### 903d` heading — 903d is already `✅ Done` and out of numeric order in the file, so inserting 908 right after 907 keeps Epic I's stories grouped without needing to renumber or move anything else):

```markdown
### 908 — Recalibrate GCD economy thresholds against exemplars ✅ Done

I want GCD economy's two thresholds (story 101/102) reviewed against real exemplar data before accepting story 904's finding that "the threshold values aren't the problem, the aggregation is" at face value for this epic specifically — 904's 33/27/39 per-fight split was pooled across the whole, non-archetype-filtered corpus, not validated deep-resto exemplars.

**Findings**, from the same 22-report story-901 `classic.warcraftlogs.com` exemplar corpus 902 used (167 real kill-fights, duration > 30s, Karazhan's non-boss "Chess Event" excluded, computed via `scripts/calibrate.ts`):

- **GCD utilization (green ≥85%/orange 70-85%/red <70%): no change.** 81% green/11% orange/7% red, median 98.3% — strong real validation of the current bands.
- **Idle-gap dead time (green <5%/orange 5-15%/red >15%): green boundary revised to <7%.** The old 5% line sat almost exactly on the sample's median (4.0%), so only 56% of genuinely elite pulls landed green; moving only the green boundary (red ceiling unchanged) shifts the sample to 64% green/20% orange/16% red.

**Acceptance criteria**

- `src/metrics/idleGaps.ts`'s `GREEN_MAX_PCT` constant updated from 5 to 7, with its sourcing comment citing both story 102 and this revision.
- `src/metrics/gcdUtilization.ts` unchanged (its thresholds were validated as-is).
- `docs/thresholds.md` updated with the new idle-gap default and a dated calibration-review paragraph recording both findings.
```

- [ ] **Step 2: Delete the design spec and this plan**

```bash
git rm docs/specs/908-gcd-recalibration-design.md docs/plans/908-gcd-recalibration-plan.md
```

- [ ] **Step 3: Verify nothing else references the deleted files**

Run: `grep -rn "908-gcd-recalibration" --include=*.md .`
Expected: no output.

- [ ] **Step 4: Run full project verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md
git commit -m "docs: close out story 908, retire its design spec and plan"
```
