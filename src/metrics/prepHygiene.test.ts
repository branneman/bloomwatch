import { describe, expect, it } from "vitest";
import {
  computePrepHygiene,
  computeEnchantCoverage,
  computeGemCoverage,
  SUPERIOR_WIZARD_OIL_ENCHANT_ID,
  MAIN_HAND_GEAR_INDEX,
  ENCHANTABLE_SLOT_INDEXES,
  type EnchantableSlot,
  GLYPH_OF_RENEWAL_ID,
  GREATER_INSCRIPTION_OF_FAITH_ID,
  INSCRIPTION_OF_FAITH_ID,
  ENCHANT_CLOAK_SUBTLETY_ID,
  ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID,
  CHEST_MAJOR_SPIRIT_ID,
  CHEST_EXCEPTIONAL_STATS_ID,
  ENCHANT_BRACER_SUPERIOR_HEALING_ID,
  ENCHANT_BRACER_HEALING_POWER_ID,
  ENCHANT_GLOVES_MAJOR_HEALING_ID,
  GOLDEN_SPELLTHREAD_ID,
  SILVER_SPELLTHREAD_ID,
  ENCHANT_BOOTS_BOARS_SPEED_ID,
  ENCHANT_WEAPON_MAJOR_HEALING_ID,
  ENCHANT_WEAPON_HEALING_POWER_ID,
  TEARDROP_LIVING_RUBY_ID,
  BRACING_EARTHSTORM_DIAMOND_ID,
  INSIGHTFUL_EARTHSTORM_DIAMOND_ID,
} from "./prepHygiene";
import { aCombatantInfoEvent } from "../testUtils/factories";

// Test-local lookup maps built from Task 1's real researched constants
// (docs/specs/602-enchant-gem-check-design.md's "ID compilation" section) —
// one bis id per slot, plus acceptable ids only where a real one was
// confirmed (Head, Hands, and Feet have no acceptable-tier alternative in
// the real data; see the per-slot comments in prepHygiene.ts).
const BIS_ID_BY_SLOT: Record<EnchantableSlot, number> = {
  Head: GLYPH_OF_RENEWAL_ID,
  Shoulder: GREATER_INSCRIPTION_OF_FAITH_ID,
  Back: ENCHANT_CLOAK_SUBTLETY_ID,
  Chest: CHEST_MAJOR_SPIRIT_ID,
  Wrist: ENCHANT_BRACER_SUPERIOR_HEALING_ID,
  Hands: ENCHANT_GLOVES_MAJOR_HEALING_ID,
  Legs: GOLDEN_SPELLTHREAD_ID,
  Feet: ENCHANT_BOOTS_BOARS_SPEED_ID,
  MainHand: ENCHANT_WEAPON_MAJOR_HEALING_ID,
};

const ACCEPTABLE_ID_BY_SLOT: Partial<Record<EnchantableSlot, number>> = {
  Shoulder: INSCRIPTION_OF_FAITH_ID,
  Back: ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID,
  Chest: CHEST_EXCEPTIONAL_STATS_ID,
  Wrist: ENCHANT_BRACER_HEALING_POWER_ID,
  Legs: SILVER_SPELLTHREAD_ID,
  MainHand: ENCHANT_WEAPON_HEALING_POWER_ID,
};

// The real research (Task 1) found exactly one bis-tier colored gem and no
// legitimate acceptable-tier alternative (a candidate hybrid gem's item id
// couldn't be confidently resolved — documented gap, see prepHygiene.ts's
// COLOR_GEM_IDS comment). Both meta gem candidates found are "bis" (a
// player-preference choice, not a bis/acceptable rung — design judgement
// call 5), so there's no acceptable-tier meta id either.
const BIS_COLOR_GEM_ID = TEARDROP_LIVING_RUBY_ID;
const BIS_META_GEM_ID = BRACING_EARTHSTORM_DIAMOND_ID;

interface TestGearEntry {
  temporaryEnchant?: number;
  permanentEnchant?: number;
  gems?: { id: number }[];
}

function gearWithEnchants(
  entries: Partial<Record<number, number>>, // slot index -> permanentEnchant id
) {
  const gear: TestGearEntry[] = Array.from({ length: 19 }, () => ({}));
  for (const [index, id] of Object.entries(entries)) {
    gear[Number(index)] = { permanentEnchant: id };
  }
  return gear;
}

function fullyBisGear() {
  const entries: Record<number, number> = {};
  for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES)) {
    entries[index] = BIS_ID_BY_SLOT[slot as EnchantableSlot];
  }
  return gearWithEnchants(entries);
}

