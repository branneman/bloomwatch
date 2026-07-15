import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWclAuth } from "./useWclAuth";
import { DEFAULT_CLIENT_ID } from "./defaultClient";
import { exchangeCodeForToken, WclApiError } from "./client";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal()),
  exchangeCodeForToken: vi.fn(),
}));

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";
const PKCE_STATE_STORAGE_KEY = "wcl_pkce_state";
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  // Some tests below push search/hash onto the shared jsdom location to
  // simulate the OAuth redirect round-trip — reset it so it doesn't bleed
  // into later tests in this file.
  window.history.pushState(null, "", window.location.pathname);
});

describe("useWclAuth", () => {
  it("defaults to the shared default Client ID when none is stored", () => {
    const { result } = renderHook(() => useWclAuth());

    expect(result.current.clientId).toBe(DEFAULT_CLIENT_ID);
    expect(result.current.usingDefaultClient).toBe(true);
  });

  it("setClientId stores a custom Client ID and switches off the default", () => {
    const { result } = renderHook(() => useWclAuth());

    act(() => result.current.setClientId("custom-id"));

    expect(result.current.clientId).toBe("custom-id");
    expect(result.current.usingDefaultClient).toBe(false);
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe("custom-id");
  });

  it("connect() no longer requires a Client ID to already be set", async () => {
    const reportError = vi.fn();
    const { result } = renderHook(() => useWclAuth(reportError));

    // jsdom logs a harmless "Not implemented: navigation" console error here
    // because buildAuthorizeUrl() points cross-origin at warcraftlogs.com —
    // expected, not a test failure.
    await act(async () => {
      await result.current.connect();
    });

    expect(reportError).not.toHaveBeenCalled();
  });

  it("connect(override) persists the override Client ID before navigating", async () => {
    const { result } = renderHook(() => useWclAuth());

    await act(async () => {
      await result.current.connect("own-client-id");
    });

    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe("own-client-id");
    expect(result.current.clientId).toBe("own-client-id");
    expect(result.current.usingDefaultClient).toBe(false);
  });

  it("treats a blank or whitespace-only override as no override, falling back to the current Client ID", async () => {
    const { result } = renderHook(() => useWclAuth());

    await act(async () => {
      await result.current.connect("   ");
    });

    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBeNull();
    expect(result.current.clientId).toBe(DEFAULT_CLIENT_ID);
    expect(result.current.usingDefaultClient).toBe(true);
  });

  it("restores the pre-auth shared-link hash after completing the OAuth redirect round-trip", async () => {
    const sharedHash = "#/r/4GYHZRdtL3bvhpc8/d/Dassz/f/1";
    window.history.pushState(null, "", sharedHash);

    const { result } = renderHook(() => useWclAuth());

    // jsdom logs a harmless "Not implemented: navigation" console error here
    // because buildAuthorizeUrl() points cross-origin at warcraftlogs.com —
    // expected, not a test failure. connect() stashes the current hash into
    // sessionStorage before attempting the (blocked) navigation.
    await act(async () => {
      await result.current.connect();
    });

    const state = sessionStorage.getItem(PKCE_STATE_STORAGE_KEY);
    expect(state).not.toBeNull();

    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "returned-token",
      expiresIn: 3600,
    });

    // Simulate WCL's redirect back: a fresh page load with ?code & state in
    // the query string and no hash — a relative pushState with only a
    // search component drops any existing fragment, matching what a real
    // full-page navigation back from WCL looks like.
    window.history.pushState(null, "", `?code=abc123&state=${state}`);
    expect(window.location.hash).toBe("");

    let popstateFired = false;
    const handlePopstate = () => {
      popstateFired = true;
    };
    window.addEventListener("popstate", handlePopstate);

    const { result: resumed } = renderHook(() => useWclAuth());

    await waitFor(() => {
      expect(resumed.current.accessToken).toBe("returned-token");
    });

    window.removeEventListener("popstate", handlePopstate);

    expect(window.location.hash).toBe(sharedHash);
    expect(popstateFired).toBe(true);
  });

  it("reportRateLimited flips rateLimited without touching the access token", () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "existing-token");
    const { result } = renderHook(() => useWclAuth());

    act(() => result.current.reportRateLimited());

    expect(result.current.rateLimited).toBe(true);
    expect(result.current.accessToken).toBe("existing-token");
  });

  it("calls reportError and leaves accessToken unset when the OAuth redirect's state doesn't match", async () => {
    window.history.pushState(null, "", "?code=abc123&state=stale-state");
    const reportError = vi.fn();

    const { result } = renderHook(() => useWclAuth(reportError));

    await waitFor(() => expect(reportError).toHaveBeenCalledOnce());
    expect(result.current.accessToken).toBeNull();
    expect(reportError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("calls reportError when exchangeCodeForToken itself rejects", async () => {
    window.history.pushState(null, "", "?code=abc123&state=expected-state");
    sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, "expected-state");
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, "test-verifier");
    vi.mocked(exchangeCodeForToken).mockRejectedValue(
      new WclApiError(400, "invalid_grant"),
    );
    const reportError = vi.fn();

    const { result } = renderHook(() => useWclAuth(reportError));

    await waitFor(() => expect(reportError).toHaveBeenCalledOnce());
    expect(result.current.accessToken).toBeNull();
  });
});
