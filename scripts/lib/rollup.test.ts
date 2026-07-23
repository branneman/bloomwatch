import { describe, expect, it } from "vitest";
import { rollupDruid } from "./rollup";
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
} from "./types";
import type { Judgement } from "../../src/metrics/judgement";

function erroredEpic(): { status: "error"; error: string } {
  return { status: "error", error: "not exercised by this test" };
}

function readyGcd(
  judgement: Judgement,
  durationMs: number,
): EpicResult<GcdEconomyMetrics> {
  return {
    status: "ready",
    judgement,
    stats: [],
    metrics: {
      gcdUtilization: {
        activeTimeMs: 0,
        fightDurationMs: durationMs,
        utilizationPct: 0,
        judgement,
      },
      idleGaps: {
        gaps: [],
        longestGaps: [],
        totalDeadTimeMs: 0,
        fightDurationMs: durationMs,
        deadTimePct: 0,
        judgement,
      },
    },
  };
}

function readyLifebloom(
  judgement: Judgement | null,
): EpicResult<LifebloomDisciplineMetrics> {
  return {
    status: "ready",
    judgement,
    stats: [],
    metrics: {
      lb3Uptime: { targets: [] },
      refreshCadence: {
        intervalCount: 0,
        medianMs: null,
        judgement: null,
        buckets: [],
      },
      accidentalBlooms: { accidentalBlooms: [], count: 0, judgement: "good" },
      restackTax: {
        casts: [],
        castCount: 0,
        estimatedMana: 0,
        judgement: "good",
      },
      concurrentLb3Targets: {
        avgConcurrent: 0,
        peakConcurrent: 0,
        levels: [],
        judgement: null,
      },
    },
  };
}

function aFightResultWithLifebloom(
  fightId: number,
  lifebloomEpic: EpicResult<LifebloomDisciplineMetrics>,
): FightResult {
  return {
    fightId,
    bossName: "Test Boss",
    kill: true,
    bossPercentage: null,
    pullNumber: 1,
    durationMs: 5000,
    hasNaturesSwiftness: false,
    faerieFireDuty: { onDuty: false, bossCastCount: 0, castSpanMs: 0 },
    epics: {
      gcdEconomy: erroredEpic(),
      lifebloomDiscipline: lifebloomEpic,
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      crisisResponse: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
  };
}

function aFightResult(
  fightId: number,
  durationMs: number,
  gcdJudgement: Judgement,
): FightResult {
  return {
    fightId,
    bossName: "Test Boss",
    kill: true,
    bossPercentage: null,
    pullNumber: 1,
    durationMs,
    hasNaturesSwiftness: false,
    faerieFireDuty: { onDuty: false, bossCastCount: 0, castSpanMs: 0 },
    epics: {
      gcdEconomy: readyGcd(gcdJudgement, durationMs),
      lifebloomDiscipline: erroredEpic(),
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      crisisResponse: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
  };
}

describe("rollupDruid", () => {
  it("reports fair, not a worst-of, when both good and bad fights are present for an epic", () => {
    const fights: FightResult[] = [
      aFightResult(1, 8000, "good"),
      aFightResult(2, 1000, "bad"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgement).toBe("fair");
  });

  it("exposes a fight-count breakdown alongside the judgement", () => {
    const fights: FightResult[] = [
      aFightResult(1, 5000, "good"),
      aFightResult(2, 5000, "good"),
      aFightResult(3, 5000, "bad"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      good: 2,
      fair: 0,
      bad: 1,
    });
  });

  it("returns a null judgement and all-zero breakdown when no fights are ready for that epic", () => {
    const rollup = rollupDruid([]);
    expect(rollup.gcdEconomy.judgement).toBeNull();
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      good: 0,
      fair: 0,
      bad: 0,
    });
  });

  it("rolls up crisis response with all-zero totals when no fights are ready", () => {
    const rollup = rollupDruid([]);
    expect(rollup.crisisResponse.judgement).toBeNull();
    expect(rollup.crisisResponse.crisesTotal).toBe(0);
    expect(rollup.crisisResponse.flaggedTotal).toBe(0);
    expect(rollup.crisisResponse.clearSaveTotal).toBe(0);
    expect(rollup.crisisResponse.fairUnmaintainedTotal).toBe(0);
    expect(rollup.crisisResponse.preppedTotal).toBe(0);
    expect(rollup.crisisResponse.preppedElsewhereTotal).toBe(0);
  });

  it("excludes a null-judgement (zero-cast) fight's lifebloomDiscipline from the judgement/breakdown, while still counting it toward fightsReady", () => {
    const fights: FightResult[] = [
      aFightResultWithLifebloom(1, readyLifebloom("good")),
      aFightResultWithLifebloom(2, readyLifebloom(null)),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.lifebloomDiscipline.judgement).toBe("good");
    expect(rollup.lifebloomDiscipline.judgementBreakdown).toEqual({
      good: 1,
      fair: 0,
      bad: 0,
    });
    expect(rollup.lifebloomDiscipline.fightsReady).toBe(2);
  });
});
