import { describe, expect, it } from "vitest";
import {
  worstJudgement,
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
  summarizeSpellDiscipline,
} from "./epicSummary";
import type { HotClipDetectionResult } from "./hotClipDetection";
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

describe("summarizeSpellDiscipline", () => {
  it("takes Rejuvenation's judgement and formats both spells' clip rates", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 64,
        clipCount: 4,
        clipPct: 6.25,
        judgement: "orange",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 22,
        clipCount: 3,
        clipPct: 13.636363636363637,
      },
      clipEvents: [],
    };

    expect(summarizeSpellDiscipline(hotClips)).toEqual({
      judgement: "orange",
      stats: ["Rejuvenation clips: 6.3%", "Regrowth clips: 13.6%"],
    });
  });

  it("is green when Rejuvenation is green", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 30,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    };

    expect(summarizeSpellDiscipline(hotClips).judgement).toBe("green");
  });

  it("stays green even when Regrowth's own clip rate would be red on its own", () => {
    // A druid spamming Regrowth for its direct-heal component (after
    // Swiftmend is on cooldown, the only non-cooldown direct heal available
    // in Tree of Life) can rack up a high Regrowth clip rate that isn't a
    // process error — see docs/backlog.md story 301.
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 50,
        clipCount: 1,
        clipPct: 2,
        judgement: "green",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 20,
        clipCount: 15,
        clipPct: 75,
      },
      clipEvents: [],
    };

    expect(summarizeSpellDiscipline(hotClips).judgement).toBe("green");
  });
});
