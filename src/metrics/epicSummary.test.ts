import { describe, expect, it } from "vitest";
import {
  worstJudgement,
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
  summarizeSpellDiscipline,
  summarizeManaEconomy,
  summarizeDeathForensics,
} from "./epicSummary";
import type { HotClipDetectionResult } from "./hotClipDetection";
import type { GcdUtilizationResult } from "./gcdUtilization";
import type { IdleGapsResult } from "./idleGaps";
import type { Lb3UptimeResult } from "./lb3Uptime";
import type { RefreshCadenceResult } from "./refreshCadence";
import type { AccidentalBloomsResult } from "./accidentalBlooms";
import type { RestackTaxResult } from "./restackTax";
import type { SwiftmendAuditResult } from "./swiftmendAudit";
import type { DownrankingDisciplineResult } from "./downrankingDiscipline";
import type { ManaCurveResult } from "./manaCurve";
import type { DeathForensicsResult } from "./deathForensics";

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
  const GREEN_DOWNRANKING: DownrankingDisciplineResult = {
    breakdown: [],
    flaggedCount: 0,
    judgement: "green",
  };

  it("takes the worst of Rejuvenation's clip judgement and the Swiftmend judgement", () => {
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
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 6,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING),
    ).toEqual({
      judgement: "orange",
      stats: ["Rejuvenation clips: 6.3%", "Swiftmend wasteful: 0.0%"],
    });
  });

  it("is green when Rejuvenation clips, Swiftmend wasteful share, and downranking are all green", () => {
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
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING)
        .judgement,
    ).toBe("green");
  });

  it("turns red when Swiftmend's wasteful share is red, even if Rejuvenation clips and downranking are green", () => {
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
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 3,
      wastefulPct: 75,
      judgement: "red",
      availableWindows: 22,
    };

    expect(
      summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING)
        .judgement,
    ).toBe("red");
  });

  it("turns orange when downranking has a flag, even if Rejuvenation clips and Swiftmend are green", () => {
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
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "green",
      availableWindows: 22,
    };
    const downranking: DownrankingDisciplineResult = {
      breakdown: [
        {
          spell: "Regrowth",
          rank: 10,
          isMaxRank: true,
          castCount: 3,
          avgEffectiveHeal: 1840,
          directOverhealPct: 62,
          flagged: true,
        },
      ],
      flaggedCount: 1,
      judgement: "orange",
    };

    const result = summarizeSpellDiscipline(
      hotClips,
      swiftmendAudit,
      downranking,
    );

    expect(result.judgement).toBe("orange");
    expect(result.stats).toEqual([
      "Rejuvenation clips: 1.0%",
      "Swiftmend wasteful: 0.0%",
    ]);
  });
});

describe("summarizeManaEconomy", () => {
  it("reports the mana curve's own judgement and ending mana stat", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "green",
    };
    expect(summarizeManaEconomy(manaCurve)).toEqual({
      judgement: "green",
      stats: ["Ending mana: 20%"],
    });
  });

  it("reports a no-data stat and defaults to green when there are no samples", () => {
    const manaCurve: ManaCurveResult = {
      points: [],
      endingPct: null,
      judgement: null,
    };
    expect(summarizeManaEconomy(manaCurve)).toEqual({
      judgement: "green",
      stats: ["Ending mana: no data"],
    });
  });
});

describe("summarizeDeathForensics", () => {
  it("reports the deaths/flagged stat lines and the rollup judgement", () => {
    const deathForensics: DeathForensicsResult = {
      deaths: [
        {
          timestampMs: 90000,
          targetId: 50,
          maintained: true,
          lb3Rolling: false,
          swiftmendReady: true,
          nsReady: true,
          idlePreceding: true,
          unspentCount: 3,
          judgement: "red",
        },
        {
          timestampMs: 91000,
          targetId: 60,
          maintained: true,
          lb3Rolling: true,
          swiftmendReady: false,
          nsReady: false,
          idlePreceding: false,
          unspentCount: 0,
          judgement: "green",
        },
      ],
      flaggedCount: 1,
      judgement: "red",
    };

    expect(summarizeDeathForensics(deathForensics)).toEqual({
      judgement: "red",
      stats: ["Deaths: 2", "Flagged: 1"],
    });
  });

  it("reports a single 'No friendly deaths' stat and green judgement when there were none", () => {
    const deathForensics: DeathForensicsResult = {
      deaths: [],
      flaggedCount: 0,
      judgement: "green",
    };

    expect(summarizeDeathForensics(deathForensics)).toEqual({
      judgement: "green",
      stats: ["No friendly deaths"],
    });
  });
});
