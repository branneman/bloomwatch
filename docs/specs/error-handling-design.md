# Global error handling & recovery overlay — design

Implements backlog story 708.

## Problem

The app currently has no consistent way to handle unexpected failures. An uncaught
render error blanks the page silently (no `ErrorBoundary` exists anywhere). WCL
requests have no timeout, so a hung request just spins forever. Error display is
scattered and inconsistent: `ConnectPanel`, `DruidDetector`, and `AbilityResolver`
each render their own inline message on fetch failure; `useWclAuth` renders its
OAuth-exchange failure via an `Alert` in `App.tsx`; ~20 metric-card components each
have their own local `{ error: string }` branch. None of these give the user a
clear "this is broken, here's what to do" path, and a truly uncaught exception
(a rendering bug) currently has no handling at all.

## Error taxonomy — what routes where

**Full-screen recovery overlay** (new — this story's main deliverable):

- Any uncaught render exception anywhere in the tree (React `ErrorBoundary`).
- `useWclAuth`'s OAuth/PKCE token-exchange failure.
- `ConnectPanel`'s report-load failure (`fetchReportFights`).
- `DruidDetector`'s druid-detection failure (`fetchCastsTable`).
- `AbilityResolver`'s ability-resolution failure (`fetchMasterDataAbilities`).
- A metric card's **fetch-layer** failure (`fetchEvents` rejecting — network error,
  non-2xx, or the new request timeout). Rationale: a WCL fetch failure almost
  always means WCL/the network is unreachable for this whole session, which will
  take out every other card on the same screen too — the "is the page still
  useful" test from story 708's acceptance criteria fails here, not just for one
  widget.

**Stays local, per-card** (existing behavior, narrowed but not removed):

- A metric card's own **computation** throwing on already-successfully-fetched
  data (a bug in one metric's calculation while every other card's fetch and
  computation succeeded). Genuinely isolated to one widget; the rest of the
  scorecard remains useful, so this keeps today's small inline error message.

**Untouched:**

- The rate-limit banner (429) — its own dedicated recovery flow per stories
  008/009 (register a personal Client ID). Explicitly excluded from this story's
  "single path," per product decision.
- The disclaimer `Alert`s in `DeathForensicsCard`, `ReportDashboard`, and
  `Scorecard`'s footer — static caveat text ("this audits your readiness only,"
  etc.), not errors.
- `ReportInput`'s validation message for a malformed report URL/code — expected
  user-input feedback (002's own acceptance criteria), not a system error.

## New components

### `ErrorOverlay` (`src/app/components/ErrorOverlay/`)

Presentational. Props: `error: unknown`, `onStartOver: () => void`.

Renders:

- An apology: "Sorry, something went wrong."
- A `Disclosure` (reusing the existing UI component), collapsed by default,
  labeled "View details," containing: the error's `message` (or `String(error)`
  if it isn't an `Error`), its `stack` when available, and a timestamp
  (`new Date().toISOString()` at render time).
- A "Start over" button: `onStartOver` sets `location.hash = "#/"` then calls
  `location.reload()`.
- A line inviting the user to open an issue at
  `https://github.com/branneman/bloomwatch/issues` (with the same details) if
  retrying doesn't help.

### `ErrorBoundary` (`src/app/components/ErrorBoundary/`)

A class component (React requires this — no hook equivalent exists for
`componentDidCatch`/`getDerivedStateFromError`). Wraps `<App />` in `main.tsx`.
On catch, renders `<ErrorOverlay error={...} onStartOver={...} />` in place of
its children.

## WCL client changes

### Timeout (`src/wcl/client.ts`, `src/wcl/events.ts`)

- New `WclTimeoutError extends Error`, distinct from `WclApiError`.
- New internal `fetchWithTimeout(url, init, callerSignal?)` helper in
  `client.ts` (exported for reuse by `events.ts`): builds a combined signal via
  `AbortSignal.any([callerSignal, AbortSignal.timeout(30_000)].filter(Boolean))`,
  calls `fetch`, and on rejection distinguishes the cause: a `DOMException`
  named `"TimeoutError"` (from our own timeout) is re-thrown as
  `WclTimeoutError`; a `DOMException` named `"AbortError"` (the caller's own
  cancellation, e.g. component unmount) is re-thrown unchanged; anything else
  is re-thrown unchanged.
- The 4 existing raw `fetch()` call sites (`fetchReportFights`,
  `fetchCastsTable`, `fetchMasterDataAbilities`, `fetchEventsPage`) switch to
  this helper. No public function signature changes — `fetchEventsPage` gains
  a timeout with no caller-cancellation signal to combine with (it doesn't
  accept one today, per story 010's caching design — in-flight event fetches
  are shared across callers and outlive any one component).
- The timeout duration (30s) is a single named constant, not threaded through
  every function signature.

### Global error reporting (`src/wcl/client.ts`)

- New `withErrorReporting(fn, reportError)`, structurally identical to the
  existing `withRateLimitDetection`: catches, re-throws `AbortError` and 429
  (`WclApiError` with `status === 429`) untouched (not global errors — the
  first is a benign cancellation, the second already has its own path), calls
  `reportError(err)` for everything else, then re-throws.

## Wiring (`src/App.tsx`)

- New `const [globalError, setGlobalError] = useState<unknown>(null)` and
  `const reportError = useCallback((err: unknown) => setGlobalError(err), [])`.
- The existing `useMemo`-wrapped fetchers (`wrappedFetchReportFights`,
  `wrappedFetchCastsTable`, `wrappedFetchMasterDataAbilities`,
  `wrappedFetchEvents`) get `withErrorReporting` layered outside
  `withRateLimitDetection` (order matters: rate-limit detection must see the
  429 first and suppress it from also being treated as a generic error).
- `useWclAuth` takes `reportError` and calls it instead of `setAuthError` in
  its token-exchange `.catch()`; the `authError` state/return value and its
  `Alert` rendering in `App.tsx`'s pre-connect screen are removed (superseded
  by the overlay).
