# Faerie Fire duty mitigation (story 917, phase 2)

## Problem

Phase 1 (complete, merged into this branch) built Faerie Fire duty detection and ran an empirical study comparing FF-duty vs. non-FF-duty fights across 5 candidate metrics. The final review found that study's comparison was pooled across druids rather than paired within-druid, and compared re-stack tax as a raw cast count rather than the duration-normalized judgement the metric actually uses — both flagged as needing resolution before committing to a mitigation magnitude.

This phase does two things in one spec (per direct request, since the refinement itself is small — it reuses already-cached `calibration-data/*.json`, no new WCL queries): (1) refine the empirical study to close both gaps, and (2) design and implement whatever mitigation the refined findings justify. Story 917 is marked `✅ Done` once this phase lands — this is the final piece of its acceptance criteria.

## Research done during scoping (informs every design choice below)

All confirmed live against the real local corpus (44 regenerated reports) this session, using the already-cached `judgement` fields on `restackTax`/`accidentalBlooms`/`refreshCadence`/`manaCurve`/`consumableThroughput` (these are computed by the same production `judge*` functions already, so comparing them is automatically duration-normalized — no need to reimplement any judging formula in the analysis script):

- **Within-druid paired comparison, all 5 metrics:** for each qualifying druid (Balance-leaning bucket + real healing participation) with at least one fight in both the FF-duty and non-FF-duty groups, computed each druid's own per-group median and the delta between them.
  - **Re-stack tax: real, robust effect.** 27 druid-report pairs have data in both groups; median per-druid delta +3 casts, 19 of 27 (70%) positive (FF-duty worse), holding up even restricted to the 13 pairs with a less-thin non-FF-duty sample (n≥2 fights): median delta still +3, 9 of 13 (69%) positive. Pooled, duration-normalized via the real cached judgement: FF-duty fights are bad 70% of the time vs. 53% for non-FF-duty fights (n=228 vs. n=45) — a genuine ~17-percentage-point gap. **This is the one metric that survives every check.**
  - **Accidental blooms: washes out.** Pooled judgement showed a good→fair shift (29%/32%/39% good/fair/bad FF-duty vs. 40%/20%/40% non-FF-duty), but the within-druid paired median delta is exactly 0 across the full paired sample (n=27: 11 positive, 11 negative, 5 tied — a cleaner "no effect" showing than an earlier same-day restricted subsample, n=13, which is not the number to cite; that restricted view undercounted the real pairing set and should not be repeated). The pooled shift is most likely a cross-druid confound (different druids populating each group), not a real per-druid effect. **No mitigation.**
  - **Ending mana %: a real per-druid effect exists, but doesn't indicate drag.** The within-druid paired median delta across the full sample (n=27, not the n=12 restricted subsample an earlier same-day pass mistakenly cited as if it were the full sample) is a real, majority-direction −9.5 percentage points (17 of 27 negative) — FF-duty fights end with meaningfully less leftover mana than that same druid's own non-FF-duty fights. This is not evidence of drag: `judgeManaBand`'s bands are non-monotonic (bad only above 70%, hoarding; good sits in the middle, 5–40%), so a downward shift moves fights away from the bad/hoarding band, never toward it — confirmed by the real judgement distribution, where FF-duty's bad rate (7.4%) is actually _lower_ than non-FF-duty's (9.1%). **No mitigation** — the real effect exists but points in a direction this metric doesn't penalize.
  - **LB3 refresh cadence: confirmed no drag**, consistent with phase 1's finding — FF-duty fights actually show a _better_ judgement distribution (24% good/39% bad) than non-FF-duty (14% good/48% bad). **No mitigation.**
  - **Consumable throughput: confirmed no difference** (63%/24%/13% vs. 66%/22%/12% good/fair/bad, essentially identical). **No mitigation.**
  - **Conclusion: re-stack tax is the only metric needing a mitigation in this phase.** Accidental blooms' pooled-comparison shift turns out to be a cross-druid artifact once compared within-druid (no real per-druid effect). Ending mana %'s within-druid effect is real, but points away from the bad/hoarding band rather than toward it, so it isn't drag. Refresh cadence and consumable throughput show no effect either way. The refinement the final review asked for changed the actual conclusion, not just its rigor — a naive pooled read would have missed all of this nuance.
