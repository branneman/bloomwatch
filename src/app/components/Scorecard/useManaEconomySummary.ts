import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeManaCurve } from "../../../metrics/manaCurve";
import { computeConsumableThroughput } from "../../../metrics/consumableThroughput";
import { computeOverhealTable } from "../../../metrics/overhealTable";
import {
  computeInnervateAudit,
  type ActorClass,
} from "../../../metrics/innervateAudit";
import { summarizeManaEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useManaEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
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
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([castEvents, healingEvents]) => {
        const manaCurve = computeManaCurve(
          castEvents,
          druidId,
          fight.kill === true,
          fight.endTime - fight.startTime,
        );
        const consumableThroughput = computeConsumableThroughput(
          castEvents,
          druidId,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        const overhealTable = computeOverhealTable(
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        const innervateAudit = computeInnervateAudit(
          castEvents,
          druidId,
          resolvedAbilities,
          actorClasses,
          fight.endTime - fight.startTime,
          fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeManaEconomy(
              manaCurve,
              consumableThroughput,
              overhealTable,
              innervateAudit,
            ),
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
                : "Failed to summarize mana economy.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    fight.kill,
    druidId,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
