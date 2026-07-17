# Bloomwatch — Threshold catalog

Every R/O/G (red/orange/green) judgement threshold used anywhere in the app, in one place, per story 802's acceptance criteria. This is the permanent reference for calibration passes — story 802 is deliberately not a one-time event (principle 3: thresholds are periodically recalibrated by the maintainers as more real logs are seen), so this doc stays current rather than being retired once 802 first ships.

Each threshold's rationale lives as a code comment next to its constant (principle 3) — this table is an index into those comments, not a replacement for them. If a value here and its code comment ever disagree, the code is authoritative; fix this table.

## GCD economy (epic B)

| Metric              | Threshold            | Current default      | Source    | Code                                                |
| ------------------- | -------------------- | -------------------- | --------- | --------------------------------------------------- |
| GCD utilization     | green / orange / red | ≥85% / 70–85% / <70% | story 101 | `src/metrics/gcdUtilization.ts`                     |
| Idle-gap dead time  | green / orange / red | <5% / 5–15% / >15%   | story 102 | `src/metrics/idleGaps.ts`                           |
| Idle-gap definition | gap counts as "idle" | >1.7s between casts  | story 102 | `src/metrics/idleGaps.ts` (`IDLE_GAP_THRESHOLD_MS`) |

## Lifebloom discipline (epic C)

| Metric                     | Threshold                             | Current default                                                                                     | Source    | Code                                                                                                                                                     |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Maintained target" filter | min uptime to count at all            | ≥30% any-stack LB uptime                                                                            | story 201 | `src/metrics/lb3Uptime.ts` (`MAINTAINED_MIN_UPTIME_PCT`, also independently duplicated in `concurrentLb3Targets.ts` and imported in `deathForensics.ts`) |
| LB3 uptime per target      | green / orange / red                  | ≥90% / 75–90% / <75%                                                                                | story 201 | `src/metrics/lb3Uptime.ts`                                                                                                                               |
| Refresh cadence buckets    | early / ideal / late                  | <5.5s / 5.5–7s / >7s                                                                                | story 202 | `src/metrics/refreshCadence.ts`                                                                                                                          |
| Refresh cadence median     | green / orange / red                  | 6–7s / 5–6s / <5s or >7s                                                                            | story 202 | `src/metrics/refreshCadence.ts` — note the non-monotonic shape: red is reachable from _both_ ends (too eager and too late)                               |
| Accidental bloom count     | green / orange / red                  | 0 / 1–2 / ≥3                                                                                        | story 203 | `src/metrics/accidentalBlooms.ts`                                                                                                                        |
| Accidental bloom window    | re-application counts as "accidental" | within 3s of the bloom                                                                              | story 203 | `src/metrics/accidentalBlooms.ts` (`ACCIDENTAL_WINDOW_MS`)                                                                                               |
| Re-stack tax               | green / orange / red                  | scales with fight length: 1 green-tier cast per 2 min elapsed, 1 orange-tier cast per 1 min elapsed | story 204 | `src/metrics/restackTax.ts` (`judgeRestackTax`)                                                                                                          |
| Concurrent LB3 targets     | —                                     | informational only, no R/O/G                                                                        | story 205 | `src/metrics/concurrentLb3Targets.ts`                                                                                                                    |

**Calibration review (story 902, 2026-07):** reviewed against ~22 real logs from 16 distinct players, including several from the 2021-2022 TBC Classic launch's Black Temple/Hyjal/Sunwell progression content (talent-confirmed deep-resto, sourced per story 901).

- **Refresh cadence median: no change.** Seven-plus independent elite players consistently land 70-96% of their refreshes in the current 5.5-7s "ideal" bucket (e.g. Kudryavka 96%, Stuuri 95%, Was 94%, Apalistar 94%), and their pooled medians cluster tightly around the 6-7s green band. This is real validation of the existing threshold, not a guess.
- **LB3 uptime per target: threshold values unchanged, but the metric's framing was found to be misleading for raid healers.** The 90%/75% bands ARE achievable by real elite play (Elmaskecura hit 91% on one target), so the numbers themselves aren't wrong. But a player juggling more simultaneous targets structurally shows lower _per-target_ uptime than one focused on fewer — evidenced directly by Olklo's own logs (3 tight targets at 64-65% in a BT/Hyjal log vs. 10 scattered targets at 19-71% in a harder Sunwell log, same player). The card now carries a caveat (`LB3UptimeCard`) explaining the metric is strongest for a dedicated tank-healer assignment and shouldn't be weighted heavily by a primarily raid-healing druid. A deeper fix — weighting or highlighting a player's best-maintained target rather than judging all targets equally — is real but overlaps with story 903's per-fight role/assignment awareness and story 904's rollup-policy work; deliberately not attempted here to avoid scope creep into stories not yet done.

