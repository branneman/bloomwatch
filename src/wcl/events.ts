import { WclApiError, postGraphQL } from "./client";

export type WclEventDataType =
  "Casts" | "Buffs" | "Healing" | "Resources" | "Deaths" | "CombatantInfo";

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

export async function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
  includeResources = false,
): Promise<WclEventsPage> {
  let data;
  try {
    data = await postGraphQL(
      accessToken,
      `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
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
