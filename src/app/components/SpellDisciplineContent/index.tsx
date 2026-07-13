import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { HotClipDetectionCard } from "../HotClipDetectionCard";
import { SwiftmendAuditCard } from "../SwiftmendAuditCard";
import styles from "./index.module.css";

export interface SpellDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function SpellDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  targetNames,
  fetchEvents,
}: SpellDisciplineContentProps) {
  return (
    <div className={styles.group}>
      <HotClipDetectionCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <SwiftmendAuditCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        swiftmendAbilityIds={swiftmendAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
