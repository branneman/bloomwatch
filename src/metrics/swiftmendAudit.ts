import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import {
  type HotClipSpell,
  CLIP_THRESHOLD_MS,
  REJUVENATION_DURATION_MS,
  REGROWTH_DURATION_MS,
} from "./hotClipDetection";

// Swiftmend's own heal/removebuff events land ~1ms after its cast event in
// live data (live-validated against report 4GYHZRdtL3bvhpc8 fight 6, see
// docs/testing.md) — a small tolerance window absorbs that gap without
// risking a match against an unrelated HoT removal on the same target.
const SWIFTMEND_MATCH_TOLERANCE_MS = 50;

export type SwiftmendClassification = "efficient" | "emergency" | "wasteful";

export interface SwiftmendCastResult {
  timestampMs: number;
  targetId: number;
  consumedSpell: HotClipSpell;
  remainingMs: number;
  targetHpPct: number | null;
  classification: SwiftmendClassification;
}

export interface SwiftmendAuditResult {
  casts: SwiftmendCastResult[];
  swiftmendCastCount: number;
  wastefulCount: number;
  wastefulPct: number;
  judgement: Judgement;
  availableWindows: number;
}

interface HotRemoval {
  timestampMs: number;
  targetId: number;
  spell: HotClipSpell;
  remainingMs: number;
}

// Green only at exactly 0% wasteful, orange up to 25%, red above — per
// docs/backlog.md story 302. Deliberately not judgeThresholdBelow (whose
// "< greenMax" semantics can't express an exact-zero green band).
function judgeWastefulShare(wastefulPct: number): Judgement {
  if (wastefulPct === 0) return "green";
  if (wastefulPct <= 25) return "orange";
  return "red";
}

function trackHotRemovals(
  buffEvents: WclEvent[],
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): HotRemoval[] {
  const relevant = buffEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        (rejuvenationAbilityIds.has(event.abilityGameID) ||
          regrowthAbilityIds.has(event.abilityGameID)),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  // Keyed by target+spell (not just target) since both HoTs can be up on
  // the same target at once.
  const expiryByKey = new Map<string, number>();
  const removals: HotRemoval[] = [];

  for (const event of relevant) {
    const targetId = event.targetID as number;
    const abilityGameID = event.abilityGameID as number;
    const spell: HotClipSpell = rejuvenationAbilityIds.has(abilityGameID)
      ? "Rejuvenation"
      : "Regrowth";
    const durationMs =
      spell === "Rejuvenation"
        ? REJUVENATION_DURATION_MS
        : REGROWTH_DURATION_MS;
    const key = `${targetId}:${spell}`;

    if (event.type === "applybuff" || event.type === "refreshbuff") {
      expiryByKey.set(key, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "removebuff") {
      const expiry = expiryByKey.get(key);
      if (expiry !== undefined) {
        removals.push({
          timestampMs: event.timestamp,
          targetId,
          spell,
          remainingMs: expiry - event.timestamp,
        });
      }
      expiryByKey.delete(key);
    }
  }

  return removals;
}

function findConsumedHot(
  removals: HotRemoval[],
  targetId: number,
  castTimestamp: number,
): HotRemoval | undefined {
  return removals.find(
    (removal) =>
      removal.targetId === targetId &&
      removal.timestampMs >= castTimestamp &&
      removal.timestampMs <= castTimestamp + SWIFTMEND_MATCH_TOLERANCE_MS,
  );
}

function findTargetHpPctBeforeCast(
  healingEvents: WclEvent[],
  targetId: number,
  castTimestamp: number,
): number | null {
  let best: { timestamp: number; hitPoints: number } | null = null;

  for (const event of healingEvents) {
    if (event.targetID !== targetId) continue;
    if (event.timestamp >= castTimestamp) continue;
    // resourceActor 2 marks the target's own HP on this event (1 would be
    // the event's source) — live-validated, see docs/testing.md.
    if (event.resourceActor !== 2) continue;
    const hitPoints = event.hitPoints;
    if (typeof hitPoints !== "number") continue;
    if (best === null || event.timestamp > best.timestamp) {
      best = { timestamp: event.timestamp, hitPoints };
    }
  }

  return best?.hitPoints ?? null;
}

// Efficient takes priority even if HP also happens to be low — consuming an
// about-to-expire HoT is the correct play regardless of the target's HP.
function classify(
  remainingMs: number,
  targetHpPct: number | null,
): SwiftmendClassification {
  if (remainingMs <= CLIP_THRESHOLD_MS) return "efficient";
  if (targetHpPct !== null && targetHpPct <= 50) return "emergency";
  return "wasteful";
}

export function computeSwiftmendAudit(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  fightDurationMs: number,
): SwiftmendAuditResult {
  const swiftmendCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        swiftmendAbilityIds.has(event.abilityGameID),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const removals = trackHotRemovals(
    buffEvents,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
  );

  const casts: SwiftmendCastResult[] = [];
  for (const cast of swiftmendCasts) {
    const targetId = cast.targetID as number;
    const consumed = findConsumedHot(removals, targetId, cast.timestamp);
    // A Swiftmend the game allowed to be cast always consumed a real HoT;
    // no match means our buff-event window didn't cover its application —
    // skip rather than guess which spell or how much was remaining.
    if (consumed === undefined) continue;

    const targetHpPct = findTargetHpPctBeforeCast(
      healingEvents,
      targetId,
      cast.timestamp,
    );
    const remainingMs = Math.max(0, consumed.remainingMs);

    casts.push({
      timestampMs: cast.timestamp,
      targetId,
      consumedSpell: consumed.spell,
      remainingMs,
      targetHpPct,
      classification: classify(remainingMs, targetHpPct),
    });
  }

  const wastefulCount = casts.filter(
    (cast) => cast.classification === "wasteful",
  ).length;
  const wastefulPct =
    casts.length === 0 ? 0 : (wastefulCount / casts.length) * 100;

  return {
    casts,
    swiftmendCastCount: swiftmendCasts.length,
    wastefulCount,
    wastefulPct,
    judgement: judgeWastefulShare(wastefulPct),
    availableWindows: Math.floor(fightDurationMs / 15_000),
  };
}
