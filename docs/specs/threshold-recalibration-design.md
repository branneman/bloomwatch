# Threshold recalibration: LB3 uptime, concurrent targets, Swiftmend/NS utilization

Direct-request revision (not a new corpus calibration study) covering four Lifebloom/Spell
Discipline metrics, plus one unrelated consistency fix found along the way. Requested directly
by the maintainer; documented here as design-of-record per CLAUDE.md's principle 3 (every
threshold must be sourced), then folded into `docs/thresholds.md` and `docs/backlog.md` once
implemented.

## 1. LB3 uptime per target (`src/metrics/lb3Uptime.ts`)

Change `GOOD_MIN_PCT` 90 → 80, `FAIR_MIN_PCT` 75 → 60. Same `judgeThreshold` call, same
per-target shape — pure constant change. This overrides story 902's corpus-calibrated 90/75
bands by direct request.

## 2. Per-target LB3 reduction before combining into the Lifebloom Discipline epic verdict

**Problem:** `summarizeLifebloomDiscipline` (`src/metrics/epicSummary.ts`) today flattens every
per-target LB3 judgement into the same `mixedJudgement` array as refresh cadence / accidental
blooms / re-stack tax. With the new 80/60 bands, a fight with 3 well-maintained targets at
96%/75%/94% (good/fair/good) has no "bad" present, so `mixedJudgement` falls back to strict
worst-of and reads "fair" for the whole epic — even though 2-of-3 targets at excellent uptime,
sustained concurrently, is genuinely strong play (real example:
`mtRh3kJ9YMLazyvQ` fight 44, druid Olklo).

**Fix:** reduce the per-target LB3 judgements to a single representative judgement via
`weightedMedianJudgement` (already exists in `src/metrics/judgement.ts`, used today for
whole-report rollups), weighted by each target's own `windowMs` (the tracked-uptime window
already present on `Lb3TargetResult`). That single reduced judgement then joins the epic's
`mixedJudgement` call as one sibling, alongside refresh cadence, blooms, re-stack tax, and the
new concurrent-targets judgement (section 3).

```ts
// epicSummary.ts
export function summarizeLifebloomDiscipline(
  lb3: Lb3UptimeResult,
  refresh: RefreshCadenceResult,
  blooms: AccidentalBloomsResult,
  restack: RestackTaxResult,
  concurrent: ConcurrentLb3Result,
): EpicSummary {
  const lb3Reduced = weightedMedianJudgement(
    lb3.targets.map((t) => ({ judgement: t.judgement, weightMs: t.windowMs })),
  );
  const judgement = mixedJudgement([
    lb3Reduced,
    refresh.judgement,
    blooms.judgement,
    restack.judgement,
    concurrent.judgement,
  ]);
  // ...stats unchanged
}
```

If `lb3.targets` is empty, `weightedMedianJudgement` returns `null` (its documented behavior for
zero total weight), which `mixedJudgement` already filters out — matches today's "no maintained
targets" case falling out of the judgement cleanly.

## 3. Concurrent LB3 targets (`src/metrics/concurrentLb3Targets.ts`)

