# Default API Client With Graceful Rate-Limit Fallback (story 008) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hardcoded default WCL API Client ID so a first-time user can connect with zero setup, and degrade gracefully — asking that one user for their own Client ID — if the shared default pool is ever rate-limited (HTTP 429).

**Architecture:** `useWclAuth` resolves an effective Client ID (stored custom ID, else a new `DEFAULT_CLIENT_ID` constant) and exposes a `rateLimited` flag flipped by a new `reportRateLimited()` callback. A generic `withRateLimitDetection` wrapper in `src/wcl/client.ts` is applied once, in `App.tsx`, to each of the four fetch functions already passed as props to child components — the only place rate-limit detection is wired in. `App.tsx` renders a dismissal-free fallback banner (reusing a new `OwnClientIdField` component also used, collapsed, on the first-connect screen) above the existing screen, which stays mounted but `inert` and dimmed rather than being torn down.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library (Tier 1/3), Vitest + MSW (Tier 2, `test/integration/client.test.ts`).

## Global Constraints

- No secrets required at build time (CLAUDE.md principle 2) — `DEFAULT_CLIENT_ID` is a hardcoded literal in source, not a build-time env var, since a Client ID isn't a secret (see `docs/wcl-auth.md`).
- Rate-limit detection is reactive only: react to an HTTP 429 (`WclApiError` with `status === 429`) on an actual request. No proactive `rateLimitData` polling — out of scope per the approved design (`docs/specs/wcl-default-client-design.md`).
- Do not attempt to preserve in-progress report/fight/druid-selection state across the PKCE reconnect redirect — out of scope per the approved design.
- Every commit must pass `npm run typecheck && npm run lint && npm run format:check` (enforced by the pre-commit hook) — full project, not scoped to changed files.
- Commits follow Conventional Commits, scope `wcl-auth` (e.g. `feat(wcl-auth): ...`).
- Tests are co-located per `docs/testing.md`'s tiers: pure logic / hooks as `*.test.ts(x)` next to the file under test (Tier 1); `client.ts`'s HTTP-facing and wrapper functions in `test/integration/client.test.ts` (Tier 2, matching where its other exports are already tested); React components as `*.test.tsx` next to the component (Tier 3).

---

### Task 1: `DEFAULT_CLIENT_ID` constant + `useWclAuth` default-fallback and rate-limit state

**Files:**

- Create: `src/wcl/defaultClient.ts`
- Modify: `src/wcl/useWclAuth.ts`
- Test: `src/wcl/useWclAuth.test.ts` (new file)

**Interfaces:**

- Consumes: `createPkceParams`, `buildAuthorizeUrl` (`src/wcl/pkce.ts`, unchanged), `exchangeCodeForToken`, `WclApiError` (`src/wcl/client.ts`, unchanged in this task).
- Produces: `DEFAULT_CLIENT_ID: string` (from `src/wcl/defaultClient.ts`). `useWclAuth()` now returns `{ clientId: string, usingDefaultClient: boolean, setClientId: (value: string) => void, connect: (clientIdOverride?: string) => Promise<void>, accessToken: string | null, authError: string | null, rateLimited: boolean, reportRateLimited: () => void }`. Task 4 (`App.tsx`) consumes `connect`, `accessToken`, `authError`, `rateLimited`, `reportRateLimited`.

- [ ] **Step 1: Read the maintainer's Client ID out of `.env.local` and create the constant file**

Read `.env.local`'s `WCL_CLIENT_ID` value yourself (do not print it to chat/logs — see CLAUDE.md's guidance on keeping it out of chat output) and hardcode it as the literal below, replacing `REPLACE_WITH_REAL_CLIENT_ID`:

```ts
// src/wcl/defaultClient.ts
export const DEFAULT_CLIENT_ID = "REPLACE_WITH_REAL_CLIENT_ID";
```

- [ ] **Step 2: Write the failing tests for the default-fallback and rate-limit behavior**

```ts
// src/wcl/useWclAuth.test.ts
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

  it("reportRateLimited flips rateLimited without touching the access token", () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "existing-token");
    const { result } = renderHook(() => useWclAuth());

    act(() => result.current.reportRateLimited());

    expect(result.current.rateLimited).toBe(true);
    expect(result.current.accessToken).toBe("existing-token");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/wcl/useWclAuth.test.ts`
Expected: FAIL — `usingDefaultClient`, `rateLimited`, and `reportRateLimited` don't exist yet on the hook's return value, and `connect()` still throws/sets `authError` because of the removed-guard behavior not yet being removed.

