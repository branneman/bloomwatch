import { fetchEventsPage, fetchLookbackEventsPage } from "./events";
import type { WclEvent, WclEventDataType } from "./events";
import type { Host } from "./client";

export interface EventFetcherFight {
  id: number;
  startTime: number;
  endTime: number;
}

export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
  fetchLookbackPage: typeof fetchLookbackEventsPage = fetchLookbackEventsPage,
  host: Host = "fresh",
) {
  const cache = new Map<string, Promise<WclEvent[]>>();

  async function fetchAllPages(
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources: boolean,
  ): Promise<WclEvent[]> {
    const events: WclEvent[] = [];
    let startTime = fight.startTime;
    for (;;) {
      const page = await fetchPage(
        accessToken,
        reportCode,
        fight.id,
        dataType,
        startTime,
        fight.endTime,
        includeResources,
        host,
      );
      events.push(...page.events);
      if (page.nextPageTimestamp === null) break;
      startTime = page.nextPageTimestamp;
    }
    return events;
  }

  function fetchEvents(
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources = false,
  ): Promise<WclEvent[]> {
    // includeResources only ever adds fields, never removes/changes ones a
    // false-requesting caller relies on (story 010) — so every call site for a
    // given dataType should pass the same value. A mismatch here silently
    // splits the cache key and doubles the request for that dataType/fight.
    const key = `${reportCode}:${fight.id}:${dataType}:${includeResources}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = fetchAllPages(
      accessToken,
      reportCode,
      fight,
      dataType,
      includeResources,
    ).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
    return promise;
  }

  // Story 915: a bounded pre-fightStart lookback, deliberately uncached (see
  // plan) and deliberately not fightIDs-filtered (see fetchLookbackEventsPage's
  // own comment) — callers gate this behind a one-time ambiguity check, so
  // repeated requests for the same window shouldn't happen in practice.
  async function fetchLookbackEvents(
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources = false,
  ): Promise<WclEvent[]> {
    const events: WclEvent[] = [];
    let cursor = startTime;
    for (;;) {
      const page = await fetchLookbackPage(
        accessToken,
        reportCode,
        dataType,
        cursor,
        endTime,
        includeResources,
        host,
      );
      events.push(...page.events);
      if (page.nextPageTimestamp === null) break;
      cursor = page.nextPageTimestamp;
    }
    return events;
  }

  return { fetchEvents, fetchLookbackEvents };
}
