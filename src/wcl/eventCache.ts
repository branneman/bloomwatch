import { fetchEventsPage } from "./events";
import type { WclEvent, WclEventDataType } from "./events";

export interface EventFetcherFight {
  id: number;
  startTime: number;
  endTime: number;
}

export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
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

  return { fetchEvents };
}
