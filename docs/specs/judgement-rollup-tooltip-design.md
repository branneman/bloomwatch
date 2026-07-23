# Judgement rollup breakdown tooltip — design

## Problem

The whole-report dashboard's epic chip strip (`ReportDashboard`) shows a duration-weighted
verdict per epic (e.g. "Lifebloom discipline: Fair") alongside a fight-count breakdown line
like "2 fair · 10 bad" (story 904's `judgementBreakdown`). The breakdown tells a user _how
many_ fights landed in each bucket, but not _which_ fights — on a report with many bosses,
finding the specific fight(s) behind a "2 fair" means scanning every row below by eye.

## Scope

Only the epic chip strip at the top of `ReportDashboard`
(`src/app/components/ReportDashboard/index.tsx:316-342`) — the 7 chips (GCD economy,
Lifebloom discipline, Spell discipline, Mana economy, Death forensics, Crisis response, Prep
hygiene). The per-fight rows below already show a single resolved judgement each; there's
nothing to break down there. No other judgement-breakdown display exists elsewhere in the app
today.

## Behavior

Each present bucket in a chip's breakdown line ("2 fair", "10 bad", etc.) becomes its own
interactive target, **but only when the chip's breakdown has 2 or more distinct non-zero
judgement buckets**. A breakdown with only one bucket present (e.g. "12 good") stays exactly
as it renders today: plain, non-interactive text. This mirrors the existing
`formatJudgementBreakdown` output one-for-one — no visual change to the single-bucket case.

For a multi-bucket segment:

- **Desktop (mouse):** hovering opens a small popover; moving the mouse away closes it.
- **Keyboard:** focusing the segment (Tab) opens the popover; blurring or pressing Escape
  closes it. This is required for accessibility, not just a nicety — hover-triggered content
  must also be reachable without a mouse (WCAG 2.1.1).
- **Touch (tap, no hover capability):** tapping opens the popover; tapping anywhere outside
  it, or tapping a link inside it, closes it.
- All three trigger types are handled by one component (see below) rather than
  branching on device/input type — mouse, keyboard, and touch events simply compose.

The popover lists every fight in that bucket, one per line, formatted identically to the
existing per-fight row label (`Pull N · Boss Name`, or just `Boss Name` when there's only one
pull of that encounter in the report — see `FightRow`'s existing label logic,
`ReportDashboard/index.tsx:172-173`). Each line is a clickable link. Clicking it navigates
straight to that fight's single-fight scorecard with the relevant epic already focused (e.g.
clicking a boss under "Lifebloom discipline"'s "2 fair" opens that fight scorecard with the
Lifebloom discipline card active) — closing the popover as a side effect of navigating away
from the dashboard screen entirely.

### Visual treatment

Interactive segments get a subtle underline (`text-decoration: underline`) as their only
affordance — **no color change** from the chip breakdown's existing `var(--text)` color. This
is a deliberate departure from the app's existing inline-link convention (`.aboutLink`'s
`var(--accent)` color), specifically requested to keep the chip strip visually quiet since
several such segments can appear close together in a compact space.

## Components

### `src/app/components/ui/Popover` (new, generic, reusable)

A small self-contained primitive, following the same hand-rolled pattern as the existing
`Alert`/`Disclosure` components — no new dependency; the project has no positioning/tooltip
library today (`package.json` deps are just `react`/`react-dom`).

- Props: a trigger (render prop or children) and content to show when open.
- Manages its own open/closed state internally. Each usage is a fully independent instance —
  multiple `Popover`s on the same page never need to coordinate with each other, since only
  one can realistically be hovered/focused/tapped at a time, and each closes itself on its own
  outside-interaction/blur/Escape.
- Open on: `mouseenter`, `focus`, or `click`/`tap` on the trigger.
- Close on: `mouseleave`, `blur`, `Escape`, or a click/tap outside the popover's own DOM
  subtree.
- Positioning: renders below the trigger by default; on open, measures available viewport
  space via `getBoundingClientRect` and flips to render above the trigger if there isn't
  enough room below. No external positioning library.
- Accessible wiring: trigger is a real `<button>` (not a styled `<span>`) for native keyboard
  operability; `aria-expanded` reflects open state; popover content is associated via
  `aria-describedby` (or an internal live region approach if a review during implementation
  finds `aria-describedby` too limited for a list of links — a plan-time decision, not a
  spec-time one, but the association must be there).

### `ReportDashboard` changes

- `formatJudgementBreakdown` (currently a single string-builder,
  `ReportDashboard/index.tsx:81-89`) is replaced by per-bucket rendering: each present bucket
  becomes either plain text (single-bucket case) or a `Popover`-wrapped interactive segment
  (multi-bucket case), joined by the same " · " separator visually.
- `onRoleEntries` (`ReportDashboard/index.tsx:291-301`) currently drops each row's
  `pullNumber` when it maps `rows` down to `{fight, summaries}`. It needs to carry
  `pullNumber` through so popover link labels can match `FightRow`'s label format exactly.
- A new prop, `onOpenFightEpic: (fightId: number, epicId: EpicId) => void`, threaded down
  from `App.tsx` (see below), is what each popover link calls on click.

### `src/metrics/reportAggregation.ts` changes

`rollupEpicJudgement` currently returns `{ judgement, breakdown: Record<Judgement, number> }`
with no fight identity attached to the counts. It gains a fight-identity companion so the
popover has something to list — either as an extended return shape or a sibling function,
decided at plan time — conceptually:

```ts
Record<Judgement, { fightId: number; label: string }[]>;
```

sourced from the same `ready` entries `judgementBreakdown` already filters to (loading/errored
fights are excluded from counts today and should stay excluded from the popover lists too, for
consistency).

### `App.tsx` navigation change

`onSelectEpic`'s existing handler (`handleSelectEpic`, `App.tsx:287-...`) reads the _current_
route to find `fightId` — it can't be combined with `onOpenFight` in one click handler to jump
straight to a specific fight+epic, because React state hasn't updated between the two calls
yet within the same tick. A new handler, `handleOpenFightEpic(fightId, epicId)`, navigates
directly to `{screen: "fightEpic", reportCode, host, druidName, fightId, epicId}` in one shot
— mirroring the existing route shape already used elsewhere in `App.tsx` (e.g. line ~301) —
and is passed to `ReportDashboard` as the new `onOpenFightEpic` prop.

## Non-goals

- No change to any other judgement-breakdown-shaped display (none currently exists outside
  this one chip strip).
- No change to the single-bucket ("12 good") rendering — it stays plain text, unchanged.
- No new dependency (positioning library, UI kit) — hand-rolled, matching existing
  conventions.
- No change to `weightedMedianJudgement`/`judgementBreakdown`'s existing counting logic or
  thresholds — this is purely a UI feature surfacing data that's already computed.

## Testing

- **Tier 1 (unit):** the new fight-identity-aware rollup data function in
  `reportAggregation.ts` — pure logic, co-located test, factory-built fight/summary fixtures
  per `docs/testing.md`.
- **Tier 3 (component):** `Popover` itself (open/close via hover, keyboard focus, click, click
  outside the subtree, Escape; viewport-flip behavior can be tested via a mocked
  `getBoundingClientRect`), and `ReportDashboard`'s chip strip (single-bucket breakdown stays
  plain text; multi-bucket breakdown renders interactive segments whose popovers list the
  right fights and call `onOpenFightEpic` with the right `fightId`/`epicId` on link click).
