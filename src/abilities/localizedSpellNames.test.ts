import { describe, expect, it } from "vitest";
import { matchLocalizedSpellName } from "./localizedSpellNames";

describe("matchLocalizedSpellName", () => {
  it("matches every spell's English name", () => {
    expect(matchLocalizedSpellName("Lifebloom")).toBe("Lifebloom");
    expect(matchLocalizedSpellName("Rejuvenation")).toBe("Rejuvenation");
    expect(matchLocalizedSpellName("Regrowth")).toBe("Regrowth");
    expect(matchLocalizedSpellName("Healing Touch")).toBe("Healing Touch");
    expect(matchLocalizedSpellName("Swiftmend")).toBe("Swiftmend");
    expect(matchLocalizedSpellName("Nature's Swiftness")).toBe(
      "Nature's Swiftness",
    );
    expect(matchLocalizedSpellName("Tranquility")).toBe("Tranquility");
    expect(matchLocalizedSpellName("Innervate")).toBe("Innervate");
  });

  it("returns undefined for a name matching no known spell in any language", () => {
    expect(matchLocalizedSpellName("Mortal Strike")).toBeUndefined();
  });

  it("matches a non-English name for every populated language", () => {
    expect(matchLocalizedSpellName("Verjüngung")).toBe("Rejuvenation"); // deDE
    expect(matchLocalizedSpellName("Fleur de vie")).toBe("Lifebloom"); // frFR
    expect(matchLocalizedSpellName("Recrecimiento")).toBe("Regrowth"); // esES/esMX
    expect(matchLocalizedSpellName("Tocco Curativo")).toBe("Healing Touch"); // itIT
    expect(matchLocalizedSpellName("Recomposição Rápida")).toBe("Swiftmend"); // ptBR
    expect(matchLocalizedSpellName("Спокойствие")).toBe("Tranquility"); // ruRU
    expect(matchLocalizedSpellName("정신 자극")).toBe("Innervate"); // koKR
    expect(matchLocalizedSpellName("回春术")).toBe("Rejuvenation"); // zhCN
    expect(matchLocalizedSpellName("生命之花")).toBe("Lifebloom"); // zhTW
  });
});
