# Design: Story 009 — Rate-limit usage banner

Backlog story: `docs/backlog.md` #009. Visual reference: `docs/design_v5.html` (screens "03 — Load
a report" and the dedicated "13 — Rate-limit usage banner" spec screen), which supersedes the
placeholder mention of this banner in `docs/design_v4`.

## Problem

The shared default WCL API client (story 008) has a per-hour request budget shared by every user
who hasn't registered their own Client ID. Today the app only reacts _after_ that budget is fully
exhausted (a 429, handled by 008's blocking fallback). Story 009 adds a quiet, non-blocking heads-up
once usage crosses 75%, so slowness reads as "busy" rather than "broken," before the hard stop.

## Real API shape (verified live, not just per the backlog's claim)

`docs/wcl-auth.md` does not actually document `rateLimitData`'s shape despite `docs/backlog.md`
claiming it does — confirmed by querying the real WCL API directly (`CLAUDE.md`'s sanctioned
live-query method) against the test token:

```
query { rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }
```

returns `{ limitPerHour: 3600, pointsSpentThisHour: 53.52, pointsResetIn: 2105 }`. Also confirmed
`rateLimitData` can be queried as a sibling root field alongside `reportData` in the same request —
no extra round trip is needed to obtain it. `pointsResetIn` isn't needed for this story (no countdown
in the design) and won't be requested.

Usage percentage = `(pointsSpentThisHour / limitPerHour) * 100`.

## Data layer

- Add `rateLimitData { limitPerHour pointsSpentThisHour }` to the query bodies built by
  `fetchReportFights`, `fetchCastsTable`, and `fetchMasterDataAbilities` (`src/wcl/client.ts`), and
  `fetchEventsPage` (`src/wcl/events.ts`) — 4 call sites total, the same ones story 010 already
  audited.
- New module `src/wcl/rateLimitUsage.ts`: a minimal subscribe/publish pair.
  - `subscribeRateLimitUsage(listener: (usage: RateLimitUsage) => void): () => void` — registers a
    listener, returns an unsubscribe function.
  - An internal `publishRateLimitUsage(usage: RateLimitUsage)`, called only from `postGraphQLOnce`
    (`src/wcl/client.ts`) whenever a parsed response includes a `rateLimitData` field — the single
    injection point, so none of the 4 domain fetch functions change signature.
  - `RateLimitUsage = { limitPerHour: number; pointsSpentThisHour: number }`.
- New hook `useRateLimitUsage()` (`src/wcl/useRateLimitUsage.ts`): subscribes on mount via
  `subscribeRateLimitUsage`, holds the latest `RateLimitUsage` in state, and returns
  `usagePct: number | null` (`null` until the first response carrying the field arrives this
  session — there is no proactive polling; the percentage only updates as a side effect of requests
  the user's own actions already trigger, so this story adds no new requests to the shared budget).

## UI

- New component `src/app/components/ui/RateLimitBanner/` (CSS module, following the project's
  existing component convention): a usage meter (with a visible tick at the 75% trigger threshold,
  matching principle 3 — the threshold is shown, not hidden) plus copy ported from `design_v5`:
  "Shared connection is running low" / "Everyone shares one connection to Warcraft Logs, and it's
  nearly used up for this hour — you could soon be blocked out. Your own free WCL API key is used
  only by you and never runs into this." followed by a `Disclosure` labelled "Use your own Client
  ID" that reveals the existing `OwnClientIdField` inline (same component + `connect()` wiring
  already used on the Connect screen and in 008's fallback Alert — no new registration flow).
  Uses the `--judgement-orange*` tokens (already in `src/index.css`, confirmed identical to
  `design_v5`'s tokens) per the design's "sanctioned non-verdict use of judgement color" note.
- Threshold: 75%, matching backlog #009's acceptance criteria — documented via a code comment
  pointing at `docs/backlog.md` #009, per principle 3.
- Placement: rendered once, at the very top of `App.tsx`'s returned tree, as a sibling to every
  existing screen block (onboarding, connect, the 008 fallback, and the main screen div) — not
  nested inside any single one, so it is genuinely app-wide chrome rather than tied to one screen.
- Visibility: `usagePct !== null && usagePct >= 75 && usingDefaultClient`. `usingDefaultClient` is
  already returned by `useWclAuth` today but currently unused by `App.tsx`. No manual dismiss —
  automatic show/hide only, matching both the backlog criteria and the design (no close button).
- Distinct from 008's existing blocking fallback Alert: that one only appears on an actual 429 and
  blocks interaction; this banner is non-blocking status chrome that can co-exist with a fully
  usable screen underneath it.

## Out of scope

- `pointsResetIn` / any countdown UI.
- Any background polling to keep `usagePct` fresh while idle.
- A manual dismiss/close affordance for the banner.
- Story 706 (mobile), 708 (error overlay), and 802 (threshold calibration) — untouched by this story.

## Testing plan (per `docs/testing.md`)

- **Tier 1** (`src/wcl/rateLimitUsage.test.ts`): publish delivers to subscribed listeners; the
  returned unsubscribe function stops further delivery; multiple listeners all receive a publish.
- **Tier 2** (extending `src/wcl/client.test.ts`'s MSW-backed suite): a mocked response carrying
  `rateLimitData` is parsed by `postGraphQLOnce` and triggers a subscriber with the correct values —
  proves the wiring survives real response parsing, not just the pub-sub module in isolation.
- **Tier 3**:
  - `RateLimitBanner.test.tsx`: renders/hides at the threshold boundary, and its Disclosure reveals
    `OwnClientIdField`.
  - Extend `src/App.test.tsx` (mirroring its existing 008 tests): banner appears/disappears based on
    a mocked `usagePct` crossing 75%, and never appears once a custom Client ID has been set,
    regardless of `usagePct`.
