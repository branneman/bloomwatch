import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import type { Host } from "../../../report/parseReportInput";
import { ManaCurveCard } from "../ManaCurveCard";
import { ConsumableThroughputCard } from "../ConsumableThroughputCard";
import { InnervateAuditCard } from "../InnervateAuditCard";
import { OverhealTableCard } from "../OverhealTableCard";
import styles from "./index.module.css";

export interface ManaEconomyContentProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function ManaEconomyContent({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  targetNames,
  fetchEvents,
}: ManaEconomyContentProps) {
  return (
    <div className={styles.group}>
      <ManaCurveCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
      <ConsumableThroughputCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
      <InnervateAuditCard
        accessToken={accessToken}
        reportCode={reportCode}
        host={host}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        actorClasses={actorClasses}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <OverhealTableCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
