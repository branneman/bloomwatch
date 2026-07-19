import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { Host } from "../../../report/parseReportInput";
import { NearDeathResponseCard } from "../NearDeathResponseCard";
import styles from "./index.module.css";

export interface NearDeathResponseContentProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  healingAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function NearDeathResponseContent({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  healingAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: NearDeathResponseContentProps) {
  return (
    <div className={styles.group}>
      <NearDeathResponseCard
        accessToken={accessToken}
        reportCode={reportCode}
        host={host}
        fight={fight}
        druidId={druidId}
        healingAbilityIds={healingAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
