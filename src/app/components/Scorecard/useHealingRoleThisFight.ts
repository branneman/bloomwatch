import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { detectHealingRoleThisFight } from "../../../report/druidDetection";

export type HealingRoleStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; healingCastCount: number; isHealingThisFight: boolean };

type TaggedState = { accessToken: string; summary: HealingRoleStatus };

export function useHealingRoleThisFight(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): HealingRoleStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    fetchEvents(accessToken, reportCode, fightArg, "Casts", true)
      .then((events) => {
        const { healingCastCount, isHealingThisFight } =
          detectHealingRoleThisFight(events, druidId, resolvedAbilities);
        setState({
          accessToken,
          summary: { status: "ready", healingCastCount, isHealingThisFight },
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
                : "Failed to detect healing role this fight.",
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
    resolvedAbilities,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