## Spell discipline (epic D)

| Metric                   | Threshold                        | Current default                                                               | Source    | Code                                                                                                                                                                          |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HoT clip definition      | refresh counts as a clip         | existing aura had >1 tick (>3s) remaining                                     | story 301 | `src/metrics/hotClipDetection.ts` (`CLIP_THRESHOLD_MS`)                                                                                                                       |
| Rejuvenation clip share  | green / orange / red             | <5% / 5–15% / >15% of Rejuv casts                                             | story 301 | `src/metrics/hotClipDetection.ts`                                                                                                                                             |
| Regrowth clip share      | —                                | informational only, no R/O/G (Regrowth-as-only-direct-heal-in-form exemption) | story 301 | `src/metrics/hotClipDetection.ts`                                                                                                                                             |
| Swiftmend classification | efficient / emergency / wasteful | consumed HoT ≤3s remaining / target ≤50% HP / neither                         | story 302 | `src/metrics/swiftmendAudit.ts` (`classify`) — efficient takes priority even if HP is also low                                                                                |
| Swiftmend wasteful share | green / orange / red             | 0% (exact) / ≤25% / >25%                                                      | story 302 | `src/metrics/swiftmendAudit.ts` — the only judged metric in the app with a zero-tolerance green band; a single wasteful Swiftmend among dozens drops the whole card to orange |
| Downranking flag         | max-rank direct heal flagged     | >50% direct overheal                                                          | story 303 | `src/metrics/downrankingDiscipline.ts`                                                                                                                                        |
| Downranking judgement    | green / orange                   | 0 flags / ≥1 flag (red is structurally unreachable — max 2 flaggable groups)  | story 303 | `src/metrics/downrankingDiscipline.ts` (`judgeFlaggedCount`)                                                                                                                  |
| Nature's Swiftness       | —                                | informational only, no R/O/G (situational by design)                          | story 304 | `src/metrics/naturesSwiftnessAudit.ts`                                                                                                                                        |

## Mana economy (epic E)

| Metric                                                | Threshold                     | Current default                                                               | Source    | Code                                                                                                                  |
| ----------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Ending mana (kills, ≥90s fights only)                 | green / orange / red          | 5–40% / 40–70% or 0–5% / >70%                                                 | story 401 | `src/metrics/manaCurve.ts` (`judgeManaBand`) — note 0–5% (near-OOM) is orange, not red; only _hoarding_ (>70%) is red |
| Consumable expected floor                             | per-consumable expected count | ⌊fight duration / 120s⌋, only for fights where mana dropped <70% at any point | story 402 | `src/metrics/consumableThroughput.ts`                                                                                 |
| Consumable throughput                                 | green / orange / red          | ≥floor / floor−1 / ≤floor−2                                                   | story 402 | `src/metrics/consumableThroughput.ts`                                                                                 |
| Innervate — never used                                | red                           | mana-constrained (<70% at any point) fight ≥3min with zero Innervate casts    | story 403 | `src/metrics/innervateAudit.ts`                                                                                       |
| Innervate — cast on ally                              | green / red                   | mana-using target / non-mana-using target (Warrior, Rogue, Feral Druid)       | story 403 | `src/metrics/innervateAudit.ts`                                                                                       |
| Innervate — self-cast timing                          | green / orange                | before / after 90% fight elapsed                                              | story 403 | `src/metrics/innervateAudit.ts` (`LATE_CAST_FRACTION`)                                                                |
| Bloom overheal                                        | green / orange / red          | <40% / 40–70% / >70%                                                          | story 404 | `src/metrics/overhealTable.ts`                                                                                        |
| Direct heal overheal (Regrowth direct, HT, Swiftmend) | green / orange / red          | <30% / 30–50% / >50%                                                          | story 404 | `src/metrics/overhealTable.ts`                                                                                        |
| HoT-tick overheal                                     | —                             | informational only, no R/O/G                                                  | story 404 | `src/metrics/overhealTable.ts`                                                                                        |

