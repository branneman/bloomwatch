import { describe, expect, it } from "vitest";
import {
  combineFightEpicStatus,
  worstReadyJudgement,
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

describe("worstReadyJudgement", () => {
  it("returns null when nothing has resolved yet", () => {
    expect(worstReadyJudgement([loading, loading])).toBeNull();
  });

  it("ignores not-yet-ready entries and reports the worst of the rest", () => {
    expect(worstReadyJudgement([green, loading, red])).toBe("red");
  });

  it("ignores errored entries the same as loading ones", () => {
    expect(worstReadyJudgement([green, errored])).toBe("green");
  });
});
