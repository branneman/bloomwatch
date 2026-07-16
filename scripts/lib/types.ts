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
}
export interface SpellDisciplineMetrics {
  hotClipDetection: HotClipDetectionResult;
  swiftmendAudit: SwiftmendAuditResult;
  downrankingDiscipline: DownrankingDisciplineResult;
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
  epics: {
    gcdEconomy: EpicResult<GcdEconomyMetrics>;
    lifebloomDiscipline: EpicResult<LifebloomDisciplineMetrics>;
    spellDiscipline: EpicResult<SpellDisciplineMetrics>;
    manaEconomy: EpicResult<ManaEconomyMetrics>;
    deathForensics: EpicResult<DeathForensicsMetrics>;
    prepHygiene: EpicResult<PrepHygieneMetrics>;
  };
  informational: {
    concurrentLb3Targets: ConcurrentLb3Result;
    naturesSwiftnessAudit: NaturesSwiftnessAuditResult;
  };
}

export interface DruidFights {
  druidId: number;
  druidName: string;
  isRestoSpec: boolean;
  healingCastCount: number;
  fights: FightResult[];
}
