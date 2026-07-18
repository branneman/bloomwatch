import type { CastTableEntry } from "../wcl/client";
import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

export const HEALING_SPELL_NAMES = [
  "Rejuvenation",
  "Regrowth",
  "Lifebloom",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
];

// A stray opportunistic cross-heal from an off-spec druid is 1-2 casts; a real
// healer casts in the hundreds even in a single fight. Validated live against
// 7 real reports — every genuine resto druid cleared this by two orders of
// magnitude, every non-healer sat at exactly 0.
export const MIN_HEALING_CASTS_FOR_DETECTION = 3;

export interface DruidCandidate {
  id: number;
  name: string;
  healingCastCount: number;
  isRestoSpec: boolean;
}

export function detectDruids(entries: CastTableEntry[]): DruidCandidate[] {
  return entries
    .filter((entry) => entry.type === "Druid")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      healingCastCount: entry.abilities
        .filter((ability) => HEALING_SPELL_NAMES.includes(ability.name))
        .reduce((sum, ability) => sum + ability.total, 0),
      isRestoSpec: entry.icon === "Druid-Restoration",
    }))
    .filter(
      (candidate) =>
        candidate.healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
    )
    .sort((a, b) => {
      if (a.isRestoSpec !== b.isRestoSpec) return a.isRestoSpec ? -1 : 1;
      return b.healingCastCount - a.healingCastCount;
    });
}

export interface HealingRoleThisFight {
  healingCastCount: number;
  isHealingThisFight: boolean;
}

export function detectHealingRoleThisFight(
  events: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): HealingRoleThisFight {
  const healingCastCount = events.filter((event) => {
    if (event.sourceID !== druidId) return false;
    if (event.type !== "cast") return false;
    if (event.abilityGameID === undefined) return false;
    const resolved = resolvedAbilities.get(event.abilityGameID);
    return (
      resolved?.kind === "spell" && HEALING_SPELL_NAMES.includes(resolved.spell)
    );
  }).length;
  return {
    healingCastCount,
    isHealingThisFight: healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
  };
}
