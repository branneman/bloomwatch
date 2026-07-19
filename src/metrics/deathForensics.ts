import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import { computeCastIntervals, type CastInterval } from "./castIntervals";
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
} from "./lifebloomStacks";
import { MAINTAINED_MIN_UPTIME_PCT } from "./lb3Uptime";
import { SWIFTMEND_COOLDOWN_MS } from "./swiftmendAudit";
import { NATURES_SWIFTNESS_COOLDOWN_MS } from "./naturesSwiftnessAudit";

// Backlog story 501: a GCD is considered "available" if the druid had at
// least this long, idle, in the moments before a death.
const DEATH_IDLE_WINDOW_MS = 5000;

export interface DeathAudit {
  timestampMs: number;
  targetId: number;
  maintained: boolean;
  lb3Rolling: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  unspentCount: number;
  judgement: Judgement | null;
}

export interface DeathForensicsResult {
  deaths: DeathAudit[];
  flaggedCount: number;
  judgement: Judgement;
}

// Only the red condition is spelled out in docs/backlog.md story 501 ("red
// if >= 2 unspent resources on a maintained target's death"); 0 -> green,
// 1 -> orange fill in the rest of the R/O/G scale every other judged
// metric in the app uses.
export function judgeDeathReadiness(unspentCount: number): Judgement {
  if (unspentCount === 0) return "green";
  if (unspentCount === 1) return "orange";
  return "red";
}

function lastCastBefore(
  sortedCasts: WclEvent[],
  timestamp: number,
): WclEvent | undefined {
  let last: WclEvent | undefined;
  for (const cast of sortedCasts) {
    if (cast.timestamp >= timestamp) break;
    last = cast;
  }
  return last;
}

export function isReady(
  sortedCasts: WclEvent[],
  atTimestamp: number,
  cooldownMs: number,
): boolean {
  const last = lastCastBefore(sortedCasts, atTimestamp);
  if (last === undefined) return true;
  return atTimestamp - last.timestamp >= cooldownMs;
}

export function wasIdlePreceding(
  castIntervals: CastInterval[],
  atTimestamp: number,
  fightStart: number,
): boolean {
  let lastIntervalBefore: CastInterval | undefined;
  for (const interval of castIntervals) {
    if (interval.start > atTimestamp) break;
    lastIntervalBefore = interval;
  }
  if (lastIntervalBefore === undefined) {
    return atTimestamp - fightStart >= DEATH_IDLE_WINDOW_MS;
  }
  if (lastIntervalBefore.end > atTimestamp) return false;
  return atTimestamp - lastIntervalBefore.end >= DEATH_IDLE_WINDOW_MS;
}

export function computeDeathForensics(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
  fightStart: number,
  fightEnd: number,
): DeathForensicsResult {
  const deaths = deathEvents
    .filter((event) => event.type === "death" && event.targetID !== undefined)
    .sort((a, b) => a.timestamp - b.timestamp);

  const druidCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const swiftmendCasts = druidCasts.filter((event) =>
    swiftmendAbilityIds.has(event.abilityGameID as number),
  );
  const nsCasts = druidCasts.filter((event) =>
    naturesSwiftnessAbilityIds.has(event.abilityGameID as number),
  );

  const castIntervals = computeCastIntervals(castEvents, druidId);
  const fightDurationMs = fightEnd - fightStart;

  const lifebloomTimelines = reconstructLifebloomTimelines(
    buffEvents,
    druidId,
    lifebloomAbilityIds,
  );
  const lifebloomStateByTarget = new Map(
    [...lifebloomTimelines.entries()].map(([targetId, timeline]) => [
      targetId,
      deriveLifebloomTargetState(timeline, fightStart, fightEnd),
    ]),
  );

  const results: DeathAudit[] = deaths.map((death) => {
    const targetId = death.targetID as number;
    const timestampMs = death.timestamp;

    const lbState = lifebloomStateByTarget.get(targetId);
    const maintained =
      lbState !== undefined &&
      (lbState.totalAnyStackMs / fightDurationMs) * 100 >=
        MAINTAINED_MIN_UPTIME_PCT;
    const lb3Rolling =
      lbState !== undefined &&
      lbState.stack3Intervals.some(
        (interval) =>
          timestampMs >= interval.start && timestampMs <= interval.end,
      );

    const swiftmendReady =
      hasSwiftmend &&
      isReady(swiftmendCasts, timestampMs, SWIFTMEND_COOLDOWN_MS);
    const nsReady =
      hasNaturesSwiftness &&
      isReady(nsCasts, timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
    const idlePreceding = wasIdlePreceding(
      castIntervals,
      timestampMs,
      fightStart,
    );

    const unspentCount = [swiftmendReady, nsReady, idlePreceding].filter(
      Boolean,
    ).length;
    const judgement = maintained ? judgeDeathReadiness(unspentCount) : null;

    return {
      timestampMs,
      targetId,
      maintained,
      lb3Rolling,
      swiftmendReady,
      nsReady,
      idlePreceding,
      unspentCount,
      judgement,
    };
  });

  return {
    deaths: results,
    flaggedCount: results.filter((d) => d.judgement === "red").length,
    judgement: worstJudgement(results.map((d) => d.judgement)),
  };
}