describe("computePrepHygiene", () => {
  it("is fully good when both healer elixirs, food, oil, enchants, and gems are present", () => {
    // Extends the factory's default (flask/elixir/food/oil auras already
    // fully prepped) with a fully-bis-enchanted, fully-gemmed gear array —
    // Task 4 will later make this the factory's own default; until then
    // this test builds it explicitly so it stays a real "happy path" case.
    const gear = fullyBisGear();
    gear[MAIN_HAND_GEAR_INDEX] = {
      ...gear[MAIN_HAND_GEAR_INDEX],
      temporaryEnchant: SUPERIOR_WIZARD_OIL_ENCHANT_ID,
    };
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = {
      ...gear[ENCHANTABLE_SLOT_INDEXES.Head],
      gems: [{ id: BIS_META_GEM_ID }],
    };
    gear[ENCHANTABLE_SLOT_INDEXES.Chest] = {
      ...gear[ENCHANTABLE_SLOT_INDEXES.Chest],
      gems: [{ id: BIS_COLOR_GEM_ID }],
    };

    const result = computePrepHygiene([aCombatantInfoEvent({ gear })], 2);
    expect(result).toEqual({
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: true,
        hasGuardianElixir: true,
        judgement: "good",
      },
      foodBuffPresent: true,
      weaponOilPresent: true,
      enchantCoverage: {
        missingSlots: [],
        acceptableSlots: [],
        judgement: "good",
      },
      gemCoverage: {
        missingOrWrongCount: 0,
        acceptableCount: 0,
        metaGemRecognized: true,
        metaGemTier: "bis",
        judgement: "good",
      },
      judgement: "good",
    });
  });

  it("is good on the flask/elixir row when a recognized flask is present alone", () => {
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 28588,
              stacks: 1,
              icon: "x.jpg",
              name: "Flask of Mighty Restoration",
            },
          ],
        }),
      ],
      2,
    );
    expect(result.flaskOrElixir).toEqual({
      hasFlask: true,
      hasBattleElixir: false,
      hasGuardianElixir: false,
      judgement: "good",
    });
  });

  it("recognizes the Shattrath flask variant and Flask of Distilled Wisdom by their real buff names", () => {
    const shattrath = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 41610,
              stacks: 1,
              icon: "x.jpg",
              name: "Mighty Restoration of Shattrath",
            },
          ],
        }),
      ],
      2,
    );
    expect(shattrath.flaskOrElixir.hasFlask).toBe(true);

    const distilledWisdom = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 17627,
              stacks: 1,
              icon: "x.jpg",
              name: "Distilled Wisdom",
            },
          ],
        }),
      ],
      2,
    );
    expect(distilledWisdom.flaskOrElixir.hasFlask).toBe(true);
  });

  it("is fair on the flask/elixir row with only one elixir and no flask", () => {
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 28491,
              stacks: 1,
              icon: "x.jpg",
              name: "Healing Power",
            },
          ],
        }),
      ],
      2,
    );
    expect(result.flaskOrElixir.judgement).toBe("fair");
  });

  it("is bad on the flask/elixir row with neither an elixir nor a flask", () => {
    const result = computePrepHygiene([aCombatantInfoEvent({ auras: [] })], 2);
    expect(result.flaskOrElixir.judgement).toBe("bad");
  });

  it("does not count an unrecognized elixir (wrong stats for a healer) as coverage", () => {
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 33082,
              stacks: 1,
              icon: "x.jpg",
              name: "Strength",
            },
          ],
        }),
      ],
      2,
    );
    expect(result.flaskOrElixir).toEqual({
      hasFlask: false,
      hasBattleElixir: false,
      hasGuardianElixir: false,
      judgement: "bad",
    });
  });

  it("reports food missing when there is no Well Fed aura, reading fair since the flask/elixir and oil checks are still fine", () => {
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 39627,
              stacks: 1,
              icon: "x.jpg",
              name: "Elixir of Draenic Wisdom",
            },
          ],
        }),
      ],
      2,
    );
    expect(result.foodBuffPresent).toBe(false);
    expect(result.flaskOrElixir.judgement).toBe("fair");
    // gear isn't overridden here, so the factory's default main-hand
    // temporary enchant keeps weaponOilPresent true ("good") — the mix
    // includes a bad (food, enchant coverage) and a good (oil), which
    // mixedJudgement reads as "fair" rather than the strict worst-of "bad".
    expect(result.weaponOilPresent).toBe(true);
    expect(result.judgement).toBe("fair");
  });

  it("reads bad overall when food and oil are both missing and the flask/elixir row is only fair (no good sibling to mix in)", () => {
    const gear = Array.from({ length: 16 }, () => ({}));
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 39627,
              stacks: 1,
              icon: "x.jpg",
              name: "Elixir of Draenic Wisdom",
            },
          ],
          gear,
        }),
      ],
      2,
    );
    expect(result.flaskOrElixir.judgement).toBe("fair");
    expect(result.foodBuffPresent).toBe(false);
    expect(result.weaponOilPresent).toBe(false);
    expect(result.judgement).toBe("bad");
  });

  it("reads fair overall when the flask/elixir row and food are good but weapon oil is missing", () => {
    const gear = Array.from({ length: 16 }, () => ({}));
    const result = computePrepHygiene(
      [
        aCombatantInfoEvent({
          auras: [
            {
              source: 2,
              ability: 28588,
              stacks: 1,
              icon: "x.jpg",
              name: "Flask of Mighty Restoration",
            },
            {
              source: 2,
              ability: 33268,
              stacks: 1,
              icon: "spell_misc_food.jpg",
              name: "Well Fed",
            },
          ],
          gear,
        }),
      ],
      2,
    );
    expect(result.flaskOrElixir.judgement).toBe("good");
    expect(result.foodBuffPresent).toBe(true);
    expect(result.weaponOilPresent).toBe(false);
    // A good sibling (flask/elixir, food) mixed with a bad one (oil,
    // enchant coverage) reads "fair" via mixedJudgement, not the strict
    // worst-of "bad".
    expect(result.judgement).toBe("fair");
  });

  it("reports weapon oil missing when the main-hand slot has no temporary enchant", () => {
    const gear = Array.from({ length: 16 }, () => ({}));
    const result = computePrepHygiene([aCombatantInfoEvent({ gear })], 2);
    expect(result.weaponOilPresent).toBe(false);
  });

  it("does not recognize a different temporary enchant as Superior Wizard Oil", () => {
    const gear = Array.from({ length: 16 }, () => ({}));
    gear[MAIN_HAND_GEAR_INDEX] = { temporaryEnchant: 2628 };
    const result = computePrepHygiene([aCombatantInfoEvent({ gear })], 2);
    expect(result.weaponOilPresent).toBe(false);
  });

  it("exports the confirmed Superior Wizard Oil enchant id", () => {
    expect(SUPERIOR_WIZARD_OIL_ENCHANT_ID).toBe(2678);
  });

  it("degrades to all-bad when no combatant-info event exists for the druid", () => {
    const result = computePrepHygiene([], 2);
    expect(result).toEqual({
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "bad",
      },
      foodBuffPresent: false,
      weaponOilPresent: false,
      enchantCoverage: {
        missingSlots: [
          "Head",
          "Shoulder",
          "Back",
          "Chest",
          "Wrist",
          "Hands",
          "Legs",
          "Feet",
          "MainHand",
        ],
        acceptableSlots: [],
        judgement: "bad",
      },
      gemCoverage: {
        missingOrWrongCount: 1,
        acceptableCount: 0,
        metaGemRecognized: false,
        metaGemTier: null,
        judgement: "fair",
      },
      judgement: "bad",
    });
  });
});

