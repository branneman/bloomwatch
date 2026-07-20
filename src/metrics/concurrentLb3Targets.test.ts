import { describe, expect, it } from "vitest";
import { computeConcurrentLb3Targets } from "./concurrentLb3Targets";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const LB_IDS = new Set([33763]);

describe("computeConcurrentLb3Targets", () => {
  it("returns zero average/peak and a full-fight level 0 with no events", () => {
    const result = computeConcurrentLb3Targets([], DRUID_ID, LB_IDS, 0, 10000);
    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
      judgement: null,
    });
  });

  it("computes overlapping windows for two maintained targets", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 3000, stack: 3, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 1.5,
      peakConcurrent: 2,
      levels: [
        { count: 0, pct: 20 },
        { count: 1, pct: 10 },
        { count: 2, pct: 70 },
      ],
      judgement: "good",
    });
  });

  it("computes back-to-back non-overlapping windows for two maintained targets", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 7000, stack: 3, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 0.6,
      peakConcurrent: 1,
      levels: [
        { count: 0, pct: 40 },
        { count: 1, pct: 60 },
      ],
      judgement: null,
    });
  });

  it("excludes a target below the 30% maintained-uptime threshold even if it reached 3 stacks", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 99 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 99 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 99 }),
      aRemoveBuffEvent({ timestamp: 25000, targetID: 99 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      100000,
    );

    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
      judgement: null,
    });
  });

  it("closes an interval still open at fightEnd", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      5000,
    );

    expect(result).toEqual({
      avgConcurrent: 0.6,
      peakConcurrent: 1,
      levels: [
        { count: 0, pct: 40 },
        { count: 1, pct: 60 },
      ],
      judgement: null,
    });
  });

  it("produces a level-3 segment for a three-way overlap", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 25000, stack: 2, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 30000, stack: 3, targetID: 50 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      100000,
    );

    expect(result).toEqual({
      avgConcurrent: 2.4,
      peakConcurrent: 3,
      levels: [
        { count: 0, pct: 10 },
        { count: 1, pct: 10 },
        { count: 2, pct: 10 },
        { count: 3, pct: 70 },
      ],
      judgement: "good",
    });
  });

  it("rounds level percentages to whole numbers that still sum to 100", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 4000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 3, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      9000,
    );

    // Raw durations of 2000/3000/4000ms out of a 9000ms fight give
    // 22.222.../33.333.../44.444...% — naive per-value Math.round yields
    // 22/33/44, which sums to 99, not 100.
    expect(result.levels).toEqual([
      { count: 0, pct: 22 },
      { count: 1, pct: 33 },
      { count: 2, pct: 45 },
    ]);
    const total = result.levels.reduce((sum, level) => sum + level.pct, 0);
    expect(total).toBe(100);
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

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      10000,
    );

    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
      judgement: null,
    });
  });

  it("judges good when 2+ targets held LB3 for at least 50% of the fight", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 25000, stack: 2, targetID: 50 }),
      anApplyBuffStackEvent({ timestamp: 30000, stack: 3, targetID: 50 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      100000,
    );

    // Same fixture as the "three-way overlap" test above: levels are
    // 0%=10, 1%=10, 2%=10, 3%=70 -> time at count>=2 is 10+70=80%.
    expect(result.judgement).toBe("good");
  });

  it("stays unjudged (never fair/bad) just below the 50% time-at-2+ bar", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 4000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 3, targetID: 47 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      0,
      9000,
    );

    // Same fixture as the "rounds level percentages" test above: levels
    // are 0%=22, 1%=33, 2%=45 -> time at count>=2 is 45%, just under 50.
    expect(result.judgement).toBeNull();
  });

  it("resolves a carry-in target's true stack-3 state using lookback events instead of leaving it silently absent", () => {
    const fightStart = 2011529;
    const fightEnd = 2113050;
    // Fight window alone only ever sees a refreshbuff on target 5 - no
    // explicit stack-change - so without the lookback it never contributes
    // a stack3Interval at all, even though it's "maintained" the whole
    // fight. The lookback proves it was already at 3 stacks before
    // fightStart.
    const events = [aRefreshBuffEvent({ timestamp: 2016447, targetID: 5 })];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1960000, targetID: 5 }),
      anApplyBuffStackEvent({ timestamp: 1970000, stack: 3, targetID: 5 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      fightStart,
      fightEnd,
      lookbackEvents,
    );

    expect(result).toEqual({
      avgConcurrent: 1,
      peakConcurrent: 1,
      levels: [{ count: 1, pct: 100 }],
      judgement: null,
    });
  });

  it("excludes a carry-in target still ambiguous after the lookback, contributing nothing (as if never maintained)", () => {
    const fightStart = 10199672;
    const fightEnd = 10440305;
    const events = [aRefreshBuffEvent({ timestamp: fightStart, targetID: 30 })];
    const lookbackEvents: ReturnType<typeof anApplyBuffEvent>[] = [];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      fightStart,
      fightEnd,
      lookbackEvents,
    );

    expect(result).toEqual({
      avgConcurrent: 0,
      peakConcurrent: 0,
      levels: [{ count: 0, pct: 100 }],
      judgement: null,
    });
  });

  it("keeps today's exact behavior when lookbackEvents is omitted (backward compatible)", () => {
    const fightStart = 0;
    const fightEnd = 100000;
    // Target 42's fight-window timeline starts with a non-open event
    // (carry-in shaped) but also has an explicit stack-change to 3 within
    // the window - proving that when lookbackEvents is omitted, the raw
    // unresolved timeline is used as-is (stack3Interval starts at the
    // explicit stack-change timestamp, not backdated to fightStart).
    const events = [
      aRefreshBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
    ];

    const result = computeConcurrentLb3Targets(
      events,
      DRUID_ID,
      LB_IDS,
      fightStart,
      fightEnd,
    );

    expect(result).toEqual({
      avgConcurrent: 0.99,
      peakConcurrent: 1,
      levels: [
        { count: 0, pct: 1 },
        { count: 1, pct: 99 },
      ],
      judgement: null,
    });
  });
});
