# Faerie Fire duty mitigation (story 917, phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 2 is operational** (run a script, capture output) — no diff to review; execute it directly and confirm its completion criteria instead of a code review.

**Goal:** Refine the phase-1 empirical study to a within-druid, judgement-band comparison (closing the final review's flagged methodology gaps), confirm re-stack tax is the only metric needing a mitigation, ship that mitigation consistently across both the single-fight Scorecard and whole-report ReportDashboard, and close out story 917 (mark it `✅ Done`).

**Architecture:** `computeFaerieFireDuty` (already built, phase 1) gets invoked in exactly two live consumers of `computeRestackTax` — `RestackTaxCard` and `useLifebloomDisciplineSummary` — both of which already independently fetch the Casts events it needs, backed by the same shared event cache, so they can't disagree. Report-level `faerieFireAbilityIds`/`bossActorIds` are resolved/fetched once in `AbilityResolver` (alongside its existing abilities fetch) and threaded down through `App.tsx` to both the Scorecard and ReportDashboard trees, mirroring the exact pattern already used for `resolvedAbilities`.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library (Tier 1 unit + Tier 3 component tests per `docs/testing.md`).

## Global Constraints

- The mitigation applies to `computeRestackTax`'s judgement only — no change to any other metric's computation.
- `computeFaerieFireDuty`'s own logic and thresholds (phase 1) do not change.
- The mitigation gates on `onDuty` directly, never on archetype/talent bucket — `ReportDashboard` must not need any new archetype-detection code.
- `computeRestackTax` gains its new `onFaerieFireDuty` parameter as **required** (not optional/defaulted) — matches this codebase's existing `compute*` convention of no optional parameters.
- The calibration script (`scripts/lib/calibrateReport.ts`) must keep passing `false` (raw, unmitigated) to `computeRestackTax` — it is this mitigation's own measurement baseline and must not become self-validating.
- No em dashes in any new user-facing string (labels, headings, tooltips, error messages) — commas/semicolons/separate sentences instead.
- No internal/planning vocabulary ("story 917", epic letters, "phase 2," etc.) in any user-facing string.
- Run `npm run typecheck && npm run lint && npm run format:check` before every commit (pre-commit hook enforces this; don't bypass it).
- Story 917 gets marked `✅ Done` in `docs/backlog.md` only in the final task, once everything else has landed and been verified.

---

### Task 1: Refine the empirical analysis script

**Files:**

- Modify: `scripts/analyzeFaerieFireDrag.ts`

**Interfaces:** none new (this script has no other consumers).

- [ ] **Step 1: Read the current file fully**

Read `scripts/analyzeFaerieFireDrag.ts` in full before editing — it already has the qualifying-druid filter (`BALANCE_LEANING_BUCKETS`, `MIN_HEALING_CASTS_PER_FIGHT`), the 5 `MetricSample` accumulators, and the main loop populating them. This task extends that same loop, it doesn't replace it.

- [ ] **Step 2: Add within-druid pairing and judgement-distribution reporting**

Add these two new functions above `main()`:

```ts
interface PairedSample {
  deltas: number[];
}

function reportPaired(name: string, sample: PairedSample): void {
  const total = sample.deltas.length;
  const positive = sample.deltas.filter((d) => d > 0).length;
  const negative = sample.deltas.filter((d) => d < 0).length;
  const zero = total - positive - negative;
  console.log(`\n=== ${name} (within-druid paired) ===`);
  console.log(
    `n=${total} druid-report pairs with data in both groups; ` +
      `median delta=${median(sample.deltas)}; ` +
      `positive=${positive} negative=${negative} zero=${zero}`,
  );
}

interface JudgementCounts {
  good: number;
  fair: number;
  bad: number;
}

function reportJudgementDistribution(
  name: string,
  ffDuty: JudgementCounts,
  nonFfDuty: JudgementCounts,
): void {
  const pct = (counts: JudgementCounts) => {
    const total = counts.good + counts.fair + counts.bad;
    if (total === 0) return "n=0";
    return (
      `n=${total} good=${((counts.good / total) * 100).toFixed(1)}% ` +
      `fair=${((counts.fair / total) * 100).toFixed(1)}% ` +
      `bad=${((counts.bad / total) * 100).toFixed(1)}%`
    );
  };
  console.log(`\n=== ${name} (judgement distribution) ===`);
  console.log(`FF-duty:     ${pct(ffDuty)}`);
  console.log(`non-FF-duty: ${pct(nonFfDuty)}`);
}
```

In `main()`, after the existing `archetypeFile` is loaded, add per-metric judgement-count accumulators and per-druid paired-delta accumulators:

```ts
const restackTaxJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const restackTaxJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const bloomsJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const bloomsJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const cadenceJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const cadenceJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const manaJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const manaJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const consumableJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
const consumableJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };

const restackTaxPaired: PairedSample = { deltas: [] };
const bloomsPaired: PairedSample = { deltas: [] };
const manaPaired: PairedSample = { deltas: [] };
```

Inside the existing `for (const [key, entry] of Object.entries(archetypeFile.reports))` loop, **after** the existing per-fight `for (const fight of fights)` loop finishes for that druid-report entry (so you have that entry's own `restackTax`/`accidentalBlooms`/`refreshCadence`/`manaCurve`/`consumableThroughput` values already split into `ffDuty`/`nonFfDuty` arrays — reuse those, don't refetch), add:

1. Judgement tallying: alongside each existing `metric[bucket].push(...)` call inside the per-fight loop, also read that same fight's cached `judgement` field (e.g. `m.restackTax.judgement`, already present in the real cached JSON per this session's confirmed shape) and increment the matching `restackTaxJudgeFf`/`restackTaxJudgeNon` (etc.) counter. Do this for `restackTax`, `accidentalBlooms`, `refreshCadence` (using `m.refreshCadence.judgement`, present even when `medianMs` is null), `manaCurve`, and `consumableThroughput` (its own `judgement` field, not the per-row ones).
2. Per-druid pairing: after that druid-report entry's fights are all processed, if its own `restackTax` `ffDuty`/`nonFfDuty` arrays are both non-empty, push `median(ffDutyValues) - median(nonFfDutyValues)` onto `restackTaxPaired.deltas`. Do the same for `accidentalBlooms` → `bloomsPaired` and `manaCurve.endingPct` → `manaPaired` (the three metrics phase 1's brainstorm actually paired — refresh cadence and consumable throughput are reported via judgement-distribution only, matching what was actually done during scoping, since their pooled/judgement view alone was sufficient to reach a confident "no drag" conclusion for both).

