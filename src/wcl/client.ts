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
      fights { id name startTime endTime encounterID kill bossPercentage }
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report;
}
