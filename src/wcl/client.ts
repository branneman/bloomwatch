export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";

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

const GRAPHQL_RETRY_DELAY_MS = 1000;

async function postGraphQLOnce(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
) {
  const resp = await fetch(USER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query }),
    signal,
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new WclGraphQLError(resp.status, bodyText, parsed.errors);
  }
  return parsed.data;
}

// One retry mirrors what a manual page refresh already does when WCL
// returns a transient GraphQL error (see WclGraphQLError above) — without
// making the user do it by hand. Not applied to plain HTTP failures (4xx/5xx
// via WclApiError), only to this specific "200 OK but partial" shape.
export async function postGraphQL(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
) {
  try {
    return await postGraphQLOnce(accessToken, query, signal);
  } catch (err) {
    if (!(err instanceof WclGraphQLError)) throw err;
    await new Promise((resolve) => setTimeout(resolve, GRAPHQL_RETRY_DELAY_MS));
    return postGraphQLOnce(accessToken, query, signal);
  }
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
  const resp = await fetch(TOKEN_URL, {
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
}

export interface ReportFights {
  title: string;
  fights: Fight[];
}

export async function fetchReportFights(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
): Promise<ReportFights> {
  const data = await postGraphQL(
    accessToken,
    `query {
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage }
    }
  }
}`,
    signal,
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
      }): Fight => ({
        id: fight.id,
        name: fight.name,
        startTime: fight.startTime,
        endTime: fight.endTime,
        encounterID: fight.encounterID,
        kill: fight.kill,
        bossPercentage: fight.bossPercentage,
      }),
    ),
  };
}

export interface CastTableAbility {
  name: string;
  total: number;
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
): Promise<CastTableEntry[]> {
  const data = await postGraphQL(
    accessToken,
    `query {
  reportData {
    report(code: "${reportCode}") {
      table(fightIDs: [${fightIds.join(", ")}], dataType: Casts)
    }
  }
}`,
    signal,
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
        guid?: unknown;
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
      })),
    }),
  );
}

export interface ReportAbility {
  gameID: number;
  name: string;
}

export async function fetchMasterDataAbilities(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
): Promise<ReportAbility[]> {
  const data = await postGraphQL(
    accessToken,
    `query {
  reportData {
    report(code: "${reportCode}") {
      masterData { abilities { gameID name } }
    }
  }
}`,
    signal,
  );
  const abilities = data.reportData.report.masterData.abilities;
  return abilities.map(
    (ability: { gameID: number; name: string }): ReportAbility => ({
      gameID: ability.gameID,
      name: ability.name,
    }),
  );
}
