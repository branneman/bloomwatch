import { describe, expect, it, vi } from "vitest";
import { createEventFetcher } from "./eventCache";
import type { WclEvent } from "./events";

function anEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 0,
    type: "heal",
    fight: 6,
    ...overrides,
  };
}

const fight = { id: 6, startTime: 1879119, endTime: 2036920 };

describe("createEventFetcher", () => {
  it("concatenates events across multiple pages until nextPageTimestamp is null", async () => {
    const fakeFetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 1 })],
        nextPageTimestamp: 1900000,
      })
      .mockResolvedValueOnce({
        events: [anEvent({ timestamp: 2 })],
        nextPageTimestamp: null,
      });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    const result = await fetchEvents("token", "report1", fight, "Healing");

    expect(result.map((e) => e.timestamp)).toEqual([1, 2]);
    expect(fakeFetchPage).toHaveBeenCalledTimes(2);
    expect(fakeFetchPage).toHaveBeenNthCalledWith(
      1,
      "token",
      "report1",
      6,
      "Healing",
      1879119,
      2036920,
    );
    expect(fakeFetchPage).toHaveBeenNthCalledWith(
      2,
      "token",
      "report1",
      6,
      "Healing",
      1900000,
      2036920,
    );
  });

  it("never fetches the same fight/dataType/report twice", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    await fetchEvents("token", "report1", fight, "Healing");
    await fetchEvents("token", "report1", fight, "Healing");

    expect(fakeFetchPage).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls for the same key into one fetch", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    const [a, b] = await Promise.all([
      fetchEvents("token", "report1", fight, "Healing"),
      fetchEvents("token", "report1", fight, "Healing"),
    ]);

    expect(fakeFetchPage).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("fetches independently for different fight, dataType, or report keys", async () => {
    const fakeFetchPage = vi.fn().mockResolvedValue({
      events: [anEvent()],
      nextPageTimestamp: null,
    });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);
    await fetchEvents("token", "report1", fight, "Healing");
    await fetchEvents("token", "report1", { ...fight, id: 7 }, "Healing");
    await fetchEvents("token", "report1", fight, "Casts");
    await fetchEvents("token", "report2", fight, "Healing");

    expect(fakeFetchPage).toHaveBeenCalledTimes(4);
  });

  it("does not cache a rejected fetch, allowing a later retry", async () => {
    const fakeFetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        events: [anEvent()],
        nextPageTimestamp: null,
      });

    const { fetchEvents } = createEventFetcher(fakeFetchPage);

    await expect(
      fetchEvents("token", "report1", fight, "Healing"),
    ).rejects.toThrow("rate limited");

    const result = await fetchEvents("token", "report1", fight, "Healing");
    expect(result).toHaveLength(1);
    expect(fakeFetchPage).toHaveBeenCalledTimes(2);
  });
});
