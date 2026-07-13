import type {
  Fight,
  ReportFights,
  CastTableEntry,
  ReportAbility,
} from "../wcl/client";
import type { WclEvent } from "../wcl/events";

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

export function aReportAbility(
  overrides: Partial<ReportAbility> = {},
): ReportAbility {
  return {
    gameID: 26982,
    name: "Rejuvenation",
    icon: "spell_nature_rejuvenation.jpg",
    type: "8",
    ...overrides,
  };
}

export function aCastEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1880311,
    type: "cast",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aBegincastEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1942970,
    type: "begincast",
    sourceID: 2,
    targetID: -1,
    abilityGameID: 26980,
    fight: 6,
    ...overrides,
  };
}

export function anApplyBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1880312,
    type: "applybuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function anApplyBuffStackEvent(
  overrides: Partial<WclEvent> = {},
): WclEvent {
  return {
    timestamp: 1881811,
    type: "applybuffstack",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    stack: 2,
    fight: 6,
    ...overrides,
  };
}

export function aRefreshBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1881811,
    type: "refreshbuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aRemoveBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1903349,
    type: "removebuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aHealEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1903349,
    type: "heal",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aDeathEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1926404,
    type: "death",
    sourceID: -1,
    targetID: 37,
    abilityGameID: 0,
    fight: 6,
    killerID: 56,
    killingAbilityGameID: 1,
    ...overrides,
  };
}
