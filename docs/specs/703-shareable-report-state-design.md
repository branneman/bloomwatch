# 703 — Shareable report state (design)

Backlog story: `docs/backlog.md` #703.

## Problem

Right now every screen transition (report submit → druid pick → dashboard → fight →
epic detail) is local React `useState` in `App.tsx`, `ReportDashboard`, and
`Scorecard`. Nothing is in the URL, so there's nothing to share, and the
browser's back/forward buttons do nothing useful. This story makes the URL
hash the single source of truth for navigation, so any screen in the flow can
be shared as a link and resumed directly, and back/forward work everywhere
the in-app back-links already do.

## Known discrepancy with the backlog wording

703's acceptance criteria lists "whole-report per-epic detail" among the
screens that need URL state. No such screen exists: `ReportDashboard`'s
aggregated epic-chip strip is explicitly non-clickable/informational only
(confirmed in both `docs/design_v3`'s handoff notes and the current
`ReportDashboard` code — the chips render a judgement with no `onClick`).
Decision (confirmed with the maintainer): treat this as stale backlog
wording, not new scope. This story routes only the screens that actually
exist today. Building a whole-report per-epic drill-down is a separate,
future story if wanted.

## Route shape

A discriminated union, each variant a strict superset of the previous one —
a shorter hash is a shallower screen:

```ts
type EpicId = "gcd" | "lifebloom" | "spell" | "mana" | "death" | "prep";

type Route =
  | { screen: "input" }
  | { screen: "druidPicker"; reportCode: string }
  | { screen: "dashboard"; reportCode: string; druidName: string }
  | { screen: "fight"; reportCode: string; druidName: string; fightId: number }
  | {
      screen: "fightEpic";
      reportCode: string;
      druidName: string;
      fightId: number;
      epicId: EpicId;
    };
```

URL form (path-style segments):

```
#                                          → input
#/r/<reportCode>                          → druidPicker
#/r/<reportCode>/d/<druidName>            → dashboard
#/r/<reportCode>/d/<druidName>/f/<fightId>            → fight
#/r/<reportCode>/d/<druidName>/f/<fightId>/e/<epicId> → fightEpic
```

**Druid identified by name, not WCL actor ID.** WoW disallows duplicate
character names on the same realm, so a name is a safe, stable, and — unlike
a WCL actor ID — human-readable lookup key for a shared link (the story's own
motivation is sharing a link "with my healing officer," who cares about a
name, not an internal ID). `druidName` is percent-encoded via
`encodeURIComponent` when serialized and decoded via `decodeURIComponent`
when parsed, to survive spaces/apostrophes/etc. in character names. Matching
on resume is an exact, case-sensitive comparison against
`DruidCandidate.name`. This is purely a URL-representation change — every
existing prop (`ReportDashboard`'s `druidId`, `Scorecard`'s `druidId`, etc.)
stays a `number`, resolved once via
`druidCandidates.find(c => c.name === route.druidName)`.

`parseHash(hash: string): Route` and `serializeRoute(route: Route): string`
are pure, co-located functions in a new `src/app/routing/hashRoute.ts`. Any
hash that doesn't match the expected shape (malformed segments, an unknown
`epicId`, wrong segment count) parses to `{ screen: "input" }` — no error
state, it just falls back to the start of the flow.

## Hook mechanics

`useHashRoute()` (`src/app/routing/useHashRoute.ts`), called once in
`App.tsx`:

- `route: Route` — state initialized from `parseHash(window.location.hash)`.
- `navigate(route: Route): void` — computes `serializeRoute(route)`, calls
  `history.pushState(null, "", newHash)`, and synchronously updates React
  state in the same call. `pushState` never fires `hashchange` or `popstate`
  on its own, so the hook must update its own state directly rather than
  relying on an event.
- A `popstate` listener (registered once, cleaned up on unmount) re-parses
  `window.location.hash` and updates state — this covers the browser's own
  back/forward buttons, which do fire `popstate` (and, since the fragment
  differs, `hashchange`) when moving between history entries this hook
  created via `pushState`.

This pairing (`pushState` + `popstate`) needs no new dependency and has been
supported in every evergreen browser for well over a decade — no polyfill
required.

## State ownership: App.tsx becomes the single source of truth

- **`App.tsx`**: drives `report`/`loadedReport`/`druidCandidates` fetching
  from `route.reportCode` instead of a separately-submitted `ParsedReport`
  state. `ReportInput.onSubmit` calls
  `navigate({ screen: "druidPicker", reportCode })` directly — the standalone
  `report` `useState` goes away. Once `druidCandidates` resolve: if
  `route.druidName` matches a candidate, skip straight to `ReportDashboard`
  (no picker, no button click) — this generalizes the existing
  single-candidate auto-select shortcut to "a druid was already named by the
  route," and the single-candidate case still applies when the route doesn't
  name one. `handleStartOver` becomes `navigate({ screen: "input" })`.
- **`ReportDashboard`**: `openFightId`/`setOpenFightId` are removed. It
  becomes a controlled component: `openFightId: number | null` and
  `onOpenFight: (fightId: number) => void` are new props. `App.tsx` wires
  `onOpenFight` to `navigate({ screen: "fight", reportCode, druidName,
fightId })`; `Scorecard`'s `onBackToFights` wires to
  `navigate({ screen: "dashboard", reportCode, druidName })`.
