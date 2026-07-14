import { describe, expect, it } from "vitest";
import { computeConsumableThroughput } from "./consumableThroughput";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const MANA_POTION_ID = 17531;
const DARK_RUNE_ID = 20520;
const DEMONIC_RUNE_ID = 20521;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [MANA_POTION_ID, { kind: "consumable", item: "Mana Potion" }],
  [DARK_RUNE_ID, { kind: "consumable", item: "Dark Rune" }],
  [DEMONIC_RUNE_ID, { kind: "consumable", item: "Demonic Rune" }],
]);

function aManaSampleEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

function aConsumableCastEvent(
  timestamp: number,
  abilityGameID: number,
  sourceID = DRUID_ID,
) {
  return aCastEvent({
    timestamp,
    sourceID,
    abilityGameID,
    targetID: sourceID,
  });
}

const LOW_MANA_SAMPLE = aManaSampleEvent(500, 6000); // 60% — below the 70% threshold

describe("computeConsumableThroughput", () => {
  it("is exempt with no rows or judgement when mana never drops below 70%", () => {
    const events = [aManaSampleEvent(500, 8000)]; // 80%, never below 70%
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      300_000,
    );
    expect(result).toEqual({ exempt: true, rows: [], judgement: null });
  });

  it("computes the floor as fight duration / 120s, floored", () => {
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        120_000,
      ).rows[0].expectedFloor,
    ).toBe(1);
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        119_999,
      ).rows[0].expectedFloor,
    ).toBe(0);
    expect(
      computeConsumableThroughput(
        [LOW_MANA_SAMPLE],
        DRUID_ID,
        RESOLVED_ABILITIES,
        241_000,
      ).rows[0].expectedFloor,
    ).toBe(2);
  });

  it("counts Dark Rune and Demonic Rune together as one Rune row", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, DARK_RUNE_ID),
      aConsumableCastEvent(2000, DEMONIC_RUNE_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      120_000,
    );
    const runeRow = result.rows.find((row) => row.label === "Rune");
    expect(runeRow?.used).toBe(2);
    expect(result.rows).toHaveLength(2); // Mana Potion + Rune, never 3
  });

  it("judges green when used meets or exceeds the floor", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
      aConsumableCastEvent(3000, MANA_POTION_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3
    );
    expect(result.rows.find((row) => row.label === "Mana Potion")).toEqual({
      label: "Mana Potion",
      used: 3,
      expectedFloor: 3,
      judgement: "green",
    });
  });

  it("judges orange when used is exactly one below the floor", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3
    );
    expect(
      result.rows.find((row) => row.label === "Mana Potion")?.judgement,
    ).toBe("orange");
  });

  it("judges red when used is two or more below the floor", () => {
    const result = computeConsumableThroughput(
      [LOW_MANA_SAMPLE],
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000, // floor 3, 0 used
    );
    expect(
      result.rows.find((row) => row.label === "Mana Potion")?.judgement,
    ).toBe("red");
    expect(result.rows.find((row) => row.label === "Rune")?.judgement).toBe(
      "red",
    );
  });

  it("takes the fight-level judgement as the worst of both rows", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID),
      aConsumableCastEvent(2000, MANA_POTION_ID),
      aConsumableCastEvent(3000, MANA_POTION_ID),
    ]; // potions green (3/3), runes red (0/3)
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000,
    );
    expect(result.judgement).toBe("red");
  });

  it("judges normally on what would be a wipe — there is no kill restriction", () => {
    // The function takes no kill/outcome flag at all, unlike computeManaCurve — this
    // test documents that omission is deliberate (docs/backlog.md story 402 has no
    // kill restriction, unlike 401's). Meeting the floor on both consumables still
    // yields a real green judgement, not an informational/null one.
    const result = computeConsumableThroughput(
      [
        LOW_MANA_SAMPLE,
        aConsumableCastEvent(1000, MANA_POTION_ID),
        aConsumableCastEvent(2000, MANA_POTION_ID),
        aConsumableCastEvent(3000, MANA_POTION_ID),
        aConsumableCastEvent(4000, DARK_RUNE_ID),
        aConsumableCastEvent(5000, DEMONIC_RUNE_ID),
        aConsumableCastEvent(6000, DARK_RUNE_ID),
      ],
      DRUID_ID,
      RESOLVED_ABILITIES,
      360_000,
    );
    expect(result.judgement).toBe("green");
  });

  it("ignores casts from other players and non-consumable abilities", () => {
    const events = [
      LOW_MANA_SAMPLE,
      aConsumableCastEvent(1000, MANA_POTION_ID, 99), // different source
      aCastEvent({ timestamp: 2000, sourceID: DRUID_ID, abilityGameID: 33763 }), // Lifebloom
    ];
    const result = computeConsumableThroughput(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      120_000,
    );
    expect(result.rows.every((row) => row.used === 0)).toBe(true);
  });
});
