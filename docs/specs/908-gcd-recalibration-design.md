# 908 — Recalibrate GCD economy thresholds against exemplars, design

Free-floating (no blocking dependency) — a threshold-review story in Epic I, mirroring 902's structure and evidence standard exactly, but for GCD economy (story 101/102) instead of Lifebloom discipline.

## Why

Story 904 observed that GCD economy looked harsh at the whole-report rollup (0% green/9% orange/91% red) despite a much more reasonable per-fight split (33% green/27% orange/39% red), and concluded "the threshold values aren't the problem here — the aggregation is." But that 33/27/39 figure was pooled across the _entire_ calibration corpus — every druid regardless of talent archetype or skill level — not filtered to real, talent-and-behaviorally-validated deep-resto exemplars. Before accepting 904's conclusion at face value for GCD economy specifically, this story checks the current 85%/70% (GCD utilization) and <5%/5-15% (idle-gap dead time) thresholds directly against the story-901 exemplar corpus, the same evidence standard 902 already used for Lifebloom discipline.

## Method

`calibration-data/classic/*.json` (22 reports, the same story-901-validated deep-resto exemplar corpus 902 used — every druid confirmed Restoration ≥ 41 via `CombatantInfo.talents`, see `docs/testing.md`'s "Known real 2021-2022 TBC Classic reports" table) already has `gcdEconomy` fully computed per fight by `scripts/calibrate.ts` — no new WCL calls needed. Filtered to kills with `durationMs > 30000` (excludes wipes and near-instant pulls, e.g. a "Chess Event" scripted encounter that reads 0% GCD utilization across every log — not a real healing check, would otherwise skew the sample toward false reds). 169 fight-rows survive the filter.

## Findings

**GCD utilization** (`src/metrics/gcdUtilization.ts`, current: green ≥85% / orange 70-85% / red <70%):

- 80% green / 11% orange / 8% red across the 169-row sample. Median 97.7%, p25 89.2%.
- This is strong, real validation — known-good deep-resto play lands mostly green under the current bands, the same character of finding 902 made for refresh cadence. **No change.**

**Idle-gap dead time** (`src/metrics/idleGaps.ts`, current: green <5% / orange 5-15% / red >15%):

- 57% green / 28% orange / 15% red. Median 4.0% — sitting almost exactly on the green/orange boundary, meaning roughly half of genuinely elite pulls land on either side of that line by a hair.
- Percentile curve: p60 ≈ 5.9%, p70 ≈ 9.5%, p80 ≈ 13.5%, p90 ≈ 17.9%.
- Moving only the green boundary from 5% to 7% (red ceiling unchanged at 15%) shifts the sample to 64% green / 20% orange / 15% red — a real improvement in fit without touching what counts as genuinely bad idle time. **Adjust `GREEN_MAX_PCT` 5 → 7.**

## Changes

- `src/metrics/idleGaps.ts`: `GREEN_MAX_PCT` constant changes from `5` to `7`, with its existing sourcing comment updated to cite story 908 alongside story 102.
- `src/metrics/gcdUtilization.ts`: no code change — its existing story-101 sourcing comment is left as-is.
- `docs/thresholds.md`'s "GCD economy" section gains a dated calibration-review paragraph (matching 902's existing precedent format) documenting both findings: the GCD-utilization validation and the idle-gap adjustment, with the sample size and method.
- `docs/backlog.md` gains a new story **908 — Recalibrate GCD economy thresholds against exemplars**, marked `✅ Done`, with this document's findings recorded in its body per this repo's "the change and reasoning recorded here" convention (902's own acceptance criteria used the same pattern).

## Explicitly out of scope

- Story 904's rollup-aggregation problem — separate, already-filed story; this story only touches the two per-fight threshold constants themselves.
- Any UI/component change — `MetricCard`/`Widget` already render whatever judgement `computeIdleGaps`/`computeGcdUtilization` return; no rendering logic changes.
- The Anniversary (`fresh.`) corpus — the story-901 `classic.` exemplar corpus is the same evidence base 902 already established as the project's calibration standard (talent-confirmed deep-resto + behaviorally validated), so this story doesn't re-derive a second corpus.

## Testing

`idleGaps.test.ts`'s existing judgement tests (`"computes deadTimePct and a green judgement below 5%"` at 3.5% dead time, and `"judges orange between 5% and 15%, red above 15%"` at 8.5%/18.5%) all sit outside the 5-7% zone that's actually changing, so none of them flip outcome and none need editing. One new test is added: a fight with dead time between 5% and 7% (e.g. 6%, previously orange) now asserts `judgement === "green"` — this is the only case that actually exercises the new `GREEN_MAX_PCT` value. No Tier 3 component changes — no component references the raw threshold numbers directly (they render through the shared `judgement`/`MetricCard` machinery already covered elsewhere).
