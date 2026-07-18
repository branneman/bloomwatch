# Mana economy overheal recalibration design

Recalibrates story 404's Bloom/Direct overheal thresholds against real data (story 905), and — as a necessary side effect of the plumbing this requires — fixes `scripts/lib/rollup.ts`'s Swiftmend pooling bug (story 907). Both stories ship together and are both marked done by this work.

## Why

Real corpus data (`calibration-data/`, 55 archetype-tagged reports on disk) shows mana economy's whole-report rollup is driven almost entirely by overheal: the backlog cites 204/393 fight-rows red, with mana curve, consumables, and Innervate all reasonably distributed on their own. Pooling this session's local corpus by archetype bucket (`calibration-data/archetypes.json`, joined against each report's per-fight `overhealTable` output) confirms why and reveals two distinct problems:

- **Bloom (Lifebloom) overheal is archetype-invariant but badly miscalibrated for everyone.** deep-resto and dreamstate both cluster at ~72-74% median overheal, but the current red line starts at 70% — convicting the median real player regardless of archetype.
- **Regrowth-direct overheal genuinely differs by archetype.** deep-resto's median (31%) sits right at today's green/orange line; dreamstate's median (50%, p75 84%) is structurally much higher. Healing Touch and Swiftmend overheal, by contrast, already fit the current single threshold well in both archetypes (median ~0-4%) and need no change.

This is a real fork in how the fix should work — not just new numbers for the same shape of threshold — which is why it's a design rather than a drop-in constant tweak.

## Scope

- **Bloom overheal** (`src/metrics/overhealTable.ts`'s `judgeBloomOverheal`): recalibrated as a single pooled threshold, unchanged across archetypes. The data doesn't support splitting it, so it isn't split.
- **Regrowth-direct overheal**: gets its own threshold per archetype bucket (deep-resto vs. dreamstate). Healing Touch and Swiftmend keep today's single `judgeDirectOverheal` threshold, unchanged.
- **Story 907 folds in**: `rollup.ts`'s `SpellDisciplineRollup` pooling (`swiftmendEntries`, `scripts/lib/rollup.ts` around line 198-212) currently pools every ready fight's `swiftmendAudit.wastefulPct` unconditionally, including fights where the druid's build can't reach Swiftmend's 30-Restoration requirement — the same fake-data problem 903c already fixed in the live app's cards, still open in the CLI's own rollup. This story fixes it as part of adding the talent/archetype plumbing 905 needs anyway.
- Nature's Swiftness has no numeric pooling in `rollup.ts` today (it's informational-only per 903c) — nothing to fix there.
- Out of scope: HoT-tick overheal (already informational-only, no judgement); any change to `computeOverhealTable`'s row classification or event handling; story 904's rollup-aggregation-policy work (separate, unrelated to this story's per-metric threshold values).

## Data & methodology

Precedent (902, 908): recalibrate against story 901's curated, behaviorally-validated deep-resto exemplar corpus, not just talent-tagged logs of unknown skill. That corpus is deep-resto-only by construction (901 never hunted dreamstate exemplars), so it only covers half of this story's need:

- **Bloom overheal and deep-resto's Regrowth-direct threshold**: calibrated against the 901 exemplar corpus — same rigor as 902/908.
- **Dreamstate's Regrowth-direct threshold**: calibrated against the broader `calibration-data/` corpus, tagged by talent points only (no behavioral skill filter). This is real data, but weaker evidence than the exemplar corpus backing every other threshold in `docs/thresholds.md` — the calibration-review entry for this threshold says so explicitly, and suggests a future "901 but for dreamstate" exemplar hunt as the way to strengthen it, rather than silently presenting it with the same confidence as the rest.
- **Every other bucket** (`mostly-resto`, `mostly-balance`, `restokin-shaped`, `other-unclassified`, `unknown-no-talent-data`, `likely-dreamstate-partial`) uses the deep-resto threshold as a fallback default — the pre-905 behavior. This is a deliberate non-decision: these builds are already flagged by 903d as not well-supported by the tool, so this story doesn't manufacture a new precision claim about them. `likely-dreamstate-partial` shares `likely-dreamstate-full`'s threshold rather than getting a third number — no separate data exists to justify splitting them.

Exact cutoffs are finalized during implementation, against the fullest corpus available at that time (re-running `npm run calibrate` for any exemplar report missing from the local `calibration-data/` scratch directory, now that 907's talent fetch makes per-fight bucket data available to the CLI). The table below gives strong directional candidates computed from this session's local corpus, following the same percentile-driven approach 908 used (choose bounds that land real known-good play mostly green, with red reserved for genuine outliers) — final numbers and their supporting percentiles get written into `docs/thresholds.md`'s calibration-review paragraph once confirmed against the full corpus.

| Metric                   | Bucket                                                               | Current                          | Candidate                        | Resulting split  |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------- | -------------------------------- | ---------------- |
| Bloom (Lifebloom)        | all                                                                  | green<40 / orange 40-70 / red>70 | green<80 / orange 80-90 / red>90 | 63% / 23% / 14%  |
| Regrowth-direct          | deep-resto                                                           | green<30 / orange 30-50 / red>50 | green<38 / orange 38-60 / red>60 | 59% / 26% / 16%  |
| Regrowth-direct          | dreamstate (full + partial); fallback buckets keep deep-resto's band | green<30 / orange 30-50 / red>50 | green<60 / orange 60-85 / red>85 | 60% / 16% / 23%  |
| Healing Touch, Swiftmend | all                                                                  | green<30 / orange 30-50 / red>50 | unchanged                        | already well-fit |

## Architecture

**`src/metrics/overhealTable.ts`**

- `computeOverhealTable` gains an optional fourth parameter, `archetypeBucket?: TalentBucket` (from `src/report/archetypeDetection.ts`). Omitted → treated as `"deep-resto"`, preserving today's behavior for any caller that doesn't pass one.
- `RowSpec.judge`'s type changes from `(overhealPct: number) => Judgement` to `(overhealPct: number, bucket: TalentBucket) => Judgement`. `judgeBloomOverheal` and the shared `judgeDirectOverheal` (still used by Healing Touch and Swiftmend) ignore the second parameter. `REGROWTH_DIRECT` gets its own judge function that branches on `bucket`, mapping every non-deep-resto, non-dreamstate bucket to deep-resto's band per the fallback rule above.

**App wiring** (`OverhealTableCard`, `Scorecard/useManaEconomySummary.ts`)

- Both already receive `accessToken`/`reportCode`/`fight`/`druidId`/`fetchEvents` as props/arguments. Each independently calls 903a's existing `useArchetypeBucket` hook (same pattern already used independently by `SwiftmendAuditCard` and `NaturesSwiftnessCard`) and passes the resulting bucket into `computeOverhealTable`. `useArchetypeBucket` fetches `CombatantInfo` through the existing event-cache layer, so this doesn't add a network request beyond what the cache already dedupes.
- While `state.status` is `"loading"` or `"error"` for the archetype bucket, the overheal table still renders using the deep-resto default (matching the omitted-parameter behavior above) — it does not block on or fail over the bucket fetch, since overheal judgement degrading to the deep-resto default is a much smaller problem than the card not rendering at all.

**CLI wiring** (`scripts/lib/calibrateReport.ts`)

- Already fetches `CombatantInfo` and calls `parseTalentPoints` for `hasSwiftmend`/`hasNaturesSwiftness` (existing code, lines ~204-211). This story adds one `classifyBucket(...)` call reusing the same `talents` result, and threads the resulting bucket into the existing `computeOverhealTable` call site (~line 317).

**Story 907's rollup fix**

- `FightResult` (`scripts/lib/types.ts`) gains a `hasSwiftmend: boolean` field, populated from the value `calibrateReport.ts` already computes locally today but doesn't currently expose on the returned object.
- `rollup.ts`'s `swiftmendEntries.push(...)` (in the spell-discipline pooling loop, ~line 209) is skipped for any fight where `hasSwiftmend` is `false`, so a Swiftmend-ineligible fight no longer contributes fake near-zero-cast data to the whole-report `swiftmendWastefulPctPooled` average.

## Testing

Per `docs/testing.md`'s tiers:

- **Unit** (`src/metrics/overhealTable.test.ts`): each archetype bucket's Regrowth-direct judgement at its new boundaries; the fallback-to-deep-resto behavior for an unsupported/unknown bucket and for an omitted bucket argument; Bloom overheal judgement unaffected by bucket.
- **Unit** (`scripts/lib/rollup.test.ts` or equivalent): a fight with `hasSwiftmend: false` is excluded from `swiftmendWastefulPctPooled`; a mixed set of eligible/ineligible fights pools only the eligible ones.
- **Component**: `OverhealTableCard`'s and `useManaEconomySummary`'s existing tests updated for the new `useArchetypeBucket` dependency (mock it the same way `SwiftmendAuditCard`'s tests already do).
- **Integration/fixture**: `docs/testing.md`'s `bKRZ68XqgwYkxtzm` report (already documented as a real Swiftmend-ineligible druid) is the natural real-data case for 907's pooling-exclusion behavior.

## Docs

- `docs/thresholds.md`'s mana economy section: updated threshold rows for Bloom and Regrowth-direct, plus a dated calibration-review paragraph in the same style as 902/908's, including the explicit "provisional, talent-tagged corpus only" caveat on dreamstate's number.
- `docs/backlog.md`: stories 905 and 907 both marked ✅ Done.
- This spec is deleted once the story ships, per this repo's "paperwork isn't done until it's retired" convention.
