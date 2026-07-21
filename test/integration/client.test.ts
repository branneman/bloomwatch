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
import {
  exchangeCodeForToken,
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
  WclGraphQLError,
  withRateLimitDetection,
  WclTimeoutError,
  fetchWithTimeout,
  withErrorReporting,
  TOKEN_URL,
  USER_API_URL,
  CLASSIC_USER_API_URL,
} from "../../src/wcl/client";
import tokenResponseFixture from "./fixtures/token-response.json";
import reportFightsFixture from "./fixtures/report-fights.json";
import reportFightsClassicFixture from "./fixtures/report-fights-classic.json";
import castsTableFixture from "./fixtures/casts-table.json";
import masterDataAbilitiesFixture from "./fixtures/masterdata-abilities.json";
import { subscribeRateLimitUsage } from "../../src/wcl/rateLimitUsage";
import { aRateLimitUsage } from "../../src/testUtils/factories";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("exchangeCodeForToken", () => {
  it("parses a successful token response", async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json(tokenResponseFixture)),
    );
    const result = await exchangeCodeForToken({
      clientId: "test-client-id",
      code: "test-code",
      verifier: "test-verifier",
      redirectUri: "https://example.com/",
    });
    expect(result.accessToken).toBe("test-access-token");
    expect(result.expiresIn).toBe(31104000);
  });

  it("throws WclApiError with the raw response on failure", async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      exchangeCodeForToken({
        clientId: "test-client-id",
        code: "bad-code",
        verifier: "test-verifier",
        redirectUri: "https://example.com/",
      }),
    ).rejects.toThrow(WclApiError);
  });
});

