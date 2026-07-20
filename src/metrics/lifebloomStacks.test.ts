import { describe, expect, it } from "vitest";
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
  detectCarryInTargets,
  resolveCarryInTimeline,
  type LifebloomTimelineEvent,
} from "./lifebloomStacks";
import type { WclEvent } from "../wcl/events";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("reconstructLifebloomTimelines", () => {
  it("reproduces the real captured sequence from report 4GYHZRdtL3bvhpc8 fight 6", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 1880312, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1881811, stack: 2, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1881811, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1883327, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1883327, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1889731, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1896347, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1903349, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 1880312, kind: "open" },
      { timestamp: 1881811, kind: "stack-change", stack: 2 },
      { timestamp: 1883327, kind: "stack-change", stack: 3 },
      { timestamp: 1889731, kind: "refresh" },
      { timestamp: 1896347, kind: "refresh" },
      { timestamp: 1903349, kind: "close" },
    ]);
  });

  it("keeps a solo refreshbuff as a genuine refresh when there's no co-occurring stack change", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 5000, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 5000, kind: "refresh" },
    ]);
  });

  it("tracks multiple targets independently, preserving first-seen order", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffEvent({ timestamp: 100, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 200, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 300, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect([...timelines.keys()]).toEqual([47, 42]);
    expect(timelines.get(47)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 200, kind: "close" },
    ]);
    expect(timelines.get(42)).toEqual([
      { timestamp: 100, kind: "open" },
      { timestamp: 300, kind: "close" },
    ]);
  });

  it("emits a second open/close pair after a drop and re-ramp on the same target", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.get(42)).toEqual([
      { timestamp: 0, kind: "open" },
      { timestamp: 500, kind: "stack-change", stack: 2 },
      { timestamp: 1000, kind: "stack-change", stack: 3 },
      { timestamp: 3000, kind: "close" },
      { timestamp: 5000, kind: "open" },
      { timestamp: 5500, kind: "stack-change", stack: 2 },
      { timestamp: 6000, kind: "stack-change", stack: 3 },
      { timestamp: 9000, kind: "close" },
    ]);
  });

  it("ignores events from a different caster and non-Lifebloom abilities", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, sourceID: 99 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 3,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];

    const timelines = reconstructLifebloomTimelines(events, 2, LB_IDS);

    expect(timelines.size).toBe(0);
  });
});

describe("deriveLifebloomTargetState", () => {
  it("accumulates any-stack time and records a single stack-3 interval", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 0, 20000);

    expect(state).toEqual({
      totalAnyStackMs: 10000,
      stack3Intervals: [{ start: 2000, end: 10000 }],
    });
  });

  it("records a second interval after a drop and re-ramp", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
        anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 0, 10000);

    expect(state).toEqual({
      totalAnyStackMs: 7000,
      stack3Intervals: [
        { start: 1000, end: 3000 },
        { start: 6000, end: 9000 },
      ],
    });
  });

  it("closes an open interval and open any-stack window at fightEnd", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 0, 5000);

    expect(state).toEqual({
      totalAnyStackMs: 5000,
      stack3Intervals: [{ start: 2000, end: 5000 }],
    });
  });

  it("returns an empty interval list for a target that never reaches 3 stacks", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
        aRemoveBuffEvent({ timestamp: 8000, targetID: 42 }),
      ],
      2,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 0, 10000);

    expect(state).toEqual({
      totalAnyStackMs: 8000,
      stack3Intervals: [],
    });
  });

  // Real capture: report D61P4CN9mqGjnW3J fight 7 (Hydross the Unstable,
  // wipe). WCL split one continuous pull attempt across fight IDs, so
  // Lifebloom's applybuff on this target landed in the preceding fight -
  // within fight 7's own event window, the timeline starts mid-stream with
  // a refreshbuff and no "open". A refresh only ever fires on an
  // already-active buff, so the any-stack window is backdated to
  // fightStart; the exact prior stack count is unknown, so no stack-3
  // interval is assumed.
  it("backdates any-stack uptime to fightStart when the timeline opens with a refresh instead of an open", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 1 }),
        aRemoveBuffEvent({ timestamp: 2064275, targetID: 5, sourceID: 1 }),
      ],
      1,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(
      timelines.get(5) ?? [],
      2011529,
      2113050,
    );

    expect(state).toEqual({
      totalAnyStackMs: 2064275 - 2011529,
      stack3Intervals: [],
    });
  });

  it("does not backdate a stack-3 interval before the first explicit stack-change, even though any-stack time is backdated to fightStart", () => {
    const timelines = reconstructLifebloomTimelines(
      [
        anApplyBuffStackEvent({
          timestamp: 1500,
          stack: 3,
          targetID: 5,
          sourceID: 1,
        }),
        aRemoveBuffEvent({ timestamp: 4000, targetID: 5, sourceID: 1 }),
      ],
      1,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(
      timelines.get(5) ?? [],
      1000,
      5000,
    );

    expect(state).toEqual({
      totalAnyStackMs: 3000,
      stack3Intervals: [{ start: 1500, end: 4000 }],
    });
  });

  it("backdates any-stack uptime to fightStart when the timeline is still open at fightEnd with no leading open event", () => {
    const timelines = reconstructLifebloomTimelines(
      [aRefreshBuffEvent({ timestamp: 2000, targetID: 5, sourceID: 1 })],
      1,
      LB_IDS,
    );

    const state = deriveLifebloomTargetState(
      timelines.get(5) ?? [],
      1000,
      5000,
    );

    expect(state).toEqual({
      totalAnyStackMs: 4000,
      stack3Intervals: [],
    });
  });
});

