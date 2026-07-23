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

interface PairedSample {
  deltas: number[];
}

function reportPaired(name: string, sample: PairedSample): void {
  const total = sample.deltas.length;
  const positive = sample.deltas.filter((d) => d > 0).length;
  const negative = sample.deltas.filter((d) => d < 0).length;
  const zero = total - positive - negative;
  console.log(`\n=== ${name} (within-druid paired) ===`);
  console.log(
    `n=${total} druid-report pairs with data in both groups; ` +
      `median delta=${median(sample.deltas)}; ` +
      `positive=${positive} negative=${negative} zero=${zero}`,
  );
}

interface JudgementCounts {
  good: number;
  fair: number;
  bad: number;
}

function reportJudgementDistribution(
  name: string,
  ffDuty: JudgementCounts,
  nonFfDuty: JudgementCounts,
): void {
  const pct = (counts: JudgementCounts) => {
    const total = counts.good + counts.fair + counts.bad;
    if (total === 0) return "n=0";
    return (
      `n=${total} good=${((counts.good / total) * 100).toFixed(1)}% ` +
      `fair=${((counts.fair / total) * 100).toFixed(1)}% ` +
      `bad=${((counts.bad / total) * 100).toFixed(1)}%`
    );
  };
  console.log(`\n=== ${name} (judgement distribution) ===`);
  console.log(`FF-duty:     ${pct(ffDuty)}`);
  console.log(`non-FF-duty: ${pct(nonFfDuty)}`);
}

