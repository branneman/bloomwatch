import { describe, expect, it } from "vitest";
import { computeNaturesSwiftnessAudit } from "./naturesSwiftnessAudit";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const NS_IDS = new Set([17116]);

const RESOLVED: Map<number, ResolvedAbility> = new Map([
  [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  [17531, { kind: "consumable", item: "Mana Potion" }],
]);

describe("computeNaturesSwiftnessAudit", () => {
  it("returns no casts and the floor of fight duration over 180s, plus one, with no events", () => {
    const result = computeNaturesSwiftnessAudit(
      [],
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result).toEqual({ casts: [], castCount: 0, availableWindows: 3 });
  });

  it("matches a Nature's Swiftness cast to the next tracked healing spell cast, with its target", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 1500, targetID: 50, abilityGameID: 9758 }),
    ];

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result.casts).toEqual([
      {
        timestampMs: 1000,
        followUp: { spell: "Healing Touch", rank: 8, targetId: 50 },
      },
    ]);
    expect(result.castCount).toBe(1);
  });

  it("skips a consumable cast between Nature's Swiftness and the real follow-up spell", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 1200, targetID: 2, abilityGameID: 17531 }),
      aCastEvent({ timestamp: 1500, targetID: 50, abilityGameID: 9758 }),
    ];

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result.casts[0].followUp).toEqual({
      spell: "Healing Touch",
      rank: 8,
      targetId: 50,
    });
  });

  it("reports followUp as null when no qualifying cast follows before the fight ends", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
    ];

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result.casts[0].followUp).toBeNull();
  });

  it("matches each of two Nature's Swiftness casts to its own nearest following heal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 1500, targetID: 50, abilityGameID: 9758 }),
      aCastEvent({ timestamp: 100000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 100500, targetID: 60, abilityGameID: 26980 }),
    ];

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result.castCount).toBe(2);
    expect(result.casts[0].followUp).toEqual({
      spell: "Healing Touch",
      rank: 8,
      targetId: 50,
    });
    expect(result.casts[1].followUp).toEqual({
      spell: "Regrowth",
      rank: 10,
      targetId: 60,
    });
  });

  it("ignores casts from other sources or unresolved abilities", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, sourceID: 99, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 2000, abilityGameID: 9999 }),
    ];

    const result = computeNaturesSwiftnessAudit(
      castEvents,
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      400000,
    );

    expect(result.castCount).toBe(0);
  });

  it("computes availableWindows as the floor of fight duration over 180s", () => {
    const result = computeNaturesSwiftnessAudit(
      [],
      DRUID_ID,
      NS_IDS,
      RESOLVED,
      341000,
    );

    expect(result.availableWindows).toBe(2);
  });
});
