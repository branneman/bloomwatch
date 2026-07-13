import type { WclEvent } from "../wcl/events";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";

// TBC: Nature's Swiftness has a 3-minute cooldown.
const NATURES_SWIFTNESS_COOLDOWN_MS = 180_000;

export interface NaturesSwiftnessFollowUp {
  spell: DruidHealingSpell;
  rank: number | null;
  targetId: number | undefined;
}

export interface NaturesSwiftnessCast {
  timestampMs: number;
  followUp: NaturesSwiftnessFollowUp | null;
}

export interface NaturesSwiftnessAuditResult {
  casts: NaturesSwiftnessCast[];
  castCount: number;
  availableWindows: number;
}

// Scans the druid's own casts (already sorted) for the first one after
// `afterTimestamp` that resolves to a tracked healing spell other than NS
// itself — skipping consumables (mana potions, runes) or anything
// unresolved along the way, since the NS buff is only consumed by an
// actual spell cast, not an item use, per docs/specs' design decision.
function findFollowUp(
  sortedDruidCasts: WclEvent[],
  resolvedAbilities: Map<number, ResolvedAbility>,
  naturesSwiftnessAbilityIds: Set<number>,
  afterTimestamp: number,
): NaturesSwiftnessFollowUp | null {
  for (const event of sortedDruidCasts) {
    if (event.timestamp <= afterTimestamp) continue;
    const abilityGameID = event.abilityGameID;
    if (abilityGameID === undefined) continue;
    if (naturesSwiftnessAbilityIds.has(abilityGameID)) continue;

    const resolved = resolvedAbilities.get(abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;

    return {
      spell: resolved.spell,
      rank: resolved.rank,
      targetId: event.targetID,
    };
  }
  return null;
}

export function computeNaturesSwiftnessAudit(
  castEvents: WclEvent[],
  druidId: number,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fightDurationMs: number,
): NaturesSwiftnessAuditResult {
  const druidCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const nsCasts = druidCasts.filter((event) =>
    naturesSwiftnessAbilityIds.has(event.abilityGameID as number),
  );

  const casts: NaturesSwiftnessCast[] = nsCasts.map((nsCast) => ({
    timestampMs: nsCast.timestamp,
    followUp: findFollowUp(
      druidCasts,
      resolvedAbilities,
      naturesSwiftnessAbilityIds,
      nsCast.timestamp,
    ),
  }));

  return {
    casts,
    castCount: casts.length,
    availableWindows: Math.floor(
      fightDurationMs / NATURES_SWIFTNESS_COOLDOWN_MS,
    ),
  };
}
