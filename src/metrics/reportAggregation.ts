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
