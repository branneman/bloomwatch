import { describe, expect, it } from "vitest";
import { computeDeathForensics } from "./deathForensics";
import {
  aDeathEvent,
  aCastEvent,
  aBegincastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const SWIFTMEND_IDS = new Set([18562]);
const NS_IDS = new Set([17116]);
const LB_IDS = new Set([33763]);

describe("computeDeathForensics", () => {
  it("judges bad when a maintained target's death has no LB3, both cooldowns ready, and the druid was idle", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
      aRemoveBuffEvent({
        timestamp: 50000,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    const result = computeDeathForensics(
      deathEvents,
      [],
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0]).toEqual({
      timestampMs: 90000,
      targetId: 50,
      maintained: true,
      lb3Rolling: false,
      swiftmendReady: true,
      nsReady: true,
      idlePreceding: true,
      unspentCount: 3,
      judgement: "bad",
    });
  });

  it("judges fair when exactly one of the three resources is unspent", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const castEvents = [
      // Nature's Swiftness, long before the death -> still on cooldown.
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        abilityGameID: 17116,
        sourceID: DRUID_ID,
      }),
      // Swiftmend, 10s before the death -> still on its 15s cooldown.
      aCastEvent({
        timestamp: 80000,
        targetID: 50,
        abilityGameID: 18562,
        sourceID: DRUID_ID,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].lb3Rolling).toBe(true);
    expect(result.deaths[0].swiftmendReady).toBe(false);
    expect(result.deaths[0].nsReady).toBe(false);
    expect(result.deaths[0].idlePreceding).toBe(true);
    expect(result.deaths[0].unspentCount).toBe(1);
    expect(result.deaths[0].judgement).toBe("fair");
  });

  it("judges good when zero resources are unspent", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        abilityGameID: 17116,
        sourceID: DRUID_ID,
      }),
      aCastEvent({
        timestamp: 80000,
        targetID: 50,
        abilityGameID: 18562,
        sourceID: DRUID_ID,
      }),
      // A third cast right before the death keeps the druid mid-cast at
      // the moment of death (instant cast -> occupies [89000, 90500]).
      aCastEvent({
        timestamp: 89000,
        targetID: 50,
        abilityGameID: 26980,
        sourceID: DRUID_ID,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].unspentCount).toBe(0);
    expect(result.deaths[0].judgement).toBe("good");
  });

  it("reports judgement as null for an unmaintained target's death, regardless of unspent count", () => {
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 999 })];
    // No Lifebloom, Swiftmend, or Nature's Swiftness casts at all, and no
    // other casts nearby -> every raw boolean looks "unspent", but the
    // target was never maintained, so it must not be judged.
    const result = computeDeathForensics(
      deathEvents,
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].maintained).toBe(false);
    expect(result.deaths[0].lb3Rolling).toBe(false);
    expect(result.deaths[0].swiftmendReady).toBe(true);
    expect(result.deaths[0].nsReady).toBe(true);
    expect(result.deaths[0].idlePreceding).toBe(true);
    expect(result.deaths[0].judgement).toBeNull();
    expect(result.flaggedCount).toBe(0);
  });

  it("maintained matches story 201's >=30% fight-wide any-stack-uptime threshold exactly at the boundary", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 70, abilityGameID: 33763 }),
      // Exactly 30% of the 100000ms fight.
      aRemoveBuffEvent({
        timestamp: 30000,
        targetID: 70,
        abilityGameID: 33763,
      }),
      anApplyBuffEvent({ timestamp: 0, targetID: 71, abilityGameID: 33763 }),
      // Just under 30%.
      aRemoveBuffEvent({
        timestamp: 29999,
        targetID: 71,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [
      aDeathEvent({ timestamp: 50000, targetID: 70 }),
      aDeathEvent({ timestamp: 50001, targetID: 71 }),
    ];

    const result = computeDeathForensics(
      deathEvents,
      [],
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].maintained).toBe(true);
    expect(result.deaths[1].maintained).toBe(false);
  });

  it.each([
    { gapMs: 15000, expected: true },
    { gapMs: 14999, expected: false },
  ])(
    "swiftmendReady is $expected when the last Swiftmend cast was $gapMs ms before the death",
    ({ gapMs, expected }) => {
      const castEvents = [
        aCastEvent({
          timestamp: 10000,
          targetID: 999,
          abilityGameID: 18562,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [
        aDeathEvent({ timestamp: 10000 + gapMs, targetID: 999 }),
      ];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        true,
        true,
        0,
        200000,
      );

      expect(result.deaths[0].swiftmendReady).toBe(expected);
    },
  );

  it.each([
    { gapMs: 180000, expected: true },
    { gapMs: 179999, expected: false },
  ])(
    "nsReady is $expected when the last Nature's Swiftness cast was $gapMs ms before the death",
    ({ gapMs, expected }) => {
      const castEvents = [
        aCastEvent({
          timestamp: 10000,
          targetID: 999,
          abilityGameID: 17116,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [
        aDeathEvent({ timestamp: 10000 + gapMs, targetID: 999 }),
      ];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        true,
        true,
        0,
        400000,
      );

      expect(result.deaths[0].nsReady).toBe(expected);
    },
  );

  it("idlePreceding is false when the druid is still mid-cast (a cast-time spell) at the death", () => {
    const castEvents = [
      aBegincastEvent({
        timestamp: 8500,
        abilityGameID: 26980,
        sourceID: DRUID_ID,
      }),
      // Regrowth's 2000ms cast time -> occupies [8500, 10500].
      aCastEvent({
        timestamp: 10500,
        abilityGameID: 26980,
        sourceID: DRUID_ID,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 9500, targetID: 999 })];

    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      200000,
    );

    expect(result.deaths[0].idlePreceding).toBe(false);
  });

  it.each([
    { deathTimestamp: 6000, expected: true },
    { deathTimestamp: 3000, expected: false },
  ])(
    "idlePreceding is $expected when the death at $deathTimestamp ms precedes the druid's first cast, measured from the fight's start",
    ({ deathTimestamp, expected }) => {
      const castEvents = [
        aCastEvent({
          timestamp: 20000,
          abilityGameID: 26980,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [
        aDeathEvent({ timestamp: deathTimestamp, targetID: 999 }),
      ];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        true,
        true,
        0,
        200000,
      );

      expect(result.deaths[0].idlePreceding).toBe(expected);
    },
  );

  it("rolls up flaggedCount and the worst-of judgement across multiple deaths", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 60,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 60,
        abilityGameID: 33763,
      }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 89000,
        abilityGameID: 18562,
        sourceID: DRUID_ID,
      }),
      aCastEvent({
        timestamp: 89000,
        abilityGameID: 17116,
        sourceID: DRUID_ID,
      }),
      aCastEvent({
        timestamp: 90500,
        abilityGameID: 26980,
        sourceID: DRUID_ID,
      }),
    ];
    const deathEvents = [
      // Early death, before any of the casts above -> everything unspent -> bad.
      aDeathEvent({ timestamp: 10000, targetID: 50 }),
      // Late death, right after the cast cluster -> everything spent -> good.
      aDeathEvent({ timestamp: 91000, targetID: 60 }),
    ];

    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].judgement).toBe("bad");
    expect(result.deaths[1].judgement).toBe("good");
    expect(result.flaggedCount).toBe(1);
    expect(result.judgement).toBe("bad");
  });

  it("resolves to a good judgement with zero flagged deaths when there are no friendly deaths", () => {
    const result = computeDeathForensics(
      [],
      [],
      [],
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result).toEqual({
      deaths: [],
      flaggedCount: 0,
      judgement: "good",
    });
  });

  it("swiftmendReady is false when hasSwiftmend is false, even with no prior Swiftmend cast recorded", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    const result = computeDeathForensics(
      deathEvents,
      [],
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      false,
      true,
      0,
      100000,
    );

    expect(result.deaths[0].swiftmendReady).toBe(false);
    expect(result.deaths[0].nsReady).toBe(true);
    expect(result.deaths[0].unspentCount).toBe(2);
  });

  it("nsReady is false when hasNaturesSwiftness is false, even with no prior Nature's Swiftness cast recorded", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    const result = computeDeathForensics(
      deathEvents,
      [],
      buffEvents,
      DRUID_ID,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      false,
      0,
      100000,
    );

    expect(result.deaths[0].swiftmendReady).toBe(true);
    expect(result.deaths[0].nsReady).toBe(false);
    expect(result.deaths[0].unspentCount).toBe(2);
  });
});