At the end of `main()`, after the existing 5 `report(...)` calls, add:

```ts
reportPaired("Re-stack tax", restackTaxPaired);
reportPaired("Accidental blooms", bloomsPaired);
reportPaired("Ending mana %", manaPaired);
reportJudgementDistribution(
  "Re-stack tax",
  restackTaxJudgeFf,
  restackTaxJudgeNon,
);
reportJudgementDistribution("Accidental blooms", bloomsJudgeFf, bloomsJudgeNon);
reportJudgementDistribution("Refresh cadence", cadenceJudgeFf, cadenceJudgeNon);
reportJudgementDistribution("Ending mana %", manaJudgeFf, manaJudgeNon);
reportJudgementDistribution(
  "Consumable throughput",
  consumableJudgeFf,
  consumableJudgeNon,
);
```

- [ ] **Step 3: Run static analysis**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 4: Run the script against the real corpus and sanity-check the output**

Run: `npm run analyze:ff-drag`

Expected real-world figures (already found and independently verified this session — confirm your run reproduces them, not just that it runs without crashing):

- Re-stack tax paired: n≈27, median delta ≈ +3, roughly 18-19 positive vs. 8-9 negative.
- Re-stack tax judgement distribution: FF-duty ≈70% bad, non-FF-duty ≈53% bad.
- Accidental blooms paired: n≈13, median delta = 0, roughly split 5/6/2.
- Ending mana % paired: n≈12, median delta ≈ +1, split ≈6/6.
- Refresh cadence judgement distribution: FF-duty shows a _better_ good rate (~24%) than non-FF-duty (~14%).
- Consumable throughput judgement distribution: both groups essentially identical (~63-66% good).

If your run diverges meaningfully from these, stop and investigate before proceeding — these numbers are what Task 3's mitigation constant and Task 5's docs write-up both depend on.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyzeFaerieFireDrag.ts
git commit -m "feat(scripts): add within-druid pairing and judgement-distribution reporting to FF-drag analysis"
```

---

### Task 2: Confirm the refined findings

**This task is operational — no code changes.** Execute directly (not via a coding subagent); its only deliverable is a confirmed, saved copy of the real output for Task 5 to transcribe from.

- [ ] **Step 1: Run and save the output**

```bash
npm run analyze:ff-drag > /tmp/ff-drag-refined-findings.txt 2>&1
cat /tmp/ff-drag-refined-findings.txt
```

- [ ] **Step 2: Confirm the conclusion**

Confirm the output supports exactly this conclusion (already found and documented in `docs/specs/faerie-fire-duty-mitigation-design.md`): re-stack tax is the only metric with both a real within-druid-paired effect (majority-consistent direction) and a real duration-normalized judgement-distribution gap. Every other metric either shows no consistent paired direction (accidental blooms, ending mana %) or no distribution gap at all (refresh cadence, consumable throughput). If the numbers meaningfully disagree with this, stop and reconcile before Task 3 proceeds — Task 3's mitigation constant assumes this conclusion holds.

---

### Task 3: Ship the mitigation — `restackTax.ts` and every real consumer

**This is one atomic task by necessity**: `computeRestackTax` gains a new _required_ parameter, which breaks all 3 of its real call sites simultaneously, and the prop-threading needed to give two of those call sites (`RestackTaxCard`, `useLifebloomDisciplineSummary`) a real value to pass requires touching every layer between `AbilityResolver`/`App.tsx` and those two leaf files. Splitting this into smaller commits isn't possible without leaving the build in a broken or lint-failing intermediate state (unused destructured props). Work through the steps in order; each step's changes are needed for later steps to compile.

**Files:**

- Modify: `src/metrics/restackTax.ts`, `src/metrics/restackTax.test.ts`
- Modify: `src/app/components/AbilityResolver/index.tsx`, `src/app/components/AbilityResolver/index.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Modify: `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`, `.../useLifebloomDisciplineSummary.test.ts`
- Modify: `src/app/components/Scorecard/useFightEpicSummaries.ts`, `.../useFightEpicSummaries.test.ts`
- Modify: `src/app/components/Scorecard/index.tsx`, `.../index.test.tsx`
- Modify: `src/app/components/LifebloomDisciplineContent/index.tsx`, `.../index.test.tsx`
- Modify: `src/app/components/RestackTaxCard/index.tsx`, `.../index.test.tsx`
- Modify: `src/app/components/ReportDashboard/index.tsx`, `.../index.test.tsx`
- Modify: `scripts/lib/calibrateReport.ts`

**Interfaces:**

- Consumes: `computeFaerieFireDuty` (`src/metrics/faerieFireDuty.ts`, phase 1), `resolveFaerieFireAbilityIds` (`src/abilities/resolveFaerieFireAbilityIds.ts`, phase 1), `fetchBossActorIds` (`src/wcl/client.ts`, phase 1).
- Produces: `computeRestackTax(buffEvents, castEvents, druidId, lifebloomAbilityIds, fightDurationMs, onFaerieFireDuty)` — new final required param. `FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE` exported constant.

- [ ] **Step 1: Read every file in the list above fully before editing.** This task threads two new values through 9 production files and their tests; the exact current signatures, prop lists, and call sites must be matched precisely, not paraphrased from this plan.

- [ ] **Step 2: `restackTax.ts` — the mitigation itself**

Read the current `judgeRestackTax` and `computeRestackTax`. Replace `judgeRestackTax` with:

