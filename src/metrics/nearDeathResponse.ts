import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
} from "./lifebloomStacks";
import { MAINTAINED_MIN_UPTIME_PCT } from "./lb3Uptime";
import {
  SWIFTMEND_COOLDOWN_MS,
  trackHotRemovals,
  findConsumedHot,
} from "./swiftmendAudit";
import { NATURES_SWIFTNESS_COOLDOWN_MS } from "./naturesSwiftnessAudit";
import {
  isReady,
  wasIdlePreceding,
  judgeDeathReadiness,
} from "./deathForensics";
import { findFollowUp } from "./naturesSwiftnessAudit";
import { computeCastIntervals } from "./castIntervals";
import {
  resolveSpellAbilityIds,
  type ResolvedAbility,
  type DruidHealingSpell,
} from "../abilities/resolveAbilities";

// Backlog story 1001: a raider's HP dropping to or below this percentage
// (WCL's own `hitPoints` field on DamageTaken/Healing events, already a real
// 0-100 percentage when fetched with includeResources: true — confirmed live
// against report 4GYHZRdtL3bvhpc8, fight 6, see docs/testing.md) counts as a
// crisis. Provisional: not yet calibrated against real exemplar data, same
// as several metrics before their own Epic I calibration pass (see 909-913).
export const CRISIS_THRESHOLD_PCT = 15;

// Spells that count as "the druid responded" — excludes Nature's Swiftness
// (a cast-time modifier, not a heal itself; its follow-up cast is what
// actually lands and is already a tracked healing spell) and Innervate (mana,
// not healing). Tranquility is included for completeness, though as a
// raid-wide channel its per-target Casts targetID may not reliably match a
// specific crisis target — a known, documented limitation, not a bug to fix
// here (Tranquility is a rare panic cooldown, not the common case).
const HEALING_SPELLS_FOR_RESPONSE: DruidHealingSpell[] = [
  "Lifebloom",
  "Rejuvenation",
  "Regrowth",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
];

export function getHealingAbilityIds(
  resolvedAbilities: Map<number, ResolvedAbility>,
): Set<number> {
  const ids = new Set<number>();
  for (const spell of HEALING_SPELLS_FOR_RESPONSE) {
    for (const id of resolveSpellAbilityIds(resolvedAbilities, spell)) {
      ids.add(id);
    }
  }
  return ids;
}

interface HpReading {
  kind: "reading";
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
}
interface DeathMarker {
  kind: "death";
  timestampMs: number;
  targetId: number;
}
type TimelineEntry = HpReading | DeathMarker;

// Merges DamageTaken + Healing readings with Deaths markers into one
// per-target, timestamp-sorted timeline. Deaths are modeled as explicit
// markers (not inferred from timestamp proximity to a damage event) because
// a battle-rez can leave a long gap between a death and that target's next
// real HP reading — live-validated against report 4GYHZRdtL3bvhpc8, fight 6,
// target 37 (dies twice in one fight): the fatal hit reads hitPoints: 0, the
// Deaths event fires ~25-59ms later, and the next real DamageTaken reading
// for that target (a healthy 81%, post-rez) doesn't appear until ~90s
// afterward. A rule that closed the crisis on "next reading above threshold"
// alone would misread that whole 90s gap as one long survived crisis.
function buildHpTimelines(
  damageEvents: WclEvent[],
  healingEvents: WclEvent[],
  deathEvents: WclEvent[],
): Map<number, TimelineEntry[]> {
  const byTarget = new Map<number, TimelineEntry[]>();

  function push(entry: TimelineEntry): void {
    let list = byTarget.get(entry.targetId);
    if (!list) {
      list = [];
      byTarget.set(entry.targetId, list);
    }
    list.push(entry);
  }

  for (const event of damageEvents) {
    if (event.type !== "damage") continue;
    if (event.targetID === undefined) continue;
    if (typeof event.hitPoints !== "number") continue;
    push({
      kind: "reading",
      timestampMs: event.timestamp,
      targetId: event.targetID,
      hitPointsPct: event.hitPoints,
    });
  }
  for (const event of healingEvents) {
    if (event.type !== "heal") continue;
    if (event.targetID === undefined) continue;
    if (typeof event.hitPoints !== "number") continue;
    push({
      kind: "reading",
      timestampMs: event.timestamp,
      targetId: event.targetID,
      hitPointsPct: event.hitPoints,
    });
  }
  for (const event of deathEvents) {
    if (event.type !== "death") continue;
    if (event.targetID === undefined) continue;
    push({
      kind: "death",
      timestampMs: event.timestamp,
      targetId: event.targetID,
    });
  }

  for (const list of byTarget.values()) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }
  return byTarget;
}

