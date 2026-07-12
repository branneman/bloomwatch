import type { WclEvent } from "../wcl/events";

export type LifebloomTimelineEventKind =
  "open" | "stack-change" | "close" | "refresh";

export interface LifebloomTimelineEvent {
  timestamp: number;
  kind: LifebloomTimelineEventKind;
  stack?: number;
}

interface RawGroup {
  timestamp: number;
  hasApplyBuff: boolean;
  hasRemoveBuff: boolean;
  stackChangeValue: number | null;
  hasRefreshBuff: boolean;
}

// Reconstructs each target's chronological Lifebloom timeline from raw
// applybuff/applybuffstack/refreshbuff/removebuff events. WCL fires a
// refreshbuff at the same timestamp as every applybuffstack (an echo of
// the duration refresh that always accompanies a stack change) - that
// echo carries no information beyond the stack-change event itself and
// is dropped. A genuine 3-stack maintenance refresh shows up as a solo
// refreshbuff, with no co-occurring applybuffstack. Events are grouped
// by exact timestamp (not a running lookback) since WCL doesn't
// document sub-order for same-timestamp events.
export function reconstructLifebloomTimelines(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): Map<number, LifebloomTimelineEvent[]> {
  const groupsByTarget = new Map<number, Map<number, RawGroup>>();
  const targetOrder: number[] = [];

  for (const event of events) {
    if (event.sourceID !== druidId) continue;
    if (event.abilityGameID === undefined) continue;
    if (!lifebloomAbilityIds.has(event.abilityGameID)) continue;
    if (event.targetID === undefined) continue;

    let groups = groupsByTarget.get(event.targetID);
    if (!groups) {
      groups = new Map<number, RawGroup>();
      groupsByTarget.set(event.targetID, groups);
      targetOrder.push(event.targetID);
    }

    let group = groups.get(event.timestamp);
    if (!group) {
      group = {
        timestamp: event.timestamp,
        hasApplyBuff: false,
        hasRemoveBuff: false,
        stackChangeValue: null,
        hasRefreshBuff: false,
      };
      groups.set(event.timestamp, group);
    }

    if (event.type === "applybuff") {
      group.hasApplyBuff = true;
    } else if (event.type === "applybuffstack") {
      group.stackChangeValue =
        typeof event.stack === "number" ? event.stack : null;
    } else if (event.type === "removebuff") {
      group.hasRemoveBuff = true;
    } else if (event.type === "refreshbuff") {
      group.hasRefreshBuff = true;
    }
  }

  const result = new Map<number, LifebloomTimelineEvent[]>();

  for (const targetId of targetOrder) {
    const groups = groupsByTarget.get(targetId);
    if (!groups) continue;

    const sortedGroups = [...groups.values()].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const timeline: LifebloomTimelineEvent[] = [];
    for (const group of sortedGroups) {
      if (group.hasApplyBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "open" });
      } else if (group.stackChangeValue !== null) {
        timeline.push({
          timestamp: group.timestamp,
          kind: "stack-change",
          stack: group.stackChangeValue,
        });
      } else if (group.hasRemoveBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "close" });
      } else if (group.hasRefreshBuff) {
        timeline.push({ timestamp: group.timestamp, kind: "refresh" });
      }
    }
    result.set(targetId, timeline);
  }

  return result;
}

export interface LifebloomTargetState {
  totalAnyStackMs: number;
  stack3Intervals: { start: number; end: number }[];
}

// Walks one target's timeline once, computing both any-stack uptime (used by
// story 201's "maintained target" filter) and closed stack-3 intervals (used
// by 201's LB3 window and 205's concurrency sweep) in a single pass, so the
// two stories' metric modules don't each re-implement this state machine.
export function deriveLifebloomTargetState(
  timeline: LifebloomTimelineEvent[],
  fightEnd: number,
): LifebloomTargetState {
  let openAt: number | null = null;
  let stack3OpenAt: number | null = null;
  let totalAnyStackMs = 0;
  const stack3Intervals: { start: number; end: number }[] = [];

  for (const event of timeline) {
    if (event.kind === "open") {
      openAt = event.timestamp;
      continue;
    }

    if (event.kind === "stack-change") {
      const stack = event.stack ?? 0;
      if (stack >= 3 && stack3OpenAt === null) {
        stack3OpenAt = event.timestamp;
      } else if (stack < 3 && stack3OpenAt !== null) {
        stack3Intervals.push({ start: stack3OpenAt, end: event.timestamp });
        stack3OpenAt = null;
      }
      continue;
    }

    if (event.kind === "close") {
      if (openAt !== null) {
        totalAnyStackMs += event.timestamp - openAt;
        openAt = null;
      }
      if (stack3OpenAt !== null) {
        stack3Intervals.push({ start: stack3OpenAt, end: event.timestamp });
        stack3OpenAt = null;
      }
      continue;
    }

    // "refresh": no stack change, nothing to record.
  }

  if (openAt !== null) {
    totalAnyStackMs += fightEnd - openAt;
  }
  if (stack3OpenAt !== null) {
    stack3Intervals.push({ start: stack3OpenAt, end: fightEnd });
  }

  return { totalAnyStackMs, stack3Intervals };
}
