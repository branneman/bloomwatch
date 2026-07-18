import { describe, expect, it } from "vitest";
import { computeOverhealTable } from "./overhealTable";
import { aHealEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
  [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
]);

describe("computeOverhealTable", () => {
  it("returns no rows and a green judgement with no events", () => {
    const result = computeOverhealTable([], DRUID_ID, RESOLVED_ABILITIES);
    expect(result).toEqual({ rows: [], judgement: "green" });
  });

  it("aggregates Rejuvenation's periodic ticks into one informational hot-tick row", () => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 3627,
        amount: 300,
        overheal: 200,
        tick: true,
      }),
      aHealEvent({
        abilityGameID: 3627,
        amount: 300,
        overheal: 200,
        tick: true,
      }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "hot-tick",
        spell: "Rejuvenation",
        amount: 600,
        overheal: 400,
        overhealPct: 40,
        judgement: null,
      },
    ]);
    expect(result.judgement).toBe("green");
  });

  it("splits Regrowth into a hot-tick row (ticks) and a direct row (the non-tick heal)", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 26980, amount: 780, overheal: 220 }), // direct
      aHealEvent({
        abilityGameID: 26980,
        amount: 390,
        overheal: 610,
        tick: true,
      }), // HoT portion
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "hot-tick",
        spell: "Regrowth (HoT portion)",
        amount: 390,
        overheal: 610,
        overhealPct: 61,
        judgement: null,
      },
      {
        category: "direct",
        spell: "Regrowth (direct)",
        amount: 780,
        overheal: 220,
        overhealPct: 22,
        judgement: "green",
      },
    ]);
  });

  it("counts only Lifebloom's non-tick bloom event, ignoring its periodic ticks entirely", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }), // bloom
      aHealEvent({
        abilityGameID: 33763,
        amount: 50,
        overheal: 950,
        tick: true,
      }), // periodic tick, not reported
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "bloom",
        spell: "Lifebloom",
        amount: 670,
        overheal: 330,
        overhealPct: 33,
        judgement: "green",
      },
    ]);
  });

  it("reports Healing Touch and Swiftmend as direct rows", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 9758, amount: 420, overheal: 580 }),
      aHealEvent({ abilityGameID: 18562, amount: 810, overheal: 190 }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([
      {
        category: "direct",
        spell: "Healing Touch",
        amount: 420,
        overheal: 580,
        overhealPct: 58,
        judgement: "red",
      },
      {
        category: "direct",
        spell: "Swiftmend",
        amount: 810,
        overheal: 190,
        overhealPct: 19,
        judgement: "green",
      },
    ]);
  });

  it.each([
    { overhealPct: 79, expected: "green" },
    { overhealPct: 80, expected: "orange" },
    { overhealPct: 90, expected: "orange" },
    { overhealPct: 91, expected: "red" },
  ])(
    "judges a Bloom row at $overhealPct% overheal as $expected (recalibrated, story 905)",
    ({ overhealPct, expected }) => {
      const healingEvents = [
        aHealEvent({
          abilityGameID: 33763,
          amount: 100 - overhealPct,
          overheal: overhealPct,
        }),
      ];

      const result = computeOverhealTable(
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.rows[0].judgement).toBe(expected);
    },
  );

  it.each([
    { bucket: "deep-resto" as const, overhealPct: 37, expected: "green" },
    { bucket: "deep-resto" as const, overhealPct: 38, expected: "orange" },
    { bucket: "deep-resto" as const, overhealPct: 60, expected: "orange" },
    { bucket: "deep-resto" as const, overhealPct: 61, expected: "red" },
    {
      bucket: "likely-dreamstate-full" as const,
      overhealPct: 59,
      expected: "green",
    },
    {
      bucket: "likely-dreamstate-full" as const,
      overhealPct: 60,
      expected: "orange",
    },
    {
      bucket: "likely-dreamstate-full" as const,
      overhealPct: 85,
      expected: "orange",
    },
    {
      bucket: "likely-dreamstate-full" as const,
      overhealPct: 86,
      expected: "red",
    },
    {
      bucket: "likely-dreamstate-partial" as const,
      overhealPct: 70,
      expected: "orange",
    },
    { bucket: "mostly-resto" as const, overhealPct: 61, expected: "red" },
    {
      bucket: "unknown-no-talent-data" as const,
      overhealPct: 61,
      expected: "red",
    },
  ])(
    "judges a Regrowth-direct row for $bucket at $overhealPct% overheal as $expected (story 905)",
    ({ bucket, overhealPct, expected }) => {
      const healingEvents = [
        aHealEvent({
          abilityGameID: 26980,
          amount: 100 - overhealPct,
          overheal: overhealPct,
        }),
      ];

      const result = computeOverhealTable(
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
        bucket,
      );

      expect(result.rows[0].judgement).toBe(expected);
    },
  );

  it("defaults Regrowth-direct to the deep-resto band when no archetype bucket is passed", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 26980, amount: 39, overheal: 61 }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows[0].judgement).toBe("red");
  });

  it.each([
    { overhealPct: 29, expected: "green" },
    { overhealPct: 30, expected: "orange" },
    { overhealPct: 50, expected: "orange" },
    { overhealPct: 51, expected: "red" },
  ])(
    "judges a Direct row at $overhealPct% overheal as $expected",
    ({ overhealPct, expected }) => {
      const healingEvents = [
        aHealEvent({
          abilityGameID: 18562,
          amount: 100 - overhealPct,
          overheal: overhealPct,
        }),
      ];

      const result = computeOverhealTable(
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.rows[0].judgement).toBe(expected);
    },
  );

  it("sorts rows HoT tick, then Bloom, then Direct, regardless of input order", () => {
    const healingEvents = [
      aHealEvent({ abilityGameID: 18562, amount: 100, overheal: 0 }), // Swiftmend (direct)
      aHealEvent({ abilityGameID: 33763, amount: 100, overheal: 0 }), // Lifebloom (bloom)
      aHealEvent({
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }), // Rejuvenation (hot-tick)
      aHealEvent({ abilityGameID: 9758, amount: 100, overheal: 0 }), // Healing Touch (direct)
      aHealEvent({
        abilityGameID: 26980,
        amount: 100,
        overheal: 0,
        tick: true,
      }), // Regrowth HoT (hot-tick)
      aHealEvent({ abilityGameID: 26980, amount: 100, overheal: 0 }), // Regrowth direct (direct)
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows.map((row) => row.spell)).toEqual([
      "Rejuvenation",
      "Regrowth (HoT portion)",
      "Lifebloom",
      "Regrowth (direct)",
      "Healing Touch",
      "Swiftmend",
    ]);
  });

  it("takes the worst-of judgement across Bloom and Direct rows only, ignoring HoT-tick rows", () => {
    const healingEvents = [
      // Rejuvenation at 90% overheal — informational, must not turn this red.
      aHealEvent({
        abilityGameID: 3627,
        amount: 10,
        overheal: 90,
        tick: true,
      }),
      // Lifebloom bloom at 33% — green.
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
      // Swiftmend at 60% — red.
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.judgement).toBe("red");
  });

  it("ignores heal events from other sources and from untracked spells", () => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 26980,
        amount: 100,
        overheal: 0,
        sourceID: 99,
      }),
      aHealEvent({ abilityGameID: 17116, amount: 100, overheal: 0 }), // Nature's Swiftness has no heal of its own; treat as untracked
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows).toEqual([]);
  });
});
