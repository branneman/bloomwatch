import { describe, expect, it } from "vitest";
import {
  base64urlEncode,
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateRandomString,
} from "./pkce";

describe("base64urlEncode", () => {
  it("encodes bytes as URL-safe base64 with no padding", () => {
    const buffer = new Uint8Array([0xfb, 0xff, 0xbf]).buffer;
    expect(base64urlEncode(buffer)).toBe("-_-_");
  });
});

describe("generateRandomString", () => {
  it("returns a string of the requested length using only base64url characters", () => {
    const result = generateRandomString(64);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different output on each call", () => {
    const a = generateRandomString(32);
    const b = generateRandomString(32);
    expect(a).not.toBe(b);
  });
});

describe("generateCodeChallenge", () => {
  it("matches the RFC 7636 appendix B example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds the authorize URL with all required PKCE params and no client secret", () => {
    const url = buildAuthorizeUrl({
      clientId: "test-client-id",
      redirectUri: "https://example.com/",
      challenge: "test-challenge",
      state: "test-state",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.warcraftlogs.com/oauth/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://example.com/",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test-state");
    expect(parsed.searchParams.has("client_secret")).toBe(false);
  });
});
