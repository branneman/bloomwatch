import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeLb3Uptime } from "../../../metrics/lb3Uptime";
import { computeRefreshCadence } from "../../../metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../../metrics/accidentalBlooms";
import { computeRestackTax } from "../../../metrics/restackTax";
import { computeConcurrentLb3Targets } from "../../../metrics/concurrentLb3Targets";
import { computeFaerieFireDuty } from "../../../metrics/faerieFireDuty";
import {
  detectCarryInTargets,
  hasLifebloomCast,
} from "../../../metrics/lifebloomStacks";
import { summarizeLifebloomDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

const LOOKBACK_WINDOW_MS = 60_000;

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
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
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
      .then(async ([buffEvents, castEvents, healEvents]) => {
        const carryInTargets = detectCarryInTargets(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const lookbackEvents =
          carryInTargets.length > 0
            ? await fetchLookbackEvents(
                accessToken,
                reportCode,
                "Buffs",
                fight.startTime - LOOKBACK_WINDOW_MS,
                fight.startTime,
                true,
              )
            : undefined;

        const lb3 = computeLb3Uptime(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
          lookbackEvents,
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
        const faerieFireDuty = computeFaerieFireDuty(
          castEvents,
          druidId,
          faerieFireAbilityIds,
          bossActorIds,
          fight.endTime - fight.startTime,
        );
        const restack = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
          faerieFireDuty.onDuty,
        );
        const concurrent = computeConcurrentLb3Targets(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
          lookbackEvents,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeLifebloomDiscipline(
              lb3,
              refresh,
              blooms,
              restack,
              concurrent,
              hasLifebloomCast(castEvents, druidId, lifebloomAbilityIds),
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
    fetchLookbackEvents,
    faerieFireAbilityIds,
    bossActorIds,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
