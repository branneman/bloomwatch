import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchEventsPage, WclRateLimitError } from "../../src/wcl/events";
import { WclApiError, USER_API_URL } from "../../src/wcl/client";
import singlePageFixture from "./fixtures/events-healing-single-page.json";
import paginatedPage1Fixture from "./fixtures/events-healing-paginated-page1.json";
import paginatedPage2Fixture from "./fixtures/events-healing-paginated-page2.json";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchEventsPage", () => {
  it("parses events and nextPageTimestamp from a real single-page response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(singlePageFixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      1879119,
      2036920,
    );

    expect(result.nextPageTimestamp).toBeNull();
    expect(result.events).toHaveLength(5);
    expect(result.events[0]).toMatchObject({
      timestamp: expect.any(Number),
      type: "heal",
    });
  });

  it("parses a non-null nextPageTimestamp from a real paginated response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(paginatedPage1Fixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      0,
      999999999,
    );

    expect(result.nextPageTimestamp).toBe(2489306);
    expect(result.events).toHaveLength(5);
  });

  it("parses a different nextPageTimestamp from the following real page", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(paginatedPage2Fixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      2489306,
      999999999,
    );

    expect(result.nextPageTimestamp).toBe(3068415);
    expect(result.events).toHaveLength(5);
  });

  it("sends fightIDs, dataType, startTime, and endTime in the query", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(singlePageFixture);
      }),
    );

    await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      1879119,
      2036920,
    );

    expect(requestBody?.query).toContain("fightIDs: [6]");
    expect(requestBody?.query).toContain("dataType: Healing");
    expect(requestBody?.query).toContain("startTime: 1879119");
    expect(requestBody?.query).toContain("endTime: 2036920");
  });

  it("throws WclRateLimitError with a retryable message on HTTP 429", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );

    await expect(
      fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      ),
    ).rejects.toThrow(WclRateLimitError);

    let error: unknown;
    try {
      await fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      );
    } catch (e) {
      error = e;
    }
    expect((error as Error).message).toBe(
      "Warcraft Logs is rate-limiting requests right now — wait a moment and try again.",
    );
  });

  it("throws WclApiError on other non-2xx responses", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
      ),
    );

    await expect(
      fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      ),
    ).rejects.toThrow(WclApiError);
  });
});
