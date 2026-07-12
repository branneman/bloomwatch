import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import {
  deriveLifebloomTargetState,
  reconstructLifebloomTimelines,
} from "./lifebloomStacks";

// Backlog story 201: targets under 30% any-stack Lifebloom uptime are
// one-off casts, not "maintained" targets, and are excluded entirely.
const MAINTAINED_MIN_UPTIME_PCT = 30;

// R/O/G thresholds per docs/backlog.md story 201: green >= 90%, orange 75-90%, red < 75%.
const GREEN_MIN_PCT = 90;
const ORANGE_MIN_PCT = 75;

export interface Lb3TargetResult {
  targetId: number;
  lbUptimePct: number;
  lb3UptimeMs: number;
  windowMs: number;
  lb3UptimePct: number;
  judgement: Judgement;
}

export interface Lb3UptimeResult {
  targets: Lb3TargetResult[];
}

export function computeLb3Uptime(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): Lb3UptimeResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );

  const fightDurationMs = fightEnd - fightStart;
  const results: Lb3TargetResult[] = [];

  for (const [targetId, timeline] of timelines) {
    const { totalAnyStackMs, stack3Intervals } = deriveLifebloomTargetState(
      timeline,
      fightEnd,
    );

    const lbUptimePct = (totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    const firstReached3At =
      stack3Intervals.length > 0 ? stack3Intervals[0].start : null;
    const windowMs =
      firstReached3At === null ? fightDurationMs : fightEnd - firstReached3At;
    const lb3UptimeMs = stack3Intervals.reduce(
      (sum, interval) => sum + (interval.end - interval.start),
      0,
    );
    const lb3UptimePct = windowMs > 0 ? (lb3UptimeMs / windowMs) * 100 : 0;

    results.push({
      targetId,
      lbUptimePct,
      lb3UptimeMs,
      windowMs,
      lb3UptimePct,
      judgement: judgeThreshold(lb3UptimePct, {
        greenMin: GREEN_MIN_PCT,
        orangeMin: ORANGE_MIN_PCT,
      }),
    });
  }

  return { targets: results };
}
