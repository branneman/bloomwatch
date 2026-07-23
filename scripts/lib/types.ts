import type { Host } from "../../src/wcl/client";
import type { Judgement } from "../../src/metrics/judgement";
import type { GcdUtilizationResult } from "../../src/metrics/gcdUtilization";
import type { IdleGapsResult } from "../../src/metrics/idleGaps";
import type { Lb3UptimeResult } from "../../src/metrics/lb3Uptime";
import type { RefreshCadenceResult } from "../../src/metrics/refreshCadence";
import type { AccidentalBloomsResult } from "../../src/metrics/accidentalBlooms";
import type { RestackTaxResult } from "../../src/metrics/restackTax";
import type { HotClipDetectionResult } from "../../src/metrics/hotClipDetection";
import type { SwiftmendAuditResult } from "../../src/metrics/swiftmendAudit";
import type { DownrankingDisciplineResult } from "../../src/metrics/downrankingDiscipline";
import type { ManaCurveResult } from "../../src/metrics/manaCurve";
import type { ConsumableThroughputResult } from "../../src/metrics/consumableThroughput";
import type { OverhealTableResult } from "../../src/metrics/overhealTable";
import type { InnervateAuditResult } from "../../src/metrics/innervateAudit";
import type { DeathForensicsResult } from "../../src/metrics/deathForensics";
import type { NearDeathResponseResult } from "../../src/metrics/nearDeathResponse";
import type { PrepHygieneResult } from "../../src/metrics/prepHygiene";
import type { ConcurrentLb3Result } from "../../src/metrics/concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "../../src/metrics/naturesSwiftnessAudit";

export interface GcdEconomyMetrics {
  gcdUtilization: GcdUtilizationResult;
  idleGaps: IdleGapsResult;
}
export interface LifebloomDisciplineMetrics {
  lb3Uptime: Lb3UptimeResult;
  refreshCadence: RefreshCadenceResult;
  accidentalBlooms: AccidentalBloomsResult;
  restackTax: RestackTaxResult;
  concurrentLb3Targets: ConcurrentLb3Result;
}
export interface SpellDisciplineMetrics {
  hotClipDetection: HotClipDetectionResult;
  swiftmendAudit: SwiftmendAuditResult;
  downrankingDiscipline: DownrankingDisciplineResult;
  naturesSwiftnessAudit: NaturesSwiftnessAuditResult;
}
export interface ManaEconomyMetrics {
  manaCurve: ManaCurveResult;
  consumableThroughput: ConsumableThroughputResult;
  overhealTable: OverhealTableResult;
  innervateAudit: InnervateAuditResult;
}
export interface DeathForensicsMetrics {
  deathForensics: DeathForensicsResult;
}
export interface CrisisResponseMetrics {
  nearDeathResponse: NearDeathResponseResult;
}
export interface PrepHygieneMetrics {
  prepHygiene: PrepHygieneResult;
}

export type EpicResult<M> =
  | { status: "ready"; judgement: Judgement; stats: string[]; metrics: M }
  | { status: "error"; error: string };

export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  hasNaturesSwiftness: boolean;
  epics: {
    gcdEconomy: EpicResult<GcdEconomyMetrics>;
    lifebloomDiscipline: EpicResult<LifebloomDisciplineMetrics>;
    spellDiscipline: EpicResult<SpellDisciplineMetrics>;
    manaEconomy: EpicResult<ManaEconomyMetrics>;
    deathForensics: EpicResult<DeathForensicsMetrics>;
    crisisResponse: EpicResult<CrisisResponseMetrics>;
    prepHygiene: EpicResult<PrepHygieneMetrics>;
  };
}

export interface DruidFights {
  druidId: number;
  druidName: string;
  isRestoSpec: boolean;
  healingCastCount: number;
  fights: FightResult[];
}

export interface EpicRollupBase {
  judgement: Judgement | null;
  judgementBreakdown: Record<Judgement, number>;
  fightsReady: number;
  fightsErrored: number;
}
export interface GcdEconomyRollup extends EpicRollupBase {
  gcdUtilizationPct: number | null;
  idleGapsDeadTimePct: number | null;
}
export interface LifebloomTargetRollup {
  targetId: number;
  lb3UptimePctPooled: number | null;
  totalWindowMs: number;
}
export interface RefreshCadenceBucketRollup {
  label: "badEarly" | "fair" | "good" | "badLate";
  count: number;
  pct: number;
}
export interface LifebloomDisciplineRollup extends EpicRollupBase {
  lb3UptimeByTarget: LifebloomTargetRollup[];
  refreshCadenceMedianMsPooled: number | null;
  refreshCadenceBuckets: RefreshCadenceBucketRollup[];
  accidentalBloomsTotal: number;
  restackTaxCastsTotal: number;
  restackTaxEstimatedManaTotal: number;
  concurrentLb3AvgPooled: number | null;
  concurrentLb3PeakMax: number;
}
export interface SpellDisciplineRollup extends EpicRollupBase {
  rejuvenationClipPctPooled: number | null;
  regrowthClipPctPooled: number | null;
  swiftmendWastefulPctPooled: number | null;
  swiftmendUtilizationPctPooled: number | null;
  downrankingFlaggedTotal: number;
  naturesSwiftnessCastsTotal: number;
  naturesSwiftnessAvailableWindowsTotal: number;
  naturesSwiftnessUtilizationPctPooled: number | null;
}
export interface OverhealRollupRow {
  category: string;
  spell: string;
  amount: number;
  overheal: number;
  overhealPct: number;
}
export interface ManaEconomyRollup extends EpicRollupBase {
  manaCurveEndingPctAvg: number | null;
  potionsUsedTotal: number;
  potionsFloorTotal: number;
  runesUsedTotal: number;
  runesFloorTotal: number;
  overhealPooled: OverhealRollupRow[];
}
export interface DeathForensicsRollup extends EpicRollupBase {
  deathsTotal: number;
  flaggedTotal: number;
}
export interface CrisisResponseRollup extends EpicRollupBase {
  crisesTotal: number;
  flaggedTotal: number;
  clearSaveTotal: number;
  fairUnmaintainedTotal: number;
}
export interface PrepHygieneRollup extends EpicRollupBase {
  totalFights: number;
  fightsWithFlaskOrElixir: number;
  fightsWithFood: number;
  fightsWithOil: number;
}
export interface DruidRollup {
  gcdEconomy: GcdEconomyRollup;
  lifebloomDiscipline: LifebloomDisciplineRollup;
  spellDiscipline: SpellDisciplineRollup;
  manaEconomy: ManaEconomyRollup;
  deathForensics: DeathForensicsRollup;
  crisisResponse: CrisisResponseRollup;
  prepHygiene: PrepHygieneRollup;
}
export interface DruidResult extends DruidFights {
  rollup: DruidRollup;
}
export interface CalibrationOutput {
  reportCode: string;
  reportTitle: string;
  generatedAt: string;
  source: Host;
  druids: DruidResult[];
}