describe("fetchReportFights", () => {
  it("parses the report title and fight list from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(reportFightsFixture)),
    );
    const result = await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
    expect(result.title).toBe("SSC+TK 2026-07-07");
    expect(result.fights).toHaveLength(6);
    expect(result.fights[0]).toEqual({
      id: 1,
      name: "Unknown",
      startTime: 760292,
      endTime: 760292,
      encounterID: 0,
      kill: null,
      bossPercentage: null,
      gameZone: { id: 548, name: "Serpentshrine Cavern" },
    });
    expect(result.fights[5]).toEqual({
      id: 6,
      name: "The Lurker Below",
      startTime: 1879119,
      endTime: 2036920,
      encounterID: 100624,
      kill: true,
      bossPercentage: 0.01,
      gameZone: { id: 548, name: "Serpentshrine Cavern" },
    });
  });

  it("requests encounterID, kill, bossPercentage, and gameZone for each fight", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(reportFightsFixture);
      }),
    );

    await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");

    expect(requestBody?.query).toContain("encounterID");
    expect(requestBody?.query).toContain("kill");
    expect(requestBody?.query).toContain("bossPercentage");
    expect(requestBody?.query).toContain("gameZone");
    expect(requestBody?.query).toContain("expansion");
    expect(requestBody?.query).toContain("archiveStatus");
  });

  it("parses expansionId and archiveStatus from a real captured www response", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(reportFightsFixture)),
    );
    const result = await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
    expect(result.expansionId).toBe(1001);
    expect(result.archiveStatus).toEqual({
      isArchived: false,
      isAccessible: true,
    });
  });

  it("parses a real captured classic.-sourced report the same way", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json(reportFightsClassicFixture),
      ),
    );
    const result = await fetchReportFights("test-token", "mtRh3kJ9YMLazyvQ");
    expect(result.title).toBe("BT / Hyjal");
    expect(result.fights).toHaveLength(4);
    expect(result.expansionId).toBe(1001);
    expect(result.archiveStatus).toEqual({
      isArchived: true,
      isAccessible: true,
    });
  });

  it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
    server.use(
      http.post(CLASSIC_USER_API_URL, () =>
        HttpResponse.json(reportFightsClassicFixture),
      ),
    );
    const result = await fetchReportFights(
      "test-token",
      "mtRh3kJ9YMLazyvQ",
      undefined,
      "classic",
    );
    expect(result.title).toBe("BT / Hyjal");
  });

  // The GraphQL-errors retry is shared plumbing (postGraphQL), not specific
  // to fetchMasterDataAbilities — confirm it also covers this call site.
  it("retries once and succeeds when WCL returns a GraphQL errors response", async () => {
    let callCount = 0;
    server.use(
      http.post(USER_API_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            data: { reportData: { report: null } },
            errors: [{ message: "report not yet available" }],
          });
        }
        return HttpResponse.json(reportFightsFixture);
      }),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(callCount).toBe(2);
      expect(result.title).toBe("SSC+TK 2026-07-07");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchCastsTable", () => {
  it("parses actor cast breakdowns from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(castsTableFixture)),
    );
    const result = await fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6]);
    expect(result).toHaveLength(5);
    const dassz = result.find((e) => e.name === "Dassz");
    expect(dassz).toEqual({
      id: 2,
      name: "Dassz",
      type: "Druid",
      icon: "Druid-Restoration",
      abilities: [
        { name: "Lifebloom", total: 33, guid: 33763 },
        { name: "Rejuvenation", total: 16, guid: 26982 },
        { name: "Regrowth", total: 6, guid: 26980 },
        { name: "Rejuvenation", total: 3, guid: 9839 },
        { name: "Swiftmend", total: 2, guid: 18562 },
      ],
    });
  });

  it("requests the table query with the given fight IDs", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(castsTableFixture);
      }),
    );

    await fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6, 9]);

    expect(requestBody?.query).toContain("dataType: Casts");
    expect(requestBody?.query).toContain("fightIDs: [6, 9]");
  });

  it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
    server.use(
      http.post(CLASSIC_USER_API_URL, () => HttpResponse.json(castsTableFixture)),
    );
    const result = await fetchCastsTable(
      "test-token",
      "mtRh3kJ9YMLazyvQ",
      [6],
      undefined,
      "classic",
    );
    expect(result).toHaveLength(5);
  });

  // Live-reported gap in postGraphQL's single retry: WCL returned "You must
  // either provide fightIDs, or provide startTime and endTime, or both." for
  // this exact table() query on an archived report (mtRh3kJ9YMLazyvQ) that
  // hadn't finished re-warming its analysis cache — the same class of bug
  // documented on fetchMasterDataAbilities below, just surfacing as a
  // GraphQL error instead of a null field. One retry (1s later) wasn't
  // enough; a manual page refresh (more elapsed time) was.
  it("retries twice and succeeds when WCL returns a GraphQL errors response twice in a row", async () => {
    let callCount = 0;
    server.use(
      http.post(USER_API_URL, () => {
        callCount++;
        if (callCount <= 2) {
          return HttpResponse.json({
            data: { reportData: { report: null } },
            errors: [
              {
                message:
                  "You must either provide fightIDs, or provide startTime and endTime, or both.",
              },
            ],
          });
        }
        return HttpResponse.json(castsTableFixture);
      }),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6]);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(callCount).toBe(3);
      expect(result).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a readable WclGraphQLError if every retry is exhausted", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          data: { reportData: { report: null } },
          errors: [
            {
              message:
                "You must either provide fightIDs, or provide startTime and endTime, or both.",
            },
          ],
        }),
      ),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6]);
      const rejects = expect(promise).rejects.toThrow(WclGraphQLError);
      await vi.advanceTimersByTimeAsync(5000);
      await rejects;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchMasterDataAbilities", () => {
  it("parses the abilities list from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json(masterDataAbilitiesFixture),
      ),
    );
    const result = await fetchMasterDataAbilities(
      "test-token",
      "4GYHZRdtL3bvhpc8",
    );
    expect(result).toHaveLength(930);
    expect(result).toContainEqual({
      gameID: 26982,
      name: "Rejuvenation",
    });
  });

  it("requests the masterData abilities query for the given report", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(masterDataAbilitiesFixture);
      }),
    );

    await fetchMasterDataAbilities("test-token", "4GYHZRdtL3bvhpc8");

    expect(requestBody?.query).toContain("masterData");
    expect(requestBody?.query).toContain("4GYHZRdtL3bvhpc8");
    expect(requestBody?.query).not.toContain("icon");
  });

  it('routes to classic.warcraftlogs.com when host: "classic" is passed', async () => {
    server.use(
      http.post(CLASSIC_USER_API_URL, () =>
        HttpResponse.json(masterDataAbilitiesFixture),
      ),
    );
    const result = await fetchMasterDataAbilities(
      "test-token",
      "mtRh3kJ9YMLazyvQ",
      undefined,
      "classic",
    );
    expect(result).toHaveLength(930);
  });

  // Regression coverage for the "can't access property map, ...abilities is
  // null" bug: WCL can return HTTP 200 with a nullable field resolved to
  // null alongside a populated `errors` array (GraphQL spec allows partial
  // responses), typically on the first query against a report before its
  // analysis cache is warm. Reported live on 2pAdzNmPkQwLYMJ4 — the app
  // required a manual refresh to recover.
  it("retries once and succeeds when WCL returns a GraphQL errors response before the field is warm", async () => {
    let callCount = 0;
    server.use(
      http.post(USER_API_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            data: {
              reportData: { report: { masterData: { abilities: null } } },
            },
            errors: [{ message: "This report's data is not yet available." }],
          });
        }
        return HttpResponse.json(masterDataAbilitiesFixture);
      }),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchMasterDataAbilities(
        "test-token",
        "4GYHZRdtL3bvhpc8",
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(callCount).toBe(2);
      expect(result).toHaveLength(930);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a readable WclGraphQLError (not a crash on the null field) if the retry also fails", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          data: {
            reportData: { report: { masterData: { abilities: null } } },
          },
          errors: [{ message: "This report's data is not yet available." }],
        }),
      ),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchMasterDataAbilities(
        "test-token",
        "4GYHZRdtL3bvhpc8",
      );
      // Attach rejection handlers before advancing timers, so the promise
      // never settles without a listener already in place (avoids a false
      // "unhandled rejection" in the gap between settling and assertion).
      const throwsGraphQLError =
        expect(promise).rejects.toThrow(WclGraphQLError);
      const throwsMessage = expect(promise).rejects.toThrow(
        "This report's data is not yet available.",
      );
      await vi.advanceTimersByTimeAsync(2000);
      await throwsGraphQLError;
      await throwsMessage;
    } finally {
      vi.useRealTimers();
    }
  });

  // Live-reported gap in the regression fix above: WCL doesn't always attach
  // an `errors` array when a field resolves null before the cache is warm —
  // sometimes it's just `data: { ...abilities: null }` with no `errors` key
  // at all. Reported live on t7MbDaAjcnXvZTxh. The existing retry only
  // triggers by catching WclGraphQLError, so this shape bypassed it entirely
  // and crashed on `.map` of null.
  it("retries once and succeeds when WCL returns a null field with no accompanying errors array", async () => {
    let callCount = 0;
    server.use(
      http.post(USER_API_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            data: {
              reportData: { report: { masterData: { abilities: null } } },
            },
          });
        }
        return HttpResponse.json(masterDataAbilitiesFixture);
      }),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchMasterDataAbilities(
        "test-token",
        "4GYHZRdtL3bvhpc8",
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(callCount).toBe(2);
      expect(result).toHaveLength(930);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a readable error (not a crash on the null field) if it's still null on retry with no errors array", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          data: {
            reportData: { report: { masterData: { abilities: null } } },
          },
        }),
      ),
    );

    vi.useFakeTimers();
    try {
      const promise = fetchMasterDataAbilities(
        "test-token",
        "4GYHZRdtL3bvhpc8",
      );
      const rejects = expect(promise).rejects.toThrow(WclApiError);
      await vi.advanceTimersByTimeAsync(2000);
      await rejects;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("withRateLimitDetection", () => {
  it("calls onRateLimited and rethrows when the wrapped function throws a 429 WclApiError", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(async () => {
      throw new WclApiError(429, "rate limited");
    }, onRateLimited);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(onRateLimited).toHaveBeenCalledOnce();
  });

  it("does not call onRateLimited for a non-429 error", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(async () => {
      throw new WclApiError(500, "server error");
    }, onRateLimited);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it("passes through arguments and the return value on success", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(
      async (a: number, b: number) => a + b,
      onRateLimited,
    );

    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(onRateLimited).not.toHaveBeenCalled();
  });
});

