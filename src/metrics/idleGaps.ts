import type { WclEvent } from "../wcl/events";
import { computeCastIntervals } from "./castIntervals";
import { judgeThresholdBelow, type Judgement } from "./judgement";

// Backlog story 102: gaps > 1.7s between casts are flagged as idle time.
export const IDLE_GAP_THRESHOLD_MS = 1700;

// R/O/G thresholds per docs/backlog.md story 102: green < 5%, orange 5-15%, red > 15%.
const GREEN_MAX_PCT = 5;
const ORANGE_MAX_PCT = 15;

export interface IdleGap {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface IdleGapsResult {
  gaps: IdleGap[];
  longestGaps: IdleGap[];
  totalDeadTimeMs: number;
  fightDurationMs: number;
  deadTimePct: number;
  judgement: Judgement;
}

export function computeIdleGaps(
  events: WclEvent[],
  druidId: number,
  fightStart: number,
  fightEnd: number,
): IdleGapsResult {
  const intervals = computeCastIntervals(events, druidId);

  const gaps: IdleGap[] = [];
  for (let i = 0; i < intervals.length - 1; i++) {
    const startMs = intervals[i].end;
    const endMs = intervals[i + 1].start;
    const durationMs = endMs - startMs;
    if (durationMs > IDLE_GAP_THRESHOLD_MS) {
      gaps.push({ startMs, endMs, durationMs });
    }
  }

  const totalDeadTimeMs = gaps.reduce((sum, gap) => sum + gap.durationMs, 0);
  const fightDurationMs = fightEnd - fightStart;
  const deadTimePct = (totalDeadTimeMs / fightDurationMs) * 100;
  const longestGaps = [...gaps]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  return {
    gaps,
    longestGaps,
    totalDeadTimeMs,
    fightDurationMs,
    deadTimePct,
    judgement: judgeThresholdBelow(deadTimePct, {
      greenMax: GREEN_MAX_PCT,
      orangeMax: ORANGE_MAX_PCT,
    }),
  };
}
