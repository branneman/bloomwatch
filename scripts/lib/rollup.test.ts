import { describe, expect, it } from "vitest";
import { rollupDruid } from "./rollup";
import type { EpicResult, FightResult, GcdEconomyMetrics } from "./types";
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
    epics: {
      gcdEconomy: readyGcd(gcdJudgement, durationMs),
      lifebloomDiscipline: erroredEpic(),
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
    informational: {
      concurrentLb3Targets: { avgConcurrent: 0, peakConcurrent: 0, levels: [] },
      naturesSwiftnessAudit: { casts: [], castCount: 0, availableWindows: 0 },
    },
  };
}

describe("rollupDruid", () => {
  it("reports the duration-weighted median judgement for an epic, not a worst-of", () => {
    const fights: FightResult[] = [
      aFightResult(1, 8000, "green"),
      aFightResult(2, 1000, "red"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgement).toBe("green");
  });

  it("exposes a fight-count breakdown alongside the judgement", () => {
    const fights: FightResult[] = [
      aFightResult(1, 5000, "green"),
      aFightResult(2, 5000, "green"),
      aFightResult(3, 5000, "red"),
    ];
    const rollup = rollupDruid(fights);
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      green: 2,
      orange: 0,
      red: 1,
    });
  });

  it("returns a null judgement and all-zero breakdown when no fights are ready for that epic", () => {
    const rollup = rollupDruid([]);
    expect(rollup.gcdEconomy.judgement).toBeNull();
    expect(rollup.gcdEconomy.judgementBreakdown).toEqual({
      green: 0,
      orange: 0,
      red: 0,
    });
  });
});
