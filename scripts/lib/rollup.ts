import {
  weightedMedianJudgement,
  judgementBreakdown,
  type Judgement,
} from "../../src/metrics/judgement";
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
  SpellDisciplineMetrics,
  ManaEconomyMetrics,
  DeathForensicsMetrics,
  PrepHygieneMetrics,
  EpicRollupBase,
  GcdEconomyRollup,
  LifebloomDisciplineRollup,
  LifebloomTargetRollup,
  RefreshCadenceBucketRollup,
  SpellDisciplineRollup,
  ManaEconomyRollup,
  OverhealRollupRow,
  DeathForensicsRollup,
  PrepHygieneRollup,
  InformationalRollup,
  DruidRollup,
} from "./types";

function isReady<M>(
  epic: EpicResult<M>,
): epic is Extract<EpicResult<M>, { status: "ready" }> {
  return epic.status === "ready";
}

interface ReadyEntry<M> {
  metrics: M;
  judgement: Judgement;
  durationMs: number;
}

// Pairs each fight's chosen epic with that fight's duration, keeping only
// fights where the epic actually resolved — the one place `isReady`'s type
// predicate applies, so every caller below works with plain, fully-typed
// `M` metrics rather than the raw union.
function readyEntries<M>(
  fights: FightResult[],
  select: (f: FightResult) => EpicResult<M>,
): ReadyEntry<M>[] {
  const result: ReadyEntry<M>[] = [];
  for (const fight of fights) {
    const epic = select(fight);
    if (isReady(epic)) {
      result.push({
        metrics: epic.metrics,
        judgement: epic.judgement,
        durationMs: fight.durationMs,
      });
    }
  }
  return result;
}

