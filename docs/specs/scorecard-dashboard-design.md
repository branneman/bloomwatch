# Design: Story 701 — Dashboard-of-widgets scorecard

Implements backlog story 701 (Epic H — Reporting & UX): the single-fight scorecard becomes a
dashboard of small summary widgets, one per epic, all visible without scrolling, with
click-to-drill-down into full epic detail and a way back to the overview.

Scope note: `docs/design_v2/` also includes design references for epics D-G (stories 301-304,
401-404, 501, 601) — those are **not** implemented yet (per `CLAUDE.md`'s repo state, only
GCD economy and Lifebloom discipline exist today) and are out of scope for this story. Their
widgets are built now only as permanently-disabled placeholders (see below); their drill-down
content does not exist yet and will be added when those stories ship.

## Current state (before this change)

`src/app/components/Scorecard/index.tsx` renders one continuous page: a fight header, then a
flat "GCD economy" group (`GCDUtilizationCard`, `IdleGapsCard`) and a flat "Lifebloom
discipline" group (`LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`,
`RestackTaxCard`, `ConcurrentTargetsCard`) — no epic-level summary, no drill-down. This was
scaffolding built while those metric cards shipped one story at a time; it predates the
dashboard shape story 701 was reworked into (see git history: "docs: rework story 701 into a
dashboard-of-widgets design").

Per user decision during brainstorming: this flat layout is fully replaced, not kept as an
alternate view — the dashboard becomes the only way to view a single fight's scorecard.

## Component architecture

`Scorecard` becomes the dashboard: the existing header (fight name/outcome/duration, druid
line, report link) stays as-is at the top, unchanged. Below it, local state
`activeEpic: EpicId | null` selects between two renders:

- `activeEpic === null` — a responsive grid of 6 `Widget`s (gcd, lifebloom, spell, mana,
  death, prep, in that order).
- `activeEpic !== null` — a "← All epics" back-link button, then an epic header (icon, `<h2>`,
  and `JudgementChip`), then that epic's `*Content` component.

### New files

- `src/app/components/ui/Widget/index.tsx` (+ `.module.css`, `.test.tsx`) — presentational
  shell, no data fetching. Props: `icon: string`, `label: string`, `onOpen?: () => void`,
  `judgement?: Judgement`, `stats?: string[]`, `note?: string`. `onOpen`'s presence is what
  makes a widget interactive — its absence is the disabled-epic case (spell/mana/death/prep
  never pass it). When interactive: renders a real `<button type="button">` (styled per the
  existing `Disclosure` summary-button pattern) with hover border/background wash
  (`--accent-border` / `--accent-bg`) and a "View details →" affordance; shows `judgement` +
  `stats` when both are present, else falls back to `note` (covers the loading/"Calculating…"
  and error states — still clickable either way). When disabled: plain, non-focusable `<div>`,
  dimmed, no hover state, always shows `note` (the caller passes "Not yet available").
- `src/app/components/GcdEconomyContent/index.tsx` (+ `.test.tsx`) — wraps
  `GCDUtilizationCard` and `IdleGapsCard`, extracted verbatim from Scorecard's current "GCD
  economy" group (same props, same layout, no logic changes).
- `src/app/components/LifebloomDisciplineContent/index.tsx` (+ `.test.tsx`) — wraps the
  existing 5 Lifebloom cards, extracted verbatim from Scorecard's current "Lifebloom
  discipline" group.
- `src/metrics/epicSummary.ts` (+ `.test.ts`, Tier 1 — pure, no I/O):
  - `worstJudgement(judgements: (Judgement | null)[]): Judgement` — ranks red > orange > green,
    ignores `null` entries. Both call sites always pass at least one non-null judgement.
  - `summarizeGcdEconomy(gcd: GcdUtilizationResult, idleGaps: IdleGapsResult): { judgement: Judgement; stats: string[] }`
  - `summarizeLifebloomDiscipline(lb3: Lb3UptimeResult, refresh: RefreshCadenceResult, blooms: AccidentalBloomsResult, restack: RestackTaxResult): { judgement: Judgement; stats: string[] }`
- `src/app/components/Scorecard/useGcdEconomySummary.ts` and
  `useLifebloomDisciplineSummary.ts` (+ `.test.ts` each) — thin hooks. Each fetches the same
  event types its epic's existing cards already fetch (cache-backed via `eventCache.ts`, keyed
  by `reportCode:fightId:dataType`, so this adds no extra network calls — only a second,
  cheap, pure-function invocation over already-fetched events), calls the existing `compute*`
  functions, then the corresponding `summarize*` function. Returns a tagged union:
  `{ status: "loading" }`, `{ status: "error"; error: string }`, or
  `{ status: "ready"; judgement: Judgement; stats: string[] }`. Uses the same
  `accessToken`-tagged-result pattern the existing cards use to discard stale results when
  props change.

### Changed files