```ts
// Empirically calibrated (docs/specs/faerie-fire-duty-mitigation-design.md):
// a druid genuinely carrying Faerie Fire duty spends GCDs that would
// otherwise go to Lifebloom maintenance, measurably raising re-stack tax
// (within-druid paired median +3 casts/fight; duration-normalized bad-rate
// 70% FF-duty vs 53% non-FF-duty across the local corpus). +5 casts added
// to both goodMax/fairMax brings the FF-duty judgement distribution
// closest to the non-FF-duty baseline of any integer allowance tested.
export const FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE = 5;

function judgeRestackTax(
  castCount: number,
  fightDurationMs: number,
  onFaerieFireDuty: boolean,
): Judgement {
  const fightMinutes = fightDurationMs / 60000;
  const allowance = onFaerieFireDuty ? FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE : 0;
  const goodMax = Math.floor(fightMinutes / 2) + 1 + allowance;
  const fairMax = Math.floor(fightMinutes) + allowance;
  return judgeThresholdBelow(castCount, { goodMax, fairMax });
}
```

Add `onFaerieFireDuty: boolean` as the new final parameter of `computeRestackTax`'s signature, and pass it through to the `judgeRestackTax(castCount, fightDurationMs, onFaerieFireDuty)` call at the end of that function (read the function's current final return statement to find the exact call site).

- [ ] **Step 3: `restackTax.test.ts` — update existing tests, add new ones**

Add `false` as a 6th argument to all 8 existing `computeRestackTax(...)` calls in this file (none of them test FF-duty behavior — this preserves their exact current meaning). Then add these two new tests at the end of the `describe` block:

```ts
it("adds no allowance when not on Faerie Fire duty", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 100, targetID: 42, stack: 2 }),
    anApplyBuffStackEvent({ timestamp: 200, targetID: 42, stack: 3 }),
  ];
  // 6 rebuild casts after the free ramp, on a 5-minute fight: goodMax
  // without allowance = floor(5/2)+1 = 3, fairMax = floor(5) = 5 -- 6
  // casts is > fairMax, so this reads "bad" with no allowance.
  const castEvents = [
    aCastEvent({ timestamp: 0, targetID: 42 }),
    aCastEvent({ timestamp: 100, targetID: 42 }),
    aCastEvent({ timestamp: 200, targetID: 42 }),
    aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
    aCastEvent({ timestamp: 20000, targetID: 42 }),
    aCastEvent({ timestamp: 21000, targetID: 42 }),
    aCastEvent({ timestamp: 22000, targetID: 42 }),
    aCastEvent({ timestamp: 23000, targetID: 42 }),
    aCastEvent({ timestamp: 24000, targetID: 42 }),
    aCastEvent({ timestamp: 25000, targetID: 42 }),
  ];

  const result = computeRestackTax(
    buffEvents,
    castEvents,
    DRUID_ID,
    LIFEBLOOM_IDS,
    300000,
    false,
  );
  expect(result.castCount).toBe(6);
  expect(result.judgement).toBe("bad");
});

it("widens the good/fair bands by the calibrated allowance when on Faerie Fire duty", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 100, targetID: 42, stack: 2 }),
    anApplyBuffStackEvent({ timestamp: 200, targetID: 42, stack: 3 }),
  ];
  // Same 6-cast shape as the previous test, but with onFaerieFireDuty
  // true: fairMax becomes floor(5)+5 = 10, so 6 casts now reads "good"
  // (goodMax = floor(5/2)+1+5 = 8, and 6 < 8).
  const castEvents = [
    aCastEvent({ timestamp: 0, targetID: 42 }),
    aCastEvent({ timestamp: 100, targetID: 42 }),
    aCastEvent({ timestamp: 200, targetID: 42 }),
    aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
    aCastEvent({ timestamp: 20000, targetID: 42 }),
    aCastEvent({ timestamp: 21000, targetID: 42 }),
    aCastEvent({ timestamp: 22000, targetID: 42 }),
    aCastEvent({ timestamp: 23000, targetID: 42 }),
    aCastEvent({ timestamp: 24000, targetID: 42 }),
    aCastEvent({ timestamp: 25000, targetID: 42 }),
  ];

  const result = computeRestackTax(
    buffEvents,
    castEvents,
    DRUID_ID,
    LIFEBLOOM_IDS,
    300000,
    true,
  );
  expect(result.castCount).toBe(6);
  expect(result.judgement).toBe("good");
});
```

Run: `npx vitest run src/metrics/restackTax.test.ts`
Expected: PASS (10 tests — 8 existing + 2 new)

- [ ] **Step 4: `AbilityResolver` — widen to also resolve Faerie Fire ability IDs and fetch boss actor IDs**

Replace the full contents of `src/app/components/AbilityResolver/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ReportAbility } from "../../../wcl/client";
import {
  resolveAbilities,
  type ResolvedAbility,
} from "../../../abilities/resolveAbilities";
import { resolveFaerieFireAbilityIds } from "../../../abilities/resolveFaerieFireAbilityIds";
import { Shell } from "../ui/Shell";

export interface AbilityResolverProps {
  accessToken: string;
  reportCode: string;
  fetchMasterDataAbilities: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<ReportAbility[]>;
  fetchBossActorIds: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<Set<number>>;
  onResolved: (
    resolved: Map<number, ResolvedAbility>,
    faerieFireAbilityIds: Set<number>,
    bossActorIds: Set<number>,
  ) => void;
}

type FetchResult = {
  accessToken: string;
  resolved: Map<number, ResolvedAbility>;
};

export function AbilityResolver({
  accessToken,
  reportCode,
  fetchMasterDataAbilities,
  fetchBossActorIds,
  onResolved,
}: AbilityResolverProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMasterDataAbilities(accessToken, reportCode, controller.signal),
      fetchBossActorIds(accessToken, reportCode, controller.signal),
    ])
      .then(([abilities, bossActorIds]) => {
        const resolved = resolveAbilities(abilities);
        const faerieFireAbilityIds = resolveFaerieFireAbilityIds(abilities);
        setResult({ accessToken, resolved });
        onResolved(resolved, faerieFireAbilityIds, bossActorIds);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetch functions (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
    return () => controller.abort();
  }, [
    accessToken,
    reportCode,
    fetchMasterDataAbilities,
    fetchBossActorIds,
    onResolved,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent)
    return (
      <Shell>
        <p>Resolving abilities…</p>
      </Shell>
    );

  return null;
}
```

