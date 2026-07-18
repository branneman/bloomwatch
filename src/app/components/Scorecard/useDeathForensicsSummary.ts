import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeDeathForensics } from "../../../metrics/deathForensics";
import { summarizeDeathForensics } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useDeathForensicsSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
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
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(([deathEvents, castEvents, buffEvents, combatantInfoEvents]) => {
        const talents = parseTalentPoints(combatantInfoEvents, druidId);
        const restoration = talents === null ? 0 : talents[2];
        const computed = computeDeathForensics(
          deathEvents,
          castEvents,
          buffEvents,
          druidId,
          swiftmendAbilityIds,
          naturesSwiftnessAbilityIds,
          lifebloomAbilityIds,
          restoration >= SWIFTMEND_MIN_RESTORATION,
          restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
          fight.startTime,
          fight.endTime,
        );
        setState({
          accessToken,
          summary: { status: "ready", ...summarizeDeathForensics(computed) },
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
                : "Failed to summarize Death forensics.",
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
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