- [ ] **Step 4: Update `useWclAuth.ts`**

Replace the whole file with:

```ts
import { useCallback, useEffect, useState } from "react";
import { buildAuthorizeUrl, createPkceParams } from "./pkce";
import { exchangeCodeForToken, WclApiError } from "./client";
import { DEFAULT_CLIENT_ID } from "./defaultClient";

class OAuthStateMismatchError extends Error {}

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";
const PKCE_STATE_STORAGE_KEY = "wcl_pkce_state";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";

function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export function useWclAuth() {
  const [customClientId, setCustomClientIdState] = useState(() =>
    localStorage.getItem(CLIENT_ID_STORAGE_KEY),
  );
  const clientId = customClientId ?? DEFAULT_CLIENT_ID;
  const usingDefaultClient = customClientId === null;
  const [accessToken, setAccessToken] = useState(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  function setClientId(value: string) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    setCustomClientIdState(value);
  }

  const reportRateLimited = useCallback(() => setRateLimited(true), []);

  async function connect(clientIdOverride?: string) {
    const effectiveClientId = clientIdOverride ?? clientId;
    if (clientIdOverride) setClientId(clientIdOverride);
    const { verifier, state, challenge } = await createPkceParams();
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, state);
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

  return {
    clientId,
    usingDefaultClient,
    setClientId,
    connect,
    accessToken,
    authError,
    rateLimited,
    reportRateLimited,
  };
}
```

Key changes from the current file: `clientId` now falls back to `DEFAULT_CLIENT_ID` instead of `""`; `usingDefaultClient` is derived from whether a custom ID is stored; `connect()` drops the `if (!clientId) { setAuthError(...); return; }` guard and accepts an optional `clientIdOverride` — when provided, it's persisted via `setClientId` _before_ building the authorize URL, and used directly (not read back from the `clientId` closure variable, which wouldn't yet reflect a same-tick state update); `reportRateLimited` is wrapped in `useCallback` with an empty dependency array so it's referentially stable across renders — Task 4 depends on this stability to safely memoize the wrapped fetch functions it hands to child components.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/wcl/useWclAuth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass (format:check may require `npm run format` first if new files aren't yet Prettier-formatted)

```bash
git add src/wcl/defaultClient.ts src/wcl/useWclAuth.ts src/wcl/useWclAuth.test.ts
git commit -m "feat(wcl-auth): resolve a default Client ID and add rate-limit state to useWclAuth"
```

---

### Task 2: `withRateLimitDetection` wrapper in `client.ts`

**Files:**

- Modify: `src/wcl/client.ts`
- Test: `test/integration/client.test.ts`

**Interfaces:**

- Consumes: `WclApiError` (already in `src/wcl/client.ts`).
- Produces: `withRateLimitDetection<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>, onRateLimited: () => void): (...args: Args) => Promise<R>`. Task 4 (`App.tsx`) consumes this directly.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `test/integration/client.test.ts` (add `vi` to the existing `import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";` line, making it `import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";`, and add `withRateLimitDetection` to the existing import from `../../src/wcl/client`):

```ts
describe("withRateLimitDetection", () => {
  it("calls onRateLimited and rethrows when the wrapped function throws a 429 WclApiError", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(async () => {
      throw new WclApiError(429, "rate limited");
    }, onRateLimited);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(onRateLimited).toHaveBeenCalledOnce();
  });

  it("does not call onRateLimited for a non-429 error", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(async () => {
      throw new WclApiError(500, "server error");
    }, onRateLimited);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it("passes through arguments and the return value on success", async () => {
    const onRateLimited = vi.fn();
    const wrapped = withRateLimitDetection(
      async (a: number, b: number) => a + b,
      onRateLimited,
    );

    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(onRateLimited).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/integration/client.test.ts`
Expected: FAIL — `withRateLimitDetection` is not exported yet.

- [ ] **Step 3: Add the wrapper to `src/wcl/client.ts`**

