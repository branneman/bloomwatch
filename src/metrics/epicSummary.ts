import {
  mixedJudgement,
  weightedMedianJudgement,
  type Judgement,
} from "./judgement";
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
import type { NearDeathResponseResult } from "./nearDeathResponse";
import type { PrepHygieneResult } from "./prepHygiene";
import type { ConsumableThroughputResult } from "./consumableThroughput";
import type { OverhealTableResult } from "./overhealTable";
import type { InnervateAuditResult } from "./innervateAudit";
import type { ConcurrentLb3Result } from "./concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "./naturesSwiftnessAudit";

export interface EpicSummary {
  judgement: Judgement | null;
  stats: string[];
}

export function summarizeGcdEconomy(
  gcd: GcdUtilizationResult,
  idleGaps: IdleGapsResult,
): EpicSummary {
  return {
    judgement: mixedJudgement([gcd.judgement, idleGaps.judgement]),
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
  concurrent: ConcurrentLb3Result,
  hasLifebloomCast: boolean,
): EpicSummary {
  if (!hasLifebloomCast) {
    return { judgement: null, stats: ["No Lifebloom casts this fight"] };
  }

  // Per-target LB3 judgements are reduced to one representative judgement
  // via weightedMedianJudgement (weighted by each target's own tracked-
  // uptime window) before joining the other siblings below — added
  // 2026-07-19, direct request. Previously every target was folded in
  // flatly alongside refresh/blooms/restack, which meant a fight with
  // several well-maintained targets and just one middling one (no target
  // actually "bad") fell back to strict worst-of and read "fair" even
  // when the middling target's weight was small — see docs/thresholds.md's
  // compounding-factors section for the motivating real example.
  const lb3Reduced = weightedMedianJudgement(
    lb3.targets.map((target) => ({
      judgement: target.judgement,
      weightMs: target.windowMs,
    })),
  );

  const judgement = mixedJudgement([
    lb3Reduced,
    refresh.judgement,
    blooms.judgement,
    restack.judgement,
    concurrent.judgement,
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
  naturesSwiftnessAudit: NaturesSwiftnessAuditResult,
  hasNaturesSwiftness: boolean,
): EpicSummary {
  // Regrowth clipping has no judgement of its own for a deep-resto druid
  // (informational only — see docs/backlog.md story 301), but does for
  // every other archetype (story 914) — folded in via `?? null` since it's
  // an optional field on HotClipDetectionResult. The widget's two stat
  // lines still show only the two metrics that always carry a judgement.
  // Downranking's judgement also joins the mixedJudgement calc
  // (per docs/backlog.md story 303 — see docs/thresholds.md's
  // compounding-factors section for the full rationale, formerly its own
  // design doc, retired once this shipped) but doesn't get its own stat
  // line — story 701 caps a dashboard widget at 1-2 stats. Swiftmend's
  // judgements/stat line are excluded entirely (not scored, not shown as
  // a spurious good) when the druid's build can't reach Swiftmend's
  // talent — story 903c. Swiftmend now contributes two judgements when
  // eligible (wasteful share and utilization, story 302 revised direct
  // request 2026-07-20) and Nature's Swiftness contributes its own
  // utilization judgement when the build can reach its talent (story 304
  // revised story 914, same date) — neither gets its own stat line, same
  // precedent as downranking.
  return {
    judgement: mixedJudgement([
      hotClips.rejuvenation.judgement,
      hotClips.regrowth.judgement ?? null,
      ...(hasSwiftmend
        ? [swiftmendAudit.judgement, swiftmendAudit.utilizationJudgement]
        : []),
      downranking.judgement,
      ...(hasNaturesSwiftness ? [naturesSwiftnessAudit.judgement] : []),
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
    // overhealTable's and innervateAudit's judgements both join the
    // mixedJudgement calc (per docs/backlog.md stories 404 and 403 — see
    // docs/thresholds.md's compounding-factors section for the full
    // rationale, formerly its own design doc, retired once this shipped)
    // but neither gets its own stat line — story 701 caps a dashboard
    // widget at 1-2 stats, same precedent as Downranking Discipline
    // joining Spell Discipline's calc silently.
    judgement: mixedJudgement([
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

export function summarizeNearDeathResponse(
  nearDeathResponse: NearDeathResponseResult,
): EpicSummary {
  const { crises, flaggedCount, judgement } = nearDeathResponse;
  return {
    judgement,
    stats:
      crises.length === 0
        ? ["No crises"]
        : [`Crises: ${crises.length}`, `Flagged: ${flaggedCount}`],
  };
}

export function summarizePrepHygiene(prep: PrepHygieneResult): EpicSummary {
  const {
    flaskOrElixir,
    foodBuffPresent,
    weaponOilPresent,
    enchantCoverage,
    gemCoverage,
    judgement,
  } = prep;

  const flaskOrElixirStat = flaskOrElixir.hasFlask
    ? "Prep: flask active"
    : flaskOrElixir.hasBattleElixir && flaskOrElixir.hasGuardianElixir
      ? "Prep: battle + guardian elixir active"
      : flaskOrElixir.hasBattleElixir
        ? "Prep: only battle elixir active"
        : flaskOrElixir.hasGuardianElixir
          ? "Prep: only guardian elixir active"
          : "Prep: no flask or elixir";

  // Enchant/gem coverage (story 602) folds into this same line rather than
  // getting its own 3rd stat line — story 701 caps a dashboard widget at
  // 1-2 key stats (same precedent as Downranking Discipline/overheal/
  // Innervate joining summarizeSpellDiscipline/summarizeManaEconomy's
  // judgement silently, see the comment there).
  const gearIssueCount =
    enchantCoverage.missingSlots.length + gemCoverage.missingOrWrongCount;
  const issues: string[] = [];
  if (!foodBuffPresent) issues.push("food missing");
  if (!weaponOilPresent) issues.push("oil missing");
  if (gearIssueCount > 0) {
    issues.push(
      gearIssueCount === 1 ? "1 gear issue" : `${gearIssueCount} gear issues`,
    );
  }
  const readinessStat =
    issues.length === 0
      ? "Food, oil & gear: all set"
      : `Food, oil & gear: ${issues.join(", ")}`;

  return {
    judgement,
    stats: [flaskOrElixirStat, readinessStat],
  };
}
