import { publishRateLimitUsage } from "./rateLimitUsage";

export type Host = "fresh" | "classic";

export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";
export const CLASSIC_USER_API_URL =
  "https://classic.warcraftlogs.com/api/v2/user";

const USER_API_URLS: Record<Host, string> = {
  fresh: USER_API_URL,
  classic: CLASSIC_USER_API_URL,
};

export class WclApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`WCL API responded ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

// A GraphQL response can be HTTP 200 with a nullable field resolved to
// `null` alongside a populated `errors` array — `data` and `errors` aren't
// mutually exclusive per the GraphQL spec. WCL exhibits this on the first
// query against a given report (e.g. `masterData.abilities` coming back
// null), before its server-side analysis cache is warm.
export class WclGraphQLError extends WclApiError {
  constructor(
    status: number,
    body: string,
    errors: Array<{ message?: string }>,
  ) {
    super(status, body);
    this.message = `Warcraft Logs returned an error: ${errors
      .map((e) => e.message ?? "unknown error")
      .join("; ")}`;
  }
}

export class WclTimeoutError extends Error {
  constructor() {
    super(
      "Warcraft Logs didn't respond within 30 seconds. This is usually a temporary network or WCL API issue — try again in a moment.",
    );
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new WclTimeoutError();
    }
    throw err;
  }
}

const GRAPHQL_RETRY_DELAY_MS = 1000;
// Initial attempt + 2 retries. A single retry (the original mirror of a
// manual page refresh) wasn't always enough for a report whose analysis
// cache needs longer to warm — e.g. an archived report re-accessed after a
// long dormancy (reported live on mtRh3kJ9YMLazyvQ's table() query; see
// fetchCastsTable's test for the reproduction).
const GRAPHQL_MAX_ATTEMPTS = 3;

async function postGraphQLOnce(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
  host: Host = "fresh",
) {
  const resp = await fetchWithTimeout(
    USER_API_URLS[host],
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
    },
    signal,
  );
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new WclGraphQLError(resp.status, bodyText, parsed.errors);
  }
  if (parsed.data?.rateLimitData) {
    publishRateLimitUsage(parsed.data.rateLimitData);
  }
  return parsed.data;
}

// Retrying mirrors what a manual page refresh already does when WCL returns
// a transient GraphQL error (see WclGraphQLError above) — without making the
// user do it by hand. Not applied to plain HTTP failures (4xx/5xx via
// WclApiError), only to this specific "200 OK but partial" shape.
export async function postGraphQL(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
  host: Host = "fresh",
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postGraphQLOnce(accessToken, query, signal, host);
    } catch (err) {
      if (
        !(err instanceof WclGraphQLError) ||
        attempt >= GRAPHQL_MAX_ATTEMPTS
      ) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, GRAPHQL_RETRY_DELAY_MS),
      );
    }
  }
}

export function withErrorReporting<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  reportError: (error: unknown) => void,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof WclApiError && err.status === 429) throw err;
      reportError(err);
      throw err;
    }
  };
}

export function withRateLimitDetection<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  onRateLimited: () => void,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof WclApiError && err.status === 429) onRateLimited();
      throw err;
    }
  };
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<TokenResult> {
  const resp = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.verifier,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const data = JSON.parse(bodyText);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID: number;
  kill: boolean | null;
  bossPercentage: number | null;
  gameZone: { id: number; name: string } | null;
}

export interface ReportFights {
  title: string;
  fights: Fight[];
  expansionId: number;
  archiveStatus: { isArchived: boolean; isAccessible: boolean };
}

export async function fetchReportFights(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<ReportFights> {
  const data = await postGraphQL(
    accessToken,
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage gameZone { id name } }
      zone { expansion { id name } }
      archiveStatus { isArchived isAccessible }
    }
  }
}`,
    signal,
    host,
  );
  const report = data.reportData.report;
  return {
    title: report.title,
    fights: report.fights.map(
      (fight: {
        id: number;
        name: string;
        startTime: number;
        endTime: number;
        encounterID: number;
        kill: boolean | null;
        bossPercentage: number | null;
        gameZone: { id: number; name: string } | null;
      }): Fight => ({
        id: fight.id,
        name: fight.name,
        startTime: fight.startTime,
        endTime: fight.endTime,
        encounterID: fight.encounterID,
        kill: fight.kill,
        bossPercentage: fight.bossPercentage,
        gameZone: fight.gameZone,
      }),
    ),
    expansionId: report.zone.expansion.id,
    archiveStatus: {
      isArchived: report.archiveStatus.isArchived,
      isAccessible: report.archiveStatus.isAccessible,
    },
  };
}

export interface CastTableAbility {
  name: string;
  total: number;
  guid?: number;
}

export interface CastTableEntry {
  id: number;
  name: string;
  type: string;
  icon: string;
  abilities: CastTableAbility[];
}

export async function fetchCastsTable(
  accessToken: string,
  reportCode: string,
  fightIds: number[],
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<CastTableEntry[]> {
  const data = await postGraphQL(
    accessToken,
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      table(fightIDs: [${fightIds.join(", ")}], dataType: Casts)
    }
  }
}`,
    signal,
    host,
  );
  const entries = data.reportData.report.table.data.entries;
  return entries.map(
    (entry: {
      id: number;
      name: string;
      type: string;
      icon: string;
      abilities: Array<{
        name: string;
        total: number;
        guid?: number;
        type?: unknown;
        icon?: unknown;
      }>;
    }): CastTableEntry => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      icon: entry.icon,
      abilities: entry.abilities.map((ability) => ({
        name: ability.name,
        total: ability.total,
        guid: ability.guid,
      })),
    }),
  );
}

export interface ReportAbility {
  gameID: number;
  name: string;
}

// Unlike the other fetch* functions, this one can't lean on postGraphQL's
// retry-on-WclGraphQLError alone: WCL doesn't always attach an `errors`
// array when masterData.abilities resolves null before the cache is warm
// (see WclGraphQLError above) — sometimes it's just a null field on an
// otherwise error-free response. So this retries once on either signal:
// a caught WclGraphQLError, or a resolved-but-null field.
export async function fetchMasterDataAbilities(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<ReportAbility[]> {
  const query = `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      masterData { abilities { gameID name } }
    }
  }
}`;

  const fetchAbilities = async () => {
    const data = await postGraphQLOnce(accessToken, query, signal, host);
    return data.reportData.report.masterData.abilities as Array<{
      gameID: number;
      name: string;
    }> | null;
  };

  let abilities: Array<{ gameID: number; name: string }> | null;
  try {
    abilities = await fetchAbilities();
  } catch (err) {
    if (!(err instanceof WclGraphQLError)) throw err;
    abilities = null;
  }

  if (abilities === null) {
    await new Promise((resolve) => setTimeout(resolve, GRAPHQL_RETRY_DELAY_MS));
    abilities = await fetchAbilities();
  }

  if (abilities === null) {
    const err = new WclApiError(200, "masterData.abilities was null twice");
    err.message =
      "Warcraft Logs hasn't finished analyzing this report's abilities yet — try again in a moment.";
    throw err;
  }

  return abilities.map((ability): ReportAbility => ({
    gameID: ability.gameID,
    name: ability.name,
  }));
}
