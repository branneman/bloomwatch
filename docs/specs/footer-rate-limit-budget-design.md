# Footer rate-limit budget — design

## Goal

Add a WCL rate-limit budget line to the footer, next to the version string, so
users can see actual hourly request usage at a glance rather than only when
the 75%-threshold banner (story 009) appears.

## Current state

`Footer` (`src/app/components/ui/Footer`) renders `About` (left) and the app
version (right) in a single flex row, space-between. Rate-limit data
(`{ limitPerHour, pointsSpentThisHour }`) is already published on every WCL
request via `src/wcl/rateLimitUsage.ts`'s pub/sub, and consumed today only as
a derived percentage by `useRateLimitUsage()` (`src/wcl/useRateLimitUsage.ts`),
which feeds `RateLimitBanner`'s 75% gate.

## Data flow

- `useRateLimitUsage.ts` gains `useRateLimitUsageData()`, returning the raw
  `RateLimitUsage | null` straight from the subscription. The existing
  `useRateLimitUsage()` (percentage) is rewritten to call it and derive the
  percentage — its own behavior and tests are unchanged.
- `App.tsx` calls `useRateLimitUsageData()` and passes the result to
  `<Footer>` as a new `rateLimitUsage` prop. No gating on `usingDefaultClient`
  or `rateLimited` beyond what already wraps `<Footer>` today — the budget
  shows regardless of which client (shared default or the user's own) is
  active, since WCL enforces an hourly limit either way.

## Footer content

- Left: unchanged `About` button.
- Right, when `rateLimitUsage` is `null` (no WCL request has completed yet
  this session): show only `Version: <version>`.
- Right, once data has arrived: show both, in this exact form:
  `WCL rate limit budget: <pointsSpentThisHour>/<limitPerHour>. Version: <version>.`
  Numbers are displayed exactly as WCL returns them — no rounding, no
  formatting.

## Responsive behavior

The footer's inner row stays a two-column flex (`About` left, info block
right) at every width. The only change is how the info block's two sentences
lay out, at the app's existing `sm` (600px) breakpoint from
`docs/responsive-design.md`:

- Below 600px: info block stacks (`flex-direction: column`, right-aligned) —
  rate-limit line on top, version line below.
- 600px and up: info block is a single row (`flex-direction: row`), both
  sentences inline, matching the one-line form above.

## Test changes

- `Footer/index.test.tsx`: the version-text assertion currently expects the
  bare `\d+-[0-9a-f]{7,}` string with nothing else in that element; update to
  match the new `Version: ` prefix. Add cases for the rate-limit line
  appearing when `rateLimitUsage` is provided and being absent when it's
  `null`.
- `useRateLimitUsage.test.ts`: unchanged (behavior unchanged).
- New cases for `useRateLimitUsageData()` (same test file as
  `useRateLimitUsage`, since it's the primitive the percentage hook now
  builds on) covering: returns `null` until first publish, returns the raw
  object after a publish, updates on a later publish, stops updating after
  unmount.

## Out of scope

- No change to `RateLimitBanner` or its 75% threshold behavior.
- No change to when the rate-limit data itself gets published (still tied to
  any WCL request completing, per story 009).
