import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { Judgement } from "./judgement";
import { mixedJudgement } from "./judgement";
import { extractManaSamples } from "./manaSamples";

// docs/backlog.md story 402: expected floor = fight duration / each consumable's own
// cooldown, for fights where mana dropped below 70% at any point; fights that never did
// are exempt. Dark Rune and Demonic Rune share one in-game cooldown (using either puts
// both on cooldown), so they're counted together as one "Rune" row rather than judged
// separately.
const POTION_FLOOR_INTERVAL_MS = 120_000;
// Story 911 recalibration: Runes (unlike Mana Potions) require Enchanting-crafted or
// scarce vendor-sourced reagents real players often don't carry, and cost health to use
// — the story-901 exemplar corpus showed real elite play using a Rune in only 10% of
// mana-constrained fights regardless of length (mean 0.03-0.32 uses even in 4-8min
// fights), so the original 120s-interval floor (matching Mana Potion's) scored real good
// players good only 20% of the time. A 300s interval fits the real data much better
// (80% good / 20% fair / 1% bad on the same corpus) while still flagging genuine neglect
// in unusually long fights — see docs/thresholds.md's story 911 entry.
const RUNE_FLOOR_INTERVAL_MS = 300_000;
const MANA_DROP_THRESHOLD_PCT = 70;

export type ConsumableLabel = "Mana Potion" | "Rune";

export interface ConsumableRow {
  label: ConsumableLabel;
  used: number;
  expectedFloor: number;
  judgement: Judgement;
}

export interface ConsumableThroughputResult {
  exempt: boolean; // mana never dropped below 70% — informational only, no rows
  rows: ConsumableRow[];
  judgement: Judgement | null; // null when exempt
}

// Good >= floor, fair = floor - 1, bad <= floor - 2, per docs/backlog.md story 402.
function judgeAgainstFloor(used: number, floor: number): Judgement {
  if (used >= floor) return "good";
  if (used === floor - 1) return "fair";
  return "bad";
}

export function computeConsumableThroughput(
  castEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fightDurationMs: number,
): ConsumableThroughputResult {
  const manaSamples = extractManaSamples(castEvents, druidId);
  const droppedBelowThreshold = manaSamples.some(
    (sample) =>
      (sample.currentMana / sample.maxMana) * 100 < MANA_DROP_THRESHOLD_PCT,
  );

  if (!droppedBelowThreshold) {
    return { exempt: true, rows: [], judgement: null };
  }

  const potionFloor = Math.floor(fightDurationMs / POTION_FLOOR_INTERVAL_MS);
  const runeFloor = Math.floor(fightDurationMs / RUNE_FLOOR_INTERVAL_MS);

  let potionCount = 0;
  let runeCount = 0;
  for (const event of castEvents) {
    if (event.sourceID !== druidId || event.type !== "cast") continue;
    if (event.abilityGameID === undefined) continue;
    const ability = resolvedAbilities.get(event.abilityGameID);
    if (!ability || ability.kind !== "consumable") continue;
    if (ability.item === "Mana Potion") potionCount++;
    else runeCount++; // Dark Rune or Demonic Rune — shared cooldown, one bucket
  }

  const rows: ConsumableRow[] = [
    {
      label: "Mana Potion",
      used: potionCount,
      expectedFloor: potionFloor,
      judgement: judgeAgainstFloor(potionCount, potionFloor),
    },
    {
      label: "Rune",
      used: runeCount,
      expectedFloor: runeFloor,
      judgement: judgeAgainstFloor(runeCount, runeFloor),
    },
  ];

  return {
    exempt: false,
    rows,
    // mixedJudgement, not worstJudgement — a good potions row and a bad
    // runes row (or vice versa) reads fair, matching every other
    // multi-part judgement in the codebase (see docs/thresholds.md's
    // compounding-factors section). Requested directly, 2026-07-20.
    judgement: mixedJudgement(rows.map((row) => row.judgement)),
  };
}
