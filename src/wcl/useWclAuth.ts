import { useCallback, useEffect, useState } from "react";
import { buildAuthorizeUrl, createPkceParams } from "./pkce";
import { exchangeCodeForToken, WclApiError, WclTimeoutError } from "./client";
import { DEFAULT_CLIENT_ID } from "./defaultClient";

class OAuthStateMismatchError extends Error {}

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";
const PKCE_STATE_STORAGE_KEY = "wcl_pkce_state";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";
const PENDING_HASH_STORAGE_KEY = "wcl_pending_hash";

function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export function useWclAuth(reportError: (error: unknown) => void = () => {}) {
  const [customClientId, setCustomClientIdState] = useState(() =>
    localStorage.getItem(CLIENT_ID_STORAGE_KEY),
  );
  const clientId = customClientId ?? DEFAULT_CLIENT_ID;
  const usingDefaultClient = customClientId === null;
  const [accessToken, setAccessToken] = useState(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [rateLimited, setRateLimited] = useState(false);

  function setClientId(value: string) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    setCustomClientIdState(value);
  }

  const reportRateLimited = useCallback(() => setRateLimited(true), []);

  async function connect(clientIdOverride?: string) {
    const trimmedOverride = clientIdOverride?.trim();
    const effectiveClientId = trimmedOverride || clientId;
    if (trimmedOverride) setClientId(trimmedOverride);
    const { verifier, state, challenge } = await createPkceParams();
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, state);
    sessionStorage.setItem(PENDING_HASH_STORAGE_KEY, window.location.hash);
    window.location.href = buildAuthorizeUrl({
      clientId: effectiveClientId,
      redirectUri: redirectUri(),
      challenge,
      state,
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawCode = params.get("code");
    if (!rawCode) return;
    const code: string = rawCode;

    async function completeAuth() {
      const returnedState = params.get("state");
      const expectedState = sessionStorage.getItem(PKCE_STATE_STORAGE_KEY);
      const verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
      const pendingHash =
        sessionStorage.getItem(PENDING_HASH_STORAGE_KEY) ?? "";
      sessionStorage.removeItem(PENDING_HASH_STORAGE_KEY);
      window.history.replaceState(
        {},
        "",
        window.location.pathname + pendingHash,
      );
      if (pendingHash) {
        window.dispatchEvent(new PopStateEvent("popstate"));
      }

      if (returnedState !== expectedState || !verifier) {
        throw new OAuthStateMismatchError(
          "OAuth state mismatch — please try connecting again.",
        );
      }

      const result = await exchangeCodeForToken({
        clientId,
        code,
        verifier,
        redirectUri: redirectUri(),
      });
      sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, result.accessToken);
      setAccessToken(result.accessToken);
    }

    completeAuth().catch((err: unknown) => {
      reportError(
        err instanceof WclApiError ||
          err instanceof OAuthStateMismatchError ||
          err instanceof WclTimeoutError
          ? err
          : new Error("Failed to exchange code for token."),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    clientId,
    usingDefaultClient,
    setClientId,
    connect,
    accessToken,
    rateLimited,
    reportRateLimited,
  };
}
