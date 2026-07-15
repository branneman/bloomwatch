# Global Error Handling & Recovery Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 708 — a React error boundary + full-screen recovery overlay for uncaught bugs and app-level WCL failures, a 30s timeout on every WCL request, and a narrowed (not removed) per-card local error display that only covers a metric card's own computation bugs, not fetch failures.

**Architecture:** A new `ErrorOverlay` component (apology, collapsed-by-default details, "Start over," GitHub issue link) is rendered two ways: by a new class-based `ErrorBoundary` wrapping `<App/>` in `main.tsx` (for uncaught render errors), and by `App.tsx`'s own `globalError` state (for async WCL/auth failures, set via a `reportError` callback threaded through every WCL fetcher and into `useWclAuth`). `src/wcl/client.ts` gains a shared `fetchWithTimeout` helper (30s, classifies `TimeoutError` vs `AbortError`) and a `withErrorReporting` wrapper (structurally identical to the existing `withRateLimitDetection`, skips 429s and cancellations). ~20 components that fetch WCL data directly (17 metric cards, `ConnectPanel`, `DruidDetector`, `AbilityResolver`) each get their `.then()/.catch()` restructured so a **fetch**-stage failure no longer renders a local message (it's already escalated globally by the wrapped fetcher) while a **compute**-stage failure (a bug in that one card's own metric calculation) still shows today's local inline message — preserving per-widget isolation for the one failure mode where it actually helps.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library (Tier 3), Vitest + MSW (Tier 2), existing `src/testUtils/factories.ts`.

## Global Constraints

- Follow Conventional Commits for every commit in this plan: `type(scope): summary` (e.g. `feat(errors): add ErrorOverlay component`).
- Every task must leave `npm run typecheck && npm run lint && npm run format:check` and `npm test` green before committing — the pre-commit hook enforces this anyway; don't bypass it.
- No new dependencies — this plan uses only `AbortSignal.any`/`AbortSignal.timeout` (native, already confirmed available in this project's TypeScript/DOM lib) and existing test tooling.
- No error-reporting/telemetry service anywhere in this plan (principles 2/4 — no backend, FOSS).
- Do not touch: the rate-limit banner's own logic (008/009), `ReportInput`'s validation message, or the static disclaimer `Alert`s in `DeathForensicsCard`/`ReportDashboard`/`Scorecard`.
- Full design context: `docs/specs/error-handling-design.md`. Read it before starting Task 1 if anything below is ambiguous.

---

### Task 1: WCL client — request timeout & error-reporting wrapper

**Files:**

- Modify: `src/wcl/client.ts`
- Modify: `src/wcl/events.ts`
- Modify: `test/integration/client.test.ts`

**Interfaces:**

- Produces: `WclTimeoutError` (class, extends `Error`), `fetchWithTimeout(url: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response>`, `withErrorReporting<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>, reportError: (error: unknown) => void): (...args: Args) => Promise<R>` — all exported from `src/wcl/client.ts`. Tasks 4 and 5 consume `withErrorReporting`; `src/wcl/events.ts` consumes `fetchWithTimeout`.

- [ ] **Step 1: Write the failing tests for `fetchWithTimeout` and `withErrorReporting`**

Add to `test/integration/client.test.ts` (after the existing `describe("withRateLimitDetection", ...)` block, before the file's closing):

```ts
describe("fetchWithTimeout", () => {
  it("classifies an internal request timeout as WclTimeoutError", async () => {
    // Simulates the internal 30s timeout firing by pre-aborting the caller
    // signal with the same DOMException shape AbortSignal.timeout() produces
    // — this exercises the exact classification branch without waiting 30
    // real seconds. AbortSignal.any() reports the reason of whichever input
    // signal is already aborted, so this is equivalent from fetch()'s POV.
    const controller = new AbortController();
    controller.abort(new DOMException("Timed out", "TimeoutError"));

    await expect(
      fetchWithTimeout(USER_API_URL, { method: "POST" }, controller.signal),
    ).rejects.toThrow(WclTimeoutError);
  });

  it("passes through a caller-initiated AbortError unchanged", async () => {
    const controller = new AbortController();
    controller.abort();

    let error: unknown;
    try {
      await fetchWithTimeout(
        USER_API_URL,
        { method: "POST" },
        controller.signal,
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("resolves normally when the request completes before any timeout", async () => {
    server.use(http.post(USER_API_URL, () => HttpResponse.json({ ok: true })));
    const resp = await fetchWithTimeout(USER_API_URL, { method: "POST" });
    expect(resp.ok).toBe(true);
  });
});

describe("withErrorReporting", () => {
  it("does not call reportError for a 429 WclApiError, and rethrows it", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(async () => {
      throw new WclApiError(429, "rate limited");
    }, reportError);

    await expect(wrapped()).rejects.toThrow(WclApiError);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does not call reportError for an AbortError, and rethrows it", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(async () => {
      throw new DOMException("aborted", "AbortError");
    }, reportError);

    await expect(wrapped()).rejects.toThrow(DOMException);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("calls reportError with the error for anything else, and rethrows it", async () => {
    const reportError = vi.fn();
    const error = new Error("boom");
    const wrapped = withErrorReporting(async () => {
      throw error;
    }, reportError);

    await expect(wrapped()).rejects.toThrow("boom");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("passes through arguments and the return value on success", async () => {
    const reportError = vi.fn();
    const wrapped = withErrorReporting(
      async (a: number, b: number) => a + b,
      reportError,
    );

    await expect(wrapped(2, 3)).resolves.toBe(5);
    expect(reportError).not.toHaveBeenCalled();
  });
});
```

Add `WclTimeoutError`, `fetchWithTimeout`, `withErrorReporting` to the existing `import { ... } from "../../src/wcl/client";` at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/integration/client.test.ts`
Expected: FAIL — `WclTimeoutError`, `fetchWithTimeout`, `withErrorReporting` are not exported yet.

- [ ] **Step 3: Implement `WclTimeoutError`, `fetchWithTimeout`, and `withErrorReporting` in `src/wcl/client.ts`**

Add after the existing `WclApiError` class (currently lines 4–13):

```ts
export class WclTimeoutError extends Error {
  constructor() {
    super(
      "Warcraft Logs didn't respond within 30 seconds. This is usually a temporary network or WCL API issue — try again in a moment.",
    );
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new WclTimeoutError();
    }
    throw err;
  }
}

export function withErrorReporting<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  reportError: (error: unknown) => void,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof WclApiError && err.status === 429) throw err;
      reportError(err);
      throw err;
    }
  };
}
```

Then update the 4 raw `fetch()` call sites in this same file to use `fetchWithTimeout`, dropping `signal` out of the request-options object and passing it as the 3rd argument instead.

`exchangeCodeForToken` (currently lines 34–55) — change:

```ts
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
```

to:

```ts
const resp = await fetchWithTimeout(TOKEN_URL, {
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
```

(No signal to combine with here — this function never accepted one.)

`fetchReportFights` (currently lines 72–96) — change:

```ts
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
  signal,
});
```

to:

```ts
const resp = await fetchWithTimeout(
  USER_API_URL,
  {
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
  },
  signal,
);
```

`fetchCastsTable` (currently lines 141–158) — same shape of change:

```ts
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
  signal,
});
```

to:

```ts
const resp = await fetchWithTimeout(
  USER_API_URL,
  {
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
  },
  signal,
);
```

`fetchMasterDataAbilities` (currently lines 198–215) — same shape of change:

```ts
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
      masterData { abilities { gameID name } }
    }
  }
}`,
  }),
  signal,
});
```