Add this function anywhere after the `WclApiError` class definition (e.g. directly below it):

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`

```bash
git add src/wcl/client.ts test/integration/client.test.ts
git commit -m "feat(wcl-auth): add withRateLimitDetection to detect 429s from any WCL fetch call"
```

---

### Task 3: `OwnClientIdField` component

**Files:**

- Create: `src/app/components/OwnClientIdField/index.tsx`
- Create: `src/app/components/OwnClientIdField/index.module.css`
- Test: `src/app/components/OwnClientIdField/index.test.tsx`

**Interfaces:**

- Consumes: `Field` (`src/app/components/ui/Field`), `Input` (`src/app/components/ui/Input`), `Button` (`src/app/components/ui/Button`) — all unchanged, existing components.
- Produces: `OwnClientIdField({ onConnect: (clientId: string) => void })`. Task 4 (`App.tsx`) consumes this component, passing `onConnect={connect}` (the hook's `connect` function from Task 1, whose `(clientIdOverride?: string) => Promise<void>` signature is call-compatible).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/OwnClientIdField/index.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OwnClientIdField } from "./index";

describe("OwnClientIdField", () => {
  it("disables the connect button until a Client ID is entered", async () => {
    const user = userEvent.setup();
    render(<OwnClientIdField onConnect={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: "Connect with this Client ID",
    });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("WCL API Client ID"), "my-id");

    expect(button).toBeEnabled();
  });

  it("calls onConnect with the entered Client ID", async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<OwnClientIdField onConnect={onConnect} />);

    await user.type(screen.getByLabelText("WCL API Client ID"), "my-id");
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(onConnect).toHaveBeenCalledWith("my-id");
  });

  it("links to the WCL client registration page", () => {
    render(<OwnClientIdField onConnect={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Register a free client" }),
    ).toHaveAttribute("href", "https://www.warcraftlogs.com/api/clients/");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/OwnClientIdField/index.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the component**

```tsx
// src/app/components/OwnClientIdField/index.tsx
import { useState } from "react";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface OwnClientIdFieldProps {
  onConnect: (clientId: string) => void;
}