describe("computeEnchantCoverage", () => {
  it("reads good with 0 missing slots when every slot has a bis enchant", () => {
    const result = computeEnchantCoverage(fullyBisGear());
    expect(result.missingSlots).toEqual([]);
    expect(result.judgement).toBe("good");
  });

  it("still reads good when every slot is on the acceptable tier, not bis", () => {
    // The exact case that prompted the tiered design (Aldor Honored vs
    // Exalted) — an all-acceptable druid must not be judged worse than an
    // all-bis one. Head/Hands/Feet have no real acceptable-tier id, so
    // those three fall back to bis (documented gap, see prepHygiene.ts).
    const entries: Record<number, number> = {};
    for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES)) {
      entries[index] =
        ACCEPTABLE_ID_BY_SLOT[slot as EnchantableSlot] ??
        BIS_ID_BY_SLOT[slot as EnchantableSlot];
    }
    const result = computeEnchantCoverage(gearWithEnchants(entries));
    expect(result.missingSlots).toEqual([]);
    expect(result.acceptableSlots.length).toBeGreaterThan(0);
    expect(result.judgement).toBe("good");
  });

  it("counts an unrecognized enchant id the same as no enchant at all", () => {
    const gear = fullyBisGear();
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = { permanentEnchant: 999999 }; // not in any tier
    const result = computeEnchantCoverage(gear);
    expect(result.missingSlots).toEqual(["Head"]);
  });

  it("bands: good=0, fair=1-3, bad=4+ missing slots", () => {
    const base = fullyBisGear();
    const missOne = [...base];
    missOne[ENCHANTABLE_SLOT_INDEXES.Head] = {};
    expect(computeEnchantCoverage(missOne).judgement).toBe("fair");

    const missThree = [...base];
    missThree[ENCHANTABLE_SLOT_INDEXES.Head] = {};
    missThree[ENCHANTABLE_SLOT_INDEXES.Shoulder] = {};
    missThree[ENCHANTABLE_SLOT_INDEXES.Chest] = {};
    expect(computeEnchantCoverage(missThree).judgement).toBe("fair");

    const missFour = [...missThree];
    missFour[ENCHANTABLE_SLOT_INDEXES.Legs] = {};
    expect(computeEnchantCoverage(missFour).judgement).toBe("bad");
  });

  it("checks MainHand's permanent enchant independently of the existing temporary weapon-oil check", () => {
    const gear = fullyBisGear();
    // Right weapon oil, but no permanent enchant on the same slot.
    gear[MAIN_HAND_GEAR_INDEX] = { temporaryEnchant: 2678 };
    const result = computeEnchantCoverage(gear);
    expect(result.missingSlots).toContain("MainHand");
  });
});

