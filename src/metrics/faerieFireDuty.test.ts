import { describe, expect, it } from "vitest";
import { computeFaerieFireDuty } from "./faerieFireDuty";
import { aCastEvent } from "../testUtils/factories";

const FF_ID = 26993;
const BOSS_A = 149;
const BOSS_B = 146;
const NON_BOSS = 92;

describe("computeFaerieFireDuty", () => {
  it("is not on duty for a single incidental cast (the confirmed real one-off case)", () => {
    // Mirrors t3qNHgVKd46YDaj9 fight 12: 1 cast, 46s fight.
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 36000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      46000,
    );
    expect(result.onDuty).toBe(false);
    expect(result.bossCastCount).toBe(1);
  });

  it("is on duty for sustained single-target casting meeting both thresholds", () => {
    // Mirrors gNYhK1ZAP7RQz2pa fight 18 shape: refreshed roughly every
    // ~35-39s across most of a ~199s fight.
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 2000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 39000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 78000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 116000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 150000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 184000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      199000,
    );
    expect(result.onDuty).toBe(true);
    expect(result.bossCastCount).toBe(6);
    expect(result.castSpanMs).toBe(182000);
  });

  it("ignores casts on a non-boss target entirely, regardless of count", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: NON_BOSS,
        timestamp: i * 20000,
      }),
    );
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      200000,
    );
    expect(result.onDuty).toBe(false);
    expect(result.bossCastCount).toBe(0);
  });

  it("combines casts across multiple simultaneous boss-tagged targets (council-fight shape)", () => {
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 5000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_B,
        timestamp: 8000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 45000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_B,
        timestamp: 90000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A, BOSS_B]),
      100000,
    );
    expect(result.bossCastCount).toBe(4);
    expect(result.castSpanMs).toBe(85000);
    expect(result.onDuty).toBe(true);
  });

  it("ignores casts from a different source (not this druid)", () => {
    const events = [
      aCastEvent({
        sourceID: 99,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 5000,
      }),
      aCastEvent({
        sourceID: 99,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 45000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      100000,
    );
    expect(result.bossCastCount).toBe(0);
    expect(result.onDuty).toBe(false);
  });
});
