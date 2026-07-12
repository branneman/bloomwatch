import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { HotClipDetectionCard } from "../HotClipDetectionCard";
import styles from "./index.module.css";

export interface SpellDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function SpellDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
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
    </div>
  );
}
