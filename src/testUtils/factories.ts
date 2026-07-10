import type { Fight, ReportFights, CastTableEntry } from "../wcl/client";

export function aFight(overrides: Partial<Fight> = {}): Fight {
  return {
    id: 1,
    name: "Coilfang Frenzy",
    startTime: 1477307,
    endTime: 1505939,
    encounterID: 601,
    kill: true,
    bossPercentage: null,
    gameZone: { id: 548, name: "Serpentshrine Cavern" },
    ...overrides,
  };
}

export function aReportFights(
  overrides: Partial<ReportFights> = {},
): ReportFights {
  return {
    title: "SSC+TK 2026-07-07",
    fights: [aFight()],
    ...overrides,
  };
}

export function aCastTableEntry(
  overrides: Partial<CastTableEntry> = {},
): CastTableEntry {
  return {
    id: 2,
    name: "Dassz",
    type: "Druid",
    icon: "Druid-Restoration",
    abilities: [
      { name: "Lifebloom", total: 33 },
      { name: "Rejuvenation", total: 16 },
      { name: "Regrowth", total: 6 },
      { name: "Swiftmend", total: 2 },
    ],
    ...overrides,
  };
}
