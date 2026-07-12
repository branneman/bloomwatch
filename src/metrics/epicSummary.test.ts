import { describe, expect, it } from "vitest";
import {
  worstJudgement,
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
} from "./epicSummary";
import type { GcdUtilizationResult } from "./gcdUtilization";
import type { IdleGapsResult } from "./idleGaps";
import type { Lb3UptimeResult } from "./lb3Uptime";
import type { RefreshCadenceResult } from "./refreshCadence";
import type { AccidentalBloomsResult } from "./accidentalBlooms";
import type { RestackTaxResult } from "./restackTax";

describe("worstJudgement", () => {
  it("returns the worst of a mix of judgements", () => {
    expect(worstJudgement(["green", "orange"])).toBe("orange");
    expect(worstJudgement(["green", "red", "orange"])).toBe("red");
  });

  it("ignores null entries", () => {
    expect(worstJudgement(["green", null, "orange"])).toBe("orange");
  });

  it("defaults to green when every entry is null", () => {
    expect(worstJudgement([null, null])).toBe("green");
  });
});

describe("summarizeGcdEconomy", () => {
  it("takes the worst-of judgement and formats both stat lines", () => {
    const gcd: GcdUtilizationResult = {
      activeTimeMs: 3000,
      fightDurationMs: 10000,
      utilizationPct: 87,
      judgement: "green",
    };
    const idleGaps: IdleGapsResult = {
      gaps: [],
      longestGaps: [],
      totalDeadTimeMs: 620,
      fightDurationMs: 10000,
      deadTimePct: 6.2,
      judgement: "orange",
    };

    expect(summarizeGcdEconomy(gcd, idleGaps)).toEqual({
      judgement: "orange",
      stats: ["GCD utilization: 87%", "Idle gaps: 6.2% dead time"],
    });
  });
});

describe("summarizeLifebloomDiscipline", () => {
  it("ranges the LB3 uptime stat across multiple targets and formats the median", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 95,
          lb3UptimeMs: 9100,
          windowMs: 10000,
          lb3UptimePct: 91,
          judgement: "green",
        },
        {
          targetId: 2,
          lbUptimePct: 82,
          lb3UptimeMs: 7900,
          windowMs: 10000,
          lb3UptimePct: 79,
          judgement: "orange",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "green",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [{ timestampMs: 173000, targetId: 2 }],
      count: 1,
      judgement: "orange",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 3,
      estimatedMana: 2400,
      judgement: "orange",
    };

    expect(summarizeLifebloomDiscipline(lb3, refresh, blooms, restack)).toEqual(
      {
        judgement: "orange",
        stats: ["LB3 uptime: 79–91%", "Refresh cadence: 6.4s median"],
      },
    );
  });

  it("formats a single maintained target without a range", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 95,
          lb3UptimeMs: 9100,
          windowMs: 10000,
          lb3UptimePct: 91,
          judgement: "green",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    };

    expect(summarizeLifebloomDiscipline(lb3, refresh, blooms, restack)).toEqual(
      {
        judgement: "green",
        stats: ["LB3 uptime: 91%", "Refresh cadence: no refreshes"],
      },
    );
  });

  it("reports no maintained targets when there are none", () => {
    const lb3: Lb3UptimeResult = { targets: [] };
    const refresh: RefreshCadenceResult = {
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    };

    expect(
      summarizeLifebloomDiscipline(lb3, refresh, blooms, restack).stats[0],
    ).toBe("LB3 uptime: no maintained targets");
  });
});