async function main(): Promise<void> {
  const archetypeRaw = await readFile(
    "docs/calibration-archetypes.json",
    "utf8",
  );
  const archetypeFile = JSON.parse(archetypeRaw) as ArchetypeFile;

  const restackTaxJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const restackTaxJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const bloomsJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const bloomsJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const cadenceJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const cadenceJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const manaJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const manaJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const consumableJudgeFf: JudgementCounts = { good: 0, fair: 0, bad: 0 };
  const consumableJudgeNon: JudgementCounts = { good: 0, fair: 0, bad: 0 };

  const restackTaxPaired: PairedSample = { deltas: [] };
  const bloomsPaired: PairedSample = { deltas: [] };
  const manaPaired: PairedSample = { deltas: [] };

  const refreshCadence: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const accidentalBlooms: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const restackTax: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const endingManaPct: MetricSample = { ffDuty: [], nonFfDuty: [] };
  // Summed across both consumable rows (Mana Potion + Rune): used minus
  // its own expected floor. A more negative number means further under
  // the expected floor -- consumables restore mana, so real FF-duty mana
  // pressure would be expected to raise consumable use (more need to top
  // off), not lower it; that's the direction story 917 is checking for.
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
            // live against the real corpus: 117 of 358 fights. judgement
            // is separately nullable in that same no-refreshes case.
            refreshCadence?: {
              medianMs: number | null;
              judgement: "good" | "fair" | "bad" | null;
            };
            accidentalBlooms?: {
              count: number;
              judgement: "good" | "fair" | "bad";
            };
            restackTax?: {
              castCount: number;
              judgement: "good" | "fair" | "bad";
            };
          };
        };
        manaEconomy: {
          status: string;
          metrics?: {
            manaCurve?: {
              endingPct: number | null;
              judgement: "good" | "fair" | "bad" | null;
            };
            consumableThroughput?: {
              rows: Array<{ used: number; expectedFloor: number }>;
              judgement: "good" | "fair" | "bad";
            };
          };
        };
      };
    }>;

    const healingCastsPerFight =
      druid.healingCastCount / Math.max(fights.length, 1);
    if (healingCastsPerFight < MIN_HEALING_CASTS_PER_FIGHT) continue;

    const fightRestackTax: MetricSample = { ffDuty: [], nonFfDuty: [] };
    const fightAccidentalBlooms: MetricSample = { ffDuty: [], nonFfDuty: [] };
    const fightEndingManaPct: MetricSample = { ffDuty: [], nonFfDuty: [] };

    for (const fight of fights) {
      const bucket = fight.faerieFireDuty.onDuty ? "ffDuty" : "nonFfDuty";
      const judgeBucket = (counts: {
        ffDuty: JudgementCounts;
        nonFfDuty: JudgementCounts;
      }) => (fight.faerieFireDuty.onDuty ? counts.ffDuty : counts.nonFfDuty);

      if (fight.epics.lifebloomDiscipline.status === "ready") {
        const metrics = fight.epics.lifebloomDiscipline.metrics;
        if (
          metrics?.refreshCadence?.medianMs !== null &&
          metrics?.refreshCadence?.medianMs !== undefined
        ) {
          refreshCadence[bucket].push(metrics.refreshCadence.medianMs);
        }
        if (metrics?.refreshCadence?.judgement) {
          judgeBucket({ ffDuty: cadenceJudgeFf, nonFfDuty: cadenceJudgeNon })[
            metrics.refreshCadence.judgement
          ]++;
        }
        if (metrics?.accidentalBlooms) {
          accidentalBlooms[bucket].push(metrics.accidentalBlooms.count);
          fightAccidentalBlooms[bucket].push(metrics.accidentalBlooms.count);
          judgeBucket({ ffDuty: bloomsJudgeFf, nonFfDuty: bloomsJudgeNon })[
            metrics.accidentalBlooms.judgement
          ]++;
        }
        if (metrics?.restackTax) {
          restackTax[bucket].push(metrics.restackTax.castCount);
          fightRestackTax[bucket].push(metrics.restackTax.castCount);
          judgeBucket({
            ffDuty: restackTaxJudgeFf,
            nonFfDuty: restackTaxJudgeNon,
          })[metrics.restackTax.judgement]++;
        }
      }

      if (fight.epics.manaEconomy.status === "ready") {
        const metrics = fight.epics.manaEconomy.metrics;
        if (
          metrics?.manaCurve?.endingPct !== null &&
          metrics?.manaCurve?.endingPct !== undefined
        ) {
          endingManaPct[bucket].push(metrics.manaCurve.endingPct);
          fightEndingManaPct[bucket].push(metrics.manaCurve.endingPct);
        }
        if (metrics?.manaCurve?.judgement) {
          judgeBucket({ ffDuty: manaJudgeFf, nonFfDuty: manaJudgeNon })[
            metrics.manaCurve.judgement
          ]++;
        }
        if (metrics?.consumableThroughput) {
          const delta = metrics.consumableThroughput.rows.reduce(
            (sum, row) => sum + (row.used - row.expectedFloor),
            0,
          );
          consumableFloorDelta[bucket].push(delta);
          judgeBucket({
            ffDuty: consumableJudgeFf,
            nonFfDuty: consumableJudgeNon,
          })[metrics.consumableThroughput.judgement]++;
        }
      }
    }

    if (
      fightRestackTax.ffDuty.length > 0 &&
      fightRestackTax.nonFfDuty.length > 0
    ) {
      const ffMedian = median(fightRestackTax.ffDuty);
      const nonFfMedian = median(fightRestackTax.nonFfDuty);
      if (ffMedian !== null && nonFfMedian !== null) {
        restackTaxPaired.deltas.push(ffMedian - nonFfMedian);
      }
    }
    if (
      fightAccidentalBlooms.ffDuty.length > 0 &&
      fightAccidentalBlooms.nonFfDuty.length > 0
    ) {
      const ffMedian = median(fightAccidentalBlooms.ffDuty);
      const nonFfMedian = median(fightAccidentalBlooms.nonFfDuty);
      if (ffMedian !== null && nonFfMedian !== null) {
        bloomsPaired.deltas.push(ffMedian - nonFfMedian);
      }
    }
    if (
      fightEndingManaPct.ffDuty.length > 0 &&
      fightEndingManaPct.nonFfDuty.length > 0
    ) {
      const ffMedian = median(fightEndingManaPct.ffDuty);
      const nonFfMedian = median(fightEndingManaPct.nonFfDuty);
      if (ffMedian !== null && nonFfMedian !== null) {
        manaPaired.deltas.push(ffMedian - nonFfMedian);
      }
    }
  }

  report("LB3 refresh cadence (median ms)", refreshCadence);
  report("Accidental blooms (count)", accidentalBlooms);
  report("Re-stack tax (cast count)", restackTax);
  report("Ending mana %", endingManaPct);
  report("Consumable used-minus-floor delta (summed)", consumableFloorDelta);

  reportPaired("Re-stack tax", restackTaxPaired);
  reportPaired("Accidental blooms", bloomsPaired);
  reportPaired("Ending mana %", manaPaired);
  reportJudgementDistribution(
    "Re-stack tax",
    restackTaxJudgeFf,
    restackTaxJudgeNon,
  );
  reportJudgementDistribution(
    "Accidental blooms",
    bloomsJudgeFf,
    bloomsJudgeNon,
  );
  reportJudgementDistribution(
    "Refresh cadence",
    cadenceJudgeFf,
    cadenceJudgeNon,
  );
  reportJudgementDistribution("Ending mana %", manaJudgeFf, manaJudgeNon);
  reportJudgementDistribution(
    "Consumable throughput",
    consumableJudgeFf,
    consumableJudgeNon,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
