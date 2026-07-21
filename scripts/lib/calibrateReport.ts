import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
} from "../../src/wcl/client";
import type { Fight } from "../../src/wcl/client";
import { createEventFetcher } from "../../src/wcl/eventCache";
import { detectDruids } from "../../src/report/druidDetection";
import type { DruidCandidate } from "../../src/report/druidDetection";
import { buildFightRows } from "../../src/report/fightRows";
import {
  classifyBucket,
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../src/report/archetypeDetection";
import {
  resolveAbilities,
  resolveSpellAbilityIds,
} from "../../src/abilities/resolveAbilities";
import type { ResolvedAbility } from "../../src/abilities/resolveAbilities";
import type { ActorClass } from "../../src/metrics/innervateAudit";
import { computeGcdUtilization } from "../../src/metrics/gcdUtilization";
import { computeIdleGaps } from "../../src/metrics/idleGaps";
import { computeLb3Uptime } from "../../src/metrics/lb3Uptime";
import { computeRefreshCadence } from "../../src/metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../src/metrics/accidentalBlooms";
import { computeRestackTax } from "../../src/metrics/restackTax";
import { computeConcurrentLb3Targets } from "../../src/metrics/concurrentLb3Targets";
import { detectCarryInTargets } from "../../src/metrics/lifebloomStacks";
import { computeHotClipDetection } from "../../src/metrics/hotClipDetection";
import { computeSwiftmendAudit } from "../../src/metrics/swiftmendAudit";
import { computeDownrankingDiscipline } from "../../src/metrics/downrankingDiscipline";
import { computeNaturesSwiftnessAudit } from "../../src/metrics/naturesSwiftnessAudit";
import { computeManaCurve } from "../../src/metrics/manaCurve";
import { computeConsumableThroughput } from "../../src/metrics/consumableThroughput";
import { computeOverhealTable } from "../../src/metrics/overhealTable";
import { computeInnervateAudit } from "../../src/metrics/innervateAudit";
import { computeDeathForensics } from "../../src/metrics/deathForensics";
import { computePrepHygiene } from "../../src/metrics/prepHygiene";
import {
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
  summarizeSpellDiscipline,
  summarizeManaEconomy,
  summarizeDeathForensics,
  summarizePrepHygiene,
} from "../../src/metrics/epicSummary";
import type { EpicSummary } from "../../src/metrics/epicSummary";
import { rollupDruid } from "./rollup";
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
  SpellDisciplineMetrics,
  ManaEconomyMetrics,
  DeathForensicsMetrics,
  PrepHygieneMetrics,
  CalibrationOutput,
  DruidResult,
} from "./types";

export interface ReportContext {
  accessToken: string;
  reportCode: string;
  reportTitle: string;
  nonTrashFights: { fight: Fight; pullNumber: number | null }[];
  candidates: DruidCandidate[];
  resolvedAbilities: Map<number, ResolvedAbility>;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReturnType<typeof createEventFetcher>["fetchEvents"];
  fetchLookbackEvents: ReturnType<
    typeof createEventFetcher
  >["fetchLookbackEvents"];
}

export async function buildReportContext(
  accessToken: string,
  reportCode: string,
): Promise<ReportContext> {
  const { title, fights } = await fetchReportFights(accessToken, reportCode);
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => ({ fight: row.fight, pullNumber: row.pullNumber }));

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((row) => row.fight.id),
  );
  const candidates = detectDruids(castTableEntries);
  const actorClasses = new Map(
    castTableEntries.map((entry) => [
      entry.id,
      { class: entry.type, specIcon: entry.icon },
    ]),
  );

  const reportAbilities = await fetchMasterDataAbilities(
    accessToken,
    reportCode,
  );
  const resolvedAbilities = resolveAbilities(reportAbilities);

  const { fetchEvents, fetchLookbackEvents } = createEventFetcher();

  return {
    accessToken,
    reportCode,
    reportTitle: title,
    nonTrashFights,
    candidates,
    resolvedAbilities,
    lifebloomAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Lifebloom"),
    rejuvenationAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Rejuvenation",
    ),
    regrowthAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Regrowth"),
    swiftmendAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Swiftmend"),
    naturesSwiftnessAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Nature's Swiftness",
    ),
    actorClasses,
    fetchEvents,
    fetchLookbackEvents,
  };
}

