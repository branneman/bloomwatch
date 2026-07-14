import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

export type OverallJudgementStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement };

// One fight's six epic summaries -> a single overall status for that fight's
// row chip. Waits for every epic to resolve before judging — unlike
// worstReadyJudgement below — since a single fight's own verdict shouldn't
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

// One epic's judgement across every fight in the report -> a single strip
// chip. Progressive: counts only fights whose this-epic summary has resolved
// so far, ignoring ones still loading or errored, so the chip can appear
// before the whole report finishes computing and can only get worse (more
// accurate) as more fights resolve, never falsely better.
export function worstReadyJudgement(
  statuses: EpicSummaryStatus[],
): Judgement | null {
  const ready = statuses.filter(
    (s): s is Extract<EpicSummaryStatus, { status: "ready" }> =>
      s.status === "ready",
  );
  if (ready.length === 0) return null;
  return worstJudgement(ready.map((s) => s.judgement));
}
