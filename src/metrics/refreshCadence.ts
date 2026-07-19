import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

// Bucket boundaries per docs/backlog.md story 202. The per-interval
// histogram buckets share the same bands as the median R/O/G judgement
// below: red < 5s, orange 5-6s, green 6-7s, red > 7s. A late interval
// correlates with near-bloom timing and is judged as severely as
// refreshing too eagerly. Actual blooms are counted separately by
// story 203's accidental-bloom counter.
const GREEN_MIN_MS = 6000;
const GREEN_MAX_MS = 7000;
const ORANGE_MIN_MS = 5000;

export type RefreshCadenceBucketLabel =
  "redEarly" | "orange" | "green" | "redLate";

export interface RefreshCadenceBucket {
  label: RefreshCadenceBucketLabel;
  count: number;
  pct: number;
}

export interface RefreshCadenceResult {
  intervalCount: number;
  medianMs: number | null;
  judgement: Judgement | null;
  buckets: RefreshCadenceBucket[];
}

function judgeMedianCadence(medianMs: number): Judgement {
  if (medianMs > GREEN_MAX_MS) return "red";
  if (medianMs >= GREEN_MIN_MS) return "green";
  if (medianMs >= ORANGE_MIN_MS) return "orange";
  return "red";
}

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

export function computeRefreshCadence(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): RefreshCadenceResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );

  const intervalsMs: number[] = [];

  for (const timeline of timelines.values()) {
    let currentStack = 0;
    let anchorAt: number | null = null;

    for (const event of timeline) {
      if (event.kind === "open") {
        currentStack = 1;
        anchorAt = null;
        continue;
      }

      if (event.kind === "stack-change") {
        currentStack = event.stack ?? currentStack;
        if (currentStack >= 3 && anchorAt === null) {
          anchorAt = event.timestamp;
        }
        continue;
      }

      if (event.kind === "refresh") {
        if (currentStack >= 3 && anchorAt !== null) {
          intervalsMs.push(event.timestamp - anchorAt);
          anchorAt = event.timestamp;
        }
        continue;
      }

      // "close"
      currentStack = 0;
      anchorAt = null;
    }
  }

  const bucketCounts: Record<RefreshCadenceBucketLabel, number> = {
    redEarly: 0,
    orange: 0,
    green: 0,
    redLate: 0,
  };

  for (const intervalMs of intervalsMs) {
    if (intervalMs < ORANGE_MIN_MS) {
      bucketCounts.redEarly += 1;
    } else if (intervalMs < GREEN_MIN_MS) {
      bucketCounts.orange += 1;
    } else if (intervalMs <= GREEN_MAX_MS) {
      bucketCounts.green += 1;
    } else {
      bucketCounts.redLate += 1;
    }
  }

  const intervalCount = intervalsMs.length;
  const buckets: RefreshCadenceBucket[] = (
    ["redEarly", "orange", "green", "redLate"] as const
  ).map((label) => ({
    label,
    count: bucketCounts[label],
    pct:
      intervalCount === 0
        ? 0
        : Math.round((bucketCounts[label] / intervalCount) * 100),
  }));

  if (intervalCount === 0) {
    return { intervalCount, medianMs: null, judgement: null, buckets };
  }

  const medianMs = median([...intervalsMs].sort((a, b) => a - b));

  return {
    intervalCount,
    medianMs,
    judgement: judgeMedianCadence(medianMs),
    buckets,
  };
}
