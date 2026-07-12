import { describe, expect, it } from "vitest";
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
} from "./lifebloomStacks";
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

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 20000);

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

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 10000);

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

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 5000);

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

    const state = deriveLifebloomTargetState(timelines.get(42) ?? [], 10000);

    expect(state).toEqual({
      totalAnyStackMs: 8000,
      stack3Intervals: [],
    });
  });
});
