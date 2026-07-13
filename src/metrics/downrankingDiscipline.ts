import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";
import { getMaxRank } from "../abilities/resolveAbilities";
import { REJUVENATION_DURATION_MS } from "./hotClipDetection";

// A Regrowth cast's direct heal event lands 0-3ms after the cast event and
// shares its abilityGameID with periodic ticks (distinguished only by
// `tick: true` on ticks) — live-validated against report
// 4GYHZRdtL3bvhpc8, fight 6 (see docs/testing.md). Healing Touch is
// assumed to behave the same way (single instant heal on cast completion,
// no ticks at all) by structural analogy — not directly observed live.
// Mirrors swiftmendAudit.ts's existing SWIFTMEND_MATCH_TOLERANCE_MS
// pattern. See docs/backlog.md story 303.
const DIRECT_HEAL_MATCH_TOLERANCE_MS = 50;

// Tolerance for the boundary between a Rejuvenation's final natural tick
// and its full-duration expiry — the last tick lands at/around exactly
// REJUVENATION_DURATION_MS after application (live-validated, see
// docs/testing.md), so a strict less-than window would drop it. Kept well
// under the 3000ms tick cadence so it can never reach into a following
// application's ticks.
const TICK_BOUNDARY_TOLERANCE_MS = 50;

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

// Rejuvenation is a pure HoT — it has no direct heal component, so every
// one of its heal events is a periodic tick (tick: true). Its per-cast
// contribution is the sum of ticks landing in [windowStart, windowEnd),
// where windowEnd is either the next Rejuvenation cast on the same target
// (a refresh — at any rank — stops the old application's ticking) or a
// full REJUVENATION_DURATION_MS if nothing refreshes it first. See
// docs/backlog.md story 303.
function sumRejuvenationTicks(
  healingEvents: WclEvent[],
  targetId: number,
  abilityGameID: number,
  windowStart: number,
  windowEnd: number,
): { amount: number; overheal: number; tickCount: number } {
  let amount = 0;
  let overheal = 0;
  let tickCount = 0;

  for (const event of healingEvents) {
    if (event.type !== "heal") continue;
    if (event.targetID !== targetId) continue;
    if (event.abilityGameID !== abilityGameID) continue;
    if (event.tick !== true) continue;
    if (event.timestamp < windowStart || event.timestamp >= windowEnd) {
      continue;
    }

    amount += typeof event.amount === "number" ? event.amount : 0;
    overheal += typeof event.overheal === "number" ? event.overheal : 0;
    tickCount += 1;
  }

  return { amount, overheal, tickCount };
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
  const casts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  // Rejuvenation casts grouped per target, in chronological order, so each
  // cast's tick window can be capped at the next cast that supersedes it.
  const rejuvenationCastsByTarget = new Map<number, WclEvent[]>();
  for (const cast of casts) {
    const resolved = resolvedAbilities.get(cast.abilityGameID as number);
    if (resolved?.kind !== "spell" || resolved.spell !== "Rejuvenation") {
      continue;
    }
    const targetId = cast.targetID as number;
    const list = rejuvenationCastsByTarget.get(targetId) ?? [];
    list.push(cast);
    rejuvenationCastsByTarget.set(targetId, list);
  }

  const rejuvenationWindowEnd = new Map<WclEvent, number>();
  for (const targetCasts of rejuvenationCastsByTarget.values()) {
    for (let i = 0; i < targetCasts.length; i++) {
      const cast = targetCasts[i];
      const nextCast = targetCasts[i + 1];
      const fullDurationEnd =
        cast.timestamp + REJUVENATION_DURATION_MS + TICK_BOUNDARY_TOLERANCE_MS;
      rejuvenationWindowEnd.set(
        cast,
        nextCast
          ? Math.min(nextCast.timestamp, fullDurationEnd)
          : fullDurationEnd,
      );
    }
  }

  const groups = new Map<string, Group>();

  for (const cast of casts) {
    const abilityGameID = cast.abilityGameID as number;
    const resolved = resolvedAbilities.get(abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;
    if (!isTrackedSpell(resolved.spell)) continue;
    const spell = resolved.spell;
    const targetId = cast.targetID as number;

    let amount: number;
    let overheal: number;

    if (spell === "Rejuvenation") {
      const windowEnd = rejuvenationWindowEnd.get(cast) as number;
      const ticks = sumRejuvenationTicks(
        healingEvents,
        targetId,
        abilityGameID,
        cast.timestamp,
        windowEnd,
      );
      // No ticks observed in this cast's window means the cast didn't
      // land (interrupted, no recorded data) — skip rather than guess,
      // same as the direct-heal spells below.
      if (ticks.tickCount === 0) continue;
      amount = ticks.amount;
      overheal = ticks.overheal;
    } else {
      const heal = findDirectHeal(
        healingEvents,
        targetId,
        abilityGameID,
        cast.timestamp,
      );
      // No matching heal event means the cast didn't land (interrupted, no
      // recorded data) — skip rather than guess, same as swiftmendAudit.ts.
      if (heal === undefined) continue;
      amount = typeof heal.amount === "number" ? heal.amount : 0;
      overheal = typeof heal.overheal === "number" ? heal.overheal : 0;
    }

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
