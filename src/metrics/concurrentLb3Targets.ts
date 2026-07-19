import type { WclEvent } from "../wcl/events";
import {
  deriveLifebloomTargetState,
  reconstructLifebloomTimelines,
} from "./lifebloomStacks";

// Backlog story 201's "maintained target" filter (>=30% any-stack uptime),
// reused here so a one-off/incidental 3-stack on a non-tank doesn't count as
// a second concurrent target. Kept as an independent constant rather than an
// import from lb3Uptime.ts.
const MAINTAINED_MIN_UPTIME_PCT = 30;

export interface ConcurrentLb3Level {
  count: number;
  pct: number;
}

export interface ConcurrentLb3Result {
  avgConcurrent: number;
  peakConcurrent: number;
  levels: ConcurrentLb3Level[];
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
): ConcurrentLb3Result {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;

  const boundaries: Boundary[] = [];

  for (const timeline of timelines.values()) {
    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      timeline,
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

  return { avgConcurrent, peakConcurrent, levels };
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
