import type { WclEvent } from "../wcl/events";

export interface FaerieFireDutyResult {
  onDuty: boolean;
  bossCastCount: number;
  castSpanMs: number;
}

// Provisional thresholds, sourced from real corpus sampling during story
// 917's scoping (see docs/thresholds.md's Lifebloom discipline section
// for the full write-up): single-boss fights showed real refresh cadence
// clustering 20-37s with
// cast-span coverage typically 60-96% of fight duration. Council fights
// break a combined median-interval measurement entirely (casts interleave
// across simultaneous targets), so this detector deliberately checks only
// cast count and span, not cadence -- a boolean "on duty" signal, not a
// quality measurement (that's story 918's job). Both constants are
// provisional pending the empirical study this same story runs.
const MIN_CAST_COUNT_FLOOR = 2;
const CAST_COUNT_PER_MS = 1 / 80_000;
const MIN_SPAN_SHARE = 0.5;

export function computeFaerieFireDuty(
  castEvents: WclEvent[],
  druidId: number,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
  fightDurationMs: number,
): FaerieFireDutyResult {
  const timestamps = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined &&
        faerieFireAbilityIds.has(event.abilityGameID) &&
        event.targetID !== undefined &&
        bossActorIds.has(event.targetID),
    )
    .map((event) => event.timestamp)
    .sort((a, b) => a - b);

  const bossCastCount = timestamps.length;
  const castSpanMs =
    bossCastCount > 1 ? timestamps[bossCastCount - 1] - timestamps[0] : 0;

  const requiredCount = Math.max(
    MIN_CAST_COUNT_FLOOR,
    Math.ceil(fightDurationMs * CAST_COUNT_PER_MS),
  );
  const requiredSpanMs = fightDurationMs * MIN_SPAN_SHARE;

  const onDuty = bossCastCount >= requiredCount && castSpanMs >= requiredSpanMs;

  return { onDuty, bossCastCount, castSpanMs };
}
