# Design: Default API client with graceful rate-limit fallback (story 008)

## Problem

Today the app requires every user to register their own WCL API Public Client and paste its Client ID before "Connect" is even enabled (`src/App.tsx`, `src/wcl/useWclAuth.ts`). Story 008 removes that first-time setup step by shipping a maintainer-owned default Client ID, while still degrading gracefully — asking one user for their own Client ID — if the shared default's rate-limit pool is ever exhausted.

## Background: rate-limit shape

WCL API v2 rate limits are scoped per Client ID (`docs/wcl-auth.md`), and enforcement returns an HTTP 429 response (confirmed via community reports; WCL's official rate-limit docs page wasn't fetchable to double-check the exact response body, so the design treats "HTTP status 429" as the detection signal and doesn't depend on any specific error body shape). This lines up with the existing `WclApiError` class in `src/wcl/client.ts`, which already captures `status` and `body` whenever `!resp.ok` — no change needed to how errors are thrown, only to how a 429 specifically is detected and reacted to.

## 1. Default Client ID constant

New file `src/wcl/defaultClient.ts`:

```ts
export const DEFAULT_CLIENT_ID = "...";
```

The literal value is the maintainer's already-registered Public Client ID, currently held in `.env.local`'s `WCL_CLIENT_ID` for local testing convenience — implementation copies that value directly into source. Hardcoded as a literal, not a build-time env var — it's not a secret (PKCE client IDs are public by design, see `docs/wcl-auth.md`), and hardcoding keeps builds reproducible from a clean clone with no required env var, per principle 2 in `CLAUDE.md`.

## 2. `useWclAuth` changes (`src/wcl/useWclAuth.ts`)

- `clientId` resolution becomes: stored custom ID from `localStorage` (existing `CLIENT_ID_STORAGE_KEY`) if present, else `DEFAULT_CLIENT_ID`. The hook exposes:
  - `clientId: string` — the effective ID used for `connect()` (never empty).
  - `usingDefaultClient: boolean` — `true` when no custom ID is stored, i.e. the session is on the shared pool.
- `connect()` drops its current `if (!clientId) { setAuthError(...); return; }` guard — a client ID is always available now.
- New state `rateLimited: boolean` (default `false`) and a `reportRateLimited()` function that sets it to `true`. This does **not** clear `accessToken` or any other session state — it's purely a flag the UI layer reacts to.
- `setClientId(value)` is unchanged in behavior (persists a custom ID to `localStorage`) and is reused both by the existing optional "use your own Client ID" affordance and by the new rate-limit fallback banner.

## 3. `withRateLimitDetection` wrapper (new, `src/wcl/client.ts`)

```ts
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
```

In `App.tsx`, each fetch function passed as a prop to `ConnectPanel`, `AbilityResolver`, `DruidDetector`, and the `Scorecard`'s `eventFetcher.fetchEvents` is wrapped once with `withRateLimitDetection(fn, auth.reportRateLimited)` before being handed down. Each component's existing local error-message handling (each already has its own `.catch()` rendering an inline message) is unchanged — the wrapper rethrows the original error after reporting. This is the only place rate-limit detection is wired in; no other component needs to know rate limiting exists.

## 4. UI changes

**Initial connect screen** (`App.tsx`, currently the `!accessToken` branch):

- Button relabeled "Connect to Warcraft Logs (WCL)".
- The existing Client ID `Field`/`Input` becomes a collapsed, optional affordance labeled "Optional: Use your own WCL API Client ID instead" — collapsed by default, so a first-time user sees just the Connect button.

**New shared component** `OwnClientIdField` (`src/app/components/OwnClientIdField/`): wraps the existing `Field`+`Input` for entering a Client ID, plus brief helper copy mirroring `docs/wcl-auth.md`'s registration steps ("Register a free client at warcraftlogs.com/api/clients — check 'Public Client', use this page's URL as the redirect") with a link to `https://www.warcraftlogs.com/api/clients/`. Used in two places:

1. Collapsed inside the initial connect screen.
2. Inside the rate-limit fallback banner (below).

**Rate-limit fallback banner** (`App.tsx`): when `auth.rateLimited` is `true`, render an `Alert` (tone `warning`) explaining the shared client is temporarily over capacity, followed by `OwnClientIdField` and a "Connect to Warcraft Logs (WCL)" button, above whatever screen is currently showing. The existing screen content underneath is kept mounted but wrapped in a dimmed, non-interactive container (reduced opacity + `inert`) rather than unmounted — so the user isn't jarringly dropped back to a blank state while reading the message. Submitting the field calls `auth.setClientId(value)` then `auth.connect()` — the existing PKCE redirect flow. That redirect reloads the page, which loses in-progress report/fight-selection state exactly as a first connect does today; the design does not attempt to preserve or restore that state across the reconnect, since the acceptance criteria don't require it and doing so isn't a data dependency of this story.

## Out of scope

- Preserving in-progress report/fight/druid selection across the reconnect redirect.
- Proactively checking `rateLimitData` before hitting a hard 429 (reactive detection only, per decision above).
- Any changes to the Tier 2/contract test's separate test-only Client ID (`docs/testing.md`) — unaffected by this story.
