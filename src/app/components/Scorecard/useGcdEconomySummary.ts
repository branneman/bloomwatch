import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeGcdUtilization } from "../../../metrics/gcdUtilization";
import { computeIdleGaps } from "../../../metrics/idleGaps";
import { summarizeGcdEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useGcdEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const gcd = computeGcdUtilization(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        const idleGaps = computeIdleGaps(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setState({
          accessToken,
          summary: { status: "ready", ...summarizeGcdEconomy(gcd, idleGaps) },
        });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to summarize GCD economy.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
