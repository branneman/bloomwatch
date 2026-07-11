# Design: Bloomwatch design system + screen retrofit

## Source

`docs/design/` — a handoff bundle (`README.md`, `screens/design-reference.html`,
`source/shared.jsx`, `source/screens.jsx`, `assets/`) containing high-fidelity
mockups for the Phase 1 MVP flow: Connect → Load a report → Pick fights &
druid → Scorecard. This spec covers turning that reference into real, typed
React components in `src/`, per the handoff's own instructions.

## Goal

1. Build a small reusable component library (the "design system") implementing
   the visual language in the mockups, backed by CSS tokens in `src/index.css`.
2. Retrofit the app's existing screens/components to use it, converting the
   flow from "every completed step stays visible, next step appends below" to
   single-screen-at-a-time (matching the mockups' linear framing).
3. Assemble the story-701 Scorecard screen now, using real cards for metrics
   that exist today (101, 102, 201) and static placeholder cards for metrics
   that don't yet (202–205), so the full visual shell is complete ahead of
   those stories' logic landing.
4. Swap the app's favicon/logo for the Lifebloom spell icon.

## A — Tokens & assets

Add to `src/index.css` (additive only — no existing token values change):

- Spacing: `--space-1` (4px) … `--space-7` (64px), per the 4px base scale:
  4/8/12/16/24/32/48/64
- Radii: `--radius-sm: 4px`, `--radius-md: 6px`, `--radius-pill: 999px`
- `--text-small-size: 14px`
- Judgement colors (light + dark, following the existing `prefers-color-scheme`
  pattern used for `--accent`):
  - `--judgement-green: #1a9c4a` / `--judgement-green-bg: rgba(26,156,74,.12)`
  - `--judgement-orange: #d97a1f` / `--judgement-orange-bg: rgba(217,122,31,.12)`
  - `--judgement-red: #d1372f` / `--judgement-red-bg: rgba(209,55,47,.12)`
- `--gray-400` (trash `Badge` tone) and `--purple-600` (primary `Button` hover)

Threshold rationale for any R/O/G judgement continues to live in
`docs/backlog.md` per product principle 3 — these are presentation-layer
tokens only, not new thresholds.

**Favicon/logo:** generate a multi-size `public/favicon.ico` (16/32/48px) from
`docs/design/assets/logo/lifebloom.jpg` using `gm convert` (GraphicsMagick),
referenced from `index.html` as
`<link rel="shortcut icon" href="/bloomwatch/favicon.ico">` (matching
`vite.config.ts`'s `base: "/bloomwatch/"`). Delete the now-unused
`public/favicon.svg`. Reuse `docs/design/assets/logo/lifebloom.jpg` directly
(copied to e.g. `src/assets/lifebloom.jpg`) as the 40×40 logo mark on the
Connect screen, replacing the mockup's never-built `bloomwatch-mark.svg`.

## B — Component library

New `src/app/components/ui/`, one folder per component
(`index.tsx` + `index.test.tsx`), matching this repo's existing component
convention:

| Component       | Notes                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Button`        | `variant?: "primary" \| "secondary" \| "ghost"`, `size?: "md" \| "sm"`                                            |
| `Input`         | thin styled wrapper over `<input>`                                                                                |
| `Checkbox`      | native checkbox + label                                                                                           |
| `Field`         | label + control wrapper                                                                                           |
| `Badge`         | `tone: "kill" \| "wipe" \| "trash"` — fight-outcome tones, kept visually distinct from judgement colors           |
| `JudgementChip` | `judgement: Judgement` (reuses `metrics/judgement.ts`'s type)                                                     |
| `ProgressBar`   | `pct: number`, `judgement: Judgement \| "neutral"`, animated fill                                                 |
| `Alert`         | `tone: "warning"`                                                                                                 |
| `Card`          | bordered/radius wrapper, no shadow                                                                                |
| `Disclosure`    | `<details>/<summary>`-based, collapsed by default, rotating chevron                                               |
| `SpellIcon`     | 28×28 default image wrapper                                                                                       |
| `Histogram`     | bucketed bar chart (refresh-cadence card)                                                                         |
| `StackedBar`    | segmented horizontal bar + legend (concurrent-targets card)                                                       |
| `MetricCard`    | icon + title + (`JudgementChip` \| italic note) + stat value + optional `ProgressBar` + body + `Disclosure`       |
| `Shell`         | bordered column container (`width: 760` default / `800` variant), replaces `#root`'s current border/width styling |

## C — App flow & screen retrofit

`App.tsx` moves to single-screen-at-a-time, each wrapped in `Shell`:

1. **Connect** (`!accessToken`) — logo + `<h1>Bloomwatch</h1>`, tagline, Client
   ID `Field`/`Input`, `Button` "Connect". Copy diverges from the mockup:
   since story 008 (shared default client ID) isn't built, the field stays
   required and the "optional — shared default" language is dropped until
   008 ships.
2. **Load a report** (`accessToken && !loadedReport`) — `ReportInput`
   restyled with `Field`/`Input`/`Button`; parse errors shown via `Alert`.
   `ConnectPanel`/`AbilityResolver` keep fetching invisibly, their loading/
   error text shown inline.
3. **Pick fights & druid** (`loadedReport` && not yet submitted for
   scorecard) — `FightPicker` restyled to bordered rows with
   `Badge`/`Checkbox`, "Select all in zone" as secondary `Button`;
   `DruidPicker` restyled to chip-row layout; `DruidDetector` stays
   invisible. A new explicit "Get scorecard" `Button` commits the
   selection (today the scorecard renders implicitly once state lines up —
   this adds a deliberate submit step matching the mockup).
4. **Scorecard** — see section D. Secondary "Start over" `Button` resets
   report/fight/druid selection state and returns to screen 2 (Load a
   report) — it does not clear the access token/session, so the user isn't
   forced to re-run OAuth to try another report. This diverges from the
   mockup's literal "returns to Connect" phrasing in favor of lower friction;
   `useWclAuth` gains no new disconnect capability.

This work is cross-cutting infra, not a single backlog story: it restyles
already-shipped stories (002–005, 101, 102, 201) and lays out 701's shell
without changing any of their acceptance-criteria behavior. No backlog
entries get marked Done by this pass. Commits are scoped by component
(`feat(ui): ...`, `refactor(app): ...`) rather than by story number.

## D — Scorecard assembly

New `src/app/components/Scorecard/index.tsx`:

- **Header**: fight name/outcome/duration `<h2>`, druid name/spec paragraph,
  report code + "View on Warcraft Logs →" link.
- **"GCD economy"** group: `GCDUtilizationCard`, `IdleGapsCard` — both
  rewritten to render through `MetricCard` (title becomes the metric name,
  not the fight name, since the Scorecard header owns that now). Fetch/
  compute logic unchanged.
- **"Lifebloom discipline"** group: `LB3UptimeCard` (same restyle, per-target
  judgement rows) plus four new **static, presentational-only** cards —
  `RefreshCadenceCard`, `AccidentalBloomsCard`, `RestackTaxCard`,
  `ConcurrentTargetsCard` — taking no data props, rendering the exact mock
  fixture content from `docs/design/source/screens.jsx` verbatim. These are
  replaced with real computation when stories 202–205 land.
- **Footer**: "can't judge target selection…" `Alert` + secondary
  "Start over" `Button`.

Since the picker still allows multiple fights checked (for future story
702), `App.tsx` keeps looping `selectedFightIds`, rendering one full
`Scorecard` (each its own 800px `Shell`) per selected fight, stacked — no new
"which fight" narrowing UI invented.

## E — Testing

Colocated unit tests for every new `ui/` primitive (render + interactive
behavior: `Disclosure` toggle, `ProgressBar` width from `pct`, `Checkbox`/
`Button` event wiring) per `docs/testing.md`. Updated tests for every
retrofitted component (`FightPicker`, `DruidPicker`, `ConnectPanel`,
`ReportInput`, `GCDUtilizationCard`, `IdleGapsCard`, `LB3UptimeCard`)
verifying new output structure. Extend existing App-level/integration
coverage for the single-screen-at-a-time transitions rather than duplicating.

## Out of scope

- Story 008 (shared default client ID + rate-limit fallback)
- Real computation for stories 202–205 (placeholder cards only)
- Stories 702, 703, 704, 802, 803
- Storybook or a design-system documentation site
