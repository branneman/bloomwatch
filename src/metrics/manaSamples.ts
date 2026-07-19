import type { WclEvent } from "../wcl/events";

export interface ManaSample {
  timestampMs: number;
  currentMana: number;
  maxMana: number;
}

// classResources[0]'s field meanings differ by report vintage — live-validated
// against two real reports (see docs/testing.md): newer (2026) reports shape
// it as .type = *current* resource amount, .amount = *max* pool (report
// 4GYHZRdtL3bvhpc8 fight 6, Dassz's mana, and a warrior's rage); older
// 2021-2024 Classic-launch reports use the opposite, standard-WCL shape —
// .amount = *current*, .max = *max* pool, .type = the small resource-type
// enum (0 = mana) — confirmed against report mtRh3kJ9YMLazyvQ fight 10
// (Olklo). The two are told apart by `.max`: a level-70 max mana pool is
// always in the thousands, while every other WoW resource's internal scale
// (rage's 0-1000, energy/focus/etc.'s 0-100) — the only values the older
// shape's `.max` field can hold in the newer shape's unrelated `.max`
// field — never reaches four digits.
const OLD_SHAPE_MAX_MANA_FLOOR = 1000;

// resourceActor must be 1: Casts events attach the source's (caster's) own
// resource state; Healing events attach the target's instead (same
// resourceActor convention docs/testing.md documents for hitPoints).
export function extractManaSamples(
  castEvents: WclEvent[],
  druidId: number,
): ManaSample[] {
  const samples: ManaSample[] = [];

  for (const event of castEvents) {
    if (event.sourceID !== druidId) continue;
    if (event.type !== "cast") continue;
    if (event.resourceActor !== 1) continue;

    const classResources = event.classResources;
    if (!Array.isArray(classResources) || classResources.length === 0) continue;

    const resource = classResources[0] as {
      type?: unknown;
      amount?: unknown;
      max?: unknown;
    };
    if (
      typeof resource.type !== "number" ||
      typeof resource.amount !== "number" ||
      typeof resource.max !== "number"
    )
      continue;

    const isOldShape = resource.max >= OLD_SHAPE_MAX_MANA_FLOOR;

    samples.push({
      timestampMs: event.timestamp,
      currentMana: isOldShape ? resource.amount : resource.type,
      maxMana: isOldShape ? resource.max : resource.amount,
    });
  }

  return samples.sort((a, b) => a.timestampMs - b.timestampMs);
}
