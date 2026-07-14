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

  it("includes a Dreamstate-labeled druid with real healing casts, judged as not Restoration-labeled", () => {
    // Real captured data: report bKRZ68XqgwYkxtzm, fight 3 (The Lurker
    // Below), Neepzendruid — WCL's own icon for a 35/0/26 Balance/Feral/
    // Restoration build is "Druid-Dreamstate", not "Druid-Restoration".
    // Zero Swiftmend casts is deliberate: Swiftmend needs 41 points deep in
    // Restoration, unreachable at 26. See docs/testing.md's known-reports
    // table.
    const neepzendruid = aCastTableEntry({
      id: 17,
      name: "Neepzendruid",
      icon: "Druid-Dreamstate",
      abilities: [
        { name: "Lifebloom", total: 784 },
        { name: "Regrowth", total: 123 },
        { name: "Rejuvenation", total: 95 },
      ],
    });
    const result = detectDruids([neepzendruid]);
    expect(result).toEqual([
      {
        id: 17,
        name: "Neepzendruid",
        healingCastCount: 1002,
        isRestoSpec: false,
      },
    ]);
  });

  it("sorts a Restoration-labeled candidate before a Dreamstate-labeled one, even with fewer casts", () => {
    const dreamstateHighCasts = aCastTableEntry({
      id: 17,
      name: "Neepzendruid",
      icon: "Druid-Dreamstate",
      abilities: [{ name: "Lifebloom", total: 784 }],
    });
    const restoLowCasts = aCastTableEntry({
      id: 2,
      name: "Dassz",
      icon: "Druid-Restoration",
      abilities: [{ name: "Lifebloom", total: 10 }],
    });
    const result = detectDruids([dreamstateHighCasts, restoLowCasts]);
    expect(result.map((c) => c.name)).toEqual(["Dassz", "Neepzendruid"]);
  });
});
