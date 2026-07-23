import { readFile } from "node:fs/promises";
import path from "node:path";

const BALANCE_LEANING_BUCKETS = new Set([
  "likely-dreamstate-full",
  "likely-dreamstate-partial",
  "mostly-balance",
]);

// A druid averaging fewer than this many healing casts per fight isn't
// really healing at all -- the same real-participation gap found live
// this story's scoping session (Serpentx: 26 total healing casts across
// 12 fights; Toxickn: 11 across 12 -- both pure Boomkin alts mistagged by
// docs/calibration-archetypes.json's talent-points-only bucketing).
const MIN_HEALING_CASTS_PER_FIGHT = 20;

interface ArchetypeEntry {
  druidId: number;
  druidName: string;
  bucket: string;
}
interface ArchetypeFile {
  reports: Record<string, ArchetypeEntry>;
}

interface MetricSample {
  ffDuty: number[];
  nonFfDuty: number[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function report(name: string, sample: MetricSample): void {
  console.log(`\n=== ${name} ===`);
  console.log(
    `FF-duty fights:     n=${sample.ffDuty.length}, median=${median(sample.ffDuty)}`,
  );
  console.log(
    `non-FF-duty fights: n=${sample.nonFfDuty.length}, median=${median(sample.nonFfDuty)}`,
  );
}

async function main(): Promise<void> {
  const archetypeRaw = await readFile(
    "docs/calibration-archetypes.json",
    "utf8",
  );
  const archetypeFile = JSON.parse(archetypeRaw) as ArchetypeFile;

  const refreshCadence: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const accidentalBlooms: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const restackTax: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const endingManaPct: MetricSample = { ffDuty: [], nonFfDuty: [] };
  // Summed across both consumable rows (Mana Potion + Rune): used minus
  // its own expected floor. A more negative number means further under
  // the expected floor -- the thing story 917 is asking whether FF duty
  // drags down (mana spent on FF, none left over for consumables).
  const consumableFloorDelta: MetricSample = { ffDuty: [], nonFfDuty: [] };

  for (const [key, entry] of Object.entries(archetypeFile.reports)) {
    if (!BALANCE_LEANING_BUCKETS.has(entry.bucket)) continue;
    const reportCode = key.split(":")[0];

    let cacheRaw: string;
    try {
      cacheRaw = await readFile(
        path.join("calibration-data", `${reportCode}.json`),
        "utf8",
      );
    } catch {
      continue; // not (yet) regenerated -- Task 5 should have covered this
    }
    const cache = JSON.parse(cacheRaw);
    const druid = cache.druids.find(
      (d: { druidId: number }) => d.druidId === entry.druidId,
    );
    if (!druid) continue;

    const fights = druid.fights as Array<{
      durationMs: number;
      faerieFireDuty: { onDuty: boolean };
      epics: {
        lifebloomDiscipline: {
          status: string;
          metrics?: {
            // medianMs is null when intervalCount is 0 (no LB3 refreshes
            // occurred that fight, e.g. no maintained target) -- confirmed
            // live against the real corpus: 117 of 358 fights.
            refreshCadence?: { medianMs: number | null };
            accidentalBlooms?: { count: number };
            restackTax?: { castCount: number };
          };
        };
        manaEconomy: {
          status: string;
          metrics?: {
            manaCurve?: { endingPct: number | null };
            consumableThroughput?: {
              rows: Array<{ used: number; expectedFloor: number }>;
            };
          };
        };
      };
    }>;

    const healingCastsPerFight =
      druid.healingCastCount / Math.max(fights.length, 1);
    if (healingCastsPerFight < MIN_HEALING_CASTS_PER_FIGHT) continue;

    for (const fight of fights) {
      const bucket = fight.faerieFireDuty.onDuty ? "ffDuty" : "nonFfDuty";

      if (fight.epics.lifebloomDiscipline.status === "ready") {
        const metrics = fight.epics.lifebloomDiscipline.metrics;
        if (
          metrics?.refreshCadence?.medianMs !== null &&
          metrics?.refreshCadence?.medianMs !== undefined
        ) {
          refreshCadence[bucket].push(metrics.refreshCadence.medianMs);
        }
        if (metrics?.accidentalBlooms) {
          accidentalBlooms[bucket].push(metrics.accidentalBlooms.count);
        }
        if (metrics?.restackTax) {
          restackTax[bucket].push(metrics.restackTax.castCount);
        }
      }

      if (fight.epics.manaEconomy.status === "ready") {
        const metrics = fight.epics.manaEconomy.metrics;
        if (
          metrics?.manaCurve?.endingPct !== null &&
          metrics?.manaCurve?.endingPct !== undefined
        ) {
          endingManaPct[bucket].push(metrics.manaCurve.endingPct);
        }
        if (metrics?.consumableThroughput) {
          const delta = metrics.consumableThroughput.rows.reduce(
            (sum, row) => sum + (row.used - row.expectedFloor),
            0,
          );
          consumableFloorDelta[bucket].push(delta);
        }
      }
    }
  }

  report("LB3 refresh cadence (median ms)", refreshCadence);
  report("Accidental blooms (count)", accidentalBlooms);
  report("Re-stack tax (cast count)", restackTax);
  report("Ending mana %", endingManaPct);
  report("Consumable used-minus-floor delta (summed)", consumableFloorDelta);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
