import { useEffect, useState } from "react";
import { buildAuthorizeUrl, createPkceParams } from "./pkce";
import { exchangeCodeForToken, WclApiError } from "./client";

class OAuthStateMismatchError extends Error {}

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";
const PKCE_STATE_STORAGE_KEY = "wcl_pkce_state";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";

function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export function useWclAuth() {
  const [clientId, setClientIdState] = useState(
    () => localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? "",
  );
  const [accessToken, setAccessToken] = useState(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [authError, setAuthError] = useState<string | null>(null);

  function setClientId(value: string) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    setClientIdState(value);
  }

  async function connect() {
    if (!clientId) {
      setAuthError("Save a Client ID first.");
      return;
    }
    const { verifier, state, challenge } = await createPkceParams();
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, state);
    window.location.href = buildAuthorizeUrl({
      clientId,
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
      window.history.replaceState({}, "", window.location.pathname);

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
      setAuthError(
        err instanceof WclApiError || err instanceof OAuthStateMismatchError
          ? err.message
          : "Failed to exchange code for token.",
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { clientId, setClientId, connect, accessToken, authError };
}
