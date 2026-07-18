import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  rollupEpicJudgement,
} from "./reportAggregation";
import type { EpicSummaryStatus } from "../app/components/Scorecard/epicSummaryStatus";

const loading: EpicSummaryStatus = { status: "loading" };
const green: EpicSummaryStatus = {
  status: "ready",
  judgement: "green",
  stats: [],
};
const orange: EpicSummaryStatus = {
  status: "ready",
  judgement: "orange",
  stats: [],
};
const red: EpicSummaryStatus = { status: "ready", judgement: "red", stats: [] };
const errored: EpicSummaryStatus = { status: "error", error: "boom" };

describe("combineFightEpicStatus", () => {
  it("stays loading until every epic has resolved", () => {
    expect(combineFightEpicStatus([green, loading, red])).toEqual({
      status: "loading",
    });
  });

  it("reports the worst-of judgement once every epic is ready", () => {
    expect(combineFightEpicStatus([green, orange, green])).toEqual({
      status: "ready",
      judgement: "orange",
    });
  });

  it("reports green when every epic is ready and green", () => {
    expect(combineFightEpicStatus([green, green])).toEqual({
      status: "ready",
      judgement: "green",
    });
  });

  it("surfaces an error immediately, even if other epics are still loading", () => {
    expect(combineFightEpicStatus([loading, errored, green])).toEqual({
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
    expect(
      rollupEpicJudgement([
        { status: green, weightMs: 9000 },
        { status: loading, weightMs: 9000 },
        { status: errored, weightMs: 9000 },
        { status: red, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "green",
      breakdown: { green: 1, orange: 0, red: 1 },
    });
  });

  it("reports a duration-weighted median, not a worst-of, across ready fights", () => {
    expect(
      rollupEpicJudgement([
        { status: green, weightMs: 8000 },
        { status: green, weightMs: 8000 },
        { status: red, weightMs: 1000 },
      ]),
    ).toEqual({
      judgement: "green",
      breakdown: { green: 2, orange: 0, red: 1 },
    });
  });
});
