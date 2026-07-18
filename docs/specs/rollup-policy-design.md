# Whole-report rollup policy (story 904)

## Problem

`docs/backlog.md` story 904: the whole-report dashboard's per-epic judgement is a strict worst-of across every fight in the report. Real corpus data showed this is far harsher than the underlying per-fight judgements: GCD economy was 33% green / 27% orange / 39% red _per fight_, but 0% green / 9% orange / 91% red at the worst-of rollup; spell discipline was 70% green per-fight but only 35% green at rollup. One rough pull in an otherwise-clean raid night shouldn't single-handedly crush the whole night's verdict to red.

## Scope

Two call sites currently do "worst single fight wins" across every fight in a report, for one epic at a time:

- `src/metrics/reportAggregation.ts`'s `worstReadyJudgement` — feeds the app's `ReportDashboard` chip strip.
- `scripts/lib/rollup.ts`'s `epicRollupBase` (via a `rollupJudgement` wrapper) — feeds the CLI calibration tool's `DruidRollup` JSON output.

Both are replaced by this story. Everything else that currently calls `worstJudgement` stays exactly as-is, because it's combining a _different_ axis than "many fights, one epic":

- `reportAggregation.ts`'s `combineFightEpicStatus` — worst-of across an epic's _six epics, for one fight_ (the fight-row overall chip). Per 904's acceptance criteria, 701's single-fight scorecard is unaffected, and this is the mechanism behind a single fight's own verdict.
- Every within-fight worst-of in `epicSummary.ts`, `lb3Uptime.ts`, `overhealTable.ts`, `consumableThroughput.ts`, `deathForensics.ts`, `prepHygiene.ts` — these combine sub-metrics _within one fight/context_, not fights within a report.

## Why not a uniform "pool the number, re-judge" approach

Not every metric has a pooled numeric value that can be meaningfully re-judged against its existing single-fight threshold. Rate-based metrics (GCD utilization %, idle-gap %, overheal %) do. But count-based metrics — accidental blooms (`judgeThresholdBelow(count, ...)`), restack tax (`judgeThresholdBelow(castCount, ...)`), downranking flags — are judged against a threshold calibrated for _one fight's_ raw event count. Summing that count across a 10-13-fight raid night and re-judging it against the same single-fight threshold is nonsensical: any raid night will trivially blow past a "0-1 casts is green" bar. A per-metric-shape hybrid (pool-and-rejudge for rate metrics, something else for count metrics) would mean two different policies to maintain and reason about.

## Chosen mechanism: duration-weighted median judgement

Instead, the new policy operates purely on the _distribution of already-computed per-fight `Judgement` values_ for an epic, weighted by each fight's duration. This works identically regardless of what the underlying metric measures, since it only needs the per-fight verdict, not the number behind it — and both consumers already have every fight's per-epic `Judgement` in hand today.

**Why median over percentage-band cutoffs:** a percentage-band scheme (e.g. "green if ≤10% of fight-time is red") would need new arbitrary constants, which — per this repo's principle 3 ("every threshold must be documented, with a comment pointing to its rationale") — realistically means a calibration pass against the exemplar corpus, similar to stories 905/908. That's real scope growth beyond what 904 asks for. The median needs no such calibration: "the middle of the raid night, weighted by how long each pull ran" is self-explanatory and requires no new sourced constant.

**Why duration-weighted, not fight-count-weighted:** a 30-second wipe shouldn't count the same as a 10-minute kill. This also matches the existing precedent in `scripts/lib/rollup.ts`'s per-metric pooling (`durationWeightedAverage`).

**Tie-break:** on an exact boundary tie (cumulative weight crosses 50% exactly at the boundary between two different judgements), the policy rounds pessimistic — toward the worse judgement. The median is already the mechanism pulling the rollup toward leniency; ties shouldn't add more of that. This is implemented by walking from the worst bucket (red) down using `>=` comparisons, rather than sorting and picking a midpoint — the `>=` at each step _is_ the round-toward-red rule.

### Shared implementation — `src/metrics/judgement.ts`

