import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeHotClipDetection } from "../../../metrics/hotClipDetection";
import { computeSwiftmendAudit } from "../../../metrics/swiftmendAudit";
import { computeDownrankingDiscipline } from "../../../metrics/downrankingDiscipline";
import { summarizeSpellDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useSpellDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
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
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
        const hotClips = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        const swiftmendAudit = computeSwiftmendAudit(
          buffEvents,
          castEvents,
          healingEvents,
          druidId,
          swiftmendAbilityIds,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
          fight.endTime - fight.startTime,
        );
        const downranking = computeDownrankingDiscipline(
          castEvents,
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking),
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
                : "Failed to summarize Spell discipline.",
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
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    resolvedAbilities,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
