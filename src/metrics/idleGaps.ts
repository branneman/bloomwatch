import type { WclEvent } from "../wcl/events";
import { computeCastIntervals } from "./castIntervals";
import { judgeThresholdBelow, type Judgement } from "./judgement";

// Backlog story 102: gaps > 1.7s between casts are flagged as idle time.
export const IDLE_GAP_THRESHOLD_MS = 1700;

// Good/Fair/Bad thresholds per docs/backlog.md story 102: good < 7%, fair 7-15%, bad > 15%.
// Good boundary revised 5% -> 7% by story 908's exemplar recalibration
// (167 real deep-resto kill-fights: median dead time 4.0%, but only 56%
// landed good under the old 5% line; 7% better matches real elite play
// without loosening what counts as genuinely bad idle time).
export const GOOD_MAX_PCT = 7;
export const FAIR_MAX_PCT = 15;

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
      goodMax: GOOD_MAX_PCT,
      fairMax: FAIR_MAX_PCT,
    }),
  };
}
