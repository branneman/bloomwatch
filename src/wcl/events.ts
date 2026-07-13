import { USER_API_URL, WclApiError } from "./client";

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
  const resp = await fetch(USER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (resp.status === 429) throw new WclRateLimitError(resp.status, bodyText);
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  const events = parsed.data.reportData.report.events;
  return {
    events: events.data,
    nextPageTimestamp: events.nextPageTimestamp,
  };
}
