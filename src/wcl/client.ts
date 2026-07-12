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
  gameZone: { id: number; name: string } | null;
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
      title
      fights { id name startTime endTime encounterID kill bossPercentage gameZone { id name } }
    }
  }
}`,
    }),
    signal,
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report;
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
): Promise<CastTableEntry[]> {
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
      table(fightIDs: [${fightIds.join(", ")}], dataType: Casts)
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  const entries = parsed.data.reportData.report.table.data.entries;
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
  icon: string;
  type: string;
}

export async function fetchMasterDataAbilities(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
): Promise<ReportAbility[]> {
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
      masterData { abilities { gameID name icon type } }
    }
  }
}`,
    }),
    signal,
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report.masterData.abilities;
}