- **`Scorecard`**: `activeEpic`/`setActiveEpic` are removed. It becomes a
  controlled component: `activeEpic: EpicId | null` and
  `onSelectEpic: (epicId: EpicId | null) => void` are new props, wired to
  `navigate({ screen: "fightEpic", ...,  epicId })` and
  `navigate({ screen: "fight", ... })` (for `epicId: null`, i.e. "← All
  metrics") respectively.
- **Preserved: pasted-link deep-fight jump.** `parseReportInput` already
  extracts a `fightId` from a _pasted_ WCL report URL's own `#fight=`
  fragment (a WCL URL convention, unrelated to this app's own hash scheme —
  see `src/report/parseReportInput.ts`). That parsed `fightId` still needs to
  land the user on that exact fight once a druid resolves. It's threaded the
  same way as today's `initialFightId` prop, just folded into the eventual
  `navigate()` call instead of a separate prop: `ReportInput`'s submit
  navigates to `{ screen: "druidPicker", reportCode }` as normal, and
  `App.tsx` remembers the pending `fightId` (plain local state, not part of
  the route — it's a one-shot seed, not shareable state in its own right)
  until druid auto-selection completes, at which point it performs one more
  `navigate` straight to the `"fight"` screen instead of `"dashboard"`.

This is a mechanical "lift state up" refactor at this layer — no new
navigation behavior, just moving `useState` ownership so the URL and the UI
can never disagree.

## Resume-from-URL sequencing & fallback behavior

Opening a deep link like `#/r/CODE/d/Dassz/f/123/e/gcd` cold:

1. `useHashRoute()` parses the full route on mount immediately, regardless of
   auth state.
2. Onboarding (705) and Connect gating are **unchanged** — still driven by
   `localStorage`'s dismissed-flag and `accessToken` respectively. A
   first-time visitor still sees onboarding once; a logged-out visitor still
   sees Connect. The parsed route just waits in memory.
3. Once authenticated, `App.tsx` uses `route.reportCode` directly to drive
   `ConnectPanel`/`DruidDetector` fetching — the `ReportInput` screen is
   skipped entirely, since a report code is already known.
4. Once `druidCandidates` resolve: if `route.druidName` matches a candidate,
   skip straight to the dashboard. If it doesn't match (stale/bad link,
   typo'd name), silently fall back to `{ screen: "druidPicker", reportCode
}` via `navigate` — this rewrites the URL, no error message shown.
5. Once `loadedReport`'s non-trash fight rows are known: if `route.fightId`
   isn't among them, `navigate` falls back to `{ screen: "dashboard",
reportCode, druidName }`.
6. `route.epicId` needs no separate runtime validation — `parseHash` only
   ever produces one of the six known `EpicId` values or omits the segment
   entirely, so an unrecognized epic segment has already collapsed to the
   `"fight"` screen at parse time.

Every fallback is a single `navigate()` call once the relevant data
resolves. No new error-display component is introduced — matches the
"silently fall back to nearest valid screen" decision below.

## Decisions confirmed with the maintainer

- **Missing "whole-report per-epic detail" screen**: scope it out; route only
  what exists today (see "Known discrepancy" above).
- **Router implementation**: hand-rolled `pushState`/`popstate`, no routing
  library — matches the project's existing minimal-dependency, hand-rolled
  style (`parseReportInput`, `useWclAuth`) and needs no new `package.json`
  entry.
- **URL shape**: path-style segments (`#/r/CODE/d/NAME/f/ID/e/EPIC`), not a
  flat query string — a shorter hash naturally represents a shallower
  screen.
- **State ownership**: centralize in `App.tsx` (Approach A over a
  decentralized two-way-sync alternative) — the URL is the only source of
  truth, so there's no risk of local state and the hash disagreeing.
- **Invalid URL state** (bad fight ID, unmatched druid name): silently fall
  back to the nearest valid screen, no error message — treated the same as
  data that simply isn't there.
- **Druid identified by name, not ID**: see "Route shape" above.

## Testing plan

Per `docs/testing.md`'s pyramid:

- **Tier 1 (unit):** `src/app/routing/hashRoute.test.ts` — a round-trip table
  covering all five screen depths (`serializeRoute(parseHash(x)) `), plus
  malformed/garbage/unknown-epic-segment hashes all falling back to
  `{ screen: "input" }`, plus a druid name containing a space/apostrophe
  round-tripping correctly through `encodeURIComponent`/`decodeURIComponent`.
- **Tier 3 (component, jsdom):** a focused test for `useHashRoute` itself —
  `navigate()` updates `window.location.hash`; a simulated `popstate` event
  updates the hook's returned `route` — needs jsdom's `window.location`/
  `history`, hence Tier 3 rather than Tier 1. `ReportDashboard` and
  `Scorecard`'s existing component tests are updated for their new
  controlled props (supply `openFightId`/`activeEpic` via props directly,
  assert `onOpenFight`/`onSelectEpic` fire on click, rather than asserting on
  internal state transitions). One focused `App`-level test mounts with a
  pre-set multi-level hash (MSW-mocked report/fight data, per existing Tier 2
  fixture conventions) and asserts it lands directly on the deep screen with
  no manual clicks — covering the resume path end-to-end.

## Non-goals

- No "whole-report per-epic detail" screen (see "Known discrepancy" above).
- No new routing library dependency.
- No change to OAuth redirect handling (`useWclAuth` uses
  `window.location.search`/`pathname` for the PKCE redirect URI, entirely
  separate from the hash this story owns).
- No change to Onboarding (705) or Connect gating logic.
- Markdown export (704), Good/Fair/Bad judgement labels (707), and
  responsive/mobile layout (706) are untouched — separate stories.