- `src/app/components/Scorecard/index.tsx` — rewritten as described above. Calls both summary
  hooks unconditionally (rules of hooks); the 4 disabled epics are a small hardcoded array
  (id, label, hotlinked icon URL) with no hook calls. While a summary hook is still loading,
  its widget shows icon + label + a muted "Calculating…" in place of chip/stats (matches the
  existing cards' own loading text, not a spinner/skeleton). If a summary hook returns
  `status: "error"`, its widget shows icon + label + the error text with `role="alert"` in
  place of chip/stats — but stays clickable (`onOpen` still wired up), since the drill-down's
  individual cards fetch independently and may still succeed (the event cache evicts a failed
  fetch's promise on rejection, so entering the detail view retries rather than reusing the
  failure) — a dead end here would strand the user with no way to inspect further.
- `src/app/components/Scorecard/index.module.css` — grid layout, widget-loading style, back
  link and epic-header rows, ~180ms fade/slide-up transition on switching views (a CSS
  keyframe plus a class toggle, no JS animation library — matches the design system's
  understated-motion rule already used elsewhere, e.g. `ProgressBar`'s fill transition).
- `src/app/components/GCDUtilizationCard/index.tsx` and `IdleGapsCard/index.tsx` — swap the
  shared local `instantcastIcon` import for real hotlinked icons:
  `https://wow.zamimg.com/images/wow/icons/large/ability_rogue_sprint.jpg` (GCD utilization)
  and `.../spell_nature_timestop.jpg` (idle gaps), per `docs/design_v2/README.md`'s icon
  assignments.
- `src/assets/spell-icons/instantcast.jpg` — deleted (no longer referenced anywhere after the
  above change).
- The 5 Lifebloom cards are unchanged — they already use the local `lifebloom.jpg`, which
  matches `design_v2` (the one icon still served locally, reused across every Lifebloom card
  and the dashboard's Lifebloom widget).
- `src/App.tsx` — no prop-shape changes to `Scorecard`; verify the 800px `Shell` width still
  reads comfortably with the new grid (adjust only if needed once viewed in a browser).

## Judgement aggregation & stat formatting

**`summarizeGcdEconomy`:**

- `judgement = worstJudgement([gcd.judgement, idleGaps.judgement])`
- `stats = ["GCD utilization: {round(gcd.utilizationPct)}%", "Idle gaps: {idleGaps.deadTimePct.toFixed(1)}% dead time"]`

**`summarizeLifebloomDiscipline`:**

- Judgement inputs: every `lb3.targets[].judgement`, `refresh.judgement` (nullable — omitted
  from the worst-of if there were no refreshes to judge), `blooms.judgement`,
  `restack.judgement`. `concurrentLb3Targets` is excluded — it's informational only (no
  judgement field), per story 205.
- Stat 1 (LB3 uptime): `lb3.targets` empty → `"LB3 uptime: no maintained targets"`; one target →
  `"LB3 uptime: {pct}%"`; multiple → `"LB3 uptime: {min}–{max}%"` (matches the design mock's
  `"LB3 uptime: 79–91%"`).
- Stat 2 (refresh cadence): `refresh.medianMs === null` → `"Refresh cadence: no refreshes"`;
  else `"Refresh cadence: {(medianMs/1000).toFixed(1)}s median"`.
- Accidental blooms and re-stack tax feed the worst-of judgement but aren't in the two headline
  stat lines, matching the design mock's choice of the two most representative numbers.

## Visual/interaction details

- **Grid:** `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, chosen over a
  hardcoded `repeat(3, 1fr)` so the layout doesn't need a manual tweak as D-G ship later and
  their widgets flip from disabled to interactive — it happens to render as 3×2 today at 800px,
  matching the design mock's fixed-3-column look without hardcoding the count.
- **Disabled widgets:** icon + label + dimmed "Not yet available" note, no chip, no stats, not
  focusable/clickable, no hover state. Icons per `docs/design_v2/README.md`: spell discipline
  `spell_nature_ravenform`, mana economy `inv_potion_137`, death forensics
  `spell_shadow_deathscream`, prep hygiene `inv_misc_coin_02` (all hotlinked from
  `wow.zamimg.com`, same CDN already used for the two new GCD-economy icons).
- **Drill-down header:** does not repeat the fight/druid/report info already shown in
  Scorecard's persistent top header (the design mock repeats it; we don't, since ours is
  already visible above in every state) — just "← All epics" + epic icon + `<h2>` + chip, then
  the epic's `*Content`.
- **Footer** (disclaimer `Alert` + "Start over" button): unchanged, stays visible in both the
  dashboard and drill-down states.

## Testing plan

- **Tier 1** — `src/metrics/epicSummary.test.ts`: `worstJudgement`, `summarizeGcdEconomy`,
  `summarizeLifebloomDiscipline`, hand-built result fixtures.
- **Tier 3** (RTL, co-located) —
  - `Widget/index.test.tsx`: interactive renders chip/stats and fires `onOpen` on click;
    disabled renders the note, has no button role, and ignores clicks.
  - `GcdEconomyContent/index.test.tsx`, `LifebloomDisciplineContent/index.test.tsx`: smoke
    tests confirming the wrapped cards render.
  - `useGcdEconomySummary.test.ts`, `useLifebloomDisciplineSummary.test.ts`: via
    `@testing-library/react`'s `renderHook`, mocked `fetchEvents`, asserting the
    loading → ready transition and correct judgement/stats.
  - `Scorecard/index.test.tsx` (rewritten): all 6 widgets render on the initial view (2
    interactive, 4 disabled); clicking the GCD widget shows `GcdEconomyContent` + back link +
    judgement chip; clicking "← All epics" returns to the grid; disabled widgets are not
    clickable.
- No Tier 0/2/4/5 changes anticipated. Story 001's existing E2E golden path already asserts a
  rendered scorecard — verify its selectors still match the new DOM shape once implemented.

## Out of scope

- Epics D-G (stories 301-304, 401-404, 501, 601) — their widgets exist now only as disabled
  placeholders; drill-down content ships with those stories.
- URL-encoded `activeEpic` state — stays component-local `useState`; promoting it to a URL
  param is story 703's shareable-state goal, not this one.
- Zone-wide aggregation (story 702) and Markdown export (story 704).