describe("rateLimitData propagation", () => {
  it("publishes rateLimitData through subscribeRateLimitUsage when a response includes it", async () => {
    const usage = aRateLimitUsage({
      limitPerHour: 3600,
      pointsSpentThisHour: 2880,
    });
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          ...reportFightsFixture,
          data: {
            ...reportFightsFixture.data,
            rateLimitData: usage,
          },
        }),
      ),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeRateLimitUsage(listener);

    try {
      await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
      expect(listener).toHaveBeenCalledWith(usage);
    } finally {
      unsubscribe();
    }
  });

  it("requests rateLimitData alongside every existing query", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(reportFightsFixture);
      }),
    );

    await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");

    expect(requestBody?.query).toContain(
      "rateLimitData { limitPerHour pointsSpentThisHour }",
    );
  });
});

describe("fetchWithTimeout", () => {
  it("classifies an internal request timeout as WclTimeoutError", async () => {
    // Simulates the internal 30s timeout firing by pre-aborting the caller
    // signal with the same DOMException shape AbortSignal.timeout() produces
    // — this exercises the exact classification branch without waiting 30
    // real seconds. AbortSignal.any() reports the reason of whichever input
    // signal is already aborted, so this is equivalent from fetch()'s POV.
    const controller = new AbortController();
    controller.abort(new DOMException("Timed out", "TimeoutError"));

    await expect(
      fetchWithTimeout(USER_API_URL, { method: "POST" }, controller.signal),
    ).rejects.toThrow(WclTimeoutError);
  });

  it("passes through a caller-initiated AbortError unchanged", async () => {
    const controller = new AbortController();
    controller.abort();

    let error: unknown;
    try {
      await fetchWithTimeout(
        USER_API_URL,
        { method: "POST" },
        controller.signal,
      );
    } catch (e) {
      error = e;
    }
    // Not a DOMException `instanceof` check here: Node's AbortController
    // constructs its default abort reason from Node's own native
    // DOMException, which is a distinct constructor from the one this
    // jsdom-based test environment exposes globally — a real cross-realm
    // quirk of this test setup, not something fetchWithTimeout's production
    // logic depends on (it never checks `instanceof DOMException` for the
    // AbortError case, only for the TimeoutError one it constructs itself
    // in the same module — see the other test above). `.name` alone proves
    // the value passed through unaltered.
    expect((error as { name: string }).name).toBe("AbortError");
  });

  it("resolves normally when the request completes before any timeout", async () => {
    server.use(http.post(USER_API_URL, () => HttpResponse.json({ ok: true })));
    const resp = await fetchWithTimeout(USER_API_URL, { method: "POST" });
    expect(resp.ok).toBe(true);
  });
});

describe("withErrorReporting", () => {
  it("does not call reportError for a 429 WclApiError, and rethrows it", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(async () => {
      throw new WclApiError(429, "rate limited");
    }, reportError);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does not call reportError for an AbortError, and rethrows it", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(async () => {
      throw new DOMException("aborted", "AbortError");
    }, reportError);

    await expect(wrapped()).rejects.toThrow(DOMException);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("calls reportError with the error for anything else, and rethrows it", async () => {
    const reportError = vi.fn();
    const error = new Error("boom");
    const wrapped = withErrorReporting(async () => {
      throw error;
    }, reportError);

    await expect(wrapped()).rejects.toThrow("boom");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("passes through arguments and the return value on success", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(
      async (a: number, b: number) => a + b,
      reportError,
    );

    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(reportError).not.toHaveBeenCalled();
  });
});