## Death forensics (epic F)

| Metric                 | Threshold                    | Current default                                                       | Source    | Code                                                                                                                      |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| "Idle preceding death" | preceding gap counts as idle | ≥5s with no cast before the death                                     | story 501 | `src/metrics/deathForensics.ts` (`DEATH_IDLE_WINDOW_MS`)                                                                  |
| Per-death readiness    | green / orange / red         | 0 / 1 / ≥2 unspent resources, judged only on maintained-target deaths | story 501 | `src/metrics/deathForensics.ts` (`judgeDeathReadiness`) — unspent resources are Swiftmend-ready, NS-ready, idle-preceding |

## Prep hygiene (epic G)

| Metric                | Threshold            | Current default                                                           | Source    | Code                                                |
| --------------------- | -------------------- | ------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| Flask/elixir coverage | green / orange / red | flask (or both battle+guardian elixir) / exactly one of the two / neither | story 601 | `src/metrics/prepHygiene.ts` (`judgeFlaskOrElixir`) |
| Food buff             | green / red          | present / missing (binary, no orange)                                     | story 601 | `src/metrics/prepHygiene.ts`                        |
| Weapon oil            | green / red          | present / missing (binary, no orange)                                     | story 601 | `src/metrics/prepHygiene.ts`                        |

## Non-tunable constants (excluded from calibration scope)

These aren't judgement thresholds — they're fixed TBC game-mechanics facts (spell durations, cooldowns) that parsing/matching logic depends on, live-validated against real WCL data (see `docs/testing.md`'s known-reports table). They don't get recalibrated; they get re-validated if TBC's numbers ever change.

- `REJUVENATION_DURATION_MS` = 12,000ms, `REGROWTH_DURATION_MS` = 27,000ms (`hotClipDetection.ts`)
- `SWIFTMEND_COOLDOWN_MS` = 15,000ms (`swiftmendAudit.ts`)
- `NATURES_SWIFTNESS_COOLDOWN_MS` = 180,000ms (`naturesSwiftnessAudit.ts`)
- Event-matching tolerances (`SWIFTMEND_MATCH_TOLERANCE_MS`, `DIRECT_HEAL_MATCH_TOLERANCE_MS`, `TICK_BOUNDARY_TOLERANCE_MS`, all 50ms) — timestamp slop absorbing WCL's own event-ordering, not judgement calls
- `LIFEBLOOM_MANA_COST` = 220 (restackTax.ts) — a cost estimate, not a judgement threshold

## Compounding factors (not thresholds themselves, but shape how harsh the tool reads)

Several structural choices amplify the effect of any single strict threshold, independent of whether that threshold's own value is right:

- **Worst-of aggregation, three levels deep.** `epicSummary.ts` rolls every metric in an epic up to a single judgement via `worstJudgement` (worst wins, ties toward red). `lb3Uptime.ts` does this per-target before that. `702`'s whole-report dashboard does it again per-fight across a whole raid night. A single red sub-metric — one target's LB3 dipping to 74% for one fight — can be the sole reason an entire epic, or an entire raid night's aggregate, reads red, even if every other target/fight/metric was green.
- **Swiftmend's zero-tolerance green band** (story 302) is the only judged metric with an exact-zero threshold for green — one wasteful Swiftmend among many casts is enough to lose green entirely, unlike every other percentage-based threshold in the app which tolerates some share of misses.
- **Calibration corpus is narrow.** `docs/testing.md`'s known-report table is drawn almost entirely from one guild's raid logs (used originally to validate event-parsing assumptions, not to represent a range of skill levels), plus one unrelated report added for spec-detection coverage. None were sourced as _known-good, well-regarded_ play. Story 802's calibration pass needs additional reports from strong resto druids specifically for this purpose — see the "known-good" gap called out in the calibration-pass task list.
