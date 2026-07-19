import type {
  Fight,
  ReportFights,
  CastTableEntry,
  ReportAbility,
} from "../wcl/client";
import type { WclEvent } from "../wcl/events";
import type { RateLimitUsage } from "../wcl/rateLimitUsage";

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
    expansionId: 1001,
    archiveStatus: { isArchived: false, isAccessible: true },
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
      { name: "Lifebloom", total: 33, guid: 33763 },
      { name: "Rejuvenation", total: 16, guid: 774 },
      { name: "Regrowth", total: 6, guid: 8936 },
      { name: "Swiftmend", total: 2, guid: 18562 },
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
    ...overrides,
  };
}

export function aRateLimitUsage(
  overrides: Partial<RateLimitUsage> = {},
): RateLimitUsage {
  return {
    limitPerHour: 3600,
    pointsSpentThisHour: 1000,
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

// A druid's combatant-info snapshot at fight start. Field shapes are taken
// directly from a live capture (report 4GYHZRdtL3bvhpc8, fight 6) — see
// docs/testing.md. Defaults to a fully prepped druid: both healer-realistic
// elixirs (no flask), food, and the confirmed weapon-oil enchant id all
// present.
export function aCombatantInfoEvent(
  overrides: Partial<WclEvent> = {},
): WclEvent {
  return {
    timestamp: 0,
    type: "combatantinfo",
    sourceID: 2,
    fight: 6,
    auras: [
      {
        source: 2,
        ability: 39627,
        stacks: 1,
        icon: "inv_potion_155.jpg",
        name: "Elixir of Draenic Wisdom",
      },
      {
        source: 2,
        ability: 28491,
        stacks: 1,
        icon: "inv_potion_142.jpg",
        name: "Healing Power",
      },
      {
        source: 2,
        ability: 33268,
        stacks: 1,
        icon: "spell_misc_food.jpg",
        name: "Well Fed",
      },
    ],
    gear: [
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      { temporaryEnchant: 2678 },
    ],
    ...overrides,
  };
}
