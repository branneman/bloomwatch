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
});
