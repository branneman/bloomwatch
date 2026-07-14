# Design: Story 702 — Whole-report dashboard (folding in 003's retirement)

## Summary

Replace the current post-report flow (multi-select fight picker → confirm → druid picker →
stacked per-fight scorecards) with the flow defined by `docs/design_v3` and `docs/backlog.md`
story 702: **connect → load report → pick druid → whole-report dashboard**. The dashboard is the
terminal screen for this story — it both aggregates every non-trash fight automatically and
serves as the fight-picker, replacing the standalone `FightPicker` screen entirely. Story 003 is
retired as a distinct screen; its acceptance criteria (boss-only list, kill/wipe distinction,
single-select) are satisfied by the dashboard's own per-boss list instead.

## Why

- `docs/backlog.md` story 702 supersedes story 004 (already removed) and demotes 003 from "the
  first post-report screen" to "content folded into 702's list" — see backlog's Epic H ordering
  note: _"003's fight-picker list remains reachable for jumping directly to a specific pull
  without going through the aggregate first."_ In discussion, the maintainer clarified this
  further: not a second screen, but the dashboard's own list must stay clickable **before** its
  aggregate judgements finish loading, which satisfies the same "don't make me wait" goal without
  a second screen existing at all.
- `docs/design_v3` (screens 04–07) is the maintainer-approved visual reference for the new flow,
  produced via a dedicated Claude Design pass per `docs/backlog.md`'s note on 706.

## Flow (before → after)

**Before:** Connect → load report → FightPicker (multi-select, zone buttons, trash toggle) →
confirm fights → DruidDetector/DruidPicker (scoped to selected fights) → Scorecard, one per
selected fight, stacked.

**After:** Connect → load report → DruidDetector (runs across **every non-trash fight**
automatically, no user gating) → DruidPicker → `WholeReportDashboard` (terminal screen for this
story).

- Druid detection no longer waits on a fight-selection step — it queries all non-trash fight IDs
  from `loadedReport` as soon as the report loads. Still cheap per story 005's constraint (a
  casts-table query, not an event-stream fetch).
- A `#fight=N` fragment on the pasted URL (story 002) is threaded through as the dashboard's
  initial `openFightId`, so a direct link still jumps straight to that fight's scorecard — within
  the one dashboard screen, rather than a separate route.

## `WholeReportDashboard` component

Matches `docs/design_v3/source/report-dashboard.jsx` (screen 05) structurally, with one behavioral
change from the mock: rows are clickable immediately, not gated on their judgement resolving.

**Props:** `fights: Fight[]` (from `loadedReport`), `druidId`, `druid`, the resolved ability-ID
sets, `resolvedAbilities`, `targetNames`, `actorClasses`, `fetchEvents`, `initialFightId: number |
null` (from the `#fight=` fragment), `onStartOver`.

**State:** `openFightId: number | null`, initialized from `initialFightId`.

**Rendering, `openFightId === null`:**

- Eyebrow ("Whole-report dashboard") + `loadedReport.title` as the heading (not a reconstructed
  zone name — see "Dropped: zone grouping" below) + druid label + fight count.
- Epic chip strip: one chip per epic, worst-of judgement across every non-trash fight so far
  resolved. Not clickable (matches design — informational only).
- Per-boss list: one row per non-trash fight, built from `buildFightRows`/`formatDuration`
  (reused from the current `FightPicker`/`fightRows.ts`) — outcome badge, duration, and that
  fight's own worst-of chip. **Rows render and are clickable as soon as the fight list loads**,
  independent of chip state; a row's chip shows "Calculating…" (same convention as the existing
  per-widget loading state) until that fight's six epic summaries resolve.
- Clicking a row sets `openFightId`; the list itself does not unmount (cheap to keep alive), it's
  just hidden while a fight is open, matching the existing pattern in `App.tsx` for kept-mounted
  steps.
- Bottom disclaimer (target selection/assignment/positioning caveat), same copy as the per-fight
  scorecard's.

**Rendering, `openFightId !== null`:** the extracted `ScorecardContent` (see below) for that fight,
with `onExit` clearing `openFightId` and `exitLabel="← All fights"`.

### Per-row / per-epic judgement computation

Each row (and the epic strip) needs, per fight, the same six per-epic `EpicSummary` computations
`Scorecard` already performs (`useGcdEconomySummary`, `useLifebloomDisciplineSummary`,
`useSpellDisciplineSummary`, `useManaEconomySummary`, `useDeathForensicsSummary`,
`usePrepHygieneSummary`). Rather than duplicating six hook calls at every call site, both the
per-fight row and `ScorecardContent`'s widget grid should be built on one shared hook (e.g.
`useFightEpicSummaries(fight, druidId, ...)`) that calls all six and returns the six `EpicSummary`
results plus one reduced `overallJudgement`/`overallStatus` via the existing `worstJudgement`. A
row only reads `overallJudgement`/`overallStatus`; `ScorecardContent` reads all six.

