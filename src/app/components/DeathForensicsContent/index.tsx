import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { DeathForensicsCard } from "../DeathForensicsCard";
import styles from "./index.module.css";

export interface DeathForensicsContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
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

export function DeathForensicsContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: DeathForensicsContentProps) {
  return (
    <div className={styles.group}>
      <DeathForensicsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
