import type { WclEvent } from "../wcl/events";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";
import { judgeThreshold, type Judgement } from "./judgement";

// TBC: Nature's Swiftness has a 3-minute cooldown.
export const NATURES_SWIFTNESS_COOLDOWN_MS = 180_000;

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
  utilizationPct: number;
  judgement: Judgement;
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

// good >= 75% / fair 50-75% / bad < 50% of theoretical 3-minute-cooldown
// windows used, per docs/backlog.md story 304 (revised story 914, direct
// request 2026-07-20). One exception: a fight with only 1 available window
// (under 3 minutes) can only ever land on 0% or 100% utilization, and
// holding Nature's Swiftness in reserve for a real emergency that may just
// not occur is reasonable on a short fight — so 0 casts there reads fair,
// not bad.
function judgeUtilization(
  castCount: number,
  availableWindows: number,
  utilizationPct: number,
): Judgement {
  if (availableWindows === 1) {
    return castCount >= 1 ? "good" : "fair";
  }
  return judgeThreshold(utilizationPct, { goodMin: 75, fairMin: 50 });
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

  // +1: NS is available at the pull (t=0), then again every cooldown
  // period after — so a fight of any length has at least one window (and
  // this is therefore always >= 1, never 0).
  const availableWindows =
    Math.floor(fightDurationMs / NATURES_SWIFTNESS_COOLDOWN_MS) + 1;
  const utilizationPct = (casts.length / availableWindows) * 100;

  return {
    casts,
    castCount: casts.length,
    availableWindows,
    utilizationPct,
    judgement: judgeUtilization(casts.length, availableWindows, utilizationPct),
  };
}
