import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import { extractManaSamples } from "./manaSamples";

// Backlog story 402: expected floor = fight duration / 120s (each consumable's own
// cooldown), for fights where mana dropped below 70% at any point; fights that never
// did are exempt. Dark Rune and Demonic Rune share one in-game cooldown (using either
// puts both on cooldown), so they're counted together as one "Rune" row rather than
// judged separately — see docs/specs/402-consumable-throughput-design.md's judgement
// call 1.
const FLOOR_INTERVAL_MS = 120_000;
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

// Green >= floor, orange = floor - 1, red <= floor - 2, per docs/backlog.md story 402.
function judgeAgainstFloor(used: number, floor: number): Judgement {
  if (used >= floor) return "green";
  if (used === floor - 1) return "orange";
  return "red";
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

  const floor = Math.floor(fightDurationMs / FLOOR_INTERVAL_MS);

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
      expectedFloor: floor,
      judgement: judgeAgainstFloor(potionCount, floor),
    },
    {
      label: "Rune",
      used: runeCount,
      expectedFloor: floor,
      judgement: judgeAgainstFloor(runeCount, floor),
    },
  ];

  return {
    exempt: false,
    rows,
    judgement: worstJudgement(rows.map((row) => row.judgement)),
  };
}