to:

```ts
const resp = await fetchWithTimeout(
  USER_API_URL,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      masterData { abilities { gameID name } }
    }
  }
}`,
    }),
  },
  signal,
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/integration/client.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Update `src/wcl/events.ts`'s `fetchEventsPage` to use `fetchWithTimeout`**

Change the import at the top from:

```ts
import { USER_API_URL, WclApiError } from "./client";
```

to:

```ts
import { USER_API_URL, WclApiError, fetchWithTimeout } from "./client";
```

Change (currently lines 39–57):

```ts
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
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
  }),
});
```

to:

```ts
const resp = await fetchWithTimeout(USER_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    query: `query {
  reportData {
    report(code: "${reportCode}") {
      events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}, includeResources: ${includeResources}) {
        data
        nextPageTimestamp
      }
    }
  }
}`,
  }),
});
```

(`fetchEventsPage` never accepted a caller signal — no 3rd argument to pass here, per story 010's shared-cache design. Its own existing Tier 2 tests in `test/integration/events.test.ts` need no changes: they test parsing/pagination/rate-limit behavior, all unaffected by this change, and the timeout classification itself is already fully covered by Task 1's `client.test.ts` tests above — no need to duplicate it here.)

- [ ] **Step 6: Run the full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/wcl/client.ts src/wcl/events.ts test/integration/client.test.ts
git commit -m "feat(wcl): add request timeout and global error-reporting wrapper"
```

---

### Task 2: `ErrorOverlay` component

**Files:**

- Create: `src/app/components/ErrorOverlay/index.tsx`
- Create: `src/app/components/ErrorOverlay/index.module.css`
- Create: `src/app/components/ErrorOverlay/index.test.tsx`
- Create: `src/app/errorRecovery.ts`

**Interfaces:**

- Produces: `ErrorOverlay` component, props `{ error: unknown; onStartOver: () => void }`, from `src/app/components/ErrorOverlay`. Produces `recoverFromError(): void` from `src/app/errorRecovery.ts`. Tasks 3 and 5 consume both.

- [ ] **Step 1: Write `src/app/errorRecovery.ts`**

```ts
export function recoverFromError(): void {
  window.location.hash = "#/";
  window.location.reload();
}
```

(No dedicated test — a 2-line browser-API wrapper, the same class of triviality as `useWclAuth.ts`'s untested `redirectUri()` helper.)

- [ ] **Step 2: Write the failing test for `ErrorOverlay`**

Create `src/app/components/ErrorOverlay/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorOverlay } from "./index";