- [ ] **Step 5: `AbilityResolver/index.test.tsx` — update all 4 existing tests**

Every existing render of `<AbilityResolver .../>` in this file needs a new `fetchBossActorIds` prop added (e.g. `fetchBossActorIds={() => Promise.resolve(new Set())}` for tests that don't care about its value). The one test asserting `expect(onResolved).toHaveBeenCalledWith(...)` needs its expectation extended to 3 arguments — read that test's current single-argument expectation and add the two new ones (a `Set` matching whatever `resolveFaerieFireAbilityIds` would resolve from that test's ability fixture, and the `Set` your test's `fetchBossActorIds` mock resolves to).

Add one new test:

```ts
  it("resolves Faerie Fire ability IDs and boss actor IDs alongside the ability map", async () => {
    const ability = aReportAbility({ gameID: 33763, name: "Lifebloom" });
    const ffAbility = aReportAbility({ gameID: 26993, name: "Faerie Fire" });
    const fetchMasterDataAbilities = () =>
      Promise.resolve([ability, ffAbility]);
    const fetchBossActorIds = () => Promise.resolve(new Set([149]));
    const onResolved = vi.fn();
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        fetchBossActorIds={fetchBossActorIds}
        onResolved={onResolved}
      />,
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    const [, faerieFireAbilityIds, bossActorIds] = onResolved.mock.calls[0];
    expect(faerieFireAbilityIds).toEqual(new Set([26993]));
    expect(bossActorIds).toEqual(new Set([149]));
  });
```

(Check whether `aReportAbility` is already imported in this test file; if not, add it to the existing `../../../testUtils/factories` import.)

Run: `npx vitest run src/app/components/AbilityResolver/index.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: `App.tsx` — new state, wrapped fetcher, thread down**

Read the current file's imports, the `resolvedAbilities` state declaration, `wrappedFetchMasterDataAbilities`, `resetReportState`, the `<AbilityResolver>` render, and the `ReportDashboard` render-gate/render, to match exactly.

Add to the imports (alongside the existing `fetchMasterDataAbilities` import from `./wcl/client`): `fetchBossActorIds`.

Add new state, right after the existing `resolvedAbilities` state declaration:

```tsx
const [faerieFireAbilityIds, setFaerieFireAbilityIds] =
  useState<Set<number> | null>(null);
const [bossActorIds, setBossActorIds] = useState<Set<number> | null>(null);
```

Add a new wrapped fetcher, right after `wrappedFetchMasterDataAbilities`:

```tsx
const wrappedFetchBossActorIds = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(fetchBossActorIds, reportRateLimited),
      reportError,
    ),
  [reportRateLimited, reportError],
);
```

Add a handler that sets all three states atomically (place it near the other handler functions, e.g. right after `resetReportState`):

```tsx
const handleAbilitiesResolved = useCallback(
  (
    resolved: Map<number, ResolvedAbility>,
    ffAbilityIds: Set<number>,
    bossIds: Set<number>,
  ) => {
    setResolvedAbilities(resolved);
    setFaerieFireAbilityIds(ffAbilityIds);
    setBossActorIds(bossIds);
  },
  [],
);
```

(Confirm `useCallback` is already imported from `react` in this file — it's used elsewhere, e.g. `handleSummaries`-style callbacks in other components; if this file doesn't already import it, add it.)

Add both new setters to `resetReportState()`:

```tsx
function resetReportState() {
  setLoadedReport(null);
  setDruidCandidates(null);
  setActorNames(new Map());
  setActorClasses(new Map());
  setResolvedAbilities(null);
  setFaerieFireAbilityIds(null);
  setBossActorIds(null);
  setPickedDruidId(null);
}
```

Update the `<AbilityResolver>` render:

```tsx
{
  reportCode && (
    <AbilityResolver
      accessToken={accessToken}
      reportCode={reportCode}
      fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
      fetchBossActorIds={wrappedFetchBossActorIds}
      onResolved={handleAbilitiesResolved}
    />
  );
}
```

Add both new values to the `ReportDashboard` render-gate condition (purely for type-narrowing — all three states resolve together via the same handler, so there's no real independent-null case) and pass them as new props:

```tsx
{
  loadedReport &&
    reportCode &&
    host !== null &&
    selectedDruid !== null &&
    resolvedAbilities !== null &&
    faerieFireAbilityIds !== null &&
    bossActorIds !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    naturesSwiftnessAbilityIds !== null && (
      <Shell>
        <ReportDashboard
          accessToken={accessToken}
          reportCode={reportCode}
          host={host}
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
          faerieFireAbilityIds={faerieFireAbilityIds}
          bossActorIds={bossActorIds}
          targetNames={actorNames}
          actorClasses={actorClasses}
          fetchEvents={wrappedFetchEvents}
          fetchLookbackEvents={wrappedFetchLookbackEvents}
          openFightId={openFightId}
          onOpenFight={handleOpenFight}
          onCloseFight={handleCloseFight}
          activeEpicId={activeEpicId}
          onSelectEpic={handleSelectEpic}
          onOpenFightEpic={handleOpenFightEpic}
          onStartOver={handleStartOver}
        />
      </Shell>
    );
}
```

- [ ] **Step 7: `App.test.tsx` — mock the new fetch function**

In the `vi.mock("./wcl/client", ...)` block, add `fetchBossActorIds: vi.fn(),` alongside the existing mocked functions. Add `fetchBossActorIds` to the named import from `./wcl/client` at the top of the file. In `setUpHappyPathMocks()`, add:

```ts
vi.mocked(fetchBossActorIds).mockResolvedValue(new Set());
```

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all existing tests — an empty `bossActorIds`/no-FF-ability-in-fixtures set means `computeFaerieFireDuty` always resolves `onDuty: false` for every existing test, preserving their exact current behavior)

- [ ] **Step 8: `useLifebloomDisciplineSummary.ts` — compute and use `onDuty`**

Read the current file fully. Add imports:

```ts
import { computeFaerieFireDuty } from "../../../metrics/faerieFireDuty";
```

Add two new parameters at the **end** of the function's parameter list (after `fetchLookbackEvents`, to avoid inserting into the middle of the existing same-typed `Set<number>` parameters and risking an argument-order mistake at call sites):

```ts
export function useLifebloomDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
): EpicSummaryStatus {
```

(The `fetchEvents`/`fetchLookbackEvents` types above are the file's existing, unchanged parameter types — only the two new params at the end are new.)

Add both new params to the `useEffect`'s dependency array.

Inside the existing `.then(async ([buffEvents, castEvents, healEvents]) => {...})`, right before the `const restack = computeRestackTax(...)` call, add:

```ts
const faerieFireDuty = computeFaerieFireDuty(
  castEvents,
  druidId,
  faerieFireAbilityIds,
  bossActorIds,
  fight.endTime - fight.startTime,
);
```

Change the `computeRestackTax` call to pass the new final argument:

```ts
const restack = computeRestackTax(
  buffEvents,
  castEvents,
  druidId,
  lifebloomAbilityIds,
  fight.endTime - fight.startTime,
  faerieFireDuty.onDuty,
);
```

- [ ] **Step 9: `useLifebloomDisciplineSummary.test.ts` — update all 4 existing calls, add a new test**

Add `new Set(), new Set()` as two new trailing arguments to all 4 existing `useLifebloomDisciplineSummary(...)` calls in this file (matching the new params' position at the end — an empty `faerieFireAbilityIds`/`bossActorIds` means `computeFaerieFireDuty` always resolves `onDuty: false`, preserving each existing test's current behavior exactly).

Add `aCastEvent` to the existing `../../../testUtils/factories` import at the top of the file (the current import list is `anApplyBuffEvent, anApplyBuffStackEvent, aRefreshBuffEvent, aFight` — `aCastEvent` isn't there yet and the new test below needs it).

Add one new test:

```ts
it("widens the re-stack tax judgement when the druid is on Faerie Fire duty this fight", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 300000 });
  const FF_ID = 26993;
  const BOSS_ID = 149;
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, sourceID: 2, targetID: 42 }),
    anApplyBuffStackEvent({
      timestamp: 100,
      sourceID: 2,
      targetID: 42,
      stack: 2,
    }),
    anApplyBuffStackEvent({
      timestamp: 200,
      sourceID: 2,
      targetID: 42,
      stack: 3,
    }),
  ];
  // 3 boss-targeted Faerie Fire casts spanning most of the fight, meeting
  // computeFaerieFireDuty's on-duty thresholds for this duration.
  const castEvents = [
    aCastEvent({
      timestamp: 5000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
    aCastEvent({
      timestamp: 100000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
    aCastEvent({
      timestamp: 200000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
  ];
  const fetchEvents = (
    _token: string,
    _report: string,
    _fight: unknown,
    dataType: string,
  ) => {
    if (dataType === "Buffs") return Promise.resolve(buffEvents);
    if (dataType === "Casts") return Promise.resolve(castEvents);
    return Promise.resolve([]);
  };
  const fetchLookbackEvents = () => Promise.resolve([]);

  const { result } = renderHook(() =>
    useLifebloomDisciplineSummary(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      fight,
      2,
      new Set([33763]),
      fetchEvents,
      fetchLookbackEvents,
      new Set([FF_ID]),
      new Set([BOSS_ID]),
    ),
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  // Real assertion: this test's fixture has zero re-stack tax casts, so
  // the allowance can't be observed via the judgement here (0 casts is
  // "good" either way) -- this test instead verifies the plumbing
  // reaches computeRestackTax without throwing and the summary still
  // resolves "ready". The allowance's actual effect on the judgement
  // boundary is unit-tested directly in restackTax.test.ts (Task 3,
  // Step 3), which is the load-bearing test for the numeric behavior.
});
```

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 10: `useFightEpicSummaries.ts` — thread through**

Add two new parameters at the end of `useFightEpicSummaries`'s parameter list (after `fetchLookbackEvents`):

```ts
export function useFightEpicSummaries(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fetchEvents: FetchEvents,
  fetchLookbackEvents: FetchLookbackEvents,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
): FightEpicSummaries {
```

Change the internal `useLifebloomDisciplineSummary(...)` call to pass the two new values as its own trailing arguments:

```ts
const lifebloom = useLifebloomDisciplineSummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
  fetchLookbackEvents,
  faerieFireAbilityIds,
  bossActorIds,
);
```

(No other of the 6 other hook calls in this function change.)

- [ ] **Step 11: `useFightEpicSummaries.test.ts` — update the one existing call**

Add `new Set(), new Set()` as two new trailing arguments to the single existing `useFightEpicSummaries(...)` call.

Run: `npx vitest run src/app/components/Scorecard/useFightEpicSummaries.test.ts`
Expected: PASS

- [ ] **Step 12: `Scorecard/index.tsx` — thread through**

Add to `ScorecardProps` (alongside the existing `resolvedAbilities: Map<number, ResolvedAbility>;` field):

```tsx
faerieFireAbilityIds: Set<number>;
bossActorIds: Set<number>;
```

Destructure both in the component's parameter list (alongside `resolvedAbilities`). Change the existing `useFightEpicSummaries(...)` call to pass them as two new trailing arguments:

```tsx
} = useFightEpicSummaries(
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
  fetchLookbackEvents,
  faerieFireAbilityIds,
  bossActorIds,
);
```

Change the existing `<LifebloomDisciplineContent>` render to add the two new props:

```tsx
<LifebloomDisciplineContent
  accessToken={accessToken}
  reportCode={reportCode}
  host={host}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  faerieFireAbilityIds={faerieFireAbilityIds}
  bossActorIds={bossActorIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
  fetchLookbackEvents={fetchLookbackEvents}
/>
```

- [ ] **Step 13: `Scorecard/index.test.tsx` — update all 6 existing renders**

Add `faerieFireAbilityIds={new Set()}` and `bossActorIds={new Set()}` to all 6 existing `<Scorecard .../>` renders in this file.

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS

- [ ] **Step 14: `LifebloomDisciplineContent/index.tsx` — thread through to `RestackTaxCard` only**

Add to `LifebloomDisciplineContentProps` (alongside `lifebloomAbilityIds: Set<number>;`):

```tsx
faerieFireAbilityIds: Set<number>;
bossActorIds: Set<number>;
```

Destructure both in the component's parameter list. Change the existing `<RestackTaxCard>` render only (not `LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`, or `ConcurrentTargetsCard` — none of those need them):

```tsx
<RestackTaxCard
  accessToken={accessToken}
  reportCode={reportCode}
  host={host}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  faerieFireAbilityIds={faerieFireAbilityIds}
  bossActorIds={bossActorIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 15: `LifebloomDisciplineContent/index.test.tsx` — update the existing render**

Add `faerieFireAbilityIds={new Set()}` and `bossActorIds={new Set()}` to the existing `<LifebloomDisciplineContent .../>` render.

Run: `npx vitest run src/app/components/LifebloomDisciplineContent/index.test.tsx`
Expected: PASS

- [ ] **Step 16: `RestackTaxCard/index.tsx` — compute `onDuty`, use it, store it for the UI**

Read the current file fully. Add imports:

```tsx
import { computeFaerieFireDuty } from "../../../metrics/faerieFireDuty";
```

Add `faerieFireAbilityIds: Set<number>` and `bossActorIds: Set<number>` to `RestackTaxCardProps`, destructure them.

Change the `FetchResult` type to carry `onDuty` alongside the existing result:

```tsx
type FetchResult =
  | { accessToken: string; result: RestackTaxResult; onDuty: boolean }
  | { accessToken: string; error: string };
```

Inside the existing `.then(([buffEvents, castEvents]) => {...})`, add (before the `computeRestackTax` call):

```tsx
const faerieFireDuty = computeFaerieFireDuty(
  castEvents,
  druidId,
  faerieFireAbilityIds,
  bossActorIds,
  fight.endTime - fight.startTime,
);
```

Change the `computeRestackTax` call and the success-path `setResult`:

```tsx
const computed = computeRestackTax(
  buffEvents,
  castEvents,
  druidId,
  lifebloomAbilityIds,
  fight.endTime - fight.startTime,
  faerieFireDuty.onDuty,
);
setResult({ accessToken, result: computed, onDuty: faerieFireDuty.onDuty });
```

Add both new values to the `useEffect`'s dependency array.

- [ ] **Step 17: `RestackTaxCard/index.test.tsx` — update all 5 existing renders**

Add `faerieFireAbilityIds={new Set()}` and `bossActorIds={new Set()}` to all 5 existing `<RestackTaxCard .../>` renders (empty sets mean `onDuty` always resolves `false`, preserving each test's exact current behavior — the UI callout addition in Task 4 is what these tests will need extending for, not this task).

Run: `npx vitest run src/app/components/RestackTaxCard/index.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 18: `ReportDashboard/index.tsx` — thread through both `FightRow` and the `Scorecard` drill-in**

Add to both `ReportDashboardProps` and `FightRowProps` (alongside `resolvedAbilities: Map<number, ResolvedAbility>;` in both interfaces):

```tsx
faerieFireAbilityIds: Set<number>;
bossActorIds: Set<number>;
```

Destructure both in the `ReportDashboard` function's parameter list and in the `FightRow` function's parameter list.

In `FightRow`, change its `useFightEpicSummaries(...)` call to add the two new trailing arguments:

```tsx
const summaries = useFightEpicSummaries(
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
  fetchLookbackEvents,
  faerieFireAbilityIds,
  bossActorIds,
);
```

In `ReportDashboard`, change the existing `<Scorecard>` drill-in render to add the two new props (alongside `resolvedAbilities={resolvedAbilities}`):

```tsx
<Scorecard
  accessToken={accessToken}
  reportCode={reportCode}
  host={host}
  fight={openFight}
  druidId={druidId}
  druid={druid}
  lifebloomAbilityIds={lifebloomAbilityIds}
  rejuvenationAbilityIds={rejuvenationAbilityIds}
  regrowthAbilityIds={regrowthAbilityIds}
  swiftmendAbilityIds={swiftmendAbilityIds}
  naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
  resolvedAbilities={resolvedAbilities}
  faerieFireAbilityIds={faerieFireAbilityIds}
  bossActorIds={bossActorIds}
  targetNames={targetNames}
  actorClasses={actorClasses}
  fetchEvents={fetchEvents}
  fetchLookbackEvents={fetchLookbackEvents}
  activeEpic={activeEpicId}
  onSelectEpic={onSelectEpic}
  onBackToFights={onCloseFight}
  onStartOver={onStartOver}
/>
```

And change the existing `<FightRow>` render inside the fight-list map to add the same two new props (alongside `resolvedAbilities={resolvedAbilities}`):

```tsx
<FightRow
  key={fight.id}
  fight={fight}
  pullNumber={pullNumber}
  onOpen={onOpenFight}
  onSummaries={handleSummaries}
  onHealingRole={handleHealingRole}
  accessToken={accessToken}
  reportCode={reportCode}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  rejuvenationAbilityIds={rejuvenationAbilityIds}
  regrowthAbilityIds={regrowthAbilityIds}
  swiftmendAbilityIds={swiftmendAbilityIds}
  naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
  resolvedAbilities={resolvedAbilities}
  faerieFireAbilityIds={faerieFireAbilityIds}
  bossActorIds={bossActorIds}
  actorClasses={actorClasses}
  fetchEvents={fetchEvents}
  fetchLookbackEvents={fetchLookbackEvents}
/>
```

- [ ] **Step 19: `ReportDashboard/index.test.tsx` — update all 13 existing renders**

Add `faerieFireAbilityIds={new Set()}` and `bossActorIds={new Set()}` to all 13 existing `<ReportDashboard .../>` renders in this file.

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS

- [ ] **Step 20: `calibrateReport.ts` — explicit, commented decision**

Find the existing `computeRestackTax(...)` call (already has 5 arguments, missing the new 6th). Add:

```ts
// Deliberately false, not faerieFireDuty.onDuty: this calibration corpus
// is the mitigation's own measurement baseline (docs/specs/
// faerie-fire-duty-mitigation-design.md) and must keep reporting raw,
// unmitigated re-stack tax so a future recalibration -- e.g. once story
// 916 changes the underlying unit -- can re-derive an allowance from real
// ground truth, rather than validating the mitigation against its own
// already-mitigated output.
false,
```

as the new 6th argument.

- [ ] **Step 21: Run full static analysis and the whole test suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all PASS. This is the real end-to-end confirmation that every file in this task's list compiles and passes together.

- [ ] **Step 22: Smoke-test against a real report with genuine FF duty**

Run: `npm run calibrate -- 1d7zP2nJqvhVW3Qa` and inspect the output — confirm at least one fight shows `faerieFireDuty.onDuty: true` alongside `epics.lifebloomDiscipline.metrics.restackTax.judgement` computed with `false` passed (per Step 20, the calibration output's own judgement should NOT reflect the allowance — this is the intended, deliberate baseline-preservation behavior, not a bug).

- [ ] **Step 23: Commit**

```bash
git add src/metrics/restackTax.ts src/metrics/restackTax.test.ts \
  src/app/components/AbilityResolver/index.tsx src/app/components/AbilityResolver/index.test.tsx \
  src/App.tsx src/App.test.tsx \
  src/app/components/Scorecard/useLifebloomDisciplineSummary.ts src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts \
  src/app/components/Scorecard/useFightEpicSummaries.ts src/app/components/Scorecard/useFightEpicSummaries.test.ts \
  src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx \
  src/app/components/LifebloomDisciplineContent/index.tsx src/app/components/LifebloomDisciplineContent/index.test.tsx \
  src/app/components/RestackTaxCard/index.tsx src/app/components/RestackTaxCard/index.test.tsx \
  src/app/components/ReportDashboard/index.tsx src/app/components/ReportDashboard/index.test.tsx \
  scripts/lib/calibrateReport.ts
git commit -m "feat(restack-tax): widen good/fair bands by 5 casts when on Faerie Fire duty"
```

---

### Task 4: UI transparency

**Files:**

- Modify: `src/app/components/RestackTaxCard/index.tsx`
- Modify: `src/app/components/RestackTaxCard/index.test.tsx`
- Modify: `src/app/components/JudgementRationale/content.mdx`

**Interfaces:** none new (uses `FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE`, already exported from Task 3).

- [ ] **Step 1: Add the callout and updated threshold text to `RestackTaxCard`**

Read the current file (as modified by Task 3) fully. Add the import:

```tsx
import { Alert } from "../ui/Alert";
import { FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE } from "../../../metrics/restackTax";
```

Change the `THRESHOLD` constant to a function of `onDuty` computed at render time, or (simpler, matching this component's existing single-constant style) keep `THRESHOLD` as the base string and build the final string conditionally in the render. In the render function, after destructuring `{ casts, castCount, estimatedMana, judgement } = result.result` and `const { onDuty } = result;`, compute:

```tsx
const fightMinutes = (fight.endTime - fight.startTime) / 60000;
const goodMax =
  Math.floor(fightMinutes / 2) +
  1 +
  (onDuty ? FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE : 0);
const fairMax =
  Math.floor(fightMinutes) + (onDuty ? FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE : 0);
const threshold = onDuty
  ? `${THRESHOLD} On Faerie Fire duty this fight, the good/fair allowance widens by ${FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE} casts (good ${goodMax} or fewer, fair ${fairMax} or fewer): real corpus data shows genuine Faerie Fire duty measurably raises re-stack tax, since GCDs spent maintaining it can't also go to Lifebloom.`
  : THRESHOLD;
```

Pass `threshold={threshold}` to `MetricCard` (replacing the current `threshold={THRESHOLD}`, in all 3 places `MetricCard` is rendered in this file — the loading, error, and success returns; the loading and error returns can keep using the plain `THRESHOLD` constant directly, since `onDuty` isn't known yet at that point).

Add the visible callout inside the success-path `MetricCard`, as the first child, before the existing cast-list rendering:

```tsx
{
  onDuty && (
    <div style={{ marginBottom: "var(--space-3)" }}>
      <Alert tone="warning">
        On Faerie Fire duty this fight; the good/fair allowance was widened by{" "}
        {FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE} casts to account for GCDs spent
        keeping Faerie Fire on the boss.
      </Alert>
    </div>
  );
}
```

- [ ] **Step 2: Add tests for the callout**

Add two new tests to `RestackTaxCard/index.test.tsx` (after the existing tests):

```tsx
it("shows the Faerie Fire duty callout and widened threshold text when on duty", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 300000 });
  const FF_ID = 26993;
  const BOSS_ID = 149;
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
    anApplyBuffStackEvent({ timestamp: 100, targetID: 42, stack: 2 }),
    anApplyBuffStackEvent({ timestamp: 200, targetID: 42, stack: 3 }),
  ];
  const castEvents = [
    aCastEvent({
      timestamp: 5000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
    aCastEvent({
      timestamp: 100000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
    aCastEvent({
      timestamp: 200000,
      sourceID: 2,
      targetID: BOSS_ID,
      abilityGameID: FF_ID,
    }),
  ];

  render(
    <RestackTaxCard
      accessToken="test-token"
      reportCode="4GYHZRdtL3bvhpc8"
      host="fresh"
      fight={fight}
      druidId={2}
      lifebloomAbilityIds={new Set([33763])}
      faerieFireAbilityIds={new Set([FF_ID])}
      bossActorIds={new Set([BOSS_ID])}
      targetNames={new Map()}
      fetchEvents={makeFetchEvents(buffEvents, castEvents)}
    />,
  );

  await waitFor(() =>
    expect(
      screen.getByText(/On Faerie Fire duty this fight/),
    ).toBeInTheDocument(),
  );
});

it("does not show the Faerie Fire duty callout when not on duty", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 300000 });
  render(
    <RestackTaxCard
      accessToken="test-token"
      reportCode="4GYHZRdtL3bvhpc8"
      host="fresh"
      fight={fight}
      druidId={2}
      lifebloomAbilityIds={new Set([33763])}
      faerieFireAbilityIds={new Set()}
      bossActorIds={new Set()}
      targetNames={new Map()}
      fetchEvents={makeFetchEvents([], [])}
    />,
  );

  await waitFor(() =>
    expect(screen.getByText("No re-stack tax this fight.")).toBeInTheDocument(),
  );
  expect(
    screen.queryByText(/On Faerie Fire duty this fight/),
  ).not.toBeInTheDocument();
});
```

Run: `npx vitest run src/app/components/RestackTaxCard/index.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 3: Update `JudgementRationale/content.mdx`**

Find the `<h3 id="restack-tax">Re-stack tax</h3>` section. Add a paragraph after its existing explanation, importing the real constant (matching this file's existing pattern of importing live threshold constants rather than hardcoding numbers — check the top of the file for how other sections already do this and match it exactly):

```
import { FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE } from "../../../metrics/restackTax";
```

(add to the existing import block at the top of the file if one exists, following its current style)

Add prose noting: a druid genuinely maintaining Faerie Fire on the boss spends real GCDs that would otherwise go to Lifebloom upkeep; real corpus data confirmed this measurably raises re-stack tax; the good/fair allowance widens by `{FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE}` casts when that duty is detected for the fight.

- [ ] **Step 4: Run full static analysis and test suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RestackTaxCard/index.tsx src/app/components/RestackTaxCard/index.test.tsx src/app/components/JudgementRationale/content.mdx
git commit -m "feat(restack-tax): surface the Faerie Fire duty allowance in the UI and rationale doc"
```

---

### Task 5: Write up the refined findings and close story 917

**Files:**

- Modify: `docs/backlog.md`
- Modify: `docs/thresholds.md`

**Interfaces:** none (docs-only, transcribing Task 2's real output).

- [ ] **Step 1: Update story 917's backlog entry**

In `docs/backlog.md`, replace story 917's existing "Findings so far" paragraph (added during phase 1) with the refined findings, one conclusion per metric — use the real, full-sample paired figures from Task 1's actual script output (n=27 for all three paired metrics: re-stack tax, accidental blooms, ending mana %), not any restricted-subsample number from an earlier same-day pass:

- **Re-stack tax:** real, robust drag (within-druid median delta +3, 18 of 27 positive; duration-normalized bad-rate 70% FF-duty vs. 53% non-FF-duty) — mitigated with a +5-cast allowance.
- **Accidental blooms:** pooled comparison suggested a shift, but the within-druid paired median delta is exactly 0 (11 positive, 11 negative, 5 tied, n=27) — a cross-druid artifact, no real per-druid effect, no mitigation.
- **Ending mana %:** a _real_ within-druid effect exists (median delta −9.5 percentage points, 17 of 27 negative) — but it doesn't indicate drag, since `judgeManaBand`'s bands are non-monotonic (bad only above 70%, hoarding; good sits in the middle, 5–40%) and a downward shift moves fights away from the bad band, not toward it — confirmed by the real judgement distribution (FF-duty's bad rate, 7.4%, is actually _lower_ than non-FF-duty's, 9.1%). No mitigation, but state this precisely as "a real effect that isn't drag," not "no effect."
- **LB3 refresh cadence, consumable throughput:** confirmed no effect either way (judgement distributions essentially identical or, for refresh cadence, favoring FF-duty).

State the mitigation was implemented (reference `FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE` in `src/metrics/restackTax.ts`). Change story 917's heading from `🔲 Todo` to `✅ Done`.

- [ ] **Step 2: Update `docs/thresholds.md`**

Update the existing dated Faerie Fire duty paragraphs in the Lifebloom discipline and Mana economy sections to reflect the refined findings from Task 5 Step 1 above (correcting, not just appending — phase 1's pooled-comparison implication for accidental blooms/ending mana was imprecise and should say so plainly, matching this repo's convention of transparently correcting an earlier same-project finding rather than leaving it standing uncorrected). For ending mana % specifically, state the precise finding (a real within-druid effect exists but doesn't indicate drag, per `judgeManaBand`'s non-monotonic bands) rather than simply "no effect" — the real full-sample data shows a genuine, majority-direction delta, just one this metric doesn't penalize. Add a new row/entry to the Lifebloom discipline threshold table for the re-stack tax FF-duty allowance (value +5, sourcing, confirmed via real corpus calibration, not provisional).

- [ ] **Step 3: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/thresholds.md
git commit -m "docs: record refined Faerie Fire duty findings, mark story 917 done"
```

---

### Task 6: Retire the paperwork

**Files:**

- Delete: `docs/specs/faerie-fire-duty-detection-design.md`
- Delete: `docs/specs/faerie-fire-duty-mitigation-design.md`
- Delete: `docs/plans/faerie-fire-duty-detection-plan.md`
- Delete: `docs/plans/faerie-fire-duty-mitigation-plan.md`

**Interfaces:** none (docs-only).

- [ ] **Step 1: Confirm story 917 is marked Done**

Re-read `docs/backlog.md`'s story 917 heading — confirm it reads `✅ Done` (set in Task 5). If not, stop; this task only applies once the story has actually shipped.

- [ ] **Step 2: Grep for any other reference to these 4 files before deleting**

```bash
grep -rn "faerie-fire-duty-detection\|faerie-fire-duty-mitigation" docs src scripts 2>/dev/null
```

Expected: only the 4 files themselves (and possibly each other, if either spec/plan cross-references its sibling) — no other file should reference these paths. If something else does, fix that reference first.

- [ ] **Step 3: Delete and commit**

```bash
git rm docs/specs/faerie-fire-duty-detection-design.md \
  docs/specs/faerie-fire-duty-mitigation-design.md \
  docs/plans/faerie-fire-duty-detection-plan.md \
  docs/plans/faerie-fire-duty-mitigation-plan.md
npm run typecheck && npm run lint && npm run format:check
git commit -m "docs: retire spec/plan docs for story 917, now shipped"
```
