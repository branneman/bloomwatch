import { describe, expect, it } from "vitest";
import {
  computePrepHygiene,
  SUPERIOR_WIZARD_OIL_ENCHANT_ID,
  MAIN_HAND_GEAR_INDEX,
} from "./prepHygiene";
import { aCombatantInfoEvent } from "../testUtils/factories";

describe("computePrepHygiene", () => {
  it("is fully good when both healer elixirs, food, and oil are present", () => {
    const result = computePrepHygiene([aCombatantInfoEvent()], 2);
    expect(result).toEqual({
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: true,
        hasGuardianElixir: true,
        judgement: "good",
      },
      foodBuffPresent: true,
      weaponOilPresent: true,
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
    // temporary enchant keeps weaponOilPresent true ("good") — the triple
    // is fair/bad/good, a good+bad mix, so mixedJudgement reads "fair"
    // rather than the strict worst-of "bad".
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
    // A good sibling (flask/elixir, food) mixed with a bad one (oil) reads
    // "fair" via mixedJudgement, not the strict worst-of "bad".
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
      judgement: "bad",
    });
  });
});
