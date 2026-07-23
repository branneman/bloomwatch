import { describe, expect, it } from "vitest";
import {
  worstJudgement,
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
  summarizeSpellDiscipline,
  summarizeManaEconomy,
  summarizeDeathForensics,
  summarizeNearDeathResponse,
  summarizePrepHygiene,
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
import type { NearDeathResponseResult } from "./nearDeathResponse";
import type { PrepHygieneResult } from "./prepHygiene";
import type { ConsumableThroughputResult } from "./consumableThroughput";
import type { OverhealTableResult } from "./overhealTable";
import type { InnervateAuditResult } from "./innervateAudit";
import type { ConcurrentLb3Result } from "./concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "./naturesSwiftnessAudit";

const NEUTRAL_CONCURRENT: ConcurrentLb3Result = {
  avgConcurrent: 0,
  peakConcurrent: 0,
  levels: [],
  judgement: null,
};

const NEUTRAL_NS: NaturesSwiftnessAuditResult = {
  casts: [],
  castCount: 0,
  availableWindows: 1,
  utilizationPct: 0,
  judgement: "fair",
};

describe("worstJudgement", () => {
  it("returns the worst of a mix of judgements", () => {
    expect(worstJudgement(["good", "fair"])).toBe("fair");
    expect(worstJudgement(["good", "bad", "fair"])).toBe("bad");
  });

  it("ignores null entries", () => {
    expect(worstJudgement(["good", null, "fair"])).toBe("fair");
  });

  it("defaults to good when every entry is null", () => {
    expect(worstJudgement([null, null])).toBe("good");
  });
});

describe("summarizeGcdEconomy", () => {
  it("takes the worst-of judgement and formats both stat lines", () => {
    const gcd: GcdUtilizationResult = {
      activeTimeMs: 3000,
      fightDurationMs: 10000,
      utilizationPct: 87,
      judgement: "good",
    };
    const idleGaps: IdleGapsResult = {
      gaps: [],
      longestGaps: [],
      totalDeadTimeMs: 620,
      fightDurationMs: 10000,
      deadTimePct: 6.2,
      judgement: "fair",
    };

    expect(summarizeGcdEconomy(gcd, idleGaps)).toEqual({
      judgement: "fair",
      stats: ["GCD utilization: 87%", "Idle gaps: 6.2% dead time"],
    });
  });

  it("reads fair (not bad) when GCD utilization is good but idle gaps are bad", () => {
    const gcd: GcdUtilizationResult = {
      activeTimeMs: 3000,
      fightDurationMs: 10000,
      utilizationPct: 87,
      judgement: "good",
    };
    const idleGaps: IdleGapsResult = {
      gaps: [],
      longestGaps: [],
      totalDeadTimeMs: 4200,
      fightDurationMs: 10000,
      deadTimePct: 42,
      judgement: "bad",
    };

    expect(summarizeGcdEconomy(gcd, idleGaps).judgement).toBe("fair");
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
          judgement: "good",
        },
        {
          targetId: 2,
          lbUptimePct: 82,
          lb3UptimeMs: 7900,
          windowMs: 10000,
          lb3UptimePct: 79,
          judgement: "fair",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "good",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [{ timestampMs: 173000, targetId: 2 }],
      count: 1,
      judgement: "fair",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 3,
      estimatedMana: 2400,
      judgement: "fair",
    };

    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
      ),
    ).toEqual({
      judgement: "fair",
      stats: ["LB3 uptime: 79–91%", "Refresh cadence: 6.4s median"],
    });
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
          judgement: "good",
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
      judgement: "good",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "good",
    };

    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
      ),
    ).toEqual({
      judgement: "good",
      stats: ["LB3 uptime: 91%", "Refresh cadence: no refreshes"],
    });
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
      judgement: "good",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "good",
    };

    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
      ).stats[0],
    ).toBe("LB3 uptime: no maintained targets");
  });

  it("reads fair (not bad) when a maintained target is good but restack tax is bad", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 95,
          lb3UptimeMs: 9100,
          windowMs: 10000,
          lb3UptimePct: 91,
          judgement: "good",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "good",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "good",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 8,
      estimatedMana: 6400,
      judgement: "bad",
    };

    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
      ).judgement,
    ).toBe("fair");
  });

  it("reduces 3 similarly-weighted per-target judgements (good/fair/good) to good before combining with other good siblings", () => {
    // Real-world motivating case: 3 well-maintained targets at 96%/75%/94%
    // uptime (good/fair/good under the 80/60 bands) should read as
    // excellent Lifebloom discipline, not "fair" from a flat worst-of.
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 96,
          lb3UptimeMs: 96000,
          windowMs: 100000,
          lb3UptimePct: 96,
          judgement: "good",
        },
        {
          targetId: 2,
          lbUptimePct: 75,
          lb3UptimeMs: 75000,
          windowMs: 100000,
          lb3UptimePct: 75,
          judgement: "fair",
        },
        {
          targetId: 3,
          lbUptimePct: 94,
          lb3UptimeMs: 94000,
          windowMs: 100000,
          lb3UptimePct: 94,
          judgement: "good",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "good",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "good",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "good",
    };
    const concurrent: ConcurrentLb3Result = {
      avgConcurrent: 2.4,
      peakConcurrent: 3,
      levels: [],
      judgement: "good",
    };

    expect(
      summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent)
        .judgement,
    ).toBe("good");
  });

  it("keeps the epic at fair when the weighted median genuinely favors the weaker target", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 96,
          lb3UptimeMs: 9600,
          windowMs: 10000,
          lb3UptimePct: 96,
          judgement: "good",
        },
        {
          targetId: 2,
          lbUptimePct: 65,
          lb3UptimeMs: 58500,
          windowMs: 90000,
          lb3UptimePct: 65,
          judgement: "fair",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "good",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "good",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "good",
    };

    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
      ).judgement,
    ).toBe("fair");
  });
});

