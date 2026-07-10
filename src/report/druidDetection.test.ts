import { describe, expect, it } from "vitest";
import {
  detectDruids,
  MIN_HEALING_CASTS_FOR_DETECTION,
} from "./druidDetection";
import { aCastTableEntry } from "../testUtils/factories";

describe("detectDruids", () => {
  it("includes a druid with healing casts above the threshold", () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const result = detectDruids([dassz]);
    expect(result).toEqual([
      { id: 2, name: "Dassz", healingCastCount: 57, isRestoSpec: true },
    ]);
  });

  it("excludes non-druid actors regardless of casts", () => {
    const paladin = aCastTableEntry({
      id: 42,
      name: "Fanah",
      type: "Paladin",
      icon: "Paladin-Holy",
      abilities: [{ name: "Holy Light", total: 100 }],
    });
    expect(detectDruids([paladin])).toEqual([]);
  });

  it("excludes a druid labeled Restoration with zero healing casts", () => {
    const mislabeled = aCastTableEntry({
      id: 19,
      name: "Barrychuckle",
      icon: "Druid-Restoration",
      abilities: [
        { name: "Shred", total: 11 },
        { name: "Claw", total: 9 },
        { name: "Rip", total: 4 },
      ],
    });
    expect(detectDruids([mislabeled])).toEqual([]);
  });

  it("includes a druid with an ambiguous spec label but real healing casts", () => {
    const ambiguous = aCastTableEntry({
      id: 4,
      name: "Maoqi",
      icon: "Druid",
      abilities: [
        { name: "Starfire", total: 300 },
        { name: "Lifebloom", total: 40 },
      ],
    });
    expect(detectDruids([ambiguous])).toEqual([
      { id: 4, name: "Maoqi", healingCastCount: 40, isRestoSpec: false },
    ]);
  });

  it(`excludes a druid with fewer than ${MIN_HEALING_CASTS_FOR_DETECTION} healing casts`, () => {
    const stray = aCastTableEntry({
      id: 7,
      name: "Coggersblast",
      icon: "Druid",
      abilities: [
        { name: "Starfire", total: 200 },
        { name: "Healing Touch", total: MIN_HEALING_CASTS_FOR_DETECTION - 1 },
      ],
    });
    expect(detectDruids([stray])).toEqual([]);
  });

  it(`includes a druid with exactly ${MIN_HEALING_CASTS_FOR_DETECTION} healing casts`, () => {
    const borderline = aCastTableEntry({
      id: 8,
      name: "Zeyam",
      icon: "Druid",
      abilities: [
        { name: "Rejuvenation", total: MIN_HEALING_CASTS_FOR_DETECTION },
      ],
    });
    expect(detectDruids([borderline])).toHaveLength(1);
  });

  it("sorts Restoration-labeled candidates before others, then by healing cast count", () => {
    const ambiguousHighCasts = aCastTableEntry({
      id: 4,
      name: "Maoqi",
      icon: "Druid",
      abilities: [{ name: "Lifebloom", total: 500 }],
    });
    const restoLowCasts = aCastTableEntry({
      id: 2,
      name: "Dassz",
      icon: "Druid-Restoration",
      abilities: [{ name: "Lifebloom", total: 10 }],
    });
    const result = detectDruids([ambiguousHighCasts, restoLowCasts]);
    expect(result.map((c) => c.name)).toEqual(["Dassz", "Maoqi"]);
  });
});
