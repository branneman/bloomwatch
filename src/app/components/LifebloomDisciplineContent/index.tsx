import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { LB3UptimeCard } from "../LB3UptimeCard";
import { RefreshCadenceCard } from "../RefreshCadenceCard";
import { AccidentalBloomsCard } from "../AccidentalBloomsCard";
import { RestackTaxCard } from "../RestackTaxCard";
import { ConcurrentTargetsCard } from "../ConcurrentTargetsCard";
import styles from "./index.module.css";

export interface LifebloomDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function LifebloomDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: LifebloomDisciplineContentProps) {
  return (
    <div className={styles.group}>
      <LB3UptimeCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <RefreshCadenceCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        fetchEvents={fetchEvents}
      />
      <AccidentalBloomsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <RestackTaxCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <ConcurrentTargetsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
