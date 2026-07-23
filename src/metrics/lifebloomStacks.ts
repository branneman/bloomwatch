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

// Story 915: flags targets whose fight-window timeline opens mid-stream
// (anything other than "open" as the first event) - proof the buff was
// already active before this fetch window began, per
// deriveLifebloomTargetState's own existing carry-in comment. Callers use
// this, from the fight-window events they've already fetched, to decide
// whether a second (lookback) fetch is worth making at all.
export function detectCarryInTargets(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): number[] {
  const timelines = reconstructLifebloomTimelines(
    events,
    druidId,
    lifebloomAbilityIds,
  );
  const flagged: number[] = [];
  for (const [targetId, timeline] of timelines) {
    if (timeline.length > 0 && timeline[0].kind !== "open") {
      flagged.push(targetId);
    }
  }
  return flagged;
}

// Story 915: attempts to resolve a carry-in target's true state at
// fightStart using a bounded lookback window (events strictly before
// fightStart). Walks the lookback timeline forward simulating the same
// open/stack-change/close state machine deriveLifebloomTargetState uses; if
// a genuine "open" is found and the buff is still active by fightStart,
// returns fightWindowTimeline prefixed with a synthetic open (and, if the
// resolved stack is >= 2, a stack-change) at exactly fightStart - a
// timeline deriveLifebloomTargetState can consume completely unchanged,
// since it now legitimately starts with "open" at fightStart. Returns null
// when the ambiguity persists (no genuine open found, or the buff already
// closed again before fightStart) - callers exclude the target from
// judgement in that case rather than guessing.
export function resolveCarryInTimeline(
  fightWindowTimeline: LifebloomTimelineEvent[],
  lookbackEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  targetId: number,
  fightStart: number,
): LifebloomTimelineEvent[] | null {
  const lookbackTimelines = reconstructLifebloomTimelines(
    lookbackEvents,
    druidId,
    lifebloomAbilityIds,
  );
  const lookbackTimeline = lookbackTimelines.get(targetId) ?? [];

  let stack = 0;
  let isOpen = false;
  let sawGenuineOpen = false;

  for (const event of lookbackTimeline) {
    if (event.kind === "open") {
      isOpen = true;
      stack = 1;
      sawGenuineOpen = true;
    } else if (event.kind === "stack-change") {
      stack = event.stack ?? stack;
    } else if (event.kind === "close") {
      isOpen = false;
      stack = 0;
    }
    // "refresh": no state change.
  }

  if (!sawGenuineOpen || !isOpen) return null;

  const prefix: LifebloomTimelineEvent[] = [
    { timestamp: fightStart, kind: "open" },
  ];
  if (stack >= 2) {
    prefix.push({ timestamp: fightStart, kind: "stack-change", stack });
  }

  return [...prefix, ...fightWindowTimeline];
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
  fightStart: number,
  fightEnd: number,
): LifebloomTargetState {
  let openAt: number | null = null;
  let stack3OpenAt: number | null = null;
  let totalAnyStackMs = 0;
  const stack3Intervals: { start: number; end: number }[] = [];

  // WCL sometimes splits one continuous pull attempt across multiple
  // "fight" IDs (e.g. a wipe immediately following a short aborted
  // mini-pull). When that happens, a Lifebloom applied during the earlier
  // fight carries into this one as a stack-change/refresh/close with no
  // preceding "open" event in this window - those event kinds only ever
  // fire on an already-active buff, so their presence is proof (not a
  // guess) that the buff was up since before fightStart. The exact prior
  // stack count is unknown, so stack-3 tracking below still waits for an
  // explicit stack-change rather than assuming stack3OpenAt too.
  if (timeline.length > 0 && timeline[0].kind !== "open") {
    openAt = fightStart;
  }

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

// Excludes a fight from Lifebloom Discipline judgement entirely
// (summarizeLifebloomDiscipline in epicSummary.ts) when false - a fact
// about actual cast events, independent of buff-timeline reconstruction
// or carry-in resolution, so a target whose Lifebloom merely carried in
// from the previous pull (and was never recast this fight) still counts
// as excluded.
export function hasLifebloomCast(
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): boolean {
  return castEvents.some(
    (event) =>
      event.type === "cast" &&
      event.sourceID === druidId &&
      event.abilityGameID !== undefined &&
      lifebloomAbilityIds.has(event.abilityGameID),
  );
}
