import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import { computeCastIntervals } from "./castIntervals";

// Good/Fair/Bad thresholds per docs/backlog.md story 101: good >= 85%, fair 70-85%, bad < 70%.
const GOOD_MIN_PCT = 85;
const FAIR_MIN_PCT = 70;

export interface GcdUtilizationResult {
  activeTimeMs: number;
  fightDurationMs: number;
  utilizationPct: number;
  judgement: Judgement;
}

export function computeGcdUtilization(
  events: WclEvent[],
  druidId: number,
  fightStart: number,
  fightEnd: number,
): GcdUtilizationResult {
  const activeTimeMs = computeCastIntervals(events, druidId).reduce(
    (sum, interval) => sum + (interval.end - interval.start),
    0,
  );

  const fightDurationMs = fightEnd - fightStart;
  const utilizationPct = Math.min(100, (activeTimeMs / fightDurationMs) * 100);

  return {
    activeTimeMs,
    fightDurationMs,
    utilizationPct,
    judgement: judgeThreshold(utilizationPct, {
      goodMin: GOOD_MIN_PCT,
      fairMin: FAIR_MIN_PCT,
    }),
  };
}