interface CrisisEpisode {
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
  windowEndMs: number;
}

// Walks each target's merged timeline, opening a crisis on a <=threshold
// reading and closing it either on a death (excluded — story 501's
// territory) or on a later >threshold reading (survived). A crisis still
// open when the timeline runs out is a survived crisis unresolved by the
// fight's end (e.g. an execute-phase near-miss).
function findCrisisEpisodes(
  timelinesByTarget: Map<number, TimelineEntry[]>,
  fightEnd: number,
): CrisisEpisode[] {
  const episodes: CrisisEpisode[] = [];

  for (const [targetId, timeline] of timelinesByTarget) {
    let crisisStart: HpReading | null = null;

    for (const entry of timeline) {
      if (crisisStart === null) {
        if (
          entry.kind === "reading" &&
          entry.hitPointsPct <= CRISIS_THRESHOLD_PCT
        ) {
          crisisStart = entry;
        }
        continue;
      }

      if (entry.kind === "death") {
        crisisStart = null;
        continue;
      }

      if (entry.hitPointsPct > CRISIS_THRESHOLD_PCT) {
        episodes.push({
          timestampMs: crisisStart.timestampMs,
          targetId,
          hitPointsPct: crisisStart.hitPointsPct,
          windowEndMs: entry.timestampMs,
        });
        crisisStart = null;
      }
    }

    if (crisisStart !== null) {
      episodes.push({
        timestampMs: crisisStart.timestampMs,
        targetId,
        hitPointsPct: crisisStart.hitPointsPct,
        windowEndMs: fightEnd,
      });
    }
  }

  episodes.sort((a, b) => a.timestampMs - b.timestampMs);
  return episodes;
}

export interface CrisisEvent {
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
  maintained: boolean;
  judged: boolean;
  responded: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  unspentCount: number;
  judgement: Judgement | null;
  judgedByReadyResource: boolean;
  clearSave: boolean;
  saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null;
}

export interface NearDeathResponseResult {
  crises: CrisisEvent[];
  flaggedCount: number;
  judgement: Judgement;
}