- **Mitigation calibration.** `restackTax.ts`'s current `judgeRestackTax(castCount, fightDurationMs)`: `goodMax = floor(minutes/2)+1`, `fairMax = floor(minutes)`, judged via `judgeThresholdBelow` (good if `count < goodMax`, fair if `count <= fairMax`, else bad — confirmed by reading `judgement.ts` directly and cross-checking a from-scratch reimplementation against the real cached `judgement` values with zero mismatches across the corpus). Swept an integer allowance added to both `goodMax`/`fairMax` from 0-7, using these _exact_ boundary semantics (an earlier same-day pass used a slightly-too-lenient `<=` on the good boundary and got +4; the corrected sweep below is the one to build against): **+5 casts** brings FF-duty's distribution (good 45.2%, bad 52.2%) closest to the non-FF-duty baseline (good 44.4%, bad 53.3%) of any integer allowance tested.
- **Architecture (full design pass, verified against the real current codebase):**
  - `computeRestackTax` has 3 real callers: `RestackTaxCard` (single-fight detail card, does its own live fetch), `useLifebloomDisciplineSummary` (a hook producing judgement+stats only, called from `useFightEpicSummaries`, which is itself called from **both** `Scorecard` and `ReportDashboard`'s `FightRow` — i.e. already the single shared choke point for both the single-fight and whole-report screens), and `scripts/lib/calibrateReport.ts` (calibration script, already wired in phase 1 but not yet passing the mitigation flag — see below).
  - **Key decision: the mitigation gates on `computeFaerieFireDuty`'s `onDuty` result directly, not on archetype bucket.** The drag is mechanistic (FF casts burn GCDs that would otherwise go to Lifebloom maintenance), not spec-correlated, and the detector is already bucket-agnostic in `calibrateReport.ts`. This means `ReportDashboard` needs zero new archetype-bucket detection (there currently is none there at all) — it only needs the same `onDuty` boolean the Scorecard path also computes, deterministically, from the same cached Casts events (both consumers already go through the same `createEventFetcher` cache instance created once in `App.tsx`, so they cannot disagree).
  - `faerieFireAbilityIds` gets computed inside `AbilityResolver` (it already has the raw `ReportAbility[]` in scope, right where `resolveAbilities(abilities)` is called) — zero new WCL requests.
  - `bossActorIds` gets fetched unconditionally, once per report, folded into `AbilityResolver`'s existing fetch (via `Promise.all` alongside the abilities fetch) — one new request per report load, the same cost tier already paid for `resolvedAbilities` itself. Gating this on archetype bucket was considered and rejected: the only per-fight bucket signal that exists today (`useArchetypeBucket`) lives in `Scorecard`, not `ReportDashboard`, and per the key decision above, bucket isn't even the correct gate for the mitigation itself — adding one just to save one report-level query isn't worth the complexity.
  - `RestackTaxCard` and `useLifebloomDisciplineSummary` each independently call `computeFaerieFireDuty` on their own already-fetched cast events (both already fetch Casts events for their own existing purposes) rather than sharing a new hook — this matches the codebase's existing pattern of independent per-component fetching backed by a shared event cache, rather than inventing a new shared-computation hook.

## Scope

In scope:

- Refine `scripts/analyzeFaerieFireDrag.ts` to add within-druid paired comparison and judgement-distribution reporting (using the already-cached `judgement` fields), for all 5 metrics, alongside its existing pooled-median reporting (kept, not removed — both views are informative and cheap to keep).
- `src/metrics/restackTax.ts`: an exported, sourced allowance constant; `judgeRestackTax` and `computeRestackTax` both gain the FF-duty allowance behavior described above.
- Live-app wiring: `AbilityResolver`, `App.tsx`, `useLifebloomDisciplineSummary`, `useFightEpicSummaries`, `Scorecard`, `LifebloomDisciplineContent`, `RestackTaxCard`, `ReportDashboard` (both `ReportDashboardProps`/`FightRowProps`) — threading `faerieFireAbilityIds`/`bossActorIds` from the top down to both real consumers of `computeRestackTax`.
- `scripts/lib/calibrateReport.ts`: an explicit, commented decision at its `computeRestackTax` call site (see below).
- UI transparency: a visible callout on `RestackTaxCard` when `onDuty` is true, an updated `THRESHOLD` explainer string, and a `JudgementRationale/content.mdx` update for the `#restack-tax` section.
- `docs/thresholds.md` and `docs/backlog.md`: replace phase 1's pooled-only findings with the refined within-druid + judgement-distribution findings (correcting, not just appending — the pooled comparison's implied conclusions for accidental blooms/ending mana were wrong), record the mitigation and its calibration, and mark story 917 `✅ Done`.
- Delete `docs/specs/faerie-fire-duty-detection-design.md`, `docs/specs/faerie-fire-duty-mitigation-design.md` (this file), `docs/plans/faerie-fire-duty-detection-plan.md`, and this phase's own plan file once story 917 is fully shipped — per this repo's "retire paperwork once shipped" convention. (Deferred to the last task of the implementation plan, not done here.)

