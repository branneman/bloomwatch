import type { Judgement } from "./judgement";
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

export interface EpicSummary {
  judgement: Judgement;
  stats: string[];
}

const JUDGEMENT_RANK: Record<Judgement, number> = {
  red: 2,
  orange: 1,
  green: 0,
};

export function worstJudgement(judgements: (Judgement | null)[]): Judgement {
  const present = judgements.filter((j): j is Judgement => j !== null);
  return present.reduce(
    (worst, current) =>
      JUDGEMENT_RANK[current] > JUDGEMENT_RANK[worst] ? current : worst,
    "green" as Judgement,
  );
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
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the worst-of calc (per
  // docs/backlog.md story 303) but doesn't get its own stat line — story
  // 701 caps a dashboard widget at 1-2 stats.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      swiftmendAudit.judgement,
      downranking.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`,
    ],
  };
}

export function summarizeManaEconomy(manaCurve: ManaCurveResult): EpicSummary {
  return {
    judgement: worstJudgement([manaCurve.judgement]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
    ],
  };
}