describe("summarizeSpellDiscipline", () => {
  const GOOD_DOWNRANKING: DownrankingDisciplineResult = {
    breakdown: [],
    flaggedCount: 0,
    judgement: "good",
  };

  it("takes the worst of Rejuvenation's clip judgement and the Swiftmend judgement", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 64,
        clipCount: 4,
        clipPct: 6.25,
        judgement: "fair",
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
      judgement: "good",
      availableWindows: 22,
      utilizationPct: 90,
      utilizationJudgement: "good",
    };

    expect(
      summarizeSpellDiscipline(
        hotClips,
        swiftmendAudit,
        GOOD_DOWNRANKING,
        true,
        NEUTRAL_NS,
        false,
      ),
    ).toEqual({
      judgement: "fair",
      stats: ["Rejuvenation clips: 6.3%", "Swiftmend wasteful: 0.0%"],
    });
  });

  it("folds Regrowth's clip judgement into the verdict when present (non-deep-resto archetype)", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "good",
      },
      regrowth: {
        spell: "Regrowth",
        castCount: 20,
        clipCount: 10,
        clipPct: 50,
        judgement: "bad",
      },
      clipEvents: [],
    };
    const swiftmendAudit: SwiftmendAuditResult = {
      casts: [],
      swiftmendCastCount: 4,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "good",
      availableWindows: 22,
      utilizationPct: 90,
      utilizationJudgement: "good",
    };

    expect(
      summarizeSpellDiscipline(
        hotClips,
        swiftmendAudit,
        GOOD_DOWNRANKING,
        true,
        NEUTRAL_NS,
        false,
      ).judgement,
    ).toBe("fair");
  });

  it("is good when Rejuvenation clips, Swiftmend wasteful share, and downranking are all good", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "good",
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
      judgement: "good",
      availableWindows: 22,
      utilizationPct: 90,
      utilizationJudgement: "good",
    };

    expect(
      summarizeSpellDiscipline(
        hotClips,
        swiftmendAudit,
        GOOD_DOWNRANKING,
        true,
        NEUTRAL_NS,
        false,
      ).judgement,
    ).toBe("good");
  });

  it("reads fair (not bad) when Swiftmend's wasteful share is bad but Rejuvenation clips and downranking are good", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "good",
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
      swiftmendCastCount: 6,
      wastefulCount: 5,
      wastefulPct: 83.3,
      judgement: "bad",
      availableWindows: 22,
      utilizationPct: 90,
      utilizationJudgement: "good",
    };

    expect(
      summarizeSpellDiscipline(
        hotClips,
        swiftmendAudit,
        GOOD_DOWNRANKING,
        true,
        NEUTRAL_NS,
        false,
      ).judgement,
    ).toBe("fair");
  });

  it("turns fair when downranking has a flag, even if Rejuvenation clips and Swiftmend are good", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "good",
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
      judgement: "good",
      availableWindows: 22,
      utilizationPct: 90,
      utilizationJudgement: "good",
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
      judgement: "fair",
    };

    const result = summarizeSpellDiscipline(
      hotClips,
      swiftmendAudit,
      downranking,
      true,
      NEUTRAL_NS,
      false,
    );

    expect(result.judgement).toBe("fair");
    expect(result.stats).toEqual([
      "Rejuvenation clips: 1.0%",
      "Swiftmend wasteful: 0.0%",
    ]);
  });

  it("excludes Swiftmend's judgement and stat line when hasSwiftmend is false", () => {
    const hotClips: HotClipDetectionResult = {
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 100,
        clipCount: 1,
        clipPct: 1,
        judgement: "good",
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
      swiftmendCastCount: 0,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "bad",
      availableWindows: 22,
      utilizationPct: 0,
      utilizationJudgement: "bad",
    };

    const result = summarizeSpellDiscipline(
      hotClips,
      swiftmendAudit,
      GOOD_DOWNRANKING,
      false,
      NEUTRAL_NS,
      false,
    );

    expect(result.judgement).toBe("good");
    expect(result.stats).toEqual(["Rejuvenation clips: 1.0%"]);
  });

  const GOOD_SWIFTMEND: SwiftmendAuditResult = {
    casts: [],
    swiftmendCastCount: 20,
    wastefulCount: 0,
    wastefulPct: 0,
    judgement: "good",
    availableWindows: 22,
    utilizationPct: 90,
    utilizationJudgement: "good",
  };
  const GOOD_HOT_CLIPS: HotClipDetectionResult = {
    rejuvenation: {
      spell: "Rejuvenation",
      castCount: 100,
      clipCount: 1,
      clipPct: 1,
      judgement: "good",
    },
    regrowth: { spell: "Regrowth", castCount: 30, clipCount: 0, clipPct: 0 },
    clipEvents: [],
  };

  it("folds Nature's Swiftness's judgement in when the build is eligible", () => {
    const badNS: NaturesSwiftnessAuditResult = {
      casts: [],
      castCount: 0,
      availableWindows: 2,
      utilizationPct: 0,
      judgement: "bad",
    };

    const result = summarizeSpellDiscipline(
      GOOD_HOT_CLIPS,
      GOOD_SWIFTMEND,
      GOOD_DOWNRANKING,
      true,
      badNS,
      true,
    );

    expect(result.judgement).toBe("fair");
  });

  it("excludes Nature's Swiftness's judgement when the build can't reach its talent", () => {
    const badNS: NaturesSwiftnessAuditResult = {
      casts: [],
      castCount: 0,
      availableWindows: 2,
      utilizationPct: 0,
      judgement: "bad",
    };

    const result = summarizeSpellDiscipline(
      GOOD_HOT_CLIPS,
      GOOD_SWIFTMEND,
      GOOD_DOWNRANKING,
      true,
      badNS,
      false,
    );

    expect(result.judgement).toBe("good");
  });

  it("folds Swiftmend's utilization judgement in separately from its wasteful-share judgement", () => {
    const swiftmendGoodWastefulBadUtilization: SwiftmendAuditResult = {
      ...GOOD_SWIFTMEND,
      utilizationPct: 20,
      utilizationJudgement: "bad",
    };

    const result = summarizeSpellDiscipline(
      GOOD_HOT_CLIPS,
      swiftmendGoodWastefulBadUtilization,
      GOOD_DOWNRANKING,
      true,
      NEUTRAL_NS,
      false,
    );

    expect(result.judgement).toBe("fair");
  });
});

