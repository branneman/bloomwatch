import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";

// TBC's fixed global cooldown in milliseconds — does not scale with haste.
export const GCD_MS = 1500;

// R/O/G thresholds per docs/backlog.md story 101: green >= 85%, orange 70-85%, red < 70%.
const GREEN_MIN_PCT = 85;
const ORANGE_MIN_PCT = 70;

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
  const pending = new Map<number, number>();
  let activeTimeMs = 0;

  for (const event of events) {
    if (event.sourceID !== druidId) continue;
    if (event.abilityGameID === undefined) continue;

    if (event.type === "begincast") {
      pending.set(event.abilityGameID, event.timestamp);
      continue;
    }

    if (event.type === "cast") {
      const begincastTimestamp = pending.get(event.abilityGameID);
      if (begincastTimestamp !== undefined) {
        activeTimeMs += Math.max(event.timestamp - begincastTimestamp, GCD_MS);
        pending.delete(event.abilityGameID);
      } else {
        activeTimeMs += GCD_MS;
      }
    }
  }

  const fightDurationMs = fightEnd - fightStart;
  const utilizationPct = Math.min(100, (activeTimeMs / fightDurationMs) * 100);

  return {
    activeTimeMs,
    fightDurationMs,
    utilizationPct,
    judgement: judgeThreshold(utilizationPct, {
      greenMin: GREEN_MIN_PCT,
      orangeMin: ORANGE_MIN_PCT,
    }),
  };
}
