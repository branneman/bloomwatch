import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow } from "./judgement";
import type { TalentBucket } from "../report/archetypeDetection";

// Rejuvenation duration, TBC Classic, constant across all ranks (only mana
// cost/heal-per-tick scale by rank) — live-validated against report
// 4GYHZRdtL3bvhpc8 fight 34: 6 natural full-duration instances all landed at
// 12006-12023ms. See docs/testing.md's known-reports table.
export const REJUVENATION_DURATION_MS = 12_000;

// Regrowth's HoT component duration (9 ticks), same live validation: 4
// natural full-duration instances all landed at 26971-27009ms, cross-checked
// against periodic Healing-event tick timestamps for one instance.
export const REGROWTH_DURATION_MS = 27_000;

// "> 1 tick (> 3s) remaining" per docs/backlog.md story 301 — both spells
// tick every 3s.
export const CLIP_THRESHOLD_MS = 3_000;

export type HotClipSpell = "Rejuvenation" | "Regrowth";

export interface HotClipEvent {
  timestampMs: number;
  targetId: number;
  spell: HotClipSpell;
}

export interface HotClipSpellResult {
  spell: HotClipSpell;
  castCount: number;
  clipCount: number;
  clipPct: number;
}

export interface HotClipDetectionResult {
  rejuvenation: HotClipSpellResult & { judgement: Judgement };
  // Judgement omitted for a deep-resto (Tree of Life-eligible) druid, or
  // when the talent read failed and eligibility can't be confirmed either
  // way — see docs/backlog.md story 301: a resto druid in Tree of Life has
  // exactly one non-cooldown direct heal (Healing Touch forces them out of
  // form), so once Swiftmend is on cooldown, spamming Regrowth for its
  // direct-heal component — clipping its own HoT tail as a side effect — is
  // the only viable response to burst damage, not a process error. That
  // exemption's premise doesn't hold for any archetype confirmed to never
  // reach Tree of Life (Restoration < 41, every non-deep-resto bucket by
  // construction — see classifyBucket in archetypeDetection.ts) — those
  // druids have Healing Touch available with no form-swap tax, so per
  // docs/backlog.md story 914, every such bucket gets a real judgement,
  // reusing Rejuvenation's own bands (real corpus data showed a clean,
  // non-degenerate fit — see docs/thresholds.md). "unknown-no-talent-data"
  // is deliberately left unjudged alongside deep-resto, matching story
  // 903d's reasoning: a failed talent read can't honestly rule out the
  // exemption applying.
  regrowth: HotClipSpellResult & { judgement?: Judgement };
  clipEvents: HotClipEvent[];
}

// Good < 5%, fair 5-15%, bad > 15% of that spell's casts, per
// docs/backlog.md story 301.
export const CLIP_GOOD_MAX_PCT = 5;
export const CLIP_FAIR_MAX_PCT = 15;

function judgeClipPct(clipPct: number): Judgement {
  return judgeThresholdBelow(clipPct, {
    goodMax: CLIP_GOOD_MAX_PCT,
    fairMax: CLIP_FAIR_MAX_PCT,
  });
}

function computeSpellResult(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  abilityIds: Set<number>,
  spell: HotClipSpell,
  durationMs: number,
): { result: HotClipSpellResult; clipEvents: HotClipEvent[] } {
  const relevantBuffEvents = buffEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.abilityGameID !== undefined &&
        abilityIds.has(event.abilityGameID) &&
        event.targetID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const expiryByTarget = new Map<number, number>();
  const clipEvents: HotClipEvent[] = [];

  for (const event of relevantBuffEvents) {
    const targetId = event.targetID as number;

    if (event.type === "applybuff") {
      expiryByTarget.set(targetId, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "refreshbuff") {
      const expiry = expiryByTarget.get(targetId);
      if (
        expiry !== undefined &&
        expiry - event.timestamp > CLIP_THRESHOLD_MS
      ) {
        clipEvents.push({ timestampMs: event.timestamp, targetId, spell });
      }
      expiryByTarget.set(targetId, event.timestamp + durationMs);
      continue;
    }

    if (event.type === "removebuff") {
      // Covers both natural expiry and Swiftmend consumption — either way
      // there's nothing to clip against until the next applybuff.
      expiryByTarget.delete(targetId);
    }
  }

  const castCount = castEvents.filter(
    (event) =>
      event.sourceID === druidId &&
      event.type === "cast" &&
      event.abilityGameID !== undefined &&
      abilityIds.has(event.abilityGameID),
  ).length;

  const clipCount = clipEvents.length;
  const clipPct = castCount === 0 ? 0 : (clipCount / castCount) * 100;

  return {
    result: { spell, castCount, clipCount, clipPct },
    clipEvents,
  };
}

export function computeHotClipDetection(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  archetypeBucket: TalentBucket = "deep-resto",
): HotClipDetectionResult {
  const rejuv = computeSpellResult(
    buffEvents,
    castEvents,
    druidId,
    rejuvenationAbilityIds,
    "Rejuvenation",
    REJUVENATION_DURATION_MS,
  );
  const regrowth = computeSpellResult(
    buffEvents,
    castEvents,
    druidId,
    regrowthAbilityIds,
    "Regrowth",
    REGROWTH_DURATION_MS,
  );

  const clipEvents = [...rejuv.clipEvents, ...regrowth.clipEvents].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  return {
    rejuvenation: {
      ...rejuv.result,
      judgement: judgeClipPct(rejuv.result.clipPct),
    },
    regrowth:
      archetypeBucket === "deep-resto" ||
      archetypeBucket === "unknown-no-talent-data"
        ? regrowth.result
        : {
            ...regrowth.result,
            judgement: judgeClipPct(regrowth.result.clipPct),
          },
    clipEvents,
  };
}
