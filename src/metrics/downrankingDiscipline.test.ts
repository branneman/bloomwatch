import { describe, expect, it } from "vitest";
import { computeDownrankingDiscipline } from "./downrankingDiscipline";
import { aCastEvent, aHealEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { WclEvent } from "../wcl/events";

const DRUID_ID = 2;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
  [26982, { kind: "spell", spell: "Rejuvenation", rank: 13 }],
  [9750, { kind: "spell", spell: "Regrowth", rank: 6 }],
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
  [26979, { kind: "spell", spell: "Healing Touch", rank: 13 }],
  [29339, { kind: "spell", spell: "Healing Touch", rank: null }],
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
]);

describe("computeDownrankingDiscipline", () => {
  it("returns an empty breakdown and good judgement with no events", () => {
    const result = computeDownrankingDiscipline(
      [],
      [],
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result).toEqual({
      breakdown: [],
      flaggedCount: 0,
      judgement: "good",
    });
  });

  it("groups casts by spell and rank, computing cast count, avg effective heal, and direct overheal %", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 2000, targetID: 51, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1500,
        overheal: 500,
      }),
      aHealEvent({
        timestamp: 2002,
        targetID: 51,
        abilityGameID: 26980,
        amount: 2100,
        overheal: 900,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([
      {
        spell: "Regrowth",
        rank: 10,
        isMaxRank: true,
        castCount: 2,
        avgEffectiveHeal: 1800,
        directOverhealPct: 28,
        flagged: false,
      },
    ]);
  });

  it("matches a cast to its direct heal event, ignoring periodic tick heals sharing the same ability ID", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1002,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1200,
        overheal: 300,
      }),
      aHealEvent({
        timestamp: 4000,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 0,
        tick: true,
      }),
      aHealEvent({
        timestamp: 7000,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 0,
        tick: true,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([
      {
        spell: "Regrowth",
        rank: 10,
        isMaxRank: true,
        castCount: 1,
        avgEffectiveHeal: 1200,
        directOverhealPct: 20,
        flagged: false,
      },
    ]);
  });

  it("skips a cast with no matching heal event within the tolerance window", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      // Lands 51ms after the cast — outside the 50ms tolerance.
      aHealEvent({
        timestamp: 1051,
        targetID: 50,
        abilityGameID: 26980,
        amount: 1200,
        overheal: 0,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([]);
  });

  it("flags a max-rank Regrowth group when direct overheal exceeds 50%", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 600,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      flagged: true,
      directOverhealPct: 60,
    });
    expect(result.flaggedCount).toBe(1);
    expect(result.judgement).toBe("fair");
  });

  it("does not flag a max-rank group at exactly 50% overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 500,
        overheal: 500,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0].flagged).toBe(false);
  });

  it("does not flag a non-max-rank group even with high overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 9750 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 9750,
        amount: 200,
        overheal: 800,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      isMaxRank: false,
      flagged: false,
    });
  });

  it("never flags Rejuvenation even at max rank with high overheal", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26982 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 4000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 90,
        tick: true,
      }),
      aHealEvent({
        timestamp: 7000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 90,
        tick: true,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      spell: "Rejuvenation",
      isMaxRank: true,
      directOverhealPct: 90,
      flagged: false,
    });
    expect(result.flaggedCount).toBe(0);
    expect(result.judgement).toBe("good");
  });

  it("sums Rejuvenation's periodic ticks per cast, capping the window at the next cast on the same target", () => {
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      // Refreshed early, at 6000ms — stops the first application's ticking.
      aCastEvent({ timestamp: 6000, targetID: 50, abilityGameID: 26982 }),
    ];
    const healingEvents = [
      // Tick from the first application.
      aHealEvent({
        timestamp: 3000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
      // A tick landing after the refresh belongs to the second cast, not
      // the first — without window capping this would double-count into
      // the first cast's uncapped 12s window too.
      aHealEvent({
        timestamp: 9000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([
      {
        spell: "Rejuvenation",
        rank: 13,
        isMaxRank: true,
        castCount: 2,
        avgEffectiveHeal: 100,
        directOverhealPct: 0,
        flagged: false,
      },
    ]);
  });

  it("sums all natural-expiry ticks for an un-refreshed Rejuvenation, including the one landing at the full duration boundary", () => {
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 3000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 0,
        tick: true,
      }),
      aHealEvent({
        timestamp: 6000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 0,
        tick: true,
      }),
      aHealEvent({
        timestamp: 9000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 0,
        tick: true,
      }),
      // Lands exactly at REJUVENATION_DURATION_MS (12000ms) — the natural
      // expiry tick, which a strict < windowEnd check would drop.
      aHealEvent({
        timestamp: 12000,
        targetID: 50,
        abilityGameID: 26982,
        amount: 10,
        overheal: 0,
        tick: true,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      spell: "Rejuvenation",
      castCount: 1,
      avgEffectiveHeal: 40,
    });
  });

  it("skips a Rejuvenation cast with no ticks observed in its window", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26982 }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      [],
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([]);
  });

  it("groups casts with an unresolved rank separately and never flags them", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 29339 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 29339,
        amount: 100,
        overheal: 900,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown[0]).toMatchObject({
      spell: "Healing Touch",
      rank: null,
      isMaxRank: false,
      flagged: false,
    });
  });

  it("ignores casts from other sources and untracked spells", () => {
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        targetID: 50,
        abilityGameID: 26980,
        sourceID: 99,
      }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 33763 }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      [],
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown).toEqual([]);
  });

  it("sorts the breakdown by spell (Rejuvenation, Regrowth, Healing Touch), then rank high to low, unresolved rank last", () => {
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 9750 }),
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 26979 }),
      aCastEvent({ timestamp: 3000, targetID: 50, abilityGameID: 3627 }),
      aCastEvent({ timestamp: 4000, targetID: 50, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 5000, targetID: 50, abilityGameID: 29339 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 9750,
        amount: 100,
        overheal: 0,
      }),
      aHealEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26979,
        amount: 100,
        overheal: 0,
      }),
      // Rejuvenation is a pure HoT — its only heal events are periodic
      // ticks, so this must carry tick: true to be picked up at all.
      aHealEvent({
        timestamp: 6000,
        targetID: 50,
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
      aHealEvent({
        timestamp: 4001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 100,
        overheal: 0,
      }),
      aHealEvent({
        timestamp: 5001,
        targetID: 50,
        abilityGameID: 29339,
        amount: 100,
        overheal: 0,
      }),
    ];

    const result = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.breakdown.map((row) => `${row.spell}:${row.rank}`)).toEqual([
      "Rejuvenation:6",
      "Regrowth:10",
      "Regrowth:6",
      "Healing Touch:13",
      "Healing Touch:null",
    ]);
  });

  it.each([
    { flaggedGroups: 0, expected: "good" },
    { flaggedGroups: 1, expected: "fair" },
    { flaggedGroups: 2, expected: "fair" },
  ])(
    "judges $expected with $flaggedGroups flagged group(s)",
    ({ flaggedGroups, expected }) => {
      const abilityIds = [26980, 26979];
      const castEvents: WclEvent[] = [];
      const healingEvents: WclEvent[] = [];

      for (let i = 0; i < flaggedGroups; i++) {
        const abilityGameID = abilityIds[i];
        castEvents.push(
          aCastEvent({ timestamp: i * 1000, targetID: 50, abilityGameID }),
        );
        healingEvents.push(
          aHealEvent({
            timestamp: i * 1000 + 1,
            targetID: 50,
            abilityGameID,
            amount: 100,
            overheal: 900,
          }),
        );
      }

      const result = computeDownrankingDiscipline(
        castEvents,
        healingEvents,
        DRUID_ID,
        RESOLVED_ABILITIES,
      );

      expect(result.judgement).toBe(expected);
    },
  );
});
