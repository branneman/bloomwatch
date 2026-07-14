import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeLb3Uptime } from "../../../metrics/lb3Uptime";
import { computeRefreshCadence } from "../../../metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../../metrics/accidentalBlooms";
import { computeRestackTax } from "../../../metrics/restackTax";
import { summarizeLifebloomDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useLifebloomDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healEvents]) => {
        const lb3 = computeLb3Uptime(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        const refresh = computeRefreshCadence(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const blooms = computeAccidentalBlooms(
          buffEvents,
          healEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const restack = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeLifebloomDiscipline(lb3, refresh, blooms, restack),
          },
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
                : "Failed to summarize Lifebloom discipline.",
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
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
