import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { ManaCurveCard } from "../ManaCurveCard";
import { ConsumableThroughputCard } from "../ConsumableThroughputCard";
import styles from "./index.module.css";

export interface ManaEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
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
  fight,
  druidId,
  resolvedAbilities,
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
    </div>
  );
}
