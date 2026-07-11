import { describe, expect, it } from "vitest";
import { computeRestackTax } from "./restackTax";
import {
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const LIFEBLOOM_IDS = new Set([33763]);
const FIGHT_DURATION_MS = 341000; // 5:41 — matches the story's worked example

describe("computeRestackTax", () => {
  it("returns zero casts and green judgement with no events", () => {
    const result = computeRestackTax(
      [],
      [],
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result).toEqual({
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    });
  });

  it("does not count casts during a target's first ramp to 3 stacks", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("does not count a maintenance refresh cast made at 3 stacks", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRefreshBuffEvent({ timestamp: 20000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 20000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("counts a cast that rebuilds a stack after the target already reached 3 once", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(1);
    expect(result.casts).toEqual([{ timestampMs: 101000, targetId: 42 }]);
    expect(result.estimatedMana).toBe(220);
  });

  it("counts every cast in a full rebuild, not just the first", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 102500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 104000, targetID: 42, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
      aCastEvent({ timestamp: 102500, targetID: 42 }),
      aCastEvent({ timestamp: 104000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(3);
    expect(result.casts).toEqual([
      { timestampMs: 101000, targetId: 42 },
      { timestampMs: 102500, targetId: 42 },
      { timestampMs: 104000, targetId: 42 },
    ]);
    expect(result.estimatedMana).toBe(660);
  });

  it("treats each target's first ramp as free independently", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      anApplyBuffEvent({ timestamp: 15000, targetID: 43 }),
      anApplyBuffStackEvent({ timestamp: 16500, targetID: 43, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 18000, targetID: 43, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 15000, targetID: 43 }),
      aCastEvent({ timestamp: 16500, targetID: 43 }),
      aCastEvent({ timestamp: 18000, targetID: 43 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("ignores casts from other sources and other abilities", () => {
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42, sourceID: 99 }),
      aCastEvent({ timestamp: 11000, targetID: 42, abilityGameID: 774 }),
    ];

    const result = computeRestackTax(
      [],
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it.each([
    { restackCasts: 2, expected: "green" },
    { restackCasts: 5, expected: "orange" },
    { restackCasts: 6, expected: "red" },
  ])(
    "judges a 5:41 fight $expected at $restackCasts re-stack casts",
    ({ restackCasts, expected }) => {
      const buffEvents = [
        anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
        anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
        aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      ];
      const castEvents = [
        aCastEvent({ timestamp: 10000, targetID: 42 }),
        aCastEvent({ timestamp: 11500, targetID: 42 }),
        aCastEvent({ timestamp: 13000, targetID: 42 }),
      ];
      // Each of these fires while the target sits at 0 stacks (no
      // intervening buff events put it back above 0), so every one
      // counts as a re-stack-tax cast.
      for (let i = 0; i < restackCasts; i++) {
        castEvents.push(
          aCastEvent({ timestamp: 101000 + i * 10000, targetID: 42 }),
        );
      }

      const result = computeRestackTax(
        buffEvents,
        castEvents,
        DRUID_ID,
        LIFEBLOOM_IDS,
        FIGHT_DURATION_MS,
      );
      expect(result.castCount).toBe(restackCasts);
      expect(result.judgement).toBe(expected);
    },
  );
});
