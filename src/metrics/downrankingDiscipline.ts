import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";
import { getMaxRank } from "../abilities/resolveAbilities";

// A Regrowth cast's direct heal event lands 0-3ms after the cast event and
// shares its abilityGameID with periodic ticks (distinguished only by
// `tick: true` on ticks) — live-validated against report
// 4GYHZRdtL3bvhpc8, fight 6 (see docs/testing.md). Healing Touch is
// assumed to behave the same way (single instant heal on cast completion,
// no ticks at all) by structural analogy — not directly observed live.
// Mirrors swiftmendAudit.ts's existing SWIFTMEND_MATCH_TOLERANCE_MS
// pattern. See docs/backlog.md story 303.
const DIRECT_HEAL_MATCH_TOLERANCE_MS = 50;

export type DownrankingSpell = "Rejuvenation" | "Regrowth" | "Healing Touch";

function isTrackedSpell(spell: DruidHealingSpell): spell is DownrankingSpell {
  return (
    spell === "Rejuvenation" ||
    spell === "Regrowth" ||
    spell === "Healing Touch"
  );
}

// Only Regrowth/Healing Touch's direct-heal overheal is a clean
// downranking signal. Rejuvenation is a pure HoT; HoT-tick overheal is too
// entangled with raid overlap and situational calls (threat management,
// mana conservation) to safely flag from logs alone. See
// docs/backlog.md story 303.
function isFlaggable(spell: DownrankingSpell): boolean {
  return spell !== "Rejuvenation";
}

const SPELL_SORT_ORDER: Record<DownrankingSpell, number> = {
  Rejuvenation: 0,
  Regrowth: 1,
  "Healing Touch": 2,
};

export interface DownrankingRankBreakdown {
  spell: DownrankingSpell;
  rank: number | null;
  isMaxRank: boolean;
  castCount: number;
  avgEffectiveHeal: number;
  directOverhealPct: number;
  flagged: boolean;
}

export interface DownrankingDisciplineResult {
  breakdown: DownrankingRankBreakdown[];
  flaggedCount: number;
  judgement: Judgement;
}

// Green when no flags, orange otherwise. Max possible flagged groups is 2
// (Regrowth + Healing Touch, one max-rank group each) — red is
// unreachable by design, per docs/backlog.md story 303.
function judgeFlaggedCount(flaggedCount: number): Judgement {
  return flaggedCount === 0 ? "green" : "orange";
}

function findDirectHeal(
  healingEvents: WclEvent[],
  targetId: number,
  abilityGameID: number,
  castTimestamp: number,
): WclEvent | undefined {
  return healingEvents.find(
    (event) =>
      event.type === "heal" &&
      event.targetID === targetId &&
      event.abilityGameID === abilityGameID &&
      event.tick !== true &&
      event.timestamp >= castTimestamp &&
      event.timestamp <= castTimestamp + DIRECT_HEAL_MATCH_TOLERANCE_MS,
  );
}

interface Group {
  spell: DownrankingSpell;
  rank: number | null;
  castCount: number;
  totalAmount: number;
  totalOverheal: number;
}

export function computeDownrankingDiscipline(
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): DownrankingDisciplineResult {
  const casts = castEvents.filter(
    (event) =>
      event.sourceID === druidId &&
      event.type === "cast" &&
      event.targetID !== undefined &&
      event.abilityGameID !== undefined,
  );

  const groups = new Map<string, Group>();

  for (const cast of casts) {
    const abilityGameID = cast.abilityGameID as number;
    const resolved = resolvedAbilities.get(abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;
    if (!isTrackedSpell(resolved.spell)) continue;
    const spell = resolved.spell;

    const heal = findDirectHeal(
      healingEvents,
      cast.targetID as number,
      abilityGameID,
      cast.timestamp,
    );
    // No matching heal event means the cast didn't land (interrupted, no
    // recorded data) — skip rather than guess, same as swiftmendAudit.ts.
    if (heal === undefined) continue;

    const amount = typeof heal.amount === "number" ? heal.amount : 0;
    const overheal = typeof heal.overheal === "number" ? heal.overheal : 0;

    const key = `${spell}:${resolved.rank}`;
    const existing = groups.get(key);
    if (existing) {
      existing.castCount += 1;
      existing.totalAmount += amount;
      existing.totalOverheal += overheal;
    } else {
      groups.set(key, {
        spell,
        rank: resolved.rank,
        castCount: 1,
        totalAmount: amount,
        totalOverheal: overheal,
      });
    }
  }

  const breakdown: DownrankingRankBreakdown[] = Array.from(groups.values()).map(
    (group) => {
      const total = group.totalAmount + group.totalOverheal;
      const rawOverhealPct =
        total === 0 ? 0 : (group.totalOverheal / total) * 100;
      const directOverhealPct = Math.round(rawOverhealPct);
      const isMaxRank =
        group.rank !== null && group.rank === getMaxRank(group.spell);
      const flagged =
        isMaxRank && rawOverhealPct > 50 && isFlaggable(group.spell);

      return {
        spell: group.spell,
        rank: group.rank,
        isMaxRank,
        castCount: group.castCount,
        avgEffectiveHeal: group.totalAmount / group.castCount,
        directOverhealPct,
        flagged,
      };
    },
  );

  breakdown.sort((a, b) => {
    if (a.spell !== b.spell) {
      return SPELL_SORT_ORDER[a.spell] - SPELL_SORT_ORDER[b.spell];
    }
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return b.rank - a.rank;
  });

  const flaggedCount = breakdown.filter((row) => row.flagged).length;

  return {
    breakdown,
    flaggedCount,
    judgement: judgeFlaggedCount(flaggedCount),
  };
}