describe("summarizeManaEconomy", () => {
  const EXEMPT_CONSUMABLES: ConsumableThroughputResult = {
    exempt: true,
    rows: [],
    judgement: null,
  };
  const OVERHEAL_TABLE_GOOD: OverhealTableResult = {
    rows: [],
    judgement: "good",
  };
  const INNERVATE_NEUTRAL: InnervateAuditResult = {
    firstCast: null,
    laterCasts: [],
    judgement: null,
  };

  it("reports the mana curve's own judgement and ending mana stat when consumables are exempt", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "good",
    };
    expect(
      summarizeManaEconomy(
        manaCurve,
        EXEMPT_CONSUMABLES,
        OVERHEAL_TABLE_GOOD,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
      judgement: "good",
      stats: ["Ending mana: 20%", "Consumables: not mana-constrained"],
    });
  });

  it("reports a no-data stat and defaults to good when there are no samples", () => {
    const manaCurve: ManaCurveResult = {
      points: [],
      endingPct: null,
      judgement: null,
    };
    expect(
      summarizeManaEconomy(
        manaCurve,
        EXEMPT_CONSUMABLES,
        OVERHEAL_TABLE_GOOD,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
      judgement: "good",
      stats: ["Ending mana: no data", "Consumables: not mana-constrained"],
    });
  });

  it("formats the potion/rune stat line and reads fair when a bad row is mixed with good judgements elsewhere", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "good",
    };
    const consumableThroughput: ConsumableThroughputResult = {
      exempt: false,
      rows: [
        {
          label: "Mana Potion",
          used: 2,
          expectedFloor: 2,
          judgement: "good",
        },
        { label: "Rune", used: 0, expectedFloor: 1, judgement: "bad" },
      ],
      judgement: "bad",
    };
    expect(
      summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        OVERHEAL_TABLE_GOOD,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
      judgement: "fair",
      stats: ["Ending mana: 20%", "Potions: 2/2, Runes: 0/1"],
    });
  });

  it("folds the overheal table's judgement in, reading fair since mana curve is good", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "good",
    };
    const overhealTable: OverhealTableResult = {
      rows: [
        {
          category: "direct",
          spell: "Swiftmend",
          casts: 1,
          amount: 400,
          overheal: 600,
          overhealPct: 60,
          judgement: "bad",
        },
      ],
      judgement: "bad",
    };
    const result = summarizeManaEconomy(
      manaCurve,
      EXEMPT_CONSUMABLES,
      overhealTable,
      INNERVATE_NEUTRAL,
    );
    expect(result.judgement).toBe("fair");
    expect(result.stats).toEqual([
      "Ending mana: 20%",
      "Consumables: not mana-constrained",
    ]);
  });

  it("folds the innervate audit's judgement in, reading fair since mana curve and overheal are good", () => {
    const manaCurve: ManaCurveResult = {
      points: [{ timestampMs: 1000, pct: 20 }],
      endingPct: 20,
      judgement: "good",
    };
    const innervateAudit: InnervateAuditResult = {
      firstCast: null,
      laterCasts: [],
      judgement: "bad",
    };
    const result = summarizeManaEconomy(
      manaCurve,
      EXEMPT_CONSUMABLES,
      OVERHEAL_TABLE_GOOD,
      innervateAudit,
    );
    expect(result.judgement).toBe("fair");
    expect(result.stats).toEqual([
      "Ending mana: 20%",
      "Consumables: not mana-constrained",
    ]);
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
          judgement: "bad",
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
          judgement: "good",
        },
      ],
      flaggedCount: 1,
      judgement: "bad",
    };

    expect(summarizeDeathForensics(deathForensics)).toEqual({
      judgement: "bad",
      stats: ["Deaths: 2", "Flagged: 1"],
    });
  });

  it("reports a single 'No friendly deaths' stat and good judgement when there were none", () => {
    const deathForensics: DeathForensicsResult = {
      deaths: [],
      flaggedCount: 0,
      judgement: "good",
    };

    expect(summarizeDeathForensics(deathForensics)).toEqual({
      judgement: "good",
      stats: ["No friendly deaths"],
    });
  });
});

