import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

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

interface TargetState {
  openAt: number | null;
  stack3OpenAt: number | null;
  firstReached3At: number | null;
  totalAnyStackMs: number;
  totalStack3Ms: number;
}

function newTargetState(): TargetState {
  return {
    openAt: null,
    stack3OpenAt: null,
    firstReached3At: null,
    totalAnyStackMs: 0,
    totalStack3Ms: 0,
  };
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
    const state = newTargetState();

    for (const event of timeline) {
      if (event.kind === "open") {
        state.openAt = event.timestamp;
        continue;
      }

      if (event.kind === "stack-change") {
        const stack = event.stack ?? 0;
        if (stack >= 3 && state.stack3OpenAt === null) {
          state.stack3OpenAt = event.timestamp;
          if (state.firstReached3At === null) {
            state.firstReached3At = event.timestamp;
          }
        } else if (stack < 3 && state.stack3OpenAt !== null) {
          state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
          state.stack3OpenAt = null;
        }
        continue;
      }

      if (event.kind === "close") {
        if (state.openAt !== null) {
          state.totalAnyStackMs += event.timestamp - state.openAt;
          state.openAt = null;
        }
        if (state.stack3OpenAt !== null) {
          state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
          state.stack3OpenAt = null;
        }
        continue;
      }

      // "refresh": no stack change, nothing to record.
    }

    if (state.openAt !== null) {
      state.totalAnyStackMs += fightEnd - state.openAt;
      state.openAt = null;
    }
    if (state.stack3OpenAt !== null) {
      state.totalStack3Ms += fightEnd - state.stack3OpenAt;
      state.stack3OpenAt = null;
    }

    const lbUptimePct = (state.totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    const windowMs =
      state.firstReached3At === null
        ? fightDurationMs
        : fightEnd - state.firstReached3At;
    const lb3UptimeMs = state.totalStack3Ms;
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