describe("ErrorOverlay", () => {
  it("shows the apology and keeps details collapsed by default", () => {
    render(<ErrorOverlay error={new Error("boom")} onStartOver={vi.fn()} />);

    expect(
      screen.getByText("Sorry, something went wrong."),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("reveals the error message and stack in View details once expanded", async () => {
    const error = new Error("boom");
    const user = userEvent.setup();
    render(<ErrorOverlay error={error} onStartOver={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "View details" }));

    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("falls back to String(error) for a non-Error value", async () => {
    const user = userEvent.setup();
    render(<ErrorOverlay error="a plain string error" onStartOver={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "View details" }));

    expect(screen.getByText(/a plain string error/)).toBeInTheDocument();
  });

  it("calls onStartOver when Start over is clicked", async () => {
    const onStartOver = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorOverlay error={new Error("boom")} onStartOver={onStartOver} />,
    );

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("links to the GitHub issues page", () => {
    render(<ErrorOverlay error={new Error("boom")} onStartOver={vi.fn()} />);

    expect(screen.getByRole("link", { name: "open an issue" })).toHaveAttribute(
      "href",
      "https://github.com/branneman/bloomwatch/issues",
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/app/components/ErrorOverlay`
Expected: FAIL — `./index` does not exist yet.

- [ ] **Step 4: Implement `ErrorOverlay`**

Create `src/app/components/ErrorOverlay/index.module.css`:

```css
.panel {
  border: 1px solid var(--judgement-red);
  background: var(--judgement-red-bg);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.details {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--code-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-family: var(--mono);
  font-size: var(--text-small-size);
  margin: 0;
}

.issueLink {
  font-size: var(--text-small-size);
  color: var(--text);
  margin: 0;
}
```

Create `src/app/components/ErrorOverlay/index.tsx`:

```tsx
import { Disclosure } from "../ui/Disclosure";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface ErrorOverlayProps {
  error: unknown;
  onStartOver: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

export function ErrorOverlay({ error, onStartOver }: ErrorOverlayProps) {
  const timestamp = new Date().toISOString();
  const stack = errorStack(error);

  return (
    <div className={styles.panel} role="alert">
      <h1>Sorry, something went wrong.</h1>
      <p>
        Bloomwatch hit an unexpected error. This is often temporary — starting
        over usually fixes it.
      </p>
      <Disclosure summary="View details">
        <pre className={styles.details}>
          {timestamp}
          {"\n"}
          {errorMessage(error)}
          {stack ? `\n\n${stack}` : ""}
        </pre>
      </Disclosure>
      <Button onClick={onStartOver}>Start over</Button>
      <p className={styles.issueLink}>
        Tried that and it&apos;s still broken? Please{" "}
        <a
          href="https://github.com/branneman/bloomwatch/issues"
          target="_blank"
          rel="noreferrer"
        >
          open an issue
        </a>{" "}
        with the details above.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/app/components/ErrorOverlay`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ErrorOverlay src/app/errorRecovery.ts
git commit -m "feat(errors): add ErrorOverlay component"
```

---

### Task 3: `ErrorBoundary` component

**Files:**

- Create: `src/app/components/ErrorBoundary/index.tsx`
- Create: `src/app/components/ErrorBoundary/index.test.tsx`

**Interfaces:**

- Consumes: `ErrorOverlay` (`src/app/components/ErrorOverlay`, Task 2), `recoverFromError` (`src/app/errorRecovery.ts`, Task 2), `Shell` (`src/app/components/ui/Shell`, existing).
- Produces: `ErrorBoundary` component, props `{ children: ReactNode }`, from `src/app/components/ErrorBoundary`. Task 5 (`main.tsx`) consumes it.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ErrorBoundary/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./index";

function Boom(): never {
  throw new Error("render exploded");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error to console.error twice (once from the
    // renderer, once from componentDidCatch) — expected noise for this test.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders the recovery overlay when a child throws during render", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("Sorry, something went wrong."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/components/ErrorBoundary`
Expected: FAIL — `./index` does not exist yet.

- [ ] **Step 3: Implement `ErrorBoundary`**

Create `src/app/components/ErrorBoundary/index.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import { ErrorOverlay } from "../ErrorOverlay";
import { Shell } from "../ui/Shell";
import { recoverFromError } from "../../errorRecovery";

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <Shell>
          <ErrorOverlay
            error={this.state.error}
            onStartOver={recoverFromError}
          />
        </Shell>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/components/ErrorBoundary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ErrorBoundary
git commit -m "feat(errors): add ErrorBoundary for uncaught render errors"
```

---

### Task 4: `useWclAuth` — route OAuth failures through `reportError`

**Files:**

- Modify: `src/wcl/useWclAuth.ts`
- Modify: `src/wcl/useWclAuth.test.ts`

**Interfaces:**

- Produces: `useWclAuth(reportError?: (error: unknown) => void)` — the hook's return object drops `authError`. Task 5 (`App.tsx`) consumes the new parameter.

- [ ] **Step 1: Update the failing/changed tests**

In `src/wcl/useWclAuth.test.ts`, change the import line to also pull in `WclApiError`:

```ts
import { exchangeCodeForToken, WclApiError } from "./client";
```

Add this constant near the top, alongside the existing storage-key constants:

```ts
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";
```

Replace the existing test:

```ts
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
```

with:

```ts
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
```

Add this new test at the end of the `describe("useWclAuth", ...)` block, right before its closing `});`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/wcl/useWclAuth.test.ts`
Expected: FAIL — `useWclAuth` doesn't accept a `reportError` argument yet, and `result.current.authError` is still the only error surface.

- [ ] **Step 3: Update `src/wcl/useWclAuth.ts`**

Change the function signature (currently `export function useWclAuth() {`) to:

```ts
export function useWclAuth(reportError: (error: unknown) => void = () => {}) {
```

Remove this line:

```ts
const [authError, setAuthError] = useState<string | null>(null);
```

Change the `completeAuth().catch(...)` block (currently):

```ts
completeAuth().catch((err: unknown) => {
  setAuthError(
    err instanceof WclApiError || err instanceof OAuthStateMismatchError
      ? err.message
      : "Failed to exchange code for token.",
  );
});
```

to:

```ts
completeAuth().catch((err: unknown) => {
  reportError(
    err instanceof WclApiError || err instanceof OAuthStateMismatchError
      ? err
      : new Error("Failed to exchange code for token."),
  );
});
```

Remove `authError` from the returned object (currently):

```ts
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
```

to:

```ts
return {
  clientId,
  usingDefaultClient,
  setClientId,
  connect,
  accessToken,
  rateLimited,
  reportRateLimited,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/wcl/useWclAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wcl/useWclAuth.ts src/wcl/useWclAuth.test.ts
git commit -m "feat(auth): route OAuth token-exchange failures through reportError"
```

---

### Task 5: Wire `App.tsx` + `main.tsx`

**Depends on:** Tasks 1, 2, 3, 4 (all must be committed first).

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**

- Consumes: `withErrorReporting` (Task 1), `ErrorOverlay` + `recoverFromError` (Task 2), `ErrorBoundary` (Task 3), `useWclAuth(reportError)` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `src/App.test.tsx`, inside the main `describe("App", ...)` block (anywhere after `setUpHappyPathMocks`/`loadReport` are defined — e.g. right after the existing rate-limit test around line 377, before its closing `});`):

```ts
  it("shows the recovery overlay (with the error visible in View details) when the report fails to load for a reason other than a rate limit", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockRejectedValue(
      new Error("WCL API responded 500: server error"),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));

    expect(
      await screen.findByText("Sorry, something went wrong."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText(/WCL API responded 500/)).toBeInTheDocument();
  });

  it("shows the recovery overlay when the OAuth redirect's state doesn't match (e.g. a stale or replayed URL)", async () => {
    window.history.pushState(null, "", "?code=abc123&state=stale-state");

    render(<App />);

    expect(
      await screen.findByText("Sorry, something went wrong."),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — the overlay text never appears; `fetchReportFights`'s rejection currently renders `ConnectPanel`'s own inline `Alert` instead, and there's no `globalError` wiring yet.

- [ ] **Step 3: Update `src/App.tsx`**

Change the client import line (currently `import { withRateLimitDetection } from "./wcl/client";`) to:

```ts
import { withRateLimitDetection, withErrorReporting } from "./wcl/client";
```

Add two new imports near the top, alongside the other `./app/components/...` imports:

```ts
import { ErrorOverlay } from "./app/components/ErrorOverlay";
import { recoverFromError } from "./app/errorRecovery";
```

Change:

```ts
const { connect, accessToken, authError, rateLimited, reportRateLimited } =
  useWclAuth();
```

to:

```ts
const [globalError, setGlobalError] = useState<unknown>(null);
const reportError = useCallback((err: unknown) => setGlobalError(err), []);
const { connect, accessToken, rateLimited, reportRateLimited } =
  useWclAuth(reportError);
```

Change the four wrapped-fetcher `useMemo`s (currently):

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

to:

```ts
const wrappedFetchReportFights = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(fetchReportFights, reportRateLimited),
      reportError,
    ),
  [reportRateLimited, reportError],
);
const wrappedFetchCastsTable = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(fetchCastsTable, reportRateLimited),
      reportError,
    ),
  [reportRateLimited, reportError],
);
const wrappedFetchMasterDataAbilities = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(fetchMasterDataAbilities, reportRateLimited),
      reportError,
    ),
  [reportRateLimited, reportError],
);
const wrappedFetchEvents = useMemo(
  () =>
    withErrorReporting(
      withRateLimitDetection(eventFetcher.fetchEvents, reportRateLimited),
      reportError,
    ),
  [eventFetcher, reportRateLimited, reportError],
);
```

Remove this line from the pre-connect screen's JSX:

```tsx
{
  authError && <Alert tone="warning">{authError}</Alert>;
}
```

Add an early return at the very top of the component's final `return`, i.e. change:

```tsx
  return (
    <>
      {!onboardingDismissed && (
```

to:

```tsx
  if (globalError !== null) {
    return (
      <Shell>
        <ErrorOverlay error={globalError} onStartOver={recoverFromError} />
      </Shell>
    );
  }

  return (
    <>
      {!onboardingDismissed && (
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL still, for the first new test only — `ConnectPanel` still renders its own inline `Alert` on fetch failure today (Task 6 removes that). Confirm the failure is specifically about the old inline alert still appearing / the overlay assertion timing out, not an unrelated error. The second new test (OAuth state mismatch) should already PASS at this point. This is expected — proceed to Task 6 before re-running.

- [ ] **Step 5: Update `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./app/components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 6: Run static analysis and the full test suite, noting the one expected remaining failure**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: typecheck/lint/format PASS. `src/App.test.tsx`'s new "shows the recovery overlay... report fails to load" test still FAILs until Task 6 lands — this is expected and will be fixed there, not in this task.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/main.tsx
git commit -m "feat(errors): wire ErrorBoundary and the global recovery overlay into App"
```

---

## Tasks 6–25: per-component fetch/compute split

**These 20 tasks have no dependency on each other or on Tasks 1–5's code** (they only restructure each component's own local `.then()/.catch()` — they don't import anything new). They can be executed in any order, and in parallel by separate subagents. Each follows the identical shape described here, with the component-specific code given in full under each task.

**The shared transformation**, applied to each file below:

- The `.then((events) => { ...compute...; setResult({ accessToken, result: computed }); })` callback's body gets wrapped in a `try`/`catch` — a throw during compute now sets the existing `{ accessToken, error }` variant (same message as before), preserving today's local, per-card error display for a **compute** bug.
- The trailing `.catch((err) => setResult({ accessToken, error: ... }))` is replaced with `.catch((err) => { if (err instanceof DOMException && err.name === "AbortError") return; })` — a **fetch**-stage failure (network error, non-2xx, timeout) no longer renders anything locally, because `App.tsx`'s `withErrorReporting` (Task 1/5) already escalated it to the full-screen overlay before this component's own `.catch` ever runs.
- Each component's test file: the existing "shows an error message when the fetch fails" test is replaced with one confirming the fetch-stage failure renders nothing locally (using a controllable-rejection promise + `act` to flush the microtask, since the component intentionally does nothing observable in this case), and a new test is added confirming a **compute**-stage throw still shows the local error message (via `vi.spyOn` on the metrics module's named export, restored in `afterEach`).

Every one of Tasks 6–25 below has three steps: **(1)** rewrite that component's test file, **(2)** run its tests to confirm the new "fetch fails" test passes and the new "compute throws" test fails (component not yet changed), **(3)** edit the component's `useEffect`, **(4)** run its tests to confirm everything passes, **(5)** commit. Steps 2 and 4 are abbreviated below to just the run command + expected result, since the pattern is identical every time.

---

### Task 6: `ConnectPanel`

**Files:** Modify `src/app/components/ConnectPanel/index.tsx`, `src/app/components/ConnectPanel/index.test.tsx`.

- [ ] **Step 1: Rewrite the test file**

Replace `src/app/components/ConnectPanel/index.test.tsx`'s `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchReportFights = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Loading report…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

Add `act` to the existing `import { render, screen, waitFor } from "@testing-library/react";` line, making it:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
```

- [ ] **Step 2: Run `npm test -- src/app/components/ConnectPanel` — expect the new test to fail** (component still renders the old inline `Alert`).

- [ ] **Step 3: Edit `src/app/components/ConnectPanel/index.tsx`**

Change (currently):

```ts
useEffect(() => {
  if (!accessToken) return;
  const controller = new AbortController();
  fetchReportFights(accessToken, reportCode, controller.signal)
    .then((report) => {
      setResult({ accessToken, report });
      onReportLoaded(report);
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResult({
        accessToken,
        error: err instanceof Error ? err.message : "Failed to fetch report.",
      });
    });
  return () => controller.abort();
}, [accessToken, reportCode, fetchReportFights, onReportLoaded]);
```

to:

```ts
useEffect(() => {
  if (!accessToken) return;
  const controller = new AbortController();
  fetchReportFights(accessToken, reportCode, controller.signal)
    .then((report) => {
      setResult({ accessToken, report });
      onReportLoaded(report);
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Anything else is already escalated to the full-screen recovery
      // overlay by the wrapped fetchReportFights (see wcl/client.ts's
      // withErrorReporting) — nothing to render locally.
    });
  return () => controller.abort();
}, [accessToken, reportCode, fetchReportFights, onReportLoaded]);
```

Change the `FetchResult` type and the render branch that used it (currently):

```ts
type FetchResult =
  | { accessToken: string; report: ReportFights }
  | { accessToken: string; error: string };
```

to:

```ts
type FetchResult = { accessToken: string; report: ReportFights };
```

And remove the now-dead render branch:

```tsx
if ("error" in result) return <Alert tone="warning">{result.error}</Alert>;
```

Remove the now-unused `import { Alert } from "../ui/Alert";` line.

Change `return <div><h2>{result.report.title}</h2></div>;`'s preceding access — since `result` is no longer a union, `result.report.title` still works unchanged; only the `if ("error" in result)` branch and its Alert import are removed.

- [ ] **Step 4: Run `npm test -- src/app/components/ConnectPanel` — expect all tests to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConnectPanel
git commit -m "refactor(errors): ConnectPanel fetch failures escalate to the recovery overlay"
```

---

### Task 7: `DruidDetector`

**Files:** Modify `src/app/components/DruidDetector/index.tsx`, `src/app/components/DruidDetector/index.test.tsx`.

- [ ] **Step 1: Rewrite the test file**

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchCastsTable = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Detecting druids…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

Add `act` to the import: `import { act, render, screen, waitFor } from "@testing-library/react";`.

- [ ] **Step 2: Run `npm test -- src/app/components/DruidDetector` — expect the new test to fail.**

- [ ] **Step 3: Edit `src/app/components/DruidDetector/index.tsx`**

Change (currently):

```ts
fetchCastsTable(accessToken, reportCode, ids, controller.signal)
  .then((entries) => {
    const candidates = detectDruids(entries);
    setResult({ accessToken, fightIdsKey, candidates });
    onDruidsDetected(candidates);
    onEntriesLoaded?.(entries);
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setResult({
      accessToken,
      fightIdsKey,
      error: err instanceof Error ? err.message : "Failed to detect druids.",
    });
  });
```

to:

```ts
fetchCastsTable(accessToken, reportCode, ids, controller.signal)
  .then((entries) => {
    const candidates = detectDruids(entries);
    setResult({ accessToken, fightIdsKey, candidates });
    onDruidsDetected(candidates);
    onEntriesLoaded?.(entries);
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Anything else is already escalated to the full-screen recovery
    // overlay by the wrapped fetchCastsTable (see wcl/client.ts's
    // withErrorReporting) — nothing to render locally.
  });
```

Change the type and render branch (currently):

```ts
type FetchResult =
  | { accessToken: string; fightIdsKey: string; candidates: DruidCandidate[] }
  | { accessToken: string; fightIdsKey: string; error: string };
```

to:

```ts
type FetchResult = {
  accessToken: string;
  fightIdsKey: string;
  candidates: DruidCandidate[];
};
```

Remove:

```tsx
if ("error" in result) return <p role="alert">{result.error}</p>;
```

- [ ] **Step 4: Run `npm test -- src/app/components/DruidDetector` — expect all tests to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DruidDetector
git commit -m "refactor(errors): DruidDetector fetch failures escalate to the recovery overlay"
```

---

### Task 8: `AbilityResolver`

**Files:** Modify `src/app/components/AbilityResolver/index.tsx`, `src/app/components/AbilityResolver/index.test.tsx`.

- [ ] **Step 1: Rewrite the test file**

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchMasterDataAbilities = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Resolving abilities…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

Add `act` to the import: `import { act, render, screen, waitFor } from "@testing-library/react";`.

- [ ] **Step 2: Run `npm test -- src/app/components/AbilityResolver` — expect the new test to fail.**

- [ ] **Step 3: Edit `src/app/components/AbilityResolver/index.tsx`**

Change (currently):

```ts
fetchMasterDataAbilities(accessToken, reportCode, controller.signal)
  .then((abilities) => {
    const resolved = resolveAbilities(abilities);
    setResult({ accessToken, resolved });
    onResolved(resolved);
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setResult({
      accessToken,
      error:
        err instanceof Error ? err.message : "Failed to resolve abilities.",
    });
  });
```

to:

```ts
fetchMasterDataAbilities(accessToken, reportCode, controller.signal)
  .then((abilities) => {
    const resolved = resolveAbilities(abilities);
    setResult({ accessToken, resolved });
    onResolved(resolved);
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Anything else is already escalated to the full-screen recovery
    // overlay by the wrapped fetchMasterDataAbilities (see
    // wcl/client.ts's withErrorReporting) — nothing to render locally.
  });
```

Change the type (currently):

```ts
type FetchResult =
  | { accessToken: string; resolved: Map<number, ResolvedAbility> }
  | { accessToken: string; error: string };
```

to:

```ts
type FetchResult = {
  accessToken: string;
  resolved: Map<number, ResolvedAbility>;
};
```

Remove:

```tsx
if ("error" in result) return <p role="alert">{result.error}</p>;
```

- [ ] **Step 4: Run `npm test -- src/app/components/AbilityResolver` — expect all tests to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AbilityResolver
git commit -m "refactor(errors): AbilityResolver fetch failures escalate to the recovery overlay"
```

---

### Task 9: `GCDUtilizationCard`

**Files:** Modify `src/app/components/GCDUtilizationCard/index.tsx`, `src/app/components/GCDUtilizationCard/index.test.tsx`.

- [ ] **Step 1: Rewrite the test file**

Add to the imports: `act` from `@testing-library/react`, `vi` from `vitest`, and a namespace import of the metrics module:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GCDUtilizationCard } from "./index";
import * as gcdUtilizationModule from "../../../metrics/gcdUtilization";
import { aCastEvent, aFight } from "../../../testUtils/factories";
```

Add, right after the `describe("GCDUtilizationCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      gcdUtilizationModule,
      "computeGcdUtilization",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2: Run `npm test -- src/app/components/GCDUtilizationCard` — expect the new tests to fail** (fetch-fail test fails because the old inline alert still shows; compute-throw test fails because there's no try/catch around the compute call yet, so the throw is unhandled inside the `.then` and the promise chain's outer `.catch` — which still has the OLD signature at this point — would catch it and render the OLD generic message instead of "boom", or the assertion may simply mismatch. Either way, expect a failure here before Step 3).

- [ ] **Step 3: Edit `src/app/components/GCDUtilizationCard/index.tsx`**

Change (currently):

```ts
fetchEvents(
  accessToken,
  reportCode,
  { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
  "Casts",
  true,
)
  .then((events) => {
    const computed = computeGcdUtilization(
      events,
      druidId,
      fight.startTime,
      fight.endTime,
    );
    setResult({ accessToken, result: computed });
  })
  .catch((err: unknown) =>
    setResult({
      accessToken,
      error:
        err instanceof Error
          ? err.message
          : "Failed to calculate GCD utilization.",
    }),
  );
```

to:

```ts
fetchEvents(
  accessToken,
  reportCode,
  { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
  "Casts",
  true,
)
  .then((events) => {
    try {
      const computed = computeGcdUtilization(
        events,
        druidId,
        fight.startTime,
        fight.endTime,
      );
      setResult({ accessToken, result: computed });
    } catch (err) {
      setResult({
        accessToken,
        error:
          err instanceof Error
            ? err.message
            : "Failed to calculate GCD utilization.",
      });
    }
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Anything else is already escalated to the full-screen recovery
    // overlay by the wrapped fetchEvents (see wcl/client.ts's
    // withErrorReporting) — nothing to render locally.
  });
```

- [ ] **Step 4: Run `npm test -- src/app/components/GCDUtilizationCard` — expect all tests to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GCDUtilizationCard
git commit -m "refactor(errors): GCDUtilizationCard isolates compute bugs, escalates fetch failures"
```

---

### Task 10: `IdleGapsCard`

**Files:** Modify `src/app/components/IdleGapsCard/index.tsx`, `src/app/components/IdleGapsCard/index.test.tsx`.

Same shape as Task 9. Metric module: `computeIdleGaps` from `../../../metrics/idleGaps`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/IdleGapsCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdleGapsCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdleGapsCard } from "./index";
import * as idleGapsModule from "../../../metrics/idleGaps";
import { aCastEvent, aFight } from "../../../testUtils/factories";
```

Add, right after the `describe("IdleGapsCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(idleGapsModule, "computeIdleGaps").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/IdleGapsCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/IdleGapsCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeIdleGaps(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate idle gaps.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeIdleGaps(
            events,
            druidId,
            fight.startTime,
            fight.endTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate idle gaps.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/IdleGapsCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/IdleGapsCard
git commit -m "refactor(errors): IdleGapsCard isolates compute bugs, escalates fetch failures"
```

---

### Task 11: `LB3UptimeCard`

**Files:** Modify `src/app/components/LB3UptimeCard/index.tsx`, `src/app/components/LB3UptimeCard/index.test.tsx`.

Same shape. Metric module: `computeLb3Uptime` from `../../../metrics/lb3Uptime`. Props for the test render: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds={new Set([33763])}`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/LB3UptimeCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LB3UptimeCard } from "./index";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LB3UptimeCard } from "./index";
import * as lb3UptimeModule from "../../../metrics/lb3Uptime";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";
```

Add, right after the `describe("LB3UptimeCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(lb3UptimeModule, "computeLb3Uptime").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/LB3UptimeCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/LB3UptimeCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeLb3Uptime(
          events,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate LB3 uptime.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeLb3Uptime(
            events,
            druidId,
            lifebloomAbilityIds,
            fight.startTime,
            fight.endTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate LB3 uptime.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/LB3UptimeCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LB3UptimeCard
git commit -m "refactor(errors): LB3UptimeCard isolates compute bugs, escalates fetch failures"
```

---

### Task 12: `RefreshCadenceCard`

**Files:** Modify `src/app/components/RefreshCadenceCard/index.tsx`, `src/app/components/RefreshCadenceCard/index.test.tsx`.

Metric module: `computeRefreshCadence` from `../../../metrics/refreshCadence`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds={new Set([33763])}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/RefreshCadenceCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefreshCadenceCard } from "./index";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshCadenceCard } from "./index";
import * as refreshCadenceModule from "../../../metrics/refreshCadence";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";
```

Add, right after the `describe("RefreshCadenceCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      refreshCadenceModule,
      "computeRefreshCadence",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/RefreshCadenceCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/RefreshCadenceCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeRefreshCadence(
          events,
          druidId,
          lifebloomAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate refresh cadence.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeRefreshCadence(
            events,
            druidId,
            lifebloomAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate refresh cadence.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/RefreshCadenceCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RefreshCadenceCard
git commit -m "refactor(errors): RefreshCadenceCard isolates compute bugs, escalates fetch failures"
```

---

### Task 13: `AccidentalBloomsCard`

**Files:** Modify `src/app/components/AccidentalBloomsCard/index.tsx`, `src/app/components/AccidentalBloomsCard/index.test.tsx`.

This one fetches via `Promise.all` — the pattern still applies identically. Metric module: `computeAccidentalBlooms` from `../../../metrics/accidentalBlooms`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds={new Set([33763])}`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`. For the fetch-fail test, `fetchEvents` must reject regardless of `dataType` (both legs of the `Promise.all` use the same mock).

- [ ] **Step 1: Rewrite the test file**

Add `act` to the RTL import and `vi`/`afterEach` where missing (this file already imports `vi`? — check: it doesn't; add `import { afterEach, describe, expect, it, vi } from "vitest";` in place of the existing `import { describe, expect, it } from "vitest";`). Add `import * as accidentalBloomsModule from "../../../metrics/accidentalBlooms";`. Add `afterEach(() => vi.restoreAllMocks());` inside the `describe` block.

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      accidentalBloomsModule,
      "computeAccidentalBlooms",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

Add `act` to `import { render, screen, waitFor } from "@testing-library/react";`.

- [ ] **Step 2:** Run `npm test -- src/app/components/AccidentalBloomsCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/AccidentalBloomsCard/index.tsx` — change:

```ts
      .then(([buffEvents, healEvents]) => {
        const computed = computeAccidentalBlooms(
          buffEvents,
          healEvents,
          druidId,
          lifebloomAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate accidental blooms.",
        }),
      );
```

to:

```ts
      .then(([buffEvents, healEvents]) => {
        try {
          const computed = computeAccidentalBlooms(
            buffEvents,
            healEvents,
            druidId,
            lifebloomAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate accidental blooms.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/AccidentalBloomsCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AccidentalBloomsCard
git commit -m "refactor(errors): AccidentalBloomsCard isolates compute bugs, escalates fetch failures"
```

---

### Task 14: `ConcurrentTargetsCard`

**Files:** Modify `src/app/components/ConcurrentTargetsCard/index.tsx`, `src/app/components/ConcurrentTargetsCard/index.test.tsx`.

Metric module: `computeConcurrentLb3Targets` from `../../../metrics/concurrentLb3Targets`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds={new Set([33763])}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/ConcurrentTargetsCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent } from "../../../wcl/events";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent } from "../../../wcl/events";
import * as concurrentLb3TargetsModule from "../../../metrics/concurrentLb3Targets";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";
```

Add, right after the `describe("ConcurrentTargetsCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      concurrentLb3TargetsModule,
      "computeConcurrentLb3Targets",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/ConcurrentTargetsCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/ConcurrentTargetsCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeConcurrentLb3Targets(
          events,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate concurrent LB3 targets.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeConcurrentLb3Targets(
            events,
            druidId,
            lifebloomAbilityIds,
            fight.startTime,
            fight.endTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate concurrent LB3 targets.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/ConcurrentTargetsCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConcurrentTargetsCard
git commit -m "refactor(errors): ConcurrentTargetsCard isolates compute bugs, escalates fetch failures"
```

---

### Task 15: `RestackTaxCard`

**Files:** Modify `src/app/components/RestackTaxCard/index.tsx`, `src/app/components/RestackTaxCard/index.test.tsx`.

Uses `Promise.all`. Metric module: `computeRestackTax` from `../../../metrics/restackTax`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `lifebloomAbilityIds={new Set([33763])}`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/RestackTaxCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RestackTaxCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestackTaxCard } from "./index";
import * as restackTaxModule from "../../../metrics/restackTax";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("RestackTaxCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(restackTaxModule, "computeRestackTax").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/RestackTaxCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/RestackTaxCard/index.tsx` — change:

```ts
      .then(([buffEvents, castEvents]) => {
        const computed = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate re-stack tax.",
        }),
      );
```

to:

```ts
      .then(([buffEvents, castEvents]) => {
        try {
          const computed = computeRestackTax(
            buffEvents,
            castEvents,
            druidId,
            lifebloomAbilityIds,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate re-stack tax.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/RestackTaxCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RestackTaxCard
git commit -m "refactor(errors): RestackTaxCard isolates compute bugs, escalates fetch failures"
```

---

### Task 16: `HotClipDetectionCard`

**Files:** Modify `src/app/components/HotClipDetectionCard/index.tsx`, `src/app/components/HotClipDetectionCard/index.test.tsx`.

Uses `Promise.all`. Metric module: `computeHotClipDetection` from `../../../metrics/hotClipDetection`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `rejuvenationAbilityIds={new Set([...])}`, `regrowthAbilityIds={new Set([...])}`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/HotClipDetectionCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HotClipDetectionCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotClipDetectionCard } from "./index";
import * as hotClipDetectionModule from "../../../metrics/hotClipDetection";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("HotClipDetectionCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      hotClipDetectionModule,
      "computeHotClipDetection",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/HotClipDetectionCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/HotClipDetectionCard/index.tsx` — change:

```ts
      .then(([buffEvents, castEvents]) => {
        const computed = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate HoT clip detection.",
        }),
      );
```

to:

```ts
      .then(([buffEvents, castEvents]) => {
        try {
          const computed = computeHotClipDetection(
            buffEvents,
            castEvents,
            druidId,
            rejuvenationAbilityIds,
            regrowthAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate HoT clip detection.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/HotClipDetectionCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/HotClipDetectionCard
git commit -m "refactor(errors): HotClipDetectionCard isolates compute bugs, escalates fetch failures"
```

---

### Task 17: `SwiftmendAuditCard`

**Files:** Modify `src/app/components/SwiftmendAuditCard/index.tsx`, `src/app/components/SwiftmendAuditCard/index.test.tsx`.

Uses `Promise.all` with 3 legs. Metric module: `computeSwiftmendAudit` from `../../../metrics/swiftmendAudit`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `swiftmendAbilityIds`, `rejuvenationAbilityIds`, `regrowthAbilityIds`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/SwiftmendAuditCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwiftmendAuditCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwiftmendAuditCard } from "./index";
import * as swiftmendAuditModule from "../../../metrics/swiftmendAudit";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("SwiftmendAuditCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      swiftmendAuditModule,
      "computeSwiftmendAudit",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/SwiftmendAuditCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/SwiftmendAuditCard/index.tsx` — change:

```ts
      .then(([buffEvents, castEvents, healingEvents]) => {
        const computed = computeSwiftmendAudit(
          buffEvents,
          castEvents,
          healingEvents,
          druidId,
          swiftmendAbilityIds,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Swiftmend quality audit.",
        }),
      );
```

to:

```ts
      .then(([buffEvents, castEvents, healingEvents]) => {
        try {
          const computed = computeSwiftmendAudit(
            buffEvents,
            castEvents,
            healingEvents,
            druidId,
            swiftmendAbilityIds,
            rejuvenationAbilityIds,
            regrowthAbilityIds,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the Swiftmend quality audit.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/SwiftmendAuditCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/SwiftmendAuditCard
git commit -m "refactor(errors): SwiftmendAuditCard isolates compute bugs, escalates fetch failures"
```

---

### Task 18: `DownrankingDisciplineCard`

**Files:** Modify `src/app/components/DownrankingDisciplineCard/index.tsx`, `src/app/components/DownrankingDisciplineCard/index.test.tsx`.

Uses `Promise.all` (2 legs). Metric module: `computeDownrankingDiscipline` from `../../../metrics/downrankingDiscipline`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `resolvedAbilities`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/DownrankingDisciplineCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DownrankingDisciplineCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownrankingDisciplineCard } from "./index";
import * as downrankingDisciplineModule from "../../../metrics/downrankingDiscipline";
```

(Leave the rest of that file's existing imports below this line untouched — including the `RESOLVED_ABILITIES` constant it already defines.)

Add, right after the `describe("DownrankingDisciplineCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      downrankingDisciplineModule,
      "computeDownrankingDiscipline",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/DownrankingDisciplineCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/DownrankingDisciplineCard/index.tsx` — change:

```ts
      .then(([castEvents, healingEvents]) => {
        const computed = computeDownrankingDiscipline(
          castEvents,
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate downranking discipline.",
        }),
      );
```

to:

```ts
      .then(([castEvents, healingEvents]) => {
        try {
          const computed = computeDownrankingDiscipline(
            castEvents,
            healingEvents,
            druidId,
            resolvedAbilities,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate downranking discipline.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/DownrankingDisciplineCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DownrankingDisciplineCard
git commit -m "refactor(errors): DownrankingDisciplineCard isolates compute bugs, escalates fetch failures"
```

---

### Task 19: `OverhealTableCard`

**Files:** Modify `src/app/components/OverhealTableCard/index.tsx`, `src/app/components/OverhealTableCard/index.test.tsx`.

Single fetch (dataType `"Healing"`). Metric module: `computeOverhealTable` from `../../../metrics/overhealTable`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `resolvedAbilities`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/OverhealTableCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverhealTableCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverhealTableCard } from "./index";
import * as overhealTableModule from "../../../metrics/overhealTable";
```

(Leave the rest of that file's existing imports below this line untouched — including the `RESOLVED_ABILITIES` constant it already defines.)

Add, right after the `describe("OverhealTableCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      overhealTableModule,
      "computeOverhealTable",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/OverhealTableCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/OverhealTableCard/index.tsx` — change:

```ts
      .then((healingEvents) => {
        const computed = computeOverhealTable(
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the overheal table.",
        }),
      );
```

to:

```ts
      .then((healingEvents) => {
        try {
          const computed = computeOverhealTable(
            healingEvents,
            druidId,
            resolvedAbilities,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the overheal table.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/OverhealTableCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/OverhealTableCard
git commit -m "refactor(errors): OverhealTableCard isolates compute bugs, escalates fetch failures"
```

---

### Task 20: `ManaCurveCard`

**Files:** Modify `src/app/components/ManaCurveCard/index.tsx`, `src/app/components/ManaCurveCard/index.test.tsx`.

Metric module: `computeManaCurve` from `../../../metrics/manaCurve`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/ManaCurveCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCurveCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManaCurveCard } from "./index";
import * as manaCurveModule from "../../../metrics/manaCurve";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("ManaCurveCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(manaCurveModule, "computeManaCurve").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/ManaCurveCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/ManaCurveCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeManaCurve(
          events,
          druidId,
          fight.kill === true,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the mana curve.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeManaCurve(
            events,
            druidId,
            fight.kill === true,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the mana curve.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/ManaCurveCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ManaCurveCard
git commit -m "refactor(errors): ManaCurveCard isolates compute bugs, escalates fetch failures"
```

---

### Task 21: `ConsumableThroughputCard`

**Files:** Modify `src/app/components/ConsumableThroughputCard/index.tsx`, `src/app/components/ConsumableThroughputCard/index.test.tsx`.

Metric module: `computeConsumableThroughput` from `../../../metrics/consumableThroughput`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `resolvedAbilities`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/ConsumableThroughputCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumableThroughputCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumableThroughputCard } from "./index";
import * as consumableThroughputModule from "../../../metrics/consumableThroughput";
```

(Leave the rest of that file's existing imports below this line untouched — including the `DRUID_ID`/`RESOLVED_ABILITIES` constants it already defines.)

Add, right after the `describe("ConsumableThroughputCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      consumableThroughputModule,
      "computeConsumableThroughput",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/ConsumableThroughputCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/ConsumableThroughputCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeConsumableThroughput(
          events,
          druidId,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate consumable throughput.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeConsumableThroughput(
            events,
            druidId,
            resolvedAbilities,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate consumable throughput.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/ConsumableThroughputCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConsumableThroughputCard
git commit -m "refactor(errors): ConsumableThroughputCard isolates compute bugs, escalates fetch failures"
```

---

### Task 22: `InnervateAuditCard`

**Files:** Modify `src/app/components/InnervateAuditCard/index.tsx`, `src/app/components/InnervateAuditCard/index.test.tsx`.

Metric module: `computeInnervateAudit` from `../../../metrics/innervateAudit`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `resolvedAbilities`, `actorClasses={new Map()}`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/InnervateAuditCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InnervateAuditCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InnervateAuditCard } from "./index";
import * as innervateAuditModule from "../../../metrics/innervateAudit";
```

(Leave the rest of that file's existing imports below this line untouched — including the `INNERVATE_ID`/`RESOLVED_ABILITIES` constants it already defines.)

Add, right after the `describe("InnervateAuditCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      innervateAuditModule,
      "computeInnervateAudit",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/InnervateAuditCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/InnervateAuditCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeInnervateAudit(
          events,
          druidId,
          resolvedAbilities,
          actorClasses,
          fight.endTime - fight.startTime,
          fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Innervate audit.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeInnervateAudit(
            events,
            druidId,
            resolvedAbilities,
            actorClasses,
            fight.endTime - fight.startTime,
            fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the Innervate audit.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/InnervateAuditCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/InnervateAuditCard
git commit -m "refactor(errors): InnervateAuditCard isolates compute bugs, escalates fetch failures"
```

---

### Task 23: `NaturesSwiftnessCard`

**Files:** Modify `src/app/components/NaturesSwiftnessCard/index.tsx`, `src/app/components/NaturesSwiftnessCard/index.test.tsx`.

Metric module: `computeNaturesSwiftnessAudit` from `../../../metrics/naturesSwiftnessAudit`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `naturesSwiftnessAbilityIds`, `resolvedAbilities`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/NaturesSwiftnessCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NaturesSwiftnessCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaturesSwiftnessCard } from "./index";
import * as naturesSwiftnessAuditModule from "../../../metrics/naturesSwiftnessAudit";
```

(Leave the rest of that file's existing imports below this line untouched — including the `RESOLVED` constant it already defines.)

Add, right after the `describe("NaturesSwiftnessCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      naturesSwiftnessAuditModule,
      "computeNaturesSwiftnessAudit",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/NaturesSwiftnessCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/NaturesSwiftnessCard/index.tsx` — change:

```ts
      .then((events) => {
        const computed = computeNaturesSwiftnessAudit(
          events,
          druidId,
          naturesSwiftnessAbilityIds,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Nature's Swiftness audit.",
        }),
      );
```

to:

```ts
      .then((events) => {
        try {
          const computed = computeNaturesSwiftnessAudit(
            events,
            druidId,
            naturesSwiftnessAbilityIds,
            resolvedAbilities,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the Nature's Swiftness audit.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/NaturesSwiftnessCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/NaturesSwiftnessCard
git commit -m "refactor(errors): NaturesSwiftnessCard isolates compute bugs, escalates fetch failures"
```

---

### Task 24: `PrepHygieneCard`

**Files:** Modify `src/app/components/PrepHygieneCard/index.tsx`, `src/app/components/PrepHygieneCard/index.test.tsx`.

Metric module: `computePrepHygiene` from `../../../metrics/prepHygiene`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `fetchEvents`. Loading text: `"Calculating…"`. Note this component's fetch has no `includeResources` argument (dataType `"CombatantInfo"` only) and its success parameter is named `combatantInfoEvents`.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/PrepHygieneCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrepHygieneCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrepHygieneCard } from "./index";
import * as prepHygieneModule from "../../../metrics/prepHygiene";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("PrepHygieneCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(prepHygieneModule, "computePrepHygiene").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/PrepHygieneCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/PrepHygieneCard/index.tsx` — change:

```ts
fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo")
  .then((combatantInfoEvents) => {
    const computed = computePrepHygiene(combatantInfoEvents, druidId);
    setResult({ accessToken, result: computed });
  })
  .catch((err: unknown) =>
    setResult({
      accessToken,
      error:
        err instanceof Error
          ? err.message
          : "Failed to calculate prep hygiene.",
    }),
  );
```

to:

```ts
fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo")
  .then((combatantInfoEvents) => {
    try {
      const computed = computePrepHygiene(combatantInfoEvents, druidId);
      setResult({ accessToken, result: computed });
    } catch (err) {
      setResult({
        accessToken,
        error:
          err instanceof Error
            ? err.message
            : "Failed to calculate prep hygiene.",
      });
    }
  })
  .catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Anything else is already escalated to the full-screen recovery
    // overlay by the wrapped fetchEvents (see wcl/client.ts's
    // withErrorReporting) — nothing to render locally.
  });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/PrepHygieneCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/PrepHygieneCard
git commit -m "refactor(errors): PrepHygieneCard isolates compute bugs, escalates fetch failures"
```

---

### Task 25: `DeathForensicsCard`

**Files:** Modify `src/app/components/DeathForensicsCard/index.tsx`, `src/app/components/DeathForensicsCard/index.test.tsx`.

Uses `Promise.all` (3 legs: `Deaths`, `Casts`, `Buffs`). Metric module: `computeDeathForensics` from `../../../metrics/deathForensics`. Test props: `accessToken`, `reportCode`, `fight`, `druidId`, `swiftmendAbilityIds`, `naturesSwiftnessAbilityIds`, `lifebloomAbilityIds`, `targetNames={new Map()}`, `fetchEvents`. Loading text: `"Calculating…"`. **Do not touch** this file's `Alert` import/usage — that's the static "not automatically the druid's fault" disclaimer, out of scope for this story.

- [ ] **Step 1: Rewrite the test file**

Change the top of `src/app/components/DeathForensicsCard/index.test.tsx` from:

```ts
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeathForensicsCard } from "./index";
```

to:

```ts
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeathForensicsCard } from "./index";
import * as deathForensicsModule from "../../../metrics/deathForensics";
```

(Leave the rest of that file's existing imports below this line untouched.)

Add, right after the `describe("DeathForensicsCard", () => {` line:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});
```

Replace the `"shows an error message when the fetch fails"` test with:

```ts
  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(
      deathForensicsModule,
      "computeDeathForensics",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
```

- [ ] **Step 2:** Run `npm test -- src/app/components/DeathForensicsCard` — expect the new tests to fail.

- [ ] **Step 3:** Edit `src/app/components/DeathForensicsCard/index.tsx` — change:

```ts
      .then(([deathEvents, castEvents, buffEvents]) => {
        const computed = computeDeathForensics(
          deathEvents,
          castEvents,
          buffEvents,
          druidId,
          swiftmendAbilityIds,
          naturesSwiftnessAbilityIds,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the per-death resource audit.",
        }),
      );
```

to:

```ts
      .then(([deathEvents, castEvents, buffEvents]) => {
        try {
          const computed = computeDeathForensics(
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            fight.startTime,
            fight.endTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the per-death resource audit.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
```

- [ ] **Step 4:** Run `npm test -- src/app/components/DeathForensicsCard` — expect all tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DeathForensicsCard
git commit -m "refactor(errors): DeathForensicsCard isolates compute bugs, escalates fetch failures"
```

---

### Task 26: Final verification and paperwork retirement

**Depends on:** all of Tasks 1–25 committed.

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/error-handling-design.md`
- Delete: `docs/plans/error-handling-plan.md`

- [ ] **Step 1: Run the full verification suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all PASS, zero failures, zero skipped tests.

- [ ] **Step 2: Manually exercise the app** (per this project's `verify` skill / CLAUDE.md guidance to test the golden path in a browser, not just automated tests)

Run: `npm run dev`, open the app, and confirm:

- A report loads normally end-to-end (no regression).
- Temporarily breaking a fetch (e.g. via browser devtools' network offline mode) while loading a report shows the full recovery overlay, with "View details" collapsed by default and expandable, and "Start over" returning to the onboarding/connect screen.

- [ ] **Step 3: Mark story 708 done in `docs/backlog.md`**

Change the heading `### 708 — Global error handling & recovery overlay 🔲 Todo` to `### 708 — Global error handling & recovery overlay ✅ Done`.

- [ ] **Step 4: Retire the spec and plan docs**

```bash
git rm docs/specs/error-handling-design.md docs/plans/error-handling-plan.md
```

(Per CLAUDE.md: "A story isn't done until its paperwork is retired" — grep the repo first to confirm nothing else references these two file paths before removing them.)

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md
git commit -m "docs: mark story 708 done and retire its spec/plan"
```