Out of scope:

- Any change to `computeFaerieFireDuty`'s own detection logic or thresholds (phase 1, already shipped).
- Story 918 (the Faerie Fire boss-uptime credit metric) and story 916 (re-stack tax's stack-loss-event redesign) — both already have their own backlog entries; 916's entry already carries a dependency note (added this session) that its implementer must re-derive an equivalent allowance for the new unit rather than assuming +5 carries over.
- Any UI change to `AccidentalBloomsCard`, `RefreshCadenceCard`, `ManaCurveCard`/mana-economy cards, or `ConsumableThroughputCard` — none of those metrics get a mitigation.

## Design

### 1. Refined analysis script

Extend `scripts/analyzeFaerieFireDrag.ts` (keeping its existing pooled-median reporting) to add, per metric:

- A within-druid pass: for each qualifying druid-report entry with fights in both groups, compute that entry's own per-group median, then the delta; aggregate as median-of-deltas plus a positive/negative/zero count.
- A judgement-distribution pass: tally each fight's already-cached `judgement` field (not raw values) per group, reporting good/fair/bad percentages for both groups.

Both passes reuse the exact same qualifying-druid filter already in the script (Balance-leaning bucket + `MIN_HEALING_CASTS_PER_FIGHT` floor) — no change to that filter.

### 2. `restackTax.ts` mitigation

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

`computeRestackTax` gains a new **required** final parameter `onFaerieFireDuty: boolean` (matches this codebase's no-optional-params convention for `compute*` functions), passed through to `judgeRestackTax`. Being required (not defaulted) forces every call site — including the calibration script — to make an explicit choice rather than silently inheriting `false`.

### 3. Live-app wiring

**`AbilityResolver`:** widen `onResolved` to `(resolved: Map<number, ResolvedAbility>, faerieFireAbilityIds: Set<number>, bossActorIds: Set<number>) => void`; add a `fetchBossActorIds` prop; fetch both abilities and boss actors via one `Promise.all`; compute `faerieFireAbilityIds` from the already-in-scope raw `abilities` array via `resolveFaerieFireAbilityIds`.

**`App.tsx`:** add `faerieFireAbilityIds`/`bossActorIds` state (alongside `resolvedAbilities`), a `wrappedFetchBossActorIds` (mirroring `wrappedFetchMasterDataAbilities`'s `withErrorReporting(withRateLimitDetection(...))` wrapping exactly), set all three states from one handler passed to `AbilityResolver`'s widened `onResolved`, add both new pieces of state to `resetReportState()`, and add both to the existing `resolvedAbilities !== null && ...` render-gate before `ReportDashboard` (purely for type-narrowing — they resolve together so there's no real independent-null case). Thread both new values down into `ReportDashboard`'s props.

**`ReportDashboardProps`/`FightRowProps`:** add `faerieFireAbilityIds: Set<number>`, `bossActorIds: Set<number>`; thread through `FightRow`'s own render call and the `<Scorecard>` drill-in render call, both already in `ReportDashboard`.

**`useFightEpicSummaries`:** add the same two params; forward them into its `useLifebloomDisciplineSummary` call (its other 6 hook calls are untouched).

**`useLifebloomDisciplineSummary`:** add the same two params (and to its effect's dependency array); inside its existing `.then([buffEvents, castEvents, healEvents])`, call `computeFaerieFireDuty(castEvents, druidId, faerieFireAbilityIds, bossActorIds, fight.endTime - fight.startTime)` and pass `.onDuty` as `computeRestackTax`'s new final argument.

**`ScorecardProps`:** add the same two params; forward into its own `useFightEpicSummaries` call and into `LifebloomDisciplineContent`.

**`LifebloomDisciplineContentProps`:** add the same two params; forward into `RestackTaxCard` only (the other 4 cards in that content group don't need them).

**`RestackTaxCardProps`:** add the same two params; inside its existing `.then([buffEvents, castEvents])`, call `computeFaerieFireDuty` the same way, pass `.onDuty` into `computeRestackTax`, and store `onDuty` in its `FetchResult` state so the render function (section 4) can use it.

### 4. UI transparency

In `RestackTaxCard`, when the fetched result's `onDuty` is `true`:

- Render a visible callout (an `Alert`-style component, matching this codebase's existing convention for card-level caveats — e.g. `DeathForensicsCard`'s warning `Alert`) inside the `MetricCard`, above the cast list: something like "On Faerie Fire duty this fight — the good/fair allowance was widened by 5 casts (to {goodMax}/{fairMax}) to account for GCDs spent keeping Faerie Fire on the boss," with the exact numbers computed from the fight's own duration and the exported allowance constant (never hardcoded twice).
- Append a sentence to the existing `THRESHOLD` explainer string (already passed to `MetricCard`) noting the FF-duty allowance and its sourcing, conditionally built when `onDuty` is true.

In `JudgementRationale/content.mdx`'s existing `#restack-tax` section (`<h3 id="restack-tax">Re-stack tax</h3>`), add a paragraph deriving the +5 allowance from the empirical study, importing `FAERIE_FIRE_DUTY_RESTACK_ALLOWANCE` live (matching this doc's existing pattern of importing real threshold constants rather than hardcoding numbers in prose, per story 710's design).

### 5. Calibration script decision

`scripts/lib/calibrateReport.ts`'s existing `computeRestackTax` call (already has `faerieFireDuty` computed per fight, from phase 1) should pass **`false`** explicitly, with a comment explaining why: the calibration corpus is this mitigation's own measurement baseline, and must keep reporting _raw_, unmitigated re-stack tax so a future recalibration (e.g. once story 916 changes the underlying unit) can re-derive an allowance from real ground truth rather than validating the mitigation against its own already-mitigated output.

### 6. Docs

`docs/backlog.md`'s story 917 entry: replace the phase-1-only findings paragraph with the refined findings (within-druid + judgement-distribution results for all 5 metrics, the corrected +5 calibration, explicit statement that phase 2 is complete), and change its heading to `✅ Done`.

`docs/thresholds.md`: update the existing dated Faerie Fire duty paragraphs (Lifebloom discipline and Mana economy sections) to reflect the refined, corrected findings — the accidental-blooms and ending-mana "shifts" found in phase 1's pooled comparison should be explicitly corrected to "no real effect once compared within-druid," not left standing alongside the new finding. Add the re-stack tax mitigation's own row/entry to the Lifebloom discipline threshold table (allowance value, sourcing, provisional/confirmed status).

## Testing

- `src/metrics/restackTax.test.ts`: extend existing tests to cover `onFaerieFireDuty: true` vs. `false` at the same cast count/duration, confirming the allowance shifts the judgement boundary correctly (e.g. a count that reads "bad" without the allowance reads "good" or "fair" with it, using real numbers derived from the exported constant rather than hardcoded literals).
- `src/app/components/RestackTaxCard/index.test.tsx`: extend to cover the callout rendering when `onDuty` is true and its absence when `false`, plus updating any existing test that constructs `RestackTaxCardProps` directly to supply the two new required props.
- `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`, `useFightEpicSummaries.test.ts`: extend/fix for the two new required params.
- `src/app/components/AbilityResolver/index.test.tsx`: extend for the widened `onResolved` callback and new `fetchBossActorIds` prop.
- `src/App.test.tsx`, `src/app/components/ReportDashboard/index.test.tsx`, `src/app/components/Scorecard/index.test.tsx`, `src/app/components/LifebloomDisciplineContent/index.test.tsx`: fix any test that constructs these components' props directly (pure-plumbing prop additions, no new behavior to test at these levels beyond "the value reaches where it needs to go" if not already covered transitively).
- No test changes needed for `scripts/lib/calibrateReport.ts` (no dedicated test file, per existing convention — exercised via real runs).

## Out of scope (restated)

- `computeFaerieFireDuty`'s own logic (phase 1, shipped).
- Stories 916 and 918 (separate backlog entries, dependency already noted on 916).
- Any mitigation for accidental blooms, ending mana %, refresh cadence, or consumable throughput — confirmed no real effect.