describe("summarizeNearDeathResponse", () => {
  it("reports the crises/flagged stat lines and the rollup judgement", () => {
    const nearDeathResponse: NearDeathResponseResult = {
      crises: [
        {
          timestampMs: 90000,
          targetId: 50,
          hitPointsPct: 10,
          maintained: true,
          judged: true,
          responded: false,
          swiftmendReady: true,
          nsReady: true,
          idlePreceding: true,
          unspentCount: 3,
          judgement: "bad",
          judgedByReadyResource: false,
          clearSave: false,
          saveKind: null,
          prepped: false,
          judgedByPreppedElsewhere: false,
        },
      ],
      flaggedCount: 1,
      judgement: "bad",
    };

    expect(summarizeNearDeathResponse(nearDeathResponse)).toEqual({
      judgement: "bad",
      stats: ["Crises: 1", "Flagged: 1"],
    });
  });

  it("reports 'No crises' when there are none", () => {
    const nearDeathResponse: NearDeathResponseResult = {
      crises: [],
      flaggedCount: 0,
      judgement: "good",
    };

    expect(summarizeNearDeathResponse(nearDeathResponse)).toEqual({
      judgement: "good",
      stats: ["No crises"],
    });
  });
});

// summarizePrepHygiene (story 602) folds enchantCoverage/gemCoverage into
// its second stat line (see the "Food, oil & gear" tests below) rather than
// giving them their own 3rd stat line — story 701 caps a dashboard widget
// at 1-2 key stats (see the comment in summarizeManaEconomy above). This
// "fully covered" fixture is the default for describe-block tests that
// aren't specifically exercising gear-issue formatting.
const A_GOOD_ENCHANT_COVERAGE: PrepHygieneResult["enchantCoverage"] = {
  missingSlots: [],
  acceptableSlots: [],
  judgement: "good",
};
const A_GOOD_GEM_COVERAGE: PrepHygieneResult["gemCoverage"] = {
  missingOrWrongCount: 0,
  acceptableCount: 0,
  metaGemRecognized: true,
  metaGemTier: "bis",
  judgement: "good",
};

