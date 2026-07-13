import { describe, expect, it } from "vitest";
import {
  resolveAbilities,
  resolveSpellAbilityIds,
  getMaxRank,
} from "./resolveAbilities";
import { aReportAbility } from "../testUtils/factories";

describe("resolveAbilities", () => {
  it("resolves a known spell rank by gameID", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(result.get(26982)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 13,
    });
  });

  it("collapses multiple ranks of one spell to the same logical spell name", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 3627, name: "Rejuvenation" }),
      aReportAbility({ gameID: 9839, name: "Rejuvenation" }),
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(result.get(3627)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 6,
    });
    expect(result.get(9839)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 8,
    });
    expect(result.get(26982)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 13,
    });
  });

  it("resolves a target spell name whose gameID has no known rank to rank: null", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 38657, name: "Rejuvenation" }),
    ]);
    expect(result.get(38657)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: null,
    });
  });

  it("resolves a rune by name and gameID", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 27869,
        name: "Dark Rune",
        icon: "inv_misc_rune_04.jpg",
        type: "32",
      }),
    ]);
    expect(result.get(27869)).toEqual({
      kind: "consumable",
      item: "Dark Rune",
    });
  });

  it("resolves a known mana potion gameID as a consumable despite its generic WCL name", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 28499,
        name: "Restore Mana",
        icon: "inv_potion_137.jpg",
        type: "1",
      }),
    ]);
    expect(result.get(28499)).toEqual({
      kind: "consumable",
      item: "Mana Potion",
    });
  });

  it("does not resolve an unlisted gameID sharing the generic 'Restore Mana' name", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 99999,
        name: "Restore Mana",
        icon: "some_other_icon.jpg",
        type: "1",
      }),
    ]);
    expect(result.has(99999)).toBe(false);
  });

  it("does not resolve an ability irrelevant to druid healing", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 12345,
        name: "Mortal Strike",
        icon: "ability_warrior_savageblow.jpg",
        type: "1",
      }),
    ]);
    expect(result.has(12345)).toBe(false);
  });
});

describe("resolveSpellAbilityIds", () => {
  it("returns every gameID resolved to the given spell, including rank: null fallbacks", () => {
    const resolved = resolveAbilities([
      aReportAbility({ gameID: 33763, name: "Lifebloom" }),
      aReportAbility({ gameID: 33778, name: "Lifebloom" }),
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(resolveSpellAbilityIds(resolved, "Lifebloom")).toEqual(
      new Set([33763, 33778]),
    );
  });

  it("returns an empty set when the spell has no resolved abilities", () => {
    const resolved = resolveAbilities([
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(resolveSpellAbilityIds(resolved, "Lifebloom")).toEqual(new Set());
  });
});

describe("getMaxRank", () => {
  it("returns the highest known rank for a multi-rank spell", () => {
    expect(getMaxRank("Rejuvenation")).toBe(13);
    expect(getMaxRank("Regrowth")).toBe(10);
    expect(getMaxRank("Healing Touch")).toBe(13);
  });

  it("returns the single rank for a one-rank spell", () => {
    expect(getMaxRank("Swiftmend")).toBe(1);
    expect(getMaxRank("Nature's Swiftness")).toBe(1);
  });
});
