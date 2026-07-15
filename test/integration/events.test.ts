import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchEventsPage, WclRateLimitError } from "../../src/wcl/events";
import {
  WclApiError,
  WclGraphQLError,
  USER_API_URL,
} from "../../src/wcl/client";
import singlePageFixture from "./fixtures/events-healing-single-page.json";
import paginatedPage1Fixture from "./fixtures/events-healing-paginated-page1.json";
import paginatedPage2Fixture from "./fixtures/events-healing-paginated-page2.json";
import withResourcesFixture from "./fixtures/events-healing-with-resources.json";

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

  // fetchEventsPage has its own try/catch translating errors out of
  // postGraphQL (for the 429 -> WclRateLimitError case above), unlike the
  // other client.ts query functions which just pass postGraphQL's result
  // straight through — so its GraphQL-errors retry path needs its own
  // regression coverage rather than relying on client.test.ts's.
  it("retries once and succeeds when WCL returns a GraphQL errors response", async () => {
    let callCount = 0;
    server.use(
      http.post(USER_API_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            data: { reportData: { report: { events: null } } },
            errors: [{ message: "report not yet available" }],
          });
        }
        return HttpResponse.json(singlePageFixture);
      }),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(callCount).toBe(2);
      expect(result.events).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mistranslate a GraphQL error into WclRateLimitError once retries are exhausted", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          data: { reportData: { report: { events: null } } },
          errors: [{ message: "report not yet available" }],
        }),
      ),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchEventsPage(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        6,
        "Healing",
        1879119,
        2036920,
      );
      const throwsGraphQLError =
        expect(promise).rejects.toThrow(WclGraphQLError);
      const notRateLimit =
        expect(promise).rejects.not.toBeInstanceOf(WclRateLimitError);
      await vi.advanceTimersByTimeAsync(2000);
      await throwsGraphQLError;
      await notRateLimit;
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses hitPoints/resourceActor fields from a real includeResources response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(withResourcesFixture)),
    );

    const result = await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      1997000,
      1999500,
      true,
    );

    expect(result.events).toHaveLength(4);
    const swiftmendHeal = result.events.find((e) => e.timestamp === 1998513);
    expect(swiftmendHeal).toMatchObject({
      resourceActor: 2,
      hitPoints: 94,
      maxHitPoints: 100,
    });
  });

  it("sends includeResources: true only when requested, and defaults to false", async () => {
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
    expect(requestBody?.query).toContain("includeResources: false");

    await fetchEventsPage(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      6,
      "Healing",
      1879119,
      2036920,
      true,
    );
    expect(requestBody?.query).toContain("includeResources: true");
  });
});
