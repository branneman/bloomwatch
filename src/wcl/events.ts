import { WclApiError, postGraphQL } from "./client";

export type WclEventDataType =
  | "Casts"
  | "Buffs"
  | "Healing"
  | "Resources"
  | "Deaths"
  | "CombatantInfo"
  | "DamageTaken";

export interface WclEvent {
  timestamp: number;
  type: string;
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  stack?: number;
  fight: number;
  [key: string]: unknown;
}

export interface WclEventsPage {
  events: WclEvent[];
  nextPageTimestamp: number | null;
}

export class WclRateLimitError extends WclApiError {
  constructor(status: number, body: string) {
    super(status, body);
    this.message =
      "Warcraft Logs is rate-limiting requests right now — wait a moment and try again.";
  }
}

async function postEventsQuery(
  accessToken: string,
  reportCode: string,
  eventsFieldArgs: string,
): Promise<WclEventsPage> {
  let data;
  try {
    data = await postGraphQL(
      accessToken,
      `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      events(${eventsFieldArgs}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
    );
  } catch (err) {
    if (err instanceof WclApiError && err.status === 429) {
      throw new WclRateLimitError(err.status, err.body);
    }
    throw err;
  }
  const events = data.reportData.report.events;
  return {
    events: events.data,
    nextPageTimestamp: events.nextPageTimestamp,
  };
}

export async function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
): Promise<WclEventsPage> {
  return postEventsQuery(
    accessToken,
    reportCode,
    `fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}`,
  );
}

// Used only for backlog story 915's bounded pre-pull lookback: querying
// with a fightIDs filter never returns events before that fight's own
// startTime, even with an earlier startTime argument (confirmed live
// against report DRtXV4ChA2Kw3c81, fights 24->25 - a fightIDs-filtered
// query for the 60s before fight 25 returned nothing, while the same
// window with fightIDs omitted correctly returned an event tagged to the
// earlier fight 24). Omitting fightIDs is therefore load-bearing, not
// cosmetic - it's the only way to see a carry-in application that lives
// in a different WCL fight ID than the one being judged.
export async function fetchLookbackEventsPage(
  accessToken: string,
  reportCode: string,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
): Promise<WclEventsPage> {
  return postEventsQuery(
    accessToken,
    reportCode,
    `dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}`,
  );
}