```ts
export function weightedMedianJudgement(
  entries: { judgement: Judgement; weightMs: number }[],
): Judgement | null {
  const total = sum(entries.map((e) => e.weightMs));
  if (total === 0) return null;
  const half = total / 2;
  const redW = sum(
    entries.filter((e) => e.judgement === "red").map((e) => e.weightMs),
  );
  if (redW >= half) return "red";
  const orangeW = sum(
    entries.filter((e) => e.judgement === "orange").map((e) => e.weightMs),
  );
  if (redW + orangeW >= half) return "orange";
  return "green";
}

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

`weightedMedianJudgement` returns `null` when total weight is 0 (no ready fights) — the same "no fights ready must not read as a clean pass" case the old `rollupJudgement` guarded explicitly; here it falls out of the total-weight check for free, so that wrapper is deleted rather than ported.

`judgementBreakdown` counts **fights**, not duration — it exists purely to answer "how many fights drove this verdict," which is a count question, not a weighting question. This is what preserves the diagnostic value the acceptance criteria requires: a user can see e.g. "8 green · 1 red" next to an orange or green headline chip and know at a glance that something needs a look, without the single red fight dominating the headline itself.

## Consumer integration

### App — `src/metrics/reportAggregation.ts` + `ReportDashboard`

- `worstReadyJudgement` is replaced with:

  ```ts
  export function rollupEpicJudgement(
    entries: { status: EpicSummaryStatus; weightMs: number }[],
  ): { judgement: Judgement; breakdown: Record<Judgement, number> } | null {
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
      ready.map((e) => ({
        judgement: e.status.judgement,
        weightMs: e.weightMs,
      })),
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

  This preserves today's progressive-loading semantics: an epic still `loading`/`errored` for some fights doesn't block the others already `ready` from contributing (same filter-then-aggregate shape `worstReadyJudgement` already had).

- `ReportDashboard`'s chip-strip currently discards each fight's duration when it builds `allSummaries: FightEpicSummaries[]`. It needs to keep the pairing so `weightMs` is available per entry — change the intermediate value to `{ fight, summaries }[]` and pass `fight.endTime - fight.startTime` as `weightMs` (the same duration calculation `FightRow` already uses for its own display).
- Each chip renders its existing `JudgementChip` plus a small adjacent text line built from `breakdown`, e.g. `8 green · 1 red` — non-zero buckets only, in green/orange/red order. Exact copy/styling is an implementation-time call (a new class alongside `.chipLabel`/`.calculating` in `ReportDashboard/index.module.css`), not fixed by this doc.
- `combineFightEpicStatus` is untouched.

### CLI — `scripts/lib/rollup.ts` + `scripts/lib/types.ts`

- `epicRollupBase<M>(totalCount, ready: ReadyEntry<M>[])` already has `durationMs` per `ReadyEntry`. Its `judgement` field becomes:

  ```ts
  judgement: weightedMedianJudgement(
    ready.map((r) => ({ judgement: r.judgement, weightMs: r.durationMs })),
  ),
  ```

  and it gains:

  ```ts
  judgementBreakdown: judgementBreakdown(ready.map((r) => ({ judgement: r.judgement }))),
  ```

- The old local `rollupJudgement` helper (and its explanatory comment about `worstJudgement([])` defaulting to green) is deleted — superseded by `weightedMedianJudgement`'s own null-on-zero-weight behavior.
- `EpicRollupBase` (`scripts/lib/types.ts`) gains `judgementBreakdown: Record<Judgement, number>`, which flows straight into `calibrate.ts`'s existing JSON-file output with no changes needed to `calibrate.ts` itself (it doesn't print a text summary — it writes the full `DruidRollup` to a file).
- `informational` (the no-judgement section of `rollupDruid`) is unaffected — it has no judgement to aggregate.

Both consumers call the same two functions from `src/metrics/judgement.ts` — one policy, not two independently-maintained ones.

## Testing

Per `docs/testing.md`'s tiers, this is pure logic plus component wiring — no new WCL calls, so no new integration fixtures needed.

- `src/metrics/judgement.test.ts` (new or extended): `weightedMedianJudgement` — majority-green, majority-red, an exact-half boundary tie (asserts it resolves to the worse side), and empty/zero-weight input → `null`. Also a regression case reproducing this story's own cited numbers (a fight mix that's worst-of-red but median-orange/green). `judgementBreakdown` — basic count correctness.
- `scripts/lib/rollup.test.ts` and `src/metrics/reportAggregation.test.ts` (existing suites, currently asserting `worstJudgement`-based behavior): updated to assert the new median + breakdown output.
- `ReportDashboard`'s existing component test(s): a case asserting the breakdown text renders next to a chip.
- Real-data sanity check (not an automated test): re-run `npm run calibrate -- <reportCode>` against one of `docs/testing.md`'s known multi-fight reports and confirm `judgementBreakdown` looks sane — same spot-check precedent stories 905/908 used.

## Documentation

- `docs/thresholds.md`'s "Worst-of aggregation, three levels deep" bullet is rewritten: it's now two levels of true worst-of (within-fight epic combine, within-epic sub-metric combine) plus a duration-weighted median for the cross-fight rollup, dated to this story.
- `docs/backlog.md`'s story 904 entry is marked `✅ Done` with a short findings paragraph, matching the convention already used by stories 905/907/908.
- This design doc is deleted in the same commit that ships the implementation, per this repo's "a story isn't done until its paperwork is retired" convention.
