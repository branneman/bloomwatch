import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { Judgement } from "./judgement";
import { extractManaSamples, type ManaSample } from "./manaSamples";

// docs/backlog.md story 403: reuses 401/402's "mana dropped below 70% at any
// point" signal for "mana-constrained", and additionally requires the fight
// run >= 3 min before an unused Innervate counts as a real miss.
const MANA_DROP_THRESHOLD_PCT = 70;
const MANA_CONSTRAINED_MIN_DURATION_MS = 180_000;
// Self-cast is judged "too late" once it lands in the fight's final 10%.
const LATE_CAST_FRACTION = 0.9;

export interface ActorClass {
  class: string; // CastTableEntry.type, e.g. "Mage", "Warrior", "Druid"
  specIcon: string; // CastTableEntry.icon, e.g. "Druid-Feral Combat"
}

// TBC ruleset fact, not a tunable threshold: every class has a mana pool
// except Warrior and Rogue; Druid is the only class whose mana-use depends
// on spec (Feral doesn't use mana, Balance/Restoration do). No
// docs/backlog.md rationale pointer is needed (principle 3 requires sourcing
// for R/O/G *thresholds*; this is a fixed game-mechanics fact, the same way
// prepHygiene.ts documents its elixir/flask name lists).
const NON_MANA_CLASSES = new Set(["Warrior", "Rogue"]);
const FERAL_DRUID_SPEC_ICON = "Druid-Feral Combat";

export function isManaUsingActor(actorClass: ActorClass | undefined): boolean {
  // Unknown class (couldn't be resolved from the report's actor table):
  // assume mana-using rather than falsely flagging a real ally as "wasted".
  if (actorClass === undefined) return true;
  if (NON_MANA_CLASSES.has(actorClass.class)) return false;
  if (actorClass.class === "Druid")
    return actorClass.specIcon !== FERAL_DRUID_SPEC_ICON;
  return true;
}

export interface InnervateCast {
  timestampMs: number;
  isSelfCast: boolean;
  targetId: number;
  targetClass: ActorClass | undefined;
  manaPct: number | null; // null = unknown (no mana sample found near the cast)
}

export interface InnervateAuditResult {
  firstCast: (InnervateCast & { judgement: Judgement }) | null;
  // TBC's 3-min cooldown allows a 2nd cast in a long fight; informational
  // only, per docs/backlog.md story 403 — it doesn't affect `judgement`.
  laterCasts: InnervateCast[];
  judgement: Judgement | null; // null = informational, no verdict
}

function selfManaPctAtCast(castEvent: WclEvent): number | null {
  if (castEvent.resourceActor !== 1) return null;
  const classResources = castEvent.classResources;
  if (!Array.isArray(classResources) || classResources.length === 0)
    return null;
  const resource = classResources[0] as { type?: unknown; amount?: unknown };
  if (typeof resource.type !== "number" || typeof resource.amount !== "number")
    return null;
  return Math.round((resource.type / resource.amount) * 100);
}

function nearestManaPct(samples: ManaSample[], atMs: number): number | null {
  if (samples.length === 0) return null;
  let nearest = samples[0];
  let bestDiffMs = Math.abs(samples[0].timestampMs - atMs);
  for (const sample of samples) {
    const diffMs = Math.abs(sample.timestampMs - atMs);
    if (diffMs < bestDiffMs) {
      nearest = sample;
      bestDiffMs = diffMs;
    }
  }
  return Math.round((nearest.currentMana / nearest.maxMana) * 100);
}

function buildCast(
  castEvent: WclEvent,
  druidId: number,
  actorClasses: Map<number, ActorClass>,
  allCastEvents: WclEvent[],
): InnervateCast {
  const rawTargetId = castEvent.targetID;
  const isSelfCast = rawTargetId === undefined || rawTargetId === druidId;
  const targetId = isSelfCast ? druidId : rawTargetId;
  const targetClass = isSelfCast ? undefined : actorClasses.get(targetId);
  const manaPct = isSelfCast
    ? selfManaPctAtCast(castEvent)
    : nearestManaPct(
        extractManaSamples(allCastEvents, targetId),
        castEvent.timestamp,
      );

  return {
    timestampMs: castEvent.timestamp,
    isSelfCast,
    targetId,
    targetClass,
    manaPct,
  };
}

function judgeCast(
  cast: InnervateCast,
  fightStartMs: number,
  fightDurationMs: number,
): Judgement {
  if (cast.isSelfCast) {
    const elapsedFraction = (cast.timestampMs - fightStartMs) / fightDurationMs;
    return elapsedFraction >= LATE_CAST_FRACTION ? "orange" : "green";
  }
  return isManaUsingActor(cast.targetClass) ? "green" : "red";
}

export function computeInnervateAudit(
  castEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fightDurationMs: number,
  fightStartMs: number,
): InnervateAuditResult {
  const innervateCasts = castEvents
    .filter((event) => {
      if (event.sourceID !== druidId || event.type !== "cast") return false;
      if (event.abilityGameID === undefined) return false;
      const resolved = resolvedAbilities.get(event.abilityGameID);
      return resolved?.kind === "spell" && resolved.spell === "Innervate";
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (innervateCasts.length === 0) {
    const manaConstrained = extractManaSamples(castEvents, druidId).some(
      (sample) =>
        (sample.currentMana / sample.maxMana) * 100 < MANA_DROP_THRESHOLD_PCT,
    );
    const judgement =
      manaConstrained && fightDurationMs >= MANA_CONSTRAINED_MIN_DURATION_MS
        ? "red"
        : null;
    return { firstCast: null, laterCasts: [], judgement };
  }

  const [firstEvent, ...laterEvents] = innervateCasts;
  const first = buildCast(firstEvent, druidId, actorClasses, castEvents);
  const judgement = judgeCast(first, fightStartMs, fightDurationMs);
  const laterCasts = laterEvents.map((event) =>
    buildCast(event, druidId, actorClasses, castEvents),
  );

  return {
    firstCast: { ...first, judgement },
    laterCasts,
    judgement,
  };
}
