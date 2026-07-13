import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { PrepHygieneCard } from "../PrepHygieneCard";

export interface PrepHygieneContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function PrepHygieneContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: PrepHygieneContentProps) {
  return (
    <PrepHygieneCard
      accessToken={accessToken}
      reportCode={reportCode}
      fight={fight}
      druidId={druidId}
      fetchEvents={fetchEvents}
    />
  );
}