describe("detectCarryInTargets", () => {
  it("flags a target whose timeline opens with a refresh instead of an open", () => {
    const events = [
      aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 2064275, targetID: 5, sourceID: 1 }),
    ];

    expect(detectCarryInTargets(events, 1, LB_IDS)).toEqual([5]);
  });

  it("does not flag a target whose timeline opens with a genuine open", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 42 }),
    ];

    expect(detectCarryInTargets(events, 2, LB_IDS)).toEqual([]);
  });

  it("flags only the ambiguous target among several", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 0, targetID: 47, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 47, sourceID: 1 }),
    ];

    expect(detectCarryInTargets(events, 1, LB_IDS)).toEqual([47]);
  });
});

describe("resolveCarryInTimeline", () => {
  it("resolves a genuine open found in the lookback window, synthesizing open+stack-change at fightStart", () => {
    const fightWindowTimeline: LifebloomTimelineEvent[] = [
      { timestamp: 2016447, kind: "refresh" },
      { timestamp: 2064275, kind: "close" },
    ];
    // Lookback events: the druid genuinely applied Lifebloom and stacked it
    // to 3 within the 60s before fightStart (2011529).
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1960000, targetID: 5, sourceID: 1 }),
      anApplyBuffStackEvent({
        timestamp: 1965000,
        stack: 2,
        targetID: 5,
        sourceID: 1,
      }),
      anApplyBuffStackEvent({
        timestamp: 1970000,
        stack: 3,
        targetID: 5,
        sourceID: 1,
      }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toEqual([
      { timestamp: 2011529, kind: "open" },
      { timestamp: 2011529, kind: "stack-change", stack: 3 },
      { timestamp: 2016447, kind: "refresh" },
      { timestamp: 2064275, kind: "close" },
    ]);
  });

  it("resolves to a bare open (no stack-change) when the lookback shows exactly 1 stack at fightStart", () => {
    const fightWindowTimeline: LifebloomTimelineEvent[] = [
      { timestamp: 2016447, kind: "refresh" },
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 2000000, targetID: 5, sourceID: 1 }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toEqual([
      { timestamp: 2011529, kind: "open" },
      { timestamp: 2016447, kind: "refresh" },
    ]);
  });

  it("returns null when the lookback window itself never shows a genuine open (real capture: report DRtXV4ChA2Kw3c81 fight 84, druid Stuuri, target 30)", () => {
    const fightWindowTimeline: LifebloomTimelineEvent[] = [
      { timestamp: 10199672, kind: "refresh" },
    ];
    // No applybuff for this druid/target anywhere in the 60s lookback -
    // matches this session's live trace, which found nothing even 190s back.
    const lookbackEvents: WclEvent[] = [];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      10,
      LB_IDS,
      30,
      10199672,
    );

    expect(resolved).toBeNull();
  });

  it("returns null when the lookback shows the buff opened and closed again before fightStart", () => {
    const fightWindowTimeline: LifebloomTimelineEvent[] = [
      { timestamp: 2016447, kind: "refresh" },
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1990000, targetID: 5, sourceID: 1 }),
      aRemoveBuffEvent({ timestamp: 1995000, targetID: 5, sourceID: 1 }),
    ];

    const resolved = resolveCarryInTimeline(
      fightWindowTimeline,
      lookbackEvents,
      1,
      LB_IDS,
      5,
      2011529,
    );

    expect(resolved).toBeNull();
  });
});