- At the top of `App`'s render: `if (globalError !== null) return <ErrorOverlay error={globalError} onStartOver={...} />` — short-circuits everything else, matching the "single unified path" decision.

## Card-level treatment (the ~20 `*Card` components under `src/app/components/`)

Each currently does:

```ts
fetchEvents(...)
  .then((events) => setResult({ accessToken, result: compute(events, ...) }))
  .catch((err) => setResult({ accessToken, error: err.message }));
```

Changes to:

```ts
fetchEvents(...)
  .then((events) => {
    try {
      setResult({ accessToken, result: compute(events, ...) });
    } catch (err) {
      setResult({ accessToken, error: /* compute-stage message, unchanged */ });
    }
  })
  .catch((err) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    // Fetch-stage failure: already escalated to the full-screen overlay via
    // withErrorReporting (App.tsx wraps fetchEvents before it reaches here).
    // Nothing to render locally — this component is about to unmount.
  });
```

`ConnectPanel`, `DruidDetector`, and `AbilityResolver` are simplified similarly:
their `error` variant and its rendering (`Alert` / `<p role="alert">`) are
removed entirely, since their one and only failure mode is a fetch-layer
failure that's now always app-level.

## Test impact

Each of the ~20 cards has an existing test ("shows an error message when the
fetch fails") that mocks a **rejected** `fetchEvents` promise and asserts an
inline message. Under the new split, a rejected fetch no longer renders
anything locally — that test's premise changes. Per card:

- Update that test to assert the fetch-rejection case now renders nothing
  extra locally (component stays in its loading state, since — in isolation,
  without the app-level `reportError` plumbing — there's genuinely nothing
  else for it to do).
- Add a new test for the compute-stage-throw case (a fake `fetchEvents` that
  **resolves** with data the compute function can't handle, or a spy that
  makes the compute function throw), asserting the existing inline error
  message still appears — proving per-card isolation still holds for that
  case.

`ConnectPanel`, `DruidDetector`, `AbilityResolver` tests: remove the
fetch-failure-renders-inline-error case (no longer true), keep everything
else.

New tests:

- Tier 1: `WclTimeoutError`/timeout-vs-abort classification, as a pure
  function extracted from `fetchWithTimeout` so it's testable without waiting
  on real timers — construct a `DOMException(..., "TimeoutError")` /
  `DOMException(..., "AbortError")` directly and assert the mapping.
- Tier 1: `withErrorReporting` — 429 and `AbortError` pass through without
  calling `reportError`; anything else calls `reportError` and rethrows.
- Tier 3: `ErrorBoundary` renders `ErrorOverlay` when a child throws during
  render.
- Tier 3: `ErrorOverlay` — details collapsed by default, expands on click,
  "Start over" sets the hash and reloads, GitHub issues link is present.
- Tier 3: `App` renders the overlay when `reportError` fires (e.g. via a
  fake `fetchReportFights` that rejects) and no longer shows `ConnectPanel`'s
  old inline `Alert`.

## Out of scope

- No error-reporting/telemetry service (principles 2/4 — no backend, FOSS).
  "View details" is for the user to paste into a manually-filed GitHub issue.
- No change to the rate-limit banner's own logic (008/009).
- No change to `ReportInput`'s validation message.
- No change to the static disclaimer `Alert`s.
