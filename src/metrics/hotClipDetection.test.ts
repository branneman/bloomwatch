import { describe, expect, it } from "vitest";
import { computeHotClipDetection } from "./hotClipDetection";
import {
  aCastEvent,
  anApplyBuffEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const REJUV_IDS = new Set([26982]);
const REGROWTH_IDS = new Set([26980]);

describe("computeHotClipDetection", () => {
  it("returns zero casts/clips and good judgement with no events", () => {
    const result = computeHotClipDetection(
      [],
      [],
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );
    expect(result).toEqual({
      rejuvenation: {
        spell: "Rejuvenation",
        castCount: 0,
        clipCount: 0,
        clipPct: 0,
        judgement: "good",
      },
      // No judgement field — Regrowth clipping is informational only, see
      // docs/backlog.md story 301.
      regrowth: {
        spell: "Regrowth",
        castCount: 0,
        clipCount: 0,
        clipPct: 0,
      },
      clipEvents: [],
    });
  });

  it("never produces a judgement for Regrowth, even at a high clip rate", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      // Regrowth lasts 27000ms; refreshing at 1000ms leaves 26000ms
      // (>3000ms) remaining — a clip by the same rule Rejuvenation uses,
      // but Regrowth is never judged for it (see docs/backlog.md story 301).
      aRefreshBuffEvent({
        timestamp: 1000,
        targetID: 48,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 1000, targetID: 48, abilityGameID: 26980 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.regrowth.clipCount).toBe(1);
    expect(result.regrowth.clipPct).toBe(50);
    expect(result.regrowth).not.toHaveProperty("judgement");
  });

  it("counts a refresh with more than one tick remaining as a clip", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // Rejuvenation lasts 12000ms; refreshing at 5000ms leaves 7000ms (>3000ms) remaining.
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(1);
    expect(result.clipEvents).toEqual([
      { timestampMs: 5000, targetId: 42, spell: "Rejuvenation" },
    ]);
  });

  it("does not count a refresh with exactly one tick (3s) or less remaining", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // 12000ms duration - 9000ms elapsed = exactly 3000ms remaining: not > 3000ms.
      aRefreshBuffEvent({
        timestamp: 9000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 9000, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(0);
  });

  it("does not count a re-application after Swiftmend consumed the HoT as a clip", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // Swiftmend consumes the HoT: a removebuff, never a refreshbuff.
      aRemoveBuffEvent({
        timestamp: 2000,
        targetID: 42,
        abilityGameID: 26982,
      }),
      anApplyBuffEvent({
        timestamp: 2001,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 2001, targetID: 42, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(0);
    expect(result.clipEvents).toEqual([]);
  });

  it("tracks Regrowth independently with its own 27s duration", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      // Regrowth lasts 27000ms; refreshing at 20000ms leaves 7000ms (>3000ms) remaining.
      aRefreshBuffEvent({
        timestamp: 20000,
        targetID: 48,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 20000, targetID: 48, abilityGameID: 26980 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.regrowth.clipCount).toBe(1);
    expect(result.rejuvenation.clipCount).toBe(0);
  });

  it("tracks multiple targets independently", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
      anApplyBuffEvent({ timestamp: 0, targetID: 43, abilityGameID: 26982 }),
      // This target's refresh has too little time remaining - not a clip.
      aRefreshBuffEvent({
        timestamp: 11000,
        targetID: 43,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 0, targetID: 43, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 11000, targetID: 43, abilityGameID: 26982 }),
    ];

    const result = computeHotClipDetection(
      buffEvents,
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.clipCount).toBe(1);
    expect(result.clipEvents).toEqual([
      { timestampMs: 5000, targetId: 42, spell: "Rejuvenation" },
    ]);
  });

  it("ignores casts from other sources and other abilities", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 0,
        targetID: 42,
        sourceID: 99,
        abilityGameID: 26982,
      }),
      aCastEvent({ timestamp: 1000, targetID: 42, abilityGameID: 33763 }),
    ];

    const result = computeHotClipDetection(
      [],
      castEvents,
      DRUID_ID,
      REJUV_IDS,
      REGROWTH_IDS,
    );

    expect(result.rejuvenation.castCount).toBe(0);
    expect(result.regrowth.castCount).toBe(0);
  });

  it.each([
    { castCount: 100, expected: "good" },
    { castCount: 20, expected: "fair" },
    { castCount: 7, expected: "fair" },
    { castCount: 5, expected: "bad" },
  ])(
    "judges $expected at a $castCount-cast sample with exactly one clip",
    ({ castCount, expected }) => {
      const buffEvents = [
        anApplyBuffEvent({
          timestamp: 0,
          targetID: 42,
          abilityGameID: 26982,
        }),
        aRefreshBuffEvent({
          timestamp: 5000,
          targetID: 42,
          abilityGameID: 26982,
        }),
      ];
      const castEvents = Array.from({ length: castCount }, (_, i) =>
        aCastEvent({ timestamp: i * 1000, targetID: 42, abilityGameID: 26982 }),
      );

      const result = computeHotClipDetection(
        buffEvents,
        castEvents,
        DRUID_ID,
        REJUV_IDS,
        REGROWTH_IDS,
      );

      expect(result.rejuvenation.clipCount).toBe(1);
      expect(result.rejuvenation.judgement).toBe(expected);
    },
  );
});
