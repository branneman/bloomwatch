import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { extractManaSamples } from "./manaSamples";

export interface ManaCurvePoint {
  timestampMs: number;
  pct: number;
}

export interface ManaCurveResult {
  points: ManaCurvePoint[];
  endingPct: number | null;
  judgement: Judgement | null;
}

export const MIN_JUDGED_FIGHT_DURATION_MS = 90_000;

// Good 5–40% ending mana, fair 40–70% or 0–5%, bad > 70% (hoarding) — kills
// only, per docs/backlog.md story 401. Good sits in the middle of the range,
// so this doesn't fit judgeThreshold/judgeThresholdBelow's monotonic shape.
export const MANA_BAND_GOOD_MIN_PCT = 5;
export const MANA_BAND_GOOD_MAX_PCT = 40;
export const MANA_BAND_BAD_MIN_PCT = 70;

function judgeManaBand(pct: number): Judgement {
  if (pct > MANA_BAND_BAD_MIN_PCT) return "bad";
  if (pct >= MANA_BAND_GOOD_MIN_PCT && pct <= MANA_BAND_GOOD_MAX_PCT)
    return "good";
  return "fair";
}

export function computeManaCurve(
  castEvents: WclEvent[],
  druidId: number,
  isKill: boolean,
  fightDurationMs: number,
): ManaCurveResult {
  const samples = extractManaSamples(castEvents, druidId);
  const points = samples.map((sample) => ({
    timestampMs: sample.timestampMs,
    pct: (sample.currentMana / sample.maxMana) * 100,
  }));

  if (points.length === 0) {
    return { points, endingPct: null, judgement: null };
  }

  const endingPct = points[points.length - 1].pct;
  // Fights under 90s auto-downgrade to informational — short/easy fights make
  // this metric moot, per docs/backlog.md story 401.
  const judged = isKill && fightDurationMs >= MIN_JUDGED_FIGHT_DURATION_MS;

  return {
    points,
    endingPct,
    judgement: judged ? judgeManaBand(endingPct) : null,
  };
}