function toEpicResult<M>(
  compute: () => { summary: EpicSummary; metrics: M },
): EpicResult<M> {
  try {
    const { summary, metrics } = compute();
    return {
      status: "ready",
      judgement: summary.judgement,
      stats: summary.stats,
      metrics,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function computeFightResult(
  ctx: ReportContext,
  candidate: DruidCandidate,
  fight: Fight,
  pullNumber: number | null,
): Promise<FightResult> {
  const druidId = candidate.id;
  const durationMs = fight.endTime - fight.startTime;

  const [
    buffEvents,
    castEvents,
    healingEvents,
    deathEvents,
    combatantInfoEvents,
  ] = await Promise.all([
    ctx.fetchEvents(
      ctx.accessToken,
      ctx.reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    ),
    ctx.fetchEvents(
      ctx.accessToken,
      ctx.reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
      true,
    ),
    ctx.fetchEvents(
      ctx.accessToken,
      ctx.reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Healing",
      true,
    ),
    ctx.fetchEvents(
      ctx.accessToken,
      ctx.reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Deaths",
    ),
    ctx.fetchEvents(
      ctx.accessToken,
      ctx.reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "CombatantInfo",
    ),
  ]);

  const carryInTargets = detectCarryInTargets(
    buffEvents,
    druidId,
    ctx.lifebloomAbilityIds,
  );
  const lookbackEvents =
    carryInTargets.length > 0
      ? await ctx.fetchLookbackEvents(
          ctx.accessToken,
          ctx.reportCode,
          "Buffs",
          fight.startTime - 60_000,
          fight.startTime,
          true,
        )
      : undefined;

  const talents = parseTalentPoints(combatantInfoEvents, druidId);
  const restoration = talents === null ? 0 : talents[2];
  const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
  const hasNaturesSwiftness = restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
  const archetypeBucket =
    talents === null
      ? "unknown-no-talent-data"
      : classifyBucket(talents[0], talents[1], talents[2]);

  const gcdEconomy = toEpicResult<GcdEconomyMetrics>(() => {
    const gcdUtilization = computeGcdUtilization(
      castEvents,
      druidId,
      fight.startTime,
      fight.endTime,
    );
    const idleGaps = computeIdleGaps(
      castEvents,
      druidId,
      fight.startTime,
      fight.endTime,
    );
    return {
      summary: summarizeGcdEconomy(gcdUtilization, idleGaps),
      metrics: { gcdUtilization, idleGaps },
    };
  });

  const lifebloomDiscipline = toEpicResult<LifebloomDisciplineMetrics>(() => {
    const lb3Uptime = computeLb3Uptime(
      buffEvents,
      druidId,
      ctx.lifebloomAbilityIds,
      fight.startTime,
      fight.endTime,
      lookbackEvents,
    );
    const refreshCadence = computeRefreshCadence(
      buffEvents,
      druidId,
      ctx.lifebloomAbilityIds,
    );
    const accidentalBlooms = computeAccidentalBlooms(
      buffEvents,
      healingEvents,
      druidId,
      ctx.lifebloomAbilityIds,
    );
    const restackTax = computeRestackTax(
      buffEvents,
      castEvents,
      druidId,
      ctx.lifebloomAbilityIds,
      durationMs,
    );
    const concurrentLb3Targets = computeConcurrentLb3Targets(
      buffEvents,
      druidId,
      ctx.lifebloomAbilityIds,
      fight.startTime,
      fight.endTime,
      lookbackEvents,
    );
    return {
      summary: summarizeLifebloomDiscipline(
        lb3Uptime,
        refreshCadence,
        accidentalBlooms,
        restackTax,
        concurrentLb3Targets,
      ),
      metrics: {
        lb3Uptime,
        refreshCadence,
        accidentalBlooms,
        restackTax,
        concurrentLb3Targets,
      },
    };
  });

  const spellDiscipline = toEpicResult<SpellDisciplineMetrics>(() => {
    const hotClipDetection = computeHotClipDetection(
      buffEvents,
      castEvents,
      druidId,
      ctx.rejuvenationAbilityIds,
      ctx.regrowthAbilityIds,
      archetypeBucket,
    );
    const swiftmendAudit = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      druidId,
      ctx.swiftmendAbilityIds,
      ctx.rejuvenationAbilityIds,
      ctx.regrowthAbilityIds,
      durationMs,
    );
    const downrankingDiscipline = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      druidId,
      ctx.resolvedAbilities,
    );
    const naturesSwiftnessAudit = computeNaturesSwiftnessAudit(
      castEvents,
      druidId,
      ctx.naturesSwiftnessAbilityIds,
      ctx.resolvedAbilities,
      durationMs,
    );
    return {
      summary: summarizeSpellDiscipline(
        hotClipDetection,
        swiftmendAudit,
        downrankingDiscipline,
        hasSwiftmend,
        naturesSwiftnessAudit,
        hasNaturesSwiftness,
      ),
      metrics: {
        hotClipDetection,
        swiftmendAudit,
        downrankingDiscipline,
        naturesSwiftnessAudit,
      },
    };
  });

  const manaEconomy = toEpicResult<ManaEconomyMetrics>(() => {
    const manaCurve = computeManaCurve(
      castEvents,
      druidId,
      fight.kill === true,
      durationMs,
    );
    const consumableThroughput = computeConsumableThroughput(
      castEvents,
      druidId,
      ctx.resolvedAbilities,
      durationMs,
    );
    const overhealTable = computeOverhealTable(
      healingEvents,
      druidId,
      ctx.resolvedAbilities,
      archetypeBucket,
    );
    const innervateAudit = computeInnervateAudit(
      castEvents,
      druidId,
      ctx.resolvedAbilities,
      ctx.actorClasses,
      durationMs,
      fight.startTime,
    );
    return {
      summary: summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        overhealTable,
        innervateAudit,
      ),
      metrics: {
        manaCurve,
        consumableThroughput,
        overhealTable,
        innervateAudit,
      },
    };
  });

  const deathForensics = toEpicResult<DeathForensicsMetrics>(() => {
    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      buffEvents,
      druidId,
      ctx.swiftmendAbilityIds,
      ctx.naturesSwiftnessAbilityIds,
      ctx.lifebloomAbilityIds,
      hasSwiftmend,
      hasNaturesSwiftness,
      fight.startTime,
      fight.endTime,
    );
    return {
      summary: summarizeDeathForensics(result),
      metrics: { deathForensics: result },
    };
  });

  const prepHygiene = toEpicResult<PrepHygieneMetrics>(() => {
    const result = computePrepHygiene(combatantInfoEvents, druidId);
    return {
      summary: summarizePrepHygiene(result),
      metrics: { prepHygiene: result },
    };
  });

  return {
    fightId: fight.id,
    bossName: fight.name,
    kill: fight.kill,
    bossPercentage: fight.bossPercentage,
    pullNumber,
    durationMs,
    hasNaturesSwiftness,
    epics: {
      gcdEconomy,
      lifebloomDiscipline,
      spellDiscipline,
      manaEconomy,
      deathForensics,
      prepHygiene,
    },
  };
}

export async function calibrateReport(
  accessToken: string,
  reportCode: string,
): Promise<CalibrationOutput> {
  const ctx = await buildReportContext(accessToken, reportCode);

  const druids: DruidResult[] = [];
  for (const candidate of ctx.candidates) {
    const fights = [];
    for (const { fight, pullNumber } of ctx.nonTrashFights) {
      fights.push(await computeFightResult(ctx, candidate, fight, pullNumber));
    }
    druids.push({
      druidId: candidate.id,
      druidName: candidate.name,
      isRestoSpec: candidate.isRestoSpec,
      healingCastCount: candidate.healingCastCount,
      fights,
      rollup: rollupDruid(fights),
    });
  }

  return {
    reportCode: ctx.reportCode,
    reportTitle: ctx.reportTitle,
    generatedAt: new Date().toISOString(),
    druids,
  };
}
