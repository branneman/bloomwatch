import { describe, expect, it } from "vitest";
import { computeRefreshCadence } from "./refreshCadence";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("computeRefreshCadence", () => {
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

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(2);
    expect(result.medianMs).toBe(6510); // (6404 + 6616) / 2
    expect(result.judgement).toBe("green");
    expect(result.buckets).toEqual([
      { label: "early", count: 0, pct: 0 },
      { label: "ideal", count: 2, pct: 100 },
      { label: "late", count: 0, pct: 0 },
    ]);
  });

  it("counts the interval from reaching 3 stacks to the first refresh", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 7000, targetID: 42 }),
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(1);
    expect(result.medianMs).toBe(6000);
  });

  it("buckets intervals at the early/ideal/late boundaries, pooled across targets", () => {
    const reach3For = (targetID: number) => [
      anApplyBuffEvent({ timestamp: 0, targetID }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID }),
    ];

    const events = [
      ...reach3For(42),
      aRefreshBuffEvent({ timestamp: 200 + 5499, targetID: 42 }), // early
      ...reach3For(43),
      aRefreshBuffEvent({ timestamp: 200 + 5500, targetID: 43 }), // ideal, lower edge
      ...reach3For(44),
      aRefreshBuffEvent({ timestamp: 200 + 7000, targetID: 44 }), // ideal, upper edge
      ...reach3For(45),
      aRefreshBuffEvent({ timestamp: 200 + 7001, targetID: 45 }), // late
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(4);
    expect(result.buckets).toEqual([
      { label: "early", count: 1, pct: 25 },
      { label: "ideal", count: 2, pct: 50 },
      { label: "late", count: 1, pct: 25 },
    ]);
  });

  it("computes the median for an odd number of intervals", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 12200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 20200, targetID: 42 }), // interval 8000
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(3);
    expect(result.medianMs).toBe(6000);
  });

  it("computes the median for an even number of intervals", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRefreshBuffEvent({ timestamp: 12700, targetID: 42 }), // interval 6500
      aRefreshBuffEvent({ timestamp: 19700, targetID: 42 }), // interval 7000
      aRefreshBuffEvent({ timestamp: 27700, targetID: 42 }), // interval 8000
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(4);
    // sorted: [6000, 6500, 7000, 8000] -> median (6500 + 7000) / 2
    expect(result.medianMs).toBe(6750);
  });

  it("judges the median red below 5s, orange 5-6s, green 6-7s, and red above 7s", () => {
    const singleIntervalResult = (intervalMs: number) => {
      const events = [
        anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
        aRefreshBuffEvent({ timestamp: 200 + intervalMs, targetID: 42 }),
      ];
      return computeRefreshCadence(events, 2, LB_IDS);
    };

    expect(singleIntervalResult(4999).judgement).toBe("red");
    expect(singleIntervalResult(5000).judgement).toBe("orange");
    expect(singleIntervalResult(5999).judgement).toBe("orange");
    expect(singleIntervalResult(6000).judgement).toBe("green");
    expect(singleIntervalResult(7000).judgement).toBe("green");
    expect(singleIntervalResult(7001).judgement).toBe("red");
  });

  it("does not record a trailing interval when the window closes via removebuff (a bloom)", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // one genuine interval: 6000
      aRemoveBuffEvent({ timestamp: 15000, targetID: 42 }), // bloom, no interval for this gap
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(1);
    expect(result.medianMs).toBe(6000);
  });

  it("starts a fresh window after a drop and re-ramp, not chaining across the gap", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 6200, targetID: 42 }), // interval 6000
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 20000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 20100, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 20200, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 26700, targetID: 42 }), // interval 6500, anchored at 20200
    ];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result.intervalCount).toBe(2);
    expect(result.buckets.map((bucket) => bucket.count)).toEqual([0, 2, 0]);
  });

  it("returns null median/judgement and zeroed buckets when no 3-stack refresh ever happened", () => {
    const events = [anApplyBuffEvent({ timestamp: 0, targetID: 42 })];

    const result = computeRefreshCadence(events, 2, LB_IDS);

    expect(result).toEqual({
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [
        { label: "early", count: 0, pct: 0 },
        { label: "ideal", count: 0, pct: 0 },
        { label: "late", count: 0, pct: 0 },
      ],
    });
  });
});
