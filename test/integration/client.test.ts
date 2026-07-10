import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  exchangeCodeForToken,
  fetchReportFights,
  fetchCastsTable,
  WclApiError,
  TOKEN_URL,
  USER_API_URL,
} from "../../src/wcl/client";
import tokenResponseFixture from "./fixtures/token-response.json";
import reportFightsFixture from "./fixtures/report-fights.json";
import castsTableFixture from "./fixtures/casts-table.json";

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
        { name: "Lifebloom", total: 33 },
        { name: "Rejuvenation", total: 16 },
        { name: "Regrowth", total: 6 },
        { name: "Rejuvenation", total: 3 },
        { name: "Swiftmend", total: 2 },
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
});
