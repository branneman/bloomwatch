import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  rollupEpicJudgement,
} from "./reportAggregation";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

const loading: EpicSummaryStatus = { status: "loading" };
const good: EpicSummaryStatus = {
  status: "ready",
  judgement: "good",
  stats: [],
};
const fair: EpicSummaryStatus = {
  status: "ready",
  judgement: "fair",
  stats: [],
};
const bad: EpicSummaryStatus = { status: "ready", judgement: "bad", stats: [] };
const errored: EpicSummaryStatus = { status: "error", error: "boom" };

describe("combineFightEpicStatus", () => {
  it("stays loading until every epic has resolved", () => {
    expect(combineFightEpicStatus([good, loading, bad])).toEqual({
      status: "loading",
    });
  });

  it("reports the worst-of judgement once every epic is ready", () => {
    expect(combineFightEpicStatus([good, fair, good])).toEqual({
      status: "ready",
      judgement: "fair",
    });
  });

  it("reports good when every epic is ready and good", () => {
    expect(combineFightEpicStatus([good, good])).toEqual({
      status: "ready",
      judgement: "good",
    });
  });

  it("surfaces an error immediately, even if other epics are still loading", () => {
    expect(combineFightEpicStatus([loading, errored, good])).toEqual({
      status: "error",
      error: "boom",
    });
  });
});

describe("rollupEpicJudgement", () => {
  it("returns null when nothing has resolved yet", () => {
    expect(
      rollupEpicJudgement([
        { status: loading, weightMs: 1000 },
        { status: loading, weightMs: 1000 },
      ]),
    ).toBeNull();
  });

  it("ignores not-yet-ready and errored entries, aggregating only the ready ones", () => {
    // Both good and bad are present among the ready entries, so the
    // fair-override in weightedMedianJudgement applies regardless of
    // which dominates by duration.
    expect(
      rollupEpicJudgement([
        { status: good, weightMs: 9000 },
        { status: loading, weightMs: 9000 },
        { status: errored, weightMs: 9000 },
        { status: bad, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "fair",
      breakdown: { good: 1, fair: 0, bad: 1 },
    });
  });

  it("reports fair, not a worst-of or a pure weighted median, when both good and bad fights are present", () => {
    expect(
      rollupEpicJudgement([
        { status: good, weightMs: 8000 },
        { status: good, weightMs: 8000 },
        { status: bad, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "fair",
      breakdown: { good: 2, fair: 0, bad: 1 },
    });
  });
});
