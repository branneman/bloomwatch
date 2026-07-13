import { describe, expect, it } from "vitest";
import {
  computePrepHygiene,
  SUPERIOR_WIZARD_OIL_ENCHANT_ID,
  MAIN_HAND_GEAR_INDEX,
} from "./prepHygiene";
import { aCombatantInfoEvent } from "../testUtils/factories";

describe("computePrepHygiene", () => {
  it("is fully green when both healer elixirs, food, and oil are present", () => {
    const result = computePrepHygiene([aCombatantInfoEvent()], 2);
    expect(result).toEqual({
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: true,
        hasGuardianElixir: true,
        judgement: "green",
      },
      foodBuffPresent: true,
      weaponOilPresent: true,
      judgement: "green",
    });
  });

  it("is green on the flask/elixir row when a recognized flask is present alone", () => {
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
      judgement: "green",
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

  it("is orange on the flask/elixir row with only one elixir and no flask", () => {
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
    expect(result.flaskOrElixir.judgement).toBe("orange");
  });

  it("is red on the flask/elixir row with neither an elixir nor a flask", () => {
    const result = computePrepHygiene([aCombatantInfoEvent({ auras: [] })], 2);
    expect(result.flaskOrElixir.judgement).toBe("red");
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
      judgement: "red",
    });
  });

  it("reports food missing when there is no Well Fed aura, dragging the overall judgement to red", () => {
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
    expect(result.flaskOrElixir.judgement).toBe("orange");
    expect(result.judgement).toBe("red");
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

  it("degrades to all-red when no combatant-info event exists for the druid", () => {
    const result = computePrepHygiene([], 2);
    expect(result).toEqual({
      flaskOrElixir: {
        hasFlask: false,
        hasBattleElixir: false,
        hasGuardianElixir: false,
        judgement: "red",
      },
      foodBuffPresent: false,
      weaponOilPresent: false,
      judgement: "red",
    });
  });
});
