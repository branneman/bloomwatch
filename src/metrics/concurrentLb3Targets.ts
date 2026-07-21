import type { WclEvent } from "../wcl/events";
import { type Judgement } from "./judgement";
import {
  deriveLifebloomTargetState,
  detectCarryInTargets,
  reconstructLifebloomTimelines,
  resolveCarryInTimeline,
} from "./lifebloomStacks";

// Backlog story 201's "maintained target" filter (>=30% any-stack uptime),
// reused here so a one-off/incidental 3-stack on a non-tank doesn't count as
// a second concurrent target. Kept as an independent constant rather than an
// import from lb3Uptime.ts.
const MAINTAINED_MIN_UPTIME_PCT = 30;

// Story 205/914: 2+ targets need to hold LB3's 3rd stack for at least this
// much of the fight for the reward-only judgement to fire.
export const CONCURRENT_MIN_TIME_PCT = 50;

export interface ConcurrentLb3Level {
  count: number;
  pct: number;
}

export interface ConcurrentLb3Result {
  avgConcurrent: number;
  peakConcurrent: number;
  levels: ConcurrentLb3Level[];
  judgement: Judgement | null;
}

interface Boundary {
  timestamp: number;
  delta: number;
}

export function computeConcurrentLb3Targets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
  lookbackEvents?: WclEvent[],
): ConcurrentLb3Result {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;
  const carryInTargets =
    lookbackEvents !== undefined
      ? new Set(detectCarryInTargets(events, druidId, lifebloomAbilityIds))
      : new Set<number>();

  const boundaries: Boundary[] = [];

  for (const [targetId, timeline] of timelines) {
    let resolvedTimeline = timeline;
    if (carryInTargets.has(targetId)) {
      const resolved = resolveCarryInTimeline(
        timeline,
        lookbackEvents as WclEvent[],
        druidId,
        lifebloomAbilityIds,
        targetId,
        fightStart,
      );
      if (resolved === null) continue; // still ambiguous - exclude, don't guess
      resolvedTimeline = resolved;
    }

    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      resolvedTimeline,
      fightStart,
      fightEnd,
    );
    const lbUptimePct = (totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    for (const interval of stack3Intervals) {
      boundaries.push({ timestamp: interval.start, delta: 1 });
      boundaries.push({ timestamp: interval.end, delta: -1 });
    }
  }

  boundaries.sort((a, b) => a.timestamp - b.timestamp);

  const durationByCount = new Map<number, number>();
  let currentCount = 0;
  let cursor = fightStart;
  let peakConcurrent = 0;
  let weightedSum = 0;

  let i = 0;
  while (i < boundaries.length) {
    const timestamp = boundaries[i].timestamp;
    let delta = 0;
    while (i < boundaries.length && boundaries[i].timestamp === timestamp) {
      delta += boundaries[i].delta;
      i++;
    }

    const sliceMs = timestamp - cursor;
    if (sliceMs > 0) {
      durationByCount.set(
        currentCount,
        (durationByCount.get(currentCount) ?? 0) + sliceMs,
      );
      weightedSum += currentCount * sliceMs;
    }

    currentCount += delta;
    if (currentCount > peakConcurrent) peakConcurrent = currentCount;
    cursor = timestamp;
  }

  const tailMs = fightEnd - cursor;
  if (tailMs > 0) {
    durationByCount.set(
      currentCount,
      (durationByCount.get(currentCount) ?? 0) + tailMs,
    );
    weightedSum += currentCount * tailMs;
  }

  const avgConcurrent = fightDurationMs > 0 ? weightedSum / fightDurationMs : 0;

  const entries = [...durationByCount.entries()]
    .filter(([, durationMs]) => durationMs > 0)
    .sort(([a], [b]) => a - b);

  const rawPcts = entries.map(
    ([, durationMs]) => (durationMs / fightDurationMs) * 100,
  );
  const roundedPcts = roundToWhole(rawPcts);

  const levels: ConcurrentLb3Level[] = entries.map(([count], i) => ({
    count,
    pct: roundedPcts[i],
  }));

  // Reward-only signal, per docs/backlog.md story 205 (revised story 914,
  // direct request 2026-07-20): the "right" number of concurrent targets
  // depends on raid healing assignments this app can't see, so below the
  // bar stays unjudged rather than penalized — never "fair" or "bad".
  const timeAt2PlusPct = levels
    .filter((level) => level.count >= 2)
    .reduce((sum, level) => sum + level.pct, 0);
  const judgement: Judgement | null =
    timeAt2PlusPct >= CONCURRENT_MIN_TIME_PCT ? "good" : null;

  return { avgConcurrent, peakConcurrent, levels, judgement };
}

// Largest-remainder rounding: rounds each value down, then distributes the
// remaining points (100 - sum of floors) to the values with the largest
// fractional part, so the rounded results always sum to 100.
function roundToWhole(pcts: number[]): number[] {
  if (pcts.length === 0) return [];

  const floors = pcts.map(Math.floor);
  const deficit = 100 - floors.reduce((sum, v) => sum + v, 0);

  const remainderOrder = pcts
    .map((pct, i) => ({ i, remainder: pct - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder);

  const rounded = [...floors];
  for (let j = 0; j < deficit; j++) {
    rounded[remainderOrder[j].i]++;
  }
  return rounded;
}
