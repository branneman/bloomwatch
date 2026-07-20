import { describe, expect, it } from "vitest";
import { computeSwiftmendAudit } from "./swiftmendAudit";
import {
  aCastEvent,
  anApplyBuffEvent,
  aRemoveBuffEvent,
  aHealEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const SWIFTMEND_IDS = new Set([18562]);
const REJUV_IDS = new Set([26982]);
const REGROWTH_IDS = new Set([26980]);

describe("computeSwiftmendAudit", () => {
  it("returns no casts, zero wasteful share, and good judgement with no events", () => {
    const result = computeSwiftmendAudit(
      [],
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result).toEqual({
      casts: [],
      swiftmendCastCount: 0,
      wastefulCount: 0,
      wastefulPct: 0,
      judgement: "good",
      availableWindows: 22,
      utilizationPct: 0,
      utilizationJudgement: "bad",
    });
  });

  it("classifies as efficient when the consumed HoT had <=3s remaining, ignoring HP", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      // Rejuvenation lasts 12000ms; removed at 9501ms leaves 2499ms (<=3000ms) remaining.
      aRemoveBuffEvent({
        timestamp: 9501,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 9500,
        targetID: 50,
        abilityGameID: 18562,
      }),
    ];
    // A low HP sample is present too, but efficient takes priority over emergency.
    const healingEvents = [
      aHealEvent({
        timestamp: 9000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 30,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts).toEqual([
      {
        timestampMs: 9500,
        targetId: 50,
        consumedSpell: "Rejuvenation",
        remainingMs: 2499,
        targetHpPct: 30,
        classification: "efficient",
      },
    ]);
  });

  it("classifies as emergency when remaining >3s and target HP <=50%", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 44,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].classification).toBe("emergency");
    expect(result.casts[0].targetHpPct).toBe(44);
  });

  it("classifies as wasteful when remaining >3s and target HP >50%", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 80,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].classification).toBe("wasteful");
  });

  it("treats an unknown target HP (no prior Healing sample) as not-emergency, so it falls through to wasteful", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].targetHpPct).toBeNull();
    expect(result.casts[0].classification).toBe("wasteful");
  });

  it("reads target HP from the most recent Healing sample before the cast, ignoring resourceActor 1 (source) and later entries", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 500,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 70,
      }),
      // The druid's own HP (source, resourceActor 1) — must be ignored.
      aHealEvent({
        timestamp: 1500,
        targetID: 50,
        resourceActor: 1,
        hitPoints: 100,
      }),
      aHealEvent({
        timestamp: 1800,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 40,
      }),
      // After the cast — must be ignored.
      aHealEvent({
        timestamp: 2500,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 95,
      }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].targetHpPct).toBe(40);
  });

  it("identifies the consumed spell as Regrowth from the removebuff's own ability, using Regrowth's 27s duration", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 26980 }),
      // Regrowth lasts 27000ms; removed at 25001ms leaves 1999ms (<=3000ms) remaining.
      aRemoveBuffEvent({
        timestamp: 25001,
        targetID: 60,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 25000, targetID: 60, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts[0].consumedSpell).toBe("Regrowth");
    expect(result.casts[0].classification).toBe("efficient");
  });

  it("skips a Swiftmend cast with no matching HoT removal, but still counts it in swiftmendCastCount", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 18562 }),
    ];

    const result = computeSwiftmendAudit(
      [],
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.casts).toEqual([]);
    expect(result.swiftmendCastCount).toBe(1);
    expect(result.wastefulPct).toBe(0);
    expect(result.judgement).toBe("good");
  });

  it("ignores casts from other sources or other abilities", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        sourceID: 99,
        abilityGameID: 18562,
      }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 26982 }),
    ];

    const result = computeSwiftmendAudit(
      [],
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.swiftmendCastCount).toBe(0);
  });

  it.each([
    { wastefulOf: [0, 4], expected: "good" },
    { wastefulOf: [2, 4], expected: "fair" },
    { wastefulOf: [5, 6], expected: "bad" },
  ])(
    "judges $expected when $wastefulOf.0 of $wastefulOf.1 casts are wasteful",
    ({ wastefulOf, expected }) => {
      const [wastefulCount, totalCount] = wastefulOf;
      const buffEvents: ReturnType<typeof anApplyBuffEvent>[] = [];
      const castEvents: ReturnType<typeof aCastEvent>[] = [];

      for (let i = 0; i < totalCount; i++) {
        const target = 50 + i;
        const applyAt = i * 100000;
        const castAt = applyAt + 2000;
        buffEvents.push(
          anApplyBuffEvent({
            timestamp: applyAt,
            targetID: target,
            abilityGameID: 26982,
          }),
        );
        buffEvents.push(
          aRemoveBuffEvent({
            timestamp: castAt + 1,
            targetID: target,
            abilityGameID: 26982,
          }),
        );
        castEvents.push(
          aCastEvent({
            timestamp: castAt,
            targetID: target,
            abilityGameID: 18562,
          }),
        );
      }
      // No Healing events at all -> every cast has remaining (12000-2001=9999ms,
      // well over the 3s efficient threshold) and unknown HP -> every cast is
      // wasteful. Re-classify the first `wastefulCount` casts as emergency
      // (not wasteful) by giving them a low-HP Healing sample instead.
      const healingEvents: ReturnType<typeof aHealEvent>[] = [];
      for (let i = wastefulCount; i < totalCount; i++) {
        const target = 50 + i;
        const castAt = i * 100000 + 2000;
        healingEvents.push(
          aHealEvent({
            timestamp: castAt - 500,
            targetID: target,
            resourceActor: 2,
            hitPoints: 30,
          }),
        );
      }

      const result = computeSwiftmendAudit(
        buffEvents,
        castEvents,
        healingEvents,
        DRUID_ID,
        SWIFTMEND_IDS,
        REJUV_IDS,
        REGROWTH_IDS,
        341000,
      );

      expect(result.wastefulCount).toBe(wastefulCount);
      expect(result.judgement).toBe(expected);
    },
  );

  it.each([
    { castCount: 20, expectedPct: (20 / 22) * 100, expected: "good" }, // 22 windows in a 341000ms fight
    { castCount: 12, expectedPct: (12 / 22) * 100, expected: "fair" },
    { castCount: 5, expectedPct: (5 / 22) * 100, expected: "bad" },
  ])(
    "judges $expected utilization for $castCount casts of 22 available windows",
    ({ castCount, expectedPct, expected }) => {
      const castEvents = Array.from({ length: castCount }, (_, i) =>
        aCastEvent({
          timestamp: i * 15000,
          targetID: 50,
          abilityGameID: 18562,
        }),
      );

      const result = computeSwiftmendAudit(
        [],
        castEvents,
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        REJUV_IDS,
        REGROWTH_IDS,
        341000,
      );

      expect(result.swiftmendCastCount).toBe(castCount);
      expect(result.utilizationPct).toBeCloseTo(expectedPct, 5);
      expect(result.utilizationJudgement).toBe(expected);
    },
  );

  it("computes availableWindows as the floor of fight duration over 15s", () => {
    const result = computeSwiftmendAudit(
      [],
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      REJUV_IDS,
      REGROWTH_IDS,
      341000,
    );

    expect(result.availableWindows).toBe(22);
  });
});