Add `judgement: Judgement | null` to `ConcurrentLb3Result`. Rule: sum `levels[]` entries where
`count >= 2`; if that summed percentage is `>= 50`, judgement is `"good"`; otherwise `null`.
**Never** `"fair"` or `"bad"` — this is a reward-only signal, since the "right" number of
concurrent targets depends on raid healing assignments the app has no way to see (per story
205's original reasoning, still valid for anything below the 50% bar).

```ts
const timeAt2PlusPct = levels
  .filter((l) => l.count >= 2)
  .reduce((sum, l) => sum + l.pct, 0);
const judgement: Judgement | null = timeAt2PlusPct >= 50 ? "good" : null;
```

No talent-eligibility gate needed — Lifebloom itself isn't talent-gated in TBC, and
`ConcurrentTargetsCard` already renders unconditionally.

**UI:** `ConcurrentTargetsCard` passes the new `judgement` to `MetricCard`'s `judgement` prop
(falls back to today's `note="Informational — no judgement"` when `null`).

**Epic wiring:** joins Lifebloom Discipline's `mixedJudgement` call per section 2. A `null` here
only ever helps (filtered out, same as an epic with no maintained targets), never hurts.

## 4. Swiftmend quality audit utilization (`src/metrics/swiftmendAudit.ts`)

Add `utilizationPct: number` and `utilizationJudgement: Judgement` to `SwiftmendAuditResult`.
Move the calc currently duplicated in `SwiftmendAuditCard` (`swiftmendCastCount / availableWindows

- 100`) into `computeSwiftmendAudit` itself:

```ts
const utilizationPct =
  availableWindows === 0 ? 0 : (swiftmendCastCount / availableWindows) * 100;
const utilizationJudgement = judgeThreshold(utilizationPct, {
  goodMin: 75,
  fairMin: 50,
});
// good >= 75%, fair 50-75%, bad < 50%
```

No new gating: `SwiftmendAuditCard` already only renders once `SWIFTMEND_MIN_RESTORATION` (30)
is met (story 903c), which already guarantees the talent is real — reusing that existing gate is
sufficient, no "deep-resto" (41+) bucket check needed.

**UI:** the card's header judgement chip stays wasteful-share's judgement, unchanged. Utilization
becomes an inline `JudgementChip` next to the existing "N Swiftmends cast of M possible 15s
windows" sentence, replacing the current "(informational)" suffix.

**Epic wiring:** `summarizeSpellDiscipline` folds `swiftmendAudit.utilizationJudgement` into its
`mixedJudgement` array alongside the existing `swiftmendAudit.judgement` (wasteful share),
`hotClips.rejuvenation.judgement`, and `downranking.judgement` — both Swiftmend judgements gated
by the existing `hasSwiftmend` flag, unchanged gating mechanism.

## 5. Nature's Swiftness audit utilization (`src/metrics/naturesSwiftnessAudit.ts`)

Add `utilizationPct: number` and `judgement: Judgement` to `NaturesSwiftnessAuditResult`.

```ts
const utilizationPct =
  availableWindows === 0 ? 0 : (castCount / availableWindows) * 100;
const judgement: Judgement =
  availableWindows === 1
    ? castCount >= 1
      ? "good"
      : "fair" // 1-window fights: holding NS in reserve is reasonable, not "bad"
    : judgeThreshold(utilizationPct, { goodMin: 75, fairMin: 50 });
```

The `availableWindows === 1` special case (fights under 3 minutes) exists because with only one
window, the standard bands make "not used" read as flat "bad" — but on a short fight it's
reasonable to hold NS in reserve for a real emergency that has a high chance of just not
occurring. Verified via the full 1-10 minute table during design (windows = `floor(duration /
180_000) + 1`):

| Fight length | Windows | Outcomes under standard bands                                              |
| ------------ | ------- | -------------------------------------------------------------------------- |
| 1-2 min      | 1       | 0 = bad, 1 = good — no "fair" reachable → **overridden to 0=fair, 1=good** |
| 3-5 min      | 2       | 0 = bad, 1 = fair (50%), 2 = good                                          |
| 6-8 min      | 3       | 0 = bad, 1 = bad (33%), 2 = fair (67%), 3 = good                           |
| 9-10 min     | 4       | 0 = bad, 1 = bad (25%), 2 = fair (50%), 3-4 = good                         |

No new gating: reuses the card's existing `NATURES_SWIFTNESS_MIN_RESTORATION` (20) render-gate
(story 903c), same reasoning as Swiftmend in section 4.

**UI:** `NaturesSwiftnessCard` drops `note="Informational — no judgement"` and passes the new
`judgement` as the card's real header judgement via `MetricCard`.

**Epic wiring:** `summarizeSpellDiscipline` gains a `naturesSwiftnessAudit` param and a new
`hasNaturesSwiftness` gate (computed the same way `hasSwiftmend` already is, just against
`NATURES_SWIFTNESS_MIN_RESTORATION`), folding `naturesSwiftnessAudit.judgement` into the
`mixedJudgement` array when eligible.

## 6. Consumable throughput fix (`src/metrics/consumableThroughput.ts`)

Unrelated inconsistency found during this work: `computeConsumableThroughput`'s own `judgement`
field combines its two rows (Mana Potion, Rune) via `worstJudgement`, when every other
multi-part judgement in the codebase uses `mixedJudgement` (good+bad reads "fair", not a flat
worst-of) — see `docs/thresholds.md`'s compounding-factors section for the established pattern.
One-line fix: swap `worstJudgement` for `mixedJudgement` in the `rows.map(...)` reduction. No
gating concerns (this function has no talent eligibility gate).

## 7. Epic-rollup / CLI plumbing (`scripts/lib/`)

- `calibrateReport.ts` / `types.ts`: move `concurrentLb3Targets` from the standalone
  `informational` bag into `LifebloomDisciplineMetrics`, and `naturesSwiftnessAudit` into
  `SpellDisciplineMetrics` — they're now real epic inputs, not just informational stats. Thread
  the already-computed `hasNaturesSwiftness` into `summarizeSpellDiscipline`'s new param, the
  same way `hasSwiftmend` already threads in today. Remove `FightResult.informational` once both
  fields have moved (nothing else should reference it after this — grep to confirm).
- `rollup.ts`: relocate the existing `concurrentLb3AvgPooled`/`concurrentLb3PeakMax` and
  `naturesSwiftnessCastsTotal`/`naturesSwiftnessAvailableWindowsTotal` numeric pools to read from
  the relocated metrics (via `lbReady`/`spellReady`), preserving the existing
  `hasNaturesSwiftness`-gated exclusion from story 907 (an ineligible fight's fictitious NS
  availability must still not pollute the pool). Add `swiftmendUtilizationPctPooled` and
  `naturesSwiftnessUtilizationPctPooled` to `SpellDisciplineRollup`, weighted by `availableWindows`
  per fight (`countWeightedAverage`), same convention as `swiftmendWastefulPctPooled`.
- `InformationalRollup` type and `DruidRollup.informational` field: both fields it currently
  holds move to the epic rollups above, so the type becomes empty — remove it and the
  `DruidRollup.informational` field entirely, and grep for any other reference before deleting
  (e.g. `docs/testing.md` fixture notes) to avoid a dangling mention.

## 8. Docs

- `docs/thresholds.md`: update/add rows and a dated "requested directly" paragraph (not a corpus
  calibration) for LB3 uptime, the new per-target reduction rule (compounding-factors section),
  Concurrent LB3, Swiftmend utilization, Nature's Swiftness, and the Consumable Throughput fix.
- `docs/backlog.md` story 914: mark the "Concurrent LB3 targets" and "Nature's Swiftness usage"
  bullets resolved inline, with a short finding note each. Story stays `🔲 Todo` overall — its
  other two bullets (Regrowth clip share, HoT-tick overheal) are untouched and out of scope here.
- `CLAUDE.md` Repo State paragraph: append a closing summary once implemented, per existing
  session convention.

## 9. Testing

- Unit tests: `lb3Uptime.test.ts`, `concurrentLb3Targets.test.ts`, `swiftmendAudit.test.ts`,
  `naturesSwiftnessAudit.test.ts`, `consumableThroughput.test.ts`, `epicSummary.test.ts` — new
  cases for each new threshold/field, the weighted-median reduction (including the Olklo-shaped
  good/fair/good → good case), the good-or-null concurrent rule, both utilization judgements
  (including NS's 1-window fair-not-bad exception), and the `mixedJudgement` swap.
- Component tests: `SwiftmendAuditCard`, `NaturesSwiftnessCard`, `ConcurrentTargetsCard` for the
  new/changed chips; `useLifebloomDisciplineSummary`/`useSpellDisciplineSummary` for the new
  params threading through.
- `scripts/lib/rollup.test.ts` / `calibrateReport` tests: updated for the relocated metrics and
  new pooled fields, per `docs/testing.md`'s Tier 2/3 conventions.

## Out of scope

- Regrowth clip share and HoT-tick overheal (story 914's other two bullets) — untouched.
- Any new exemplar-corpus data collection — this is a direct-request revision, not a calibration
  study; `docs/thresholds.md` documents it as such rather than claiming new corpus evidence.
- Death forensics / near-death response readiness thresholds (stories 910, 1001) — unaffected;
  they already gate Swiftmend/NS readiness on the same eligibility flags this design reuses.
