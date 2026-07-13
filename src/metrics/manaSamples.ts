import type { WclEvent } from "../wcl/events";

export interface ManaSample {
  timestampMs: number;
  currentMana: number;
  maxMana: number;
}

// classResources[0].type is confusingly the *current* resource amount, and
// .amount is the *max* pool — live-validated against report 4GYHZRdtL3bvhpc8
// fight 6 (Dassz's mana, and a warrior's rage), see docs/testing.md.
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
    };
    if (
      typeof resource.type !== "number" ||
      typeof resource.amount !== "number"
    )
      continue;

    samples.push({
      timestampMs: event.timestamp,
      currentMana: resource.type,
      maxMana: resource.amount,
    });
  }

  return samples.sort((a, b) => a.timestampMs - b.timestampMs);
}
