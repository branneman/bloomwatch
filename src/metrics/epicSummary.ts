import { worstJudgement, type Judgement } from "./judgement";
export { worstJudgement } from "./judgement";
import type { GcdUtilizationResult } from "./gcdUtilization";
import type { IdleGapsResult } from "./idleGaps";
import type { Lb3TargetResult, Lb3UptimeResult } from "./lb3Uptime";
import type { RefreshCadenceResult } from "./refreshCadence";
import type { AccidentalBloomsResult } from "./accidentalBlooms";
import type { RestackTaxResult } from "./restackTax";
import type { HotClipDetectionResult } from "./hotClipDetection";
import type { SwiftmendAuditResult } from "./swiftmendAudit";
import type { DownrankingDisciplineResult } from "./downrankingDiscipline";
import type { ManaCurveResult } from "./manaCurve";
import type { DeathForensicsResult } from "./deathForensics";
import type { PrepHygieneResult } from "./prepHygiene";
import type { ConsumableThroughputResult } from "./consumableThroughput";
import type { OverhealTableResult } from "./overhealTable";
import type { InnervateAuditResult } from "./innervateAudit";

export interface EpicSummary {
  judgement: Judgement;
  stats: string[];
}

export function summarizeGcdEconomy(
  gcd: GcdUtilizationResult,
  idleGaps: IdleGapsResult,
): EpicSummary {
  return {
    judgement: worstJudgement([gcd.judgement, idleGaps.judgement]),
    stats: [
      `GCD utilization: ${Math.round(gcd.utilizationPct)}%`,
      `Idle gaps: ${idleGaps.deadTimePct.toFixed(1)}% dead time`,
    ],
  };
}

function formatLb3UptimeStat(targets: Lb3TargetResult[]): string {
  if (targets.length === 0) return "LB3 uptime: no maintained targets";
  const pcts = targets.map((target) => Math.round(target.lb3UptimePct));
  if (pcts.length === 1) return `LB3 uptime: ${pcts[0]}%`;
  return `LB3 uptime: ${Math.min(...pcts)}–${Math.max(...pcts)}%`;
}

export function summarizeLifebloomDiscipline(
  lb3: Lb3UptimeResult,
  refresh: RefreshCadenceResult,
  blooms: AccidentalBloomsResult,
  restack: RestackTaxResult,
): EpicSummary {
  const judgement = worstJudgement([
    ...lb3.targets.map((target) => target.judgement),
    refresh.judgement,
    blooms.judgement,
    restack.judgement,
  ]);

  const cadenceStat =
    refresh.medianMs === null
      ? "Refresh cadence: no refreshes"
      : `Refresh cadence: ${(refresh.medianMs / 1000).toFixed(1)}s median`;

  return {
    judgement,
    stats: [formatLb3UptimeStat(lb3.targets), cadenceStat],
  };
}

export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
  downranking: DownrankingDisciplineResult,
  hasSwiftmend: boolean,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the worst-of calc (per
  // docs/backlog.md story 303) but doesn't get its own stat line — story
  // 701 caps a dashboard widget at 1-2 stats. Swiftmend's judgement/stat
  // line are excluded entirely (not scored, not shown as a spurious green)
  // when the druid's build can't reach Swiftmend's talent — story 903c.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      ...(hasSwiftmend ? [swiftmendAudit.judgement] : []),
      downranking.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      ...(hasSwiftmend
        ? [`Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`]
        : []),
    ],
  };
}

export function summarizeManaEconomy(
  manaCurve: ManaCurveResult,
  consumableThroughput: ConsumableThroughputResult,
  overhealTable: OverhealTableResult,
  innervateAudit: InnervateAuditResult,
): EpicSummary {
  const consumablesStat = consumableThroughput.exempt
    ? "Consumables: not mana-constrained"
    : consumableThroughput.rows
        .map(
          (row) =>
            `${row.label === "Mana Potion" ? "Potions" : "Runes"}: ${row.used}/${row.expectedFloor}`,
        )
        .join(", ");

  return {
    // overhealTable's and innervateAudit's judgements both join the worst-of
    // calc (per docs/backlog.md stories 404 and 403) but neither gets its own
    // stat line — story 701 caps a dashboard widget at 1-2 stats, same
    // precedent as Downranking Discipline joining Spell Discipline's worst-of
    // silently.
    judgement: worstJudgement([
      manaCurve.judgement,
      consumableThroughput.judgement,
      overhealTable.judgement,
      innervateAudit.judgement,
    ]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
      consumablesStat,
    ],
  };
}

export function summarizeDeathForensics(
  deathForensics: DeathForensicsResult,
): EpicSummary {
  const { deaths, flaggedCount, judgement } = deathForensics;
  return {
    judgement,
    stats:
      deaths.length === 0
        ? ["No friendly deaths"]
        : [`Deaths: ${deaths.length}`, `Flagged: ${flaggedCount}`],
  };
}

export function summarizePrepHygiene(prep: PrepHygieneResult): EpicSummary {
  const { flaskOrElixir, foodBuffPresent, weaponOilPresent, judgement } = prep;

  const flaskOrElixirStat = flaskOrElixir.hasFlask
    ? "Prep: flask active"
    : flaskOrElixir.hasBattleElixir && flaskOrElixir.hasGuardianElixir
      ? "Prep: battle + guardian elixir active"
      : flaskOrElixir.hasBattleElixir
        ? "Prep: only battle elixir active"
        : flaskOrElixir.hasGuardianElixir
          ? "Prep: only guardian elixir active"
          : "Prep: no flask or elixir";

  const foodOilStat =
    foodBuffPresent && weaponOilPresent
      ? "Food & oil: both present"
      : !foodBuffPresent && !weaponOilPresent
        ? "Food & oil: both missing"
        : foodBuffPresent
          ? "Food & oil: oil missing"
          : "Food & oil: food missing";

  return {
    judgement,
    stats: [flaskOrElixirStat, foodOilStat],
  };
}
