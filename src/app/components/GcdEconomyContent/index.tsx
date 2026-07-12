import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { GCDUtilizationCard } from "../GCDUtilizationCard";
import { IdleGapsCard } from "../IdleGapsCard";
import styles from "./index.module.css";

export interface GcdEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function GcdEconomyContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GcdEconomyContentProps) {
  return (
    <div className={styles.group}>
      <GCDUtilizationCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
      <IdleGapsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