export function OwnClientIdField({ onConnect }: OwnClientIdFieldProps) {
  const [value, setValue] = useState("");

  return (
    <div className={styles.ownClientIdField}>
      <Field label="WCL API Client ID">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste your Client ID"
        />
      </Field>
      <p className={styles.helper}>
        Don&apos;t have one?{" "}
        <a
          href="https://www.warcraftlogs.com/api/clients/"
          target="_blank"
          rel="noreferrer"
        >
          Register a free client
        </a>{" "}
        at warcraftlogs.com — check &quot;Public Client&quot;, and use this
        page&apos;s URL as the redirect.
      </p>
      <Button onClick={() => onConnect(value)} disabled={value.trim() === ""}>
        Connect with this Client ID
      </Button>
    </div>
  );
}
```

```css
/* src/app/components/OwnClientIdField/index.module.css */
.ownClientIdField {
  margin-top: var(--space-4);
}
.helper {
  font-size: var(--text-small-size);
  color: var(--text);
  margin: var(--space-2) 0 var(--space-3);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/OwnClientIdField/index.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`

```bash
git add src/app/components/OwnClientIdField
git commit -m "feat(wcl-auth): add OwnClientIdField component for the personal-Client-ID input"
```

---

### Task 4: Wire the default client, rate-limit banner, and dimmed fallback into `App.tsx`

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.module.css`
- Modify: `src/App.test.tsx`

**Interfaces:**

- Consumes: `useWclAuth()` (Task 1: `connect`, `accessToken`, `authError`, `rateLimited`, `reportRateLimited`), `withRateLimitDetection` (Task 2), `OwnClientIdField` (Task 3), `Disclosure` (`src/app/components/ui/Disclosure`, unchanged, existing).
- Produces: no new exports — this is the top-level composition point.

- [ ] **Step 1: Update `App.tsx` imports**

In `src/App.tsx`, remove these two now-unused imports:

```ts
import { Field } from "./app/components/ui/Field";
import { Input } from "./app/components/ui/Input";
```

Add:

```ts
import { withRateLimitDetection } from "./wcl/client";
import { OwnClientIdField } from "./app/components/OwnClientIdField";
import { Disclosure } from "./app/components/ui/Disclosure";
```

And change the `fetchReportFights, fetchCastsTable, fetchMasterDataAbilities` import line (currently importing types alongside them) to keep those three function imports as-is (still needed, just now wrapped before being passed down) — no change needed to that import line itself.

- [ ] **Step 2: Destructure the new hook fields and memoize the wrapped fetch functions**

Change:

```ts
const { clientId, setClientId, connect, accessToken, authError } = useWclAuth();
```

to:

```ts
const { connect, accessToken, authError, rateLimited, reportRateLimited } =
  useWclAuth();
```

After the existing `const [eventFetcher] = useState(() => createEventFetcher());` line, add:

```ts
const wrappedFetchReportFights = useMemo(
  () => withRateLimitDetection(fetchReportFights, reportRateLimited),
  [reportRateLimited],
);
const wrappedFetchCastsTable = useMemo(
  () => withRateLimitDetection(fetchCastsTable, reportRateLimited),
  [reportRateLimited],
);
const wrappedFetchMasterDataAbilities = useMemo(
  () => withRateLimitDetection(fetchMasterDataAbilities, reportRateLimited),
  [reportRateLimited],
);
const wrappedFetchEvents = useMemo(
  () => withRateLimitDetection(eventFetcher.fetchEvents, reportRateLimited),
  [eventFetcher, reportRateLimited],
);
```

(`useMemo` is already imported in this file. These are safe to memoize on `[reportRateLimited]` alone because Task 1 made `reportRateLimited` referentially stable via `useCallback`.)

- [ ] **Step 3: Replace every prop usage of the raw fetch functions with the wrapped ones**

In the JSX, replace each of these prop values:

- `fetchReportFights={fetchReportFights}` → `fetchReportFights={wrappedFetchReportFights}` (1 usage, on `ConnectPanel`)
- `fetchMasterDataAbilities={fetchMasterDataAbilities}` → `fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}` (2 usages, both on `AbilityResolver`)
- `fetchCastsTable={fetchCastsTable}` → `fetchCastsTable={wrappedFetchCastsTable}` (1 usage, on `DruidDetector`)
- `fetchEvents={eventFetcher.fetchEvents}` → `fetchEvents={wrappedFetchEvents}` (2 usages, both on `Scorecard`)

- [ ] **Step 4: Replace the initial connect screen**

Replace this block:

```tsx
{
  !accessToken && (
    <Shell>
      <div className={styles.connectHeader}>
        <img src={logo} width={40} height={40} alt="" />
        <h1>Bloomwatch</h1>
      </div>
      <p className={styles.tagline}>
        Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
        scorecard that judges your process — not another parse percentile that
        healing, being zero-sum, can&apos;t fairly measure.
      </p>
      <Field label="WCL Client ID">
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Paste your Client ID"
        />
      </Field>
      <Button onClick={connect}>Connect</Button>
      {authError && <Alert tone="warning">{authError}</Alert>}
      <p className={styles.connectFooter}>
        No account, no server, no secret — every request to Warcraft Logs is
        made directly from your browser.
      </p>
    </Shell>
  );
}
```

with:

```tsx
{
  !accessToken && (
    <Shell>
      <div className={styles.connectHeader}>
        <img src={logo} width={40} height={40} alt="" />
        <h1>Bloomwatch</h1>
      </div>
      <p className={styles.tagline}>
        Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
        scorecard that judges your process — not another parse percentile that
        healing, being zero-sum, can&apos;t fairly measure.
      </p>
      <Button onClick={() => connect()}>Connect to Warcraft Logs (WCL)</Button>
      <Disclosure summary="Optional: Use your own WCL API Client ID instead">
        <OwnClientIdField onConnect={connect} />
      </Disclosure>
      {authError && <Alert tone="warning">{authError}</Alert>}
      <p className={styles.connectFooter}>
        No account, no server, no secret — every request to Warcraft Logs is
        made directly from your browser.
      </p>
    </Shell>
  );
}
```

Note `onClick={() => connect()}` (not `onClick={connect}`): `connect` now takes an optional `clientIdOverride?: string`, and a bare `onClick={connect}` would pass the click's `MouseEvent` as that argument. `OwnClientIdField`'s `onConnect={connect}` is fine as-is, since `OwnClientIdField` always calls `onConnect(value)` with a real string.

- [ ] **Step 5: Wrap the three accessToken-gated screens in a dimmable container, and add the rate-limit banner**

Replace this block (the three `{accessToken && ...}` sections, from `{accessToken && !loadedReport && (` through the end of the scorecard `.map((f) => (...))` block):

```tsx
{
  accessToken && !loadedReport && (
    <Shell>
      <ReportInput onSubmit={handleReportSubmit} />
      {report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={wrappedFetchReportFights}
          onReportLoaded={setLoadedReport}
        />
      )}
      {report && (
        <AbilityResolver
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
          onResolved={setResolvedAbilities}
        />
      )}
    </Shell>
  );
}

{
  accessToken && report && loadedReport && !scorecardRequested && (
    <Shell>
      <h2>{loadedReport.title}</h2>
      {resolvedAbilities === null && (
        <AbilityResolver
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
          onResolved={setResolvedAbilities}
        />
      )}
      <FightPicker
        fights={loadedReport.fights}
        initialFightId={report.fightId}
        onSelectionChange={setSelectedFightIds}
      />
      <DruidDetector
        accessToken={accessToken}
        reportCode={report.reportCode}
        fightIds={loadedReport.fights.map((f) => f.id)}
        fetchCastsTable={wrappedFetchCastsTable}
        onDruidsDetected={setDruidCandidates}
        onEntriesLoaded={handleEntriesLoaded}
      />
      {druidCandidates !== null &&
        (druidCandidates.length > 1 ? (
          <div className={styles.druidSection}>
            <h3>Druid</h3>
            <DruidPicker
              candidates={druidCandidates}
              selectedDruidId={selectedDruidId}
              onSelect={setSelectedDruidId}
            />
          </div>
        ) : (
          <DruidPicker
            candidates={druidCandidates}
            selectedDruidId={selectedDruidId}
            onSelect={setSelectedDruidId}
          />
        ))}
      <Button
        disabled={!canGetScorecard}
        onClick={() => setScorecardRequested(true)}
      >
        Get scorecard
      </Button>
    </Shell>
  );
}

{
  accessToken &&
    report &&
    loadedReport &&
    scorecardRequested &&
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    loadedReport.fights
      .filter((f) => selectedFightIds.includes(f.id))
      .map((f) => (
        <Shell width={800} key={f.id}>
          <Scorecard
            accessToken={accessToken}
            reportCode={report.reportCode}
            fight={f}
            druidId={selectedDruid.id}
            druid={selectedDruid}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={actorNames}
            fetchEvents={wrappedFetchEvents}
            onStartOver={handleStartOver}
          />
        </Shell>
      ));
}
```

with:

```tsx
{
  accessToken && rateLimited && (
    <Shell>
      <Alert tone="warning">
        The shared connection is temporarily over capacity — too many people are
        using Bloomwatch&apos;s default connection right now. Register your own
        free WCL API client to keep going; it only takes a minute.
      </Alert>
      <OwnClientIdField onConnect={connect} />
    </Shell>
  );
}

{
  accessToken && (
    <div
      className={rateLimited ? styles.dimmed : undefined}
      inert={rateLimited}
    >
      {!loadedReport && (
        <Shell>
          <ReportInput onSubmit={handleReportSubmit} />
          {report && (
            <ConnectPanel
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchReportFights={wrappedFetchReportFights}
              onReportLoaded={setLoadedReport}
            />
          )}
          {report && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}
        </Shell>
      )}

      {report && loadedReport && !scorecardRequested && (
        <Shell>
          <h2>{loadedReport.title}</h2>
          {resolvedAbilities === null && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}
          <FightPicker
            fights={loadedReport.fights}
            initialFightId={report.fightId}
            onSelectionChange={setSelectedFightIds}
          />
          <DruidDetector
            accessToken={accessToken}
            reportCode={report.reportCode}
            fightIds={loadedReport.fights.map((f) => f.id)}
            fetchCastsTable={wrappedFetchCastsTable}
            onDruidsDetected={setDruidCandidates}
            onEntriesLoaded={handleEntriesLoaded}
          />
          {druidCandidates !== null &&
            (druidCandidates.length > 1 ? (
              <div className={styles.druidSection}>
                <h3>Druid</h3>
                <DruidPicker
                  candidates={druidCandidates}
                  selectedDruidId={selectedDruidId}
                  onSelect={setSelectedDruidId}
                />
              </div>
            ) : (
              <DruidPicker
                candidates={druidCandidates}
                selectedDruidId={selectedDruidId}
                onSelect={setSelectedDruidId}
              />
            ))}
          <Button
            disabled={!canGetScorecard}
            onClick={() => setScorecardRequested(true)}
          >
            Get scorecard
          </Button>
        </Shell>
      )}

      {report &&
        loadedReport &&
        scorecardRequested &&
        selectedDruid !== null &&
        lifebloomAbilityIds !== null &&
        loadedReport.fights
          .filter((f) => selectedFightIds.includes(f.id))
          .map((f) => (
            <Shell width={800} key={f.id}>
              <Scorecard
                accessToken={accessToken}
                reportCode={report.reportCode}
                fight={f}
                druidId={selectedDruid.id}
                druid={selectedDruid}
                lifebloomAbilityIds={lifebloomAbilityIds}
                targetNames={actorNames}
                fetchEvents={wrappedFetchEvents}
                onStartOver={handleStartOver}
              />
            </Shell>
          ))}
    </div>
  );
}
```

- [ ] **Step 6: Add the dimmed style**

Add to `src/App.module.css`:

```css
.dimmed {
  opacity: 0.4;
}
```

- [ ] **Step 7: Update the existing "renders the Connect screen" test in `App.test.tsx`**

Replace:

```tsx
it("renders the Connect screen when there is no access token", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Bloomwatch" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("WCL Client ID")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
});
```

with:

```tsx
it("renders the Connect screen when there is no access token, with no Client ID required upfront", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Bloomwatch" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("WCL API Client ID")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Optional: Use your own WCL API Client ID instead",
    }),
  ).toBeInTheDocument();
});

it("reveals the optional own-Client-ID field when its disclosure is expanded", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(
    screen.getByRole("button", {
      name: "Optional: Use your own WCL API Client ID instead",
    }),
  );

  expect(screen.getByLabelText("WCL API Client ID")).toBeInTheDocument();
});
```

- [ ] **Step 8: Add `localStorage.clear()` to the top-level `beforeEach`, and import `WclApiError`**

Change:

```tsx
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
```

to:

```tsx
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
```

(Needed because `usingDefaultClient`/`clientId` resolution now reads `localStorage`, which otherwise leaks a custom Client ID from one test into the next in the same file.)

Add `WclApiError` to the existing `import { fetchReportFights, fetchCastsTable, fetchMasterDataAbilities } from "./wcl/client";` line, making it `import { fetchReportFights, fetchCastsTable, fetchMasterDataAbilities, WclApiError } from "./wcl/client";`.

- [ ] **Step 9: Write the new rate-limit-banner test**

Add to `src/App.test.tsx`, inside the `describe("App", ...)` block:

```tsx
it("shows the rate-limit fallback banner (without unmounting the current screen) when a request hits the default client's rate limit, and lets the user submit their own Client ID", async () => {
  sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
  vi.mocked(fetchReportFights).mockResolvedValue(
    aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
  );
  vi.mocked(fetchCastsTable).mockRejectedValue(
    new WclApiError(429, "rate limited"),
  );
  vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
  const user = userEvent.setup();

  render(<App />);
  await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
  await user.click(screen.getByRole("button", { name: "Load report" }));

  await screen.findByRole("heading", { name: REPORT_TITLE });
  await screen.findByText(/temporarily over capacity/);

  await user.type(
    screen.getByLabelText("WCL API Client ID"),
    "my-own-client-id",
  );
  await user.click(
    screen.getByRole("button", { name: "Connect with this Client ID" }),
  );

  expect(localStorage.getItem("wcl_client_id")).toBe("my-own-client-id");
  expect(
    screen.getByRole("heading", { name: REPORT_TITLE }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 10: Run the full test file to verify everything passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones added in Steps 7 and 9)

- [ ] **Step 11: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`

```bash
git add src/App.tsx src/App.module.css src/App.test.tsx
git commit -m "feat(wcl-auth): wire default-client connect and rate-limit fallback into App"
```

---

### Task 5: Close out story 008

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/wcl-default-client-design.md`
- Delete: `docs/plans/wcl-default-client-plan.md` (this file)

- [ ] **Step 1: Confirm no other file references the spec or plan paths**

Run: `grep -rn "wcl-default-client-design\|wcl-default-client-plan" --include="*.md" /Users/bran/Source/bloomwatch/docs /Users/bran/Source/bloomwatch/CLAUDE.md`
Expected: only the spec/plan files themselves match (no dangling references elsewhere to fix first).

- [ ] **Step 2: Mark story 008 done in the backlog**

In `docs/backlog.md`, change the heading:

```md
### 008 — Default API client with graceful rate-limit fallback
```

to:

```md
### 008 — Default API client with graceful rate-limit fallback ✅ Done
```

- [ ] **Step 3: Update CLAUDE.md's Repo state paragraph**

In `CLAUDE.md`, under `## Repo state`, change:

```md
...and story 701 (single-fight scorecard) are complete and live — Phase 1 MVP is done. Phase 2 work continues with backlog story 008 (default API client fallback) next, then epic D starting with story 301.
```

to:

```md
...story 701 (single-fight scorecard), and story 008 (default API client fallback) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D starting with story 301.
```

- [ ] **Step 4: Delete the spec and this plan**

```bash
git rm docs/specs/wcl-default-client-design.md docs/plans/wcl-default-client-plan.md
```

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 008 (default API client fallback)"
```