function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  return {
    judgement: weightedMedianJudgement(
      ready.map((r) => ({ judgement: r.judgement, weightMs: r.durationMs })),
    ),
    judgementBreakdown: judgementBreakdown(
      ready.map((r) => ({ judgement: r.judgement })),
    ),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function durationWeightedAverage(
  entries: { value: number; weightMs: number }[],
): number | null {
  const totalWeight = sum(entries.map((e) => e.weightMs));
  if (totalWeight === 0) return null;
  return sum(entries.map((e) => e.value * e.weightMs)) / totalWeight;
}

function countWeightedAverage(
  entries: { value: number; weight: number }[],
): number | null {
  const totalWeight = sum(entries.map((e) => e.weight));
  if (totalWeight === 0) return null;
  return sum(entries.map((e) => e.value * e.weight)) / totalWeight;
}

export function rollupDruid(fights: FightResult[]): DruidRollup {
  // --- GCD economy ---
  const gcdReady = readyEntries<GcdEconomyMetrics>(
    fights,
    (f) => f.epics.gcdEconomy,
  );
  const gcdEconomy: GcdEconomyRollup = {
    ...epicRollupBase(fights.length, gcdReady),
    gcdUtilizationPct: durationWeightedAverage(
      gcdReady.map((r) => ({
        value: r.metrics.gcdUtilization.utilizationPct,
        weightMs: r.durationMs,
      })),
    ),
    idleGapsDeadTimePct: durationWeightedAverage(
      gcdReady.map((r) => ({
        value: r.metrics.idleGaps.deadTimePct,
        weightMs: r.durationMs,
      })),
    ),
  };

  // --- Lifebloom discipline ---
  const lbReady = readyEntries<LifebloomDisciplineMetrics>(
    fights,
    (f) => f.epics.lifebloomDiscipline,
  );
  const targetWindows = new Map<
    number,
    { value: number; weightMs: number }[]
  >();
  const refreshMedians: { value: number; weight: number }[] = [];
  const bucketTotals: Record<
    "redEarly" | "orange" | "green" | "redLate",
    number
  > = {
    redEarly: 0,
    orange: 0,
    green: 0,
    redLate: 0,
  };
  let accidentalBloomsTotal = 0;
  let restackTaxCastsTotal = 0;
  let restackTaxEstimatedManaTotal = 0;
  for (const entry of lbReady) {
    for (const target of entry.metrics.lb3Uptime.targets) {
      const list = targetWindows.get(target.targetId) ?? [];
      list.push({ value: target.lb3UptimePct, weightMs: target.windowMs });
      targetWindows.set(target.targetId, list);
    }
    if (entry.metrics.refreshCadence.medianMs !== null) {
      refreshMedians.push({
        value: entry.metrics.refreshCadence.medianMs,
        weight: entry.metrics.refreshCadence.intervalCount,
      });
    }
    for (const bucket of entry.metrics.refreshCadence.buckets) {
      bucketTotals[bucket.label] += bucket.count;
    }
    accidentalBloomsTotal += entry.metrics.accidentalBlooms.count;
    restackTaxCastsTotal += entry.metrics.restackTax.castCount;
    restackTaxEstimatedManaTotal += entry.metrics.restackTax.estimatedMana;
  }
  const bucketCountTotal =
    bucketTotals.redEarly +
    bucketTotals.orange +
    bucketTotals.green +
    bucketTotals.redLate;
  const refreshCadenceBuckets: RefreshCadenceBucketRollup[] = (
    ["redEarly", "orange", "green", "redLate"] as const
  ).map((label) => ({
    label,
    count: bucketTotals[label],
    pct:
      bucketCountTotal === 0
        ? 0
        : Math.round((bucketTotals[label] / bucketCountTotal) * 100),
  }));
  const lb3UptimeByTarget: LifebloomTargetRollup[] = [
    ...targetWindows.entries(),
  ]
    .map(([targetId, entries]) => ({
      targetId,
      lb3UptimePctPooled: durationWeightedAverage(entries),
      totalWindowMs: sum(entries.map((e) => e.weightMs)),
    }))
    .sort((a, b) => a.targetId - b.targetId);
  const lifebloomDiscipline: LifebloomDisciplineRollup = {
    ...epicRollupBase(fights.length, lbReady),
    lb3UptimeByTarget,
    refreshCadenceMedianMsPooled: countWeightedAverage(refreshMedians),
    refreshCadenceBuckets,
    accidentalBloomsTotal,
    restackTaxCastsTotal,
    restackTaxEstimatedManaTotal,
  };

  // --- Spell discipline ---
  const spellReady = readyEntries<SpellDisciplineMetrics>(
    fights,
    (f) => f.epics.spellDiscipline,
  );
  const rejuvEntries: { value: number; weight: number }[] = [];
  const regrowthEntries: { value: number; weight: number }[] = [];
  const swiftmendEntries: { value: number; weight: number }[] = [];
  let downrankingFlaggedTotal = 0;
  for (const entry of spellReady) {
    rejuvEntries.push({
      value: entry.metrics.hotClipDetection.rejuvenation.clipPct,
      weight: entry.metrics.hotClipDetection.rejuvenation.castCount,
    });
    regrowthEntries.push({
      value: entry.metrics.hotClipDetection.regrowth.clipPct,
      weight: entry.metrics.hotClipDetection.regrowth.castCount,
    });
    swiftmendEntries.push({
      value: entry.metrics.swiftmendAudit.wastefulPct,
      weight: entry.metrics.swiftmendAudit.casts.length,
    });
    downrankingFlaggedTotal += entry.metrics.downrankingDiscipline.flaggedCount;
  }
  const spellDiscipline: SpellDisciplineRollup = {
    ...epicRollupBase(fights.length, spellReady),
    rejuvenationClipPctPooled: countWeightedAverage(rejuvEntries),
    regrowthClipPctPooled: countWeightedAverage(regrowthEntries),
    swiftmendWastefulPctPooled: countWeightedAverage(swiftmendEntries),
    downrankingFlaggedTotal,
  };

  // --- Mana economy ---
  const manaReady = readyEntries<ManaEconomyMetrics>(
    fights,
    (f) => f.epics.manaEconomy,
  );
  const endingPcts: number[] = [];
  let potionsUsedTotal = 0;
  let potionsFloorTotal = 0;
  let runesUsedTotal = 0;
  let runesFloorTotal = 0;
  const overhealTotals = new Map<
    string,
    { category: string; spell: string; amount: number; overheal: number }
  >();
  for (const entry of manaReady) {
    if (
      entry.metrics.manaCurve.judgement !== null &&
      entry.metrics.manaCurve.endingPct !== null
    ) {
      endingPcts.push(entry.metrics.manaCurve.endingPct);
    }
    if (!entry.metrics.consumableThroughput.exempt) {
      for (const row of entry.metrics.consumableThroughput.rows) {
        if (row.label === "Mana Potion") {
          potionsUsedTotal += row.used;
          potionsFloorTotal += row.expectedFloor;
        } else {
          runesUsedTotal += row.used;
          runesFloorTotal += row.expectedFloor;
        }
      }
    }
    for (const row of entry.metrics.overhealTable.rows) {
      const key = `${row.category}:${row.spell}`;
      const existing = overhealTotals.get(key) ?? {
        category: row.category,
        spell: row.spell,
        amount: 0,
        overheal: 0,
      };
      existing.amount += row.amount;
      existing.overheal += row.overheal;
      overhealTotals.set(key, existing);
    }
  }
  const overhealPooled: OverhealRollupRow[] = [...overhealTotals.values()].map(
    (row) => {
      const total = row.amount + row.overheal;
      return {
        ...row,
        overhealPct: total === 0 ? 0 : Math.round((row.overheal / total) * 100),
      };
    },
  );
  const manaEconomy: ManaEconomyRollup = {
    ...epicRollupBase(fights.length, manaReady),
    manaCurveEndingPctAvg: average(endingPcts),
    potionsUsedTotal,
    potionsFloorTotal,
    runesUsedTotal,
    runesFloorTotal,
    overhealPooled,
  };

  // --- Death forensics ---
  const deathReady = readyEntries<DeathForensicsMetrics>(
    fights,
    (f) => f.epics.deathForensics,
  );
  let deathsTotal = 0;
  let flaggedTotal = 0;
  for (const entry of deathReady) {
    deathsTotal += entry.metrics.deathForensics.deaths.length;
    flaggedTotal += entry.metrics.deathForensics.flaggedCount;
  }
  const deathForensics: DeathForensicsRollup = {
    ...epicRollupBase(fights.length, deathReady),
    deathsTotal,
    flaggedTotal,
  };

  // --- Prep hygiene ---
  const prepReady = readyEntries<PrepHygieneMetrics>(
    fights,
    (f) => f.epics.prepHygiene,
  );
  let fightsWithFlaskOrElixir = 0;
  let fightsWithFood = 0;
  let fightsWithOil = 0;
  for (const entry of prepReady) {
    if (entry.metrics.prepHygiene.flaskOrElixir.judgement === "green")
      fightsWithFlaskOrElixir += 1;
    if (entry.metrics.prepHygiene.foodBuffPresent) fightsWithFood += 1;
    if (entry.metrics.prepHygiene.weaponOilPresent) fightsWithOil += 1;
  }
  const prepHygiene: PrepHygieneRollup = {
    ...epicRollupBase(fights.length, prepReady),
    totalFights: prepReady.length,
    fightsWithFlaskOrElixir,
    fightsWithFood,
    fightsWithOil,
  };

  // --- Informational (no epic judgement) ---
  const concurrentEntries = fights.map((f) => ({
    value: f.informational.concurrentLb3Targets.avgConcurrent,
    weightMs: f.durationMs,
  }));
  const informational: InformationalRollup = {
    concurrentLb3AvgPooled: durationWeightedAverage(concurrentEntries),
    concurrentLb3PeakMax:
      fights.length === 0
        ? 0
        : Math.max(
            ...fights.map(
              (f) => f.informational.concurrentLb3Targets.peakConcurrent,
            ),
          ),
    // Story 907: a fight where this druid's build can't reach Nature's Swiftness's
    // 20-Restoration requirement has no real availability -- computeNaturesSwiftnessAudit's
    // cooldown-based availableWindows estimate is fictitious there (the player could
    // never actually cast it), so both totals below exclude those fights the same way
    // story 903c already excludes them from the live app's NaturesSwiftnessCard.
    naturesSwiftnessCastsTotal: sum(
      fights
        .filter((f) => f.hasNaturesSwiftness)
        .map((f) => f.informational.naturesSwiftnessAudit.castCount),
    ),
    naturesSwiftnessAvailableWindowsTotal: sum(
      fights
        .filter((f) => f.hasNaturesSwiftness)
        .map((f) => f.informational.naturesSwiftnessAudit.availableWindows),
    ),
  };

  return {
    gcdEconomy,
    lifebloomDiscipline,
    spellDiscipline,
    manaEconomy,
    deathForensics,
    prepHygiene,
    informational,
  };
}
