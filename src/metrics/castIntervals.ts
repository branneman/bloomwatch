import type { WclEvent } from "../wcl/events";

// TBC's fixed global cooldown in milliseconds — does not scale with haste.
export const GCD_MS = 1500;

export interface CastInterval {
  start: number;
  end: number;
}

// Reconstructs the "occupied" windows implied by a druid's begincast/cast
// events: an instant cast occupies exactly one GCD; a cast-time spell
// occupies from its begincast to its cast, floored at one GCD. A begincast
// with no following cast (interrupt) contributes no interval.
export function computeCastIntervals(
  events: WclEvent[],
  druidId: number,
): CastInterval[] {
  const pending = new Map<number, number>();
  const intervals: CastInterval[] = [];

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
        const cost = Math.max(event.timestamp - begincastTimestamp, GCD_MS);
        intervals.push({
          start: begincastTimestamp,
          end: begincastTimestamp + cost,
        });
        pending.delete(event.abilityGameID);
      } else {
        intervals.push({
          start: event.timestamp,
          end: event.timestamp + GCD_MS,
        });
      }
    }
  }

  return intervals;
}
