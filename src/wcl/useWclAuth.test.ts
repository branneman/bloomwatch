import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWclAuth } from "./useWclAuth";
import { DEFAULT_CLIENT_ID } from "./defaultClient";

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
    const { result } = renderHook(() => useWclAuth());

    // jsdom logs a harmless "Not implemented: navigation" console error here
    // because buildAuthorizeUrl() points cross-origin at warcraftlogs.com —
    // expected, not a test failure.
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.authError).toBeNull();
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

  it("reportRateLimited flips rateLimited without touching the access token", () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "existing-token");
    const { result } = renderHook(() => useWclAuth());

    act(() => result.current.reportRateLimited());

    expect(result.current.rateLimited).toBe(true);
    expect(result.current.accessToken).toBe("existing-token");
  });
});