This is mounted once per non-trash fight (N parallel instances) purely to drive the dashboard's
list/strip. If the user then opens that same fight, `ScorecardContent` calls the same shared hook
again for that fight — story 006's event cache dedupes the underlying network requests, so this
doesn't double the WCL calls.

**Loading semantics:** worst-of is monotonic — it can only get worse (more accurate) as more of
the six summaries resolve for a fight, and the epic strip's cross-fight worst-of can only get worse
as more fights resolve. So both render progressively with no risk of a chip flipping from a
correct bad verdict back to a falsely-better one.

**Known cost, accepted as inherent to the feature:** rendering the full dashboard triggers event-
stream fetches for every non-trash fight × six epics, all at once. This is the whole point of
"aggregates every fight automatically" (702) and story 008/009 already provide graceful rate-limit
degradation; a dedicated request-batching/perf pass is explicitly deferred to story 010, which is
scoped for exactly this kind of sweep once more call sites exist.

## `ScorecardContent` extraction

Split the current `Scorecard` component into a presentational content component, matching
`docs/design_v3`'s `SingleFightDashboardContent` extraction pattern: same props as today's
`Scorecard` (fight, druidId, ability ID sets, etc.) plus `onExit: () => void` and `exitLabel:
string`, replacing the current hardcoded "← All fights" / "Load different WCL report" back-links.
Content and widget-grid/drill-down behavior (`activeEpic` state, the six per-epic detail views)
are unchanged. There is only one caller now — the dashboard's inline drill-down — so no second
"standalone" mounting path is needed.

## Retired: `FightPicker`, zone grouping

- `src/app/components/FightPicker/` is deleted outright (not repurposed) — multi-select, the
  "Show trash fights" toggle, and the zone-button row all disappear with it, per 003's already-
  trimmed acceptance criteria and the maintainer's decision that no second fight-list screen
  should exist.
- `groupFightsByZone`/`ZoneGroup` in `src/report/fightRows.ts` become dead code once `FightPicker`
  is gone (its only consumer) and are deleted in the same change. `buildFightRows` and
  `formatDuration` are kept — reused by the dashboard's per-boss list.
- The dashboard's heading uses `loadedReport.title` rather than reconstructing a zone name, so a
  report spanning multiple zones (per 702's explicit acceptance criterion — "aggregates all of
  them together, no per-zone split") gets a correct heading with no new logic required.

## `App.tsx` state simplification

Removed: `selectedFightIds`, `fightsConfirmed`, `scorecardRequested`, and the special-cased
sole-candidate auto-advance logic tied to those (the dashboard is simply shown once a druid is
resolved; no separate "confirm" gesture exists to auto-skip).

Kept/changed: `report`, `loadedReport`, `druidCandidates`, `selectedDruidId` — `DruidDetector` is
now invoked with every non-trash fight ID from `loadedReport` instead of `selectedFightIds`.

## Explicitly out of scope (this story)

- **Numeric aggregation** (duration-weighted-mean uptime, summed counts) beyond the worst-of
  judgement chips — confirmed with the maintainer: match `docs/design_v3`'s mock exactly (chips
  only), since real numeric aggregation would require plumbing raw per-fight metric values through
  a new aggregation layer (current per-fight code only exposes formatted judgement+stat strings) —
  a meaningfully bigger lift than what's actually designed. Can be revisited later (e.g. for a
  Markdown export, story 704) if ever needed.
- **URL-encoded dashboard state** (`openFightId` as a shareable param) — story 703's job, not this
  one. `openFightId` stays local component state for now, per design_v3's own note that this state
  "should likely be a URL param... recommend promoting to a URL param for 703."
- **Responsive/mobile layout** — story 706, deliberately deferred per its own backlog entry.
- **WCL request/loading-state performance audit** — story 010, deliberately late per its own
  backlog entry; this story accepts the "fetch everything up front" cost as inherent for now.

## Testing

Per `docs/testing.md`:

- **Tier 1**: any new pure logic (e.g. the shared six-summary-to-one-worst-of reduction, if it
  isn't already trivially covered by existing `worstJudgement` tests).
- **Tier 3**: `WholeReportDashboard` component tests — cheap immediate row rendering + clickability
  before chips resolve, progressive chip fill-in, inline drill-down open/close, epic strip
  worst-of behavior. Existing `Scorecard`/`FightPicker` tests get ported/adapted: `FightPicker`'s
  tests for row formatting (kill/wipe badges, duration, trash exclusion) move to
  `WholeReportDashboard`'s test file since that's now where the row-rendering logic lives.
- Update `App.test.tsx` for the simplified flow (no more confirm-fights step).