describe("computeGemCoverage", () => {
  it("reads good with 0 wrong/missing when all present gems and the meta are recognized", () => {
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = { gems: [{ id: BIS_META_GEM_ID }] };
    gear[ENCHANTABLE_SLOT_INDEXES.Chest] = { gems: [{ id: BIS_COLOR_GEM_ID }] };
    const result = computeGemCoverage(gear);
    expect(result.missingOrWrongCount).toBe(0);
    expect(result.acceptableCount).toBe(0);
    expect(result.metaGemRecognized).toBe(true);
    expect(result.metaGemTier).toBe("bis");
    expect(result.judgement).toBe("good");
  });

  it("recognizes either confirmed meta gem id as bis (mana-vs-throughput is a legitimate player preference, not a tier rung)", () => {
    // Real research (Task 1) found no acceptable-tier colored or meta gem
    // at all — the one candidate acceptable-tier colored gem's item id
    // couldn't be confidently resolved, and both confirmed meta candidates
    // are "bis" by design (judgement call 5), not one bis + one acceptable.
    // So unlike computeEnchantCoverage's acceptable-tier test above, there's
    // no real id to exercise the gem "acceptable" branch against yet — this
    // instead confirms both real bis meta ids are recognized independently.
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = {
      gems: [{ id: INSIGHTFUL_EARTHSTORM_DIAMOND_ID }],
    };
    const result = computeGemCoverage(gear);
    expect(result.metaGemRecognized).toBe(true);
    expect(result.metaGemTier).toBe("bis");
    expect(result.acceptableCount).toBe(0);
    expect(result.judgement).toBe("good");
  });

  it("treats a Head slot with no gems at all as meta-not-recognized (documented limitation)", () => {
    // Can't distinguish "no meta socket on this item" from "empty/wrong meta socket" —
    // see docs/specs/602-enchant-gem-check-design.md judgement call 5.
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    const result = computeGemCoverage(gear);
    expect(result.metaGemRecognized).toBe(false);
    expect(result.missingOrWrongCount).toBeGreaterThanOrEqual(1);
  });

  it("bands: good=0, fair=1-2, bad=3+ missing-or-wrong", () => {
    const gearWithWrongGems = (count: number) => {
      const gear = Array.from(
        { length: 19 },
        () => ({}) as { gems?: { id: number }[] },
      );
      gear[ENCHANTABLE_SLOT_INDEXES.Head] = { gems: [{ id: BIS_META_GEM_ID }] };
      for (let i = 0; i < count; i++) {
        gear[
          i === 0
            ? ENCHANTABLE_SLOT_INDEXES.Chest
            : ENCHANTABLE_SLOT_INDEXES.Legs + i
        ] = {
          gems: [{ id: 999999 }],
        };
      }
      return gear;
    };
    expect(computeGemCoverage(gearWithWrongGems(1)).judgement).toBe("fair");
    expect(computeGemCoverage(gearWithWrongGems(2)).judgement).toBe("fair");
    expect(computeGemCoverage(gearWithWrongGems(3)).judgement).toBe("bad");
  });
});

describe("computePrepHygiene — enchant/gem integration", () => {
  it("folds a bad enchantCoverage row into the overall judgement", () => {
    const combatant = aCombatantInfoEvent({ gear: [] }); // every slot missing -> bad
    const result = computePrepHygiene([combatant], 2);
    expect(result.enchantCoverage.judgement).toBe("bad");
    expect(result.judgement).not.toBe("good");
  });
});
