import type { WclEvent } from "../wcl/events";
import { judgeThresholdBelow, type Judgement } from "./judgement";

// Good/Fair/Bad thresholds per docs/backlog.md story 203: good 0, fair 1-2, bad >= 3.
const GOOD_MAX_COUNT = 1;
const FAIR_MAX_COUNT = 2;

// Heuristic per docs/backlog.md story 203: a bloom counts as accidental when
// Lifebloom is re-applied to the same target within this window of blooming.
const ACCIDENTAL_WINDOW_MS = 3000;

export interface AccidentalBloom {
  timestampMs: number;
  targetId: number;
}

export interface AccidentalBloomsResult {
  accidentalBlooms: AccidentalBloom[];
  count: number;
  judgement: Judgement;
}

export function computeAccidentalBlooms(
  buffEvents: WclEvent[],
  healEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): AccidentalBloomsResult {
  // Bloom detection per docs/backlog.md story 203: the non-periodic (non-tick)
  // Lifebloom heal event. Any Lifebloom-family ability qualifies rather than
  // a hardcoded gameID, since ability IDs must be resolved at runtime.
  const blooms = healEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        lifebloomAbilityIds.has(event.abilityGameID) &&
        event.tick !== true,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const reapplications = buffEvents.filter(
    (event) =>
      event.type === "applybuff" &&
      event.sourceID === druidId &&
      event.targetID !== undefined &&
      event.abilityGameID !== undefined &&
      lifebloomAbilityIds.has(event.abilityGameID),
  );

  const accidentalBlooms: AccidentalBloom[] = [];

  for (const bloom of blooms) {
    const targetId = bloom.targetID as number;
    const isAccidental = reapplications.some((reapply) => {
      if (reapply.targetID !== targetId) return false;
      const delta = reapply.timestamp - bloom.timestamp;
      return delta > 0 && delta <= ACCIDENTAL_WINDOW_MS;
    });
    if (isAccidental) {
      accidentalBlooms.push({ timestampMs: bloom.timestamp, targetId });
    }
  }

  const count = accidentalBlooms.length;

  return {
    accidentalBlooms,
    count,
    judgement: judgeThresholdBelow(count, {
      goodMax: GOOD_MAX_COUNT,
      fairMax: FAIR_MAX_COUNT,
    }),
  };
}
