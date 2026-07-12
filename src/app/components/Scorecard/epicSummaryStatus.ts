import type { Judgement } from "../../../metrics/judgement";

export type EpicSummaryStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement; stats: string[] };
