export const AUTHORIZE_URL = "https://www.warcraftlogs.com/oauth/authorize";

export function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes.buffer).slice(0, length);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(digest);
}

export interface PkceParams {
  verifier: string;
  state: string;
  challenge: string;
}

export async function createPkceParams(): Promise<PkceParams> {
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await generateCodeChallenge(verifier);
  return { verifier, state, challenge };
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}