describe("summarizePrepHygiene", () => {
  it("passes through the judgement and formats both stat lines", () => {
    const prep: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: true,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "good",
      },
      foodBuffPresent: true,
      weaponOilPresent: false,
      enchantCoverage: A_GOOD_ENCHANT_COVERAGE,
      gemCoverage: A_GOOD_GEM_COVERAGE,
      judgement: "bad",
    };

    expect(summarizePrepHygiene(prep)).toEqual({
      judgement: "bad",
      stats: ["Prep: flask active", "Food, oil & gear: oil missing"],
    });
  });

  it("describes battle + guardian elixir coverage without a flask", () => {
    const prep: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: true,
        hasGuardianElixir: true,
        judgement: "good",
      },
      foodBuffPresent: true,
      weaponOilPresent: true,
      enchantCoverage: A_GOOD_ENCHANT_COVERAGE,
      gemCoverage: A_GOOD_GEM_COVERAGE,
      judgement: "good",
    };

    expect(summarizePrepHygiene(prep).stats).toEqual([
      "Prep: battle + guardian elixir active",
      "Food, oil & gear: all set",
    ]);
  });

  it("describes only-battle and only-guardian elixir coverage", () => {
    const onlyBattle: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: true,
        hasGuardianElixir: false,
        judgement: "fair",
      },
      foodBuffPresent: false,
      weaponOilPresent: false,
      enchantCoverage: A_GOOD_ENCHANT_COVERAGE,
      gemCoverage: A_GOOD_GEM_COVERAGE,
      judgement: "bad",
    };
    expect(summarizePrepHygiene(onlyBattle).stats[0]).toBe(
      "Prep: only battle elixir active",
    );

    const onlyGuardian: PrepHygieneResult = {
      ...onlyBattle,
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: false,
        hasGuardianElixir: true,
        judgement: "fair",
      },
    };
    expect(summarizePrepHygiene(onlyGuardian).stats[0]).toBe(
      "Prep: only guardian elixir active",
    );
  });

  it("describes no coverage at all", () => {
    const prep: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "bad",
      },
      foodBuffPresent: false,
      weaponOilPresent: false,
      enchantCoverage: A_GOOD_ENCHANT_COVERAGE,
      gemCoverage: A_GOOD_GEM_COVERAGE,
      judgement: "bad",
    };

    expect(summarizePrepHygiene(prep).stats).toEqual([
      "Prep: no flask or elixir",
      "Food, oil & gear: food missing, oil missing",
    ]);
  });

  it("folds a gear coverage gap into the second stat line", () => {
    const prep: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: true,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "good",
      },
      foodBuffPresent: true,
      weaponOilPresent: true,
      enchantCoverage: {
        missingSlots: ["Head", "Legs"],
        acceptableSlots: [],
        judgement: "fair",
      },
      gemCoverage: A_GOOD_GEM_COVERAGE,
      judgement: "fair",
    };

    expect(summarizePrepHygiene(prep).stats).toEqual([
      "Prep: flask active",
      "Food, oil & gear: 2 gear issues",
    ]);
  });

  it("combines a missing food/oil buff with gear issues in one line", () => {
    const prep: PrepHygieneResult = {
      flaskOrElixir: {
        hasFlask: true,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "good",
      },
      foodBuffPresent: false,
      weaponOilPresent: true,
      enchantCoverage: A_GOOD_ENCHANT_COVERAGE,
      gemCoverage: {
        missingOrWrongCount: 1,
        acceptableCount: 0,
        metaGemRecognized: true,
        metaGemTier: "bis",
        judgement: "fair",
      },
      judgement: "fair",
    };

    expect(summarizePrepHygiene(prep).stats).toEqual([
      "Prep: flask active",
      "Food, oil & gear: food missing, 1 gear issue",
    ]);
  });
});
