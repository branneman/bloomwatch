import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import {
  deriveLifebloomTargetState,
  detectCarryInTargets,
  reconstructLifebloomTimelines,
  resolveCarryInTimeline,
} from "./lifebloomStacks";

// Backlog story 201: targets under 30% any-stack Lifebloom uptime are
// one-off casts, not "maintained" targets, and are excluded entirely.
export const MAINTAINED_MIN_UPTIME_PCT = 30;

// Good/Fair/Bad thresholds per docs/backlog.md story 201, revised by direct
// request 2026-07-20 (docs/thresholds.md): good >= 80%, fair 60-80%, bad < 60%.
const GOOD_MIN_PCT = 80;
const FAIR_MIN_PCT = 60;

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
  lookbackEvents?: WclEvent[],
): Lb3UptimeResult {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const carryInTargets =
    lookbackEvents !== undefined
      ? new Set(detectCarryInTargets(events, druidId, lifebloomAbilityIds))
      : new Set<number>();

  const fightDurationMs = fightEnd - fightStart;
  const results: Lb3TargetResult[] = [];

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
        goodMin: GOOD_MIN_PCT,
        fairMin: FAIR_MIN_PCT,
      }),
    });
  }

  return { targets: results };
}
