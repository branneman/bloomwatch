import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

// Lifebloom base mana cost, TBC Classic, single rank — see
// https://www.wowhead.com/tbc/spell=33763/lifebloom. Intentionally NOT
// adjusted for talent/gear mana-cost reduction (e.g. Moonglow, set
// bonuses) — docs/backlog.md story 204 calls for an *estimate*, and
// per-log-accurate cost isn't reliably recoverable from WCL resource
// events.
export const LIFEBLOOM_MANA_COST = 220;

export interface RestackTaxCast {
  timestampMs: number;
  targetId: number;
}

export interface RestackTaxResult {
  casts: RestackTaxCast[];
  castCount: number;
  estimatedMana: number;
  judgement: Judgement;
}

// Good/Fair/Bad scales with fight length per docs/backlog.md story 204: one
// good-tier tax cast is allowed per 2 minutes elapsed, one fair-tier
// cast per minute elapsed. Reproduces the card mockup's worked example:
// a 5:41 fight allows good 0-2, fair 3-5, bad 6+.
function judgeRestackTax(
  castCount: number,
  fightDurationMs: number,
): Judgement {
  const fightMinutes = fightDurationMs / 60000;
  const goodMax = Math.floor(fightMinutes / 2) + 1;
  const fairMax = Math.floor(fightMinutes);
  return judgeThresholdBelow(castCount, { goodMax, fairMax });
}

type MergedEvent =
  | { timestamp: number; order: 0; kind: "cast" }
  | {
      timestamp: number;
      order: 1;
      kind: "buff";
      buffKind: "open" | "stack-change" | "close" | "refresh";
      stack?: number;
    };

export function computeRestackTax(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightDurationMs: number,
): RestackTaxResult {
  const timelines = reconstructLifebloomTimelines(
    buffEvents,
    druidId,
    lifebloomAbilityIds,
  );

  const castTimestampsByTarget = new Map<number, number[]>();
  for (const event of castEvents) {
    if (event.sourceID !== druidId) continue;
    if (event.type !== "cast") continue;
    if (event.abilityGameID === undefined) continue;
    if (!lifebloomAbilityIds.has(event.abilityGameID)) continue;
    if (event.targetID === undefined) continue;

    const list = castTimestampsByTarget.get(event.targetID) ?? [];
    list.push(event.timestamp);
    castTimestampsByTarget.set(event.targetID, list);
  }

  const taxCasts: RestackTaxCast[] = [];

  for (const [targetId, castTimestamps] of castTimestampsByTarget) {
    const timeline = timelines.get(targetId) ?? [];

    // Casts sort before buff events at equal timestamps: a cast and the
    // stack-change/open it causes share a timestamp, and tax
    // classification needs the stack state going into the cast, not
    // the result of it.
    const merged: MergedEvent[] = [
      ...castTimestamps.map((timestamp): MergedEvent => ({
        timestamp,
        order: 0,
        kind: "cast",
      })),
      ...timeline.map((event): MergedEvent => ({
        timestamp: event.timestamp,
        order: 1,
        kind: "buff",
        buffKind: event.kind,
        stack: event.stack,
      })),
    ];
    merged.sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);

    let currentStack = 0;
    let everReached3 = false;

    for (const item of merged) {
      if (item.kind === "cast") {
        if (everReached3 && currentStack < 3) {
          taxCasts.push({ timestampMs: item.timestamp, targetId });
        }
        continue;
      }

      if (item.buffKind === "open") {
        currentStack = 1;
      } else if (item.buffKind === "stack-change") {
        currentStack = item.stack ?? currentStack;
      } else if (item.buffKind === "close") {
        currentStack = 0;
      }
      // "refresh" leaves currentStack unchanged.

      if (currentStack >= 3) {
        everReached3 = true;
      }
    }
  }

  taxCasts.sort((a, b) => a.timestampMs - b.timestampMs);

  const castCount = taxCasts.length;

  return {
    casts: taxCasts,
    castCount,
    estimatedMana: castCount * LIFEBLOOM_MANA_COST,
    judgement: judgeRestackTax(castCount, fightDurationMs),
  };
}
