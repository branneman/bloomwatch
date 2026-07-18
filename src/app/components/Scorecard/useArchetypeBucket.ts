import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  classifyBucket,
  parseTalentPoints,
  type TalentBucket,
} from "../../../report/archetypeDetection";

export type ArchetypeBucketStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; bucket: TalentBucket };

type TaggedState = { accessToken: string; summary: ArchetypeBucketStatus };

export function useArchetypeBucket(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): ArchetypeBucketStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo")
      .then((combatantInfoEvents) => {
        const talents = parseTalentPoints(combatantInfoEvents, druidId);
        const bucket: TalentBucket =
          talents === null
            ? "unknown-no-talent-data"
            : classifyBucket(talents[0], talents[1], talents[2]);
        setState({ accessToken, summary: { status: "ready", bucket } });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to detect talent archetype.",
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