export function computeNearDeathResponse(
  damageEvents: WclEvent[],
  healingEvents: WclEvent[],
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  healingAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
  fightStart: number,
  fightEnd: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): NearDeathResponseResult {
  const timelinesByTarget = buildHpTimelines(
    damageEvents,
    healingEvents,
    deathEvents,
  );
  const episodes = findCrisisEpisodes(timelinesByTarget, fightEnd);

  // Scope/exemption: "maintained targets" is exactly story 201/501's
  // definition. A clear tank assignment (1-2 maintained targets) exempts
  // crises on other raiders from judgement — they're shown as context
  // only — UNLESS a real resource (Swiftmend or Nature's Swiftness) was
  // ready at the time, which reads "fair" per story 1002: surfacing "you
  // could have helped" without grading the miss further.
  const lifebloomTimelines = reconstructLifebloomTimelines(
    buffEvents,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;
  const maintainedTargetIds = new Set<number>();
  for (const [targetId, timeline] of lifebloomTimelines) {
    const state = deriveLifebloomTargetState(timeline, fightStart, fightEnd);
    if (
      (state.totalAnyStackMs / fightDurationMs) * 100 >=
      MAINTAINED_MIN_UPTIME_PCT
    ) {
      maintainedTargetIds.add(targetId);
    }
  }
  const hasClearAssignment =
    maintainedTargetIds.size >= 1 && maintainedTargetIds.size <= 2;

  const druidCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const swiftmendCasts = druidCasts.filter((event) =>
    swiftmendAbilityIds.has(event.abilityGameID as number),
  );
  const nsCasts = druidCasts.filter((event) =>
    naturesSwiftnessAbilityIds.has(event.abilityGameID as number),
  );
  const castIntervals = computeCastIntervals(castEvents, druidId);

  const nsCastsWithFollowUp = nsCasts.map((nsCast) => ({
    timestampMs: nsCast.timestamp,
    followUp: findFollowUp(
      druidCasts,
      resolvedAbilities,
      naturesSwiftnessAbilityIds,
      nsCast.timestamp,
    ),
  }));

  const hotRemovals = trackHotRemovals(
    buffEvents,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
  );

  const crises: CrisisEvent[] = episodes.map((episode) => {
    const maintained = maintainedTargetIds.has(episode.targetId);

    const responded = druidCasts.some(
      (cast) =>
        cast.targetID === episode.targetId &&
        healingAbilityIds.has(cast.abilityGameID as number) &&
        cast.timestamp >= episode.timestampMs &&
        cast.timestamp <= episode.windowEndMs,
    );

    const swiftmendReady =
      hasSwiftmend &&
      isReady(swiftmendCasts, episode.timestampMs, SWIFTMEND_COOLDOWN_MS);
    const nsReady =
      hasNaturesSwiftness &&
      isReady(nsCasts, episode.timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
    const idlePreceding = wasIdlePreceding(
      castIntervals,
      episode.timestampMs,
      fightStart,
    );
    const unspentCount = [swiftmendReady, nsReady, idlePreceding].filter(
      Boolean,
    ).length;

    // Story 1002: a crisis on a target outside the druid's maintained
    // assignment is judged in two cases -- the existing "no clear
    // assignment at all" case, and (new) whenever a real resource was
    // ready to help even though the target wasn't "yours". The second
    // case always reads "fair" -- it surfaces "you could have helped",
    // it doesn't grade the miss further via the maintained-target
    // severity tally.
    const judgedElsewhereReady = !maintained && (swiftmendReady || nsReady);
    const judged = maintained || !hasClearAssignment || judgedElsewhereReady;

    // Tracked separately from `judgement === "fair"` because a crisis can
    // also land on "fair" via the pre-existing no-clear-assignment path
    // (judgeDeathReadiness(1), e.g. idlePreceding alone with neither
    // resource ready) -- this flag is true only for the new rule above,
    // so downstream calibration pooling (story 1002, scripts/lib/rollup.ts)
    // can count real occurrences of the new tier precisely, not by
    // re-deriving an approximation from `maintained`/`judgement` alone.
    const judgedByReadyResource = judgedElsewhereReady && hasClearAssignment;

    const judgement = !judged
      ? null
      : responded
        ? "good"
        : maintained || !hasClearAssignment
          ? judgeDeathReadiness(unspentCount)
          : "fair";

    // Story 1002: within an already-"good" (responded) crisis, distinguish
    // a clearly deliberate save from any other reactive heal landing. A
    // Nature's Swiftness cast makes the very next cast instant -- whatever
    // that next tracked healing spell is (per naturesSwiftnessAudit.ts's
    // own findFollowUp), if it's Healing Touch or Regrowth and it lands on
    // this crisis's target within this crisis's window, that's an
    // unambiguous burst save. Real example: report 3YLbnvyWwaXN6fpH, fight
    // 36, target 31, crisis at 4736343ms. Confirmed against the local
    // calibration corpus (~121 reports re-run live, story 1002): 56 such
    // combos found, so this is a real recurring pattern, not a hypothetical.
    let saveKind: CrisisEvent["saveKind"] = null;
    if (responded) {
      const nsComboMatch = nsCastsWithFollowUp.find(
        (entry) =>
          entry.followUp !== null &&
          entry.followUp.targetId === episode.targetId &&
          (entry.followUp.spell === "Healing Touch" ||
            entry.followUp.spell === "Regrowth") &&
          entry.followUp.timestampMs >= episode.timestampMs &&
          entry.followUp.timestampMs <= episode.windowEndMs,
      );
      if (nsComboMatch !== undefined) {
        saveKind = "natures-swiftness-combo";
      } else {
        // The reactive cast is the earliest of the druid's own healing
        // casts that landed on this target inside the crisis window --
        // same cast `responded` above already confirmed exists. Real
        // example (a reactive Swiftmend that consumed a Rejuvenation):
        // report 4QP6RCHfKWGcZFb3, fight 75, target 24, crisis at
        // 9727119ms. Confirmed against the local calibration corpus
        // (~121 reports re-run live, story 1002): 22 such combos found.
        const respondingCast = druidCasts.find(
          (cast) =>
            cast.targetID === episode.targetId &&
            healingAbilityIds.has(cast.abilityGameID as number) &&
            cast.timestamp >= episode.timestampMs &&
            cast.timestamp <= episode.windowEndMs,
        );
        if (
          respondingCast !== undefined &&
          swiftmendAbilityIds.has(respondingCast.abilityGameID as number)
        ) {
          const consumed = findConsumedHot(
            hotRemovals,
            episode.targetId,
            respondingCast.timestamp,
          );
          if (consumed?.spell === "Rejuvenation") {
            saveKind = "swiftmend-hot-consume";
          }
        }
      }
    }
    const clearSave = saveKind !== null;

    return {
      timestampMs: episode.timestampMs,
      targetId: episode.targetId,
      hitPointsPct: episode.hitPointsPct,
      maintained,
      judged,
      responded,
      swiftmendReady,
      nsReady,
      idlePreceding,
      unspentCount,
      judgement,
      judgedByReadyResource,
      clearSave,
      saveKind,
    };
  });

  return {
    crises,
    flaggedCount: crises.filter((c) => c.judgement === "bad").length,
    judgement: worstJudgement(crises.map((c) => c.judgement)),
  };
}
