# Judgement Rationale page — design

## Purpose & scope

A new content page, **Judgement Rationale** (`#/judgements`), explains to three
audiences — a beginner TBC resto druid, an advanced resto druid, and a raid
lead judging their druids' play — how Bloomwatch collects data from Warcraft
Logs and turns it into Good/Fair/Bad verdicts. It starts with high-level
philosophy, moves through exactly how judgements combine, then the exact
per-epic thresholds, then a conceptual explanation of how the underlying data
is sourced via WCL's GraphQL API.

Companion change: the existing Onboarding/**About** screen gets a real route
(`#/about`) instead of local overlay state, and links to the new page. Both
pages are pure content — no WCL data, no auth required to view them.

This is shipped as one story, full scope: MDX tooling, both routes, section
deep-links, exported threshold constants, and all 7 epics' content land
together.

## Routing changes

`src/app/routing/hashRoute.ts`'s `Route` union gains two variants, both
independent of report/druid/fight state and reachable regardless of auth
(same tier as Onboarding today):

```ts
| { screen: "about" }
| { screen: "judgements"; slug?: string }
```

Serialized as `#/about` and `#/judgements` / `#/judgements/<slug>`.

`App.tsx`'s Onboarding handling changes:

- Onboarding stops being gated by `onboardingDismissed` local state
  (`localStorage`-backed overlay shown regardless of the URL underneath).
  Instead it's the component rendered at the `"about"` route, consistent with
  every other screen in the app.
- The `bloomwatch_onboarding_seen` `localStorage` flag is repurposed to
  control only a **redirect**: on first load, if the flag isn't set and the
  resolved route isn't already `"about"`, navigate to `#/about` (setting the
  flag). "Continue" on that screen navigates onward — to `#/` or wherever the
  route would otherwise have resolved, mirroring today's dismiss behavior.
- A returning visitor's direct navigation to `#/about` (footer link, shared
  link, browser back/forward) behaves like any other screen — no
  special-casing, no re-redirect.

`#/judgements/<slug>` scrolls to and highlights the matching section on
mount/route-change via `element.scrollIntoView` — no new library.

## Rendering pipeline (MDX)

- Add `@mdx-js/rollup` and `@mdx-js/react` as build-time dependencies; wire
  `mdx()` into `vite.config.ts`'s `plugins` array alongside `react()`. A
  `*.mdx` module ambient type declaration is added so TypeScript recognizes
  the import.
- New directory `src/app/components/JudgementRationale/`:
  - `content.mdx` — the actual prose, tables, and headings (the "large
    document").
  - `index.tsx` — thin wrapper: imports the compiled MDX component, supplies
    custom component-mapping (tables, below) and the deep-link scroll
    behavior, wraps it in the app's standard `<Shell>`/heading chrome.
- Markdown tables in `content.mdx` are rendered through a small wrapper
  component that reuses `DataTable`'s existing CSS module classes
  (`.tableWrap`/`.table`/`.headerCell`/`.cell`) so wide tables get the same
  `overflow-x: auto` scroll behavior as every other epic card in the app.
  `DataTable` itself takes `columns`/`rows` props rather than children, so
  this is a sibling wrapper applying the same classes to MDX's native
  `table`/`thead`/`tr`/`th`/`td` elements — not a literal `DataTable`
  instantiation.
- The GraphQL section's one real query example lives inside a
  `<Disclosure summary="See a real example query">` (reusing the existing
  `Disclosure` component, the same pattern `OwnClientIdField` already uses),
  followed by a "Read more on GitHub →" link to the repository's README.
- `Onboarding`'s content gains a line/link near the bottom pointing to
  `#/judgements`, for readers who want the full depth.

## Threshold sourcing (live constants, no drift)

Roughly a dozen threshold constants across `src/metrics/*.ts` aren't
currently exported (confirmed via grep): `gcdUtilization.ts`'s
`GOOD_MIN_PCT`/`FAIR_MIN_PCT`, `idleGaps.ts`'s `GOOD_MAX_PCT`/`FAIR_MAX_PCT`,
`lb3Uptime.ts`'s `GOOD_MIN_PCT`/`FAIR_MIN_PCT`, `refreshCadence.ts`'s
`GOOD_MIN_MS`/`GOOD_MAX_MS`/`FAIR_MIN_MS`, `accidentalBlooms.ts`'s
`GOOD_MAX_COUNT`/`FAIR_MAX_COUNT`, `consumableThroughput.ts`'s
`POTION_FLOOR_INTERVAL_MS`/`RUNE_FLOOR_INTERVAL_MS`/`MANA_DROP_THRESHOLD_PCT`,
`concurrentLb3Targets.ts`'s duplicate `MAINTAINED_MIN_UPTIME_PCT`,
`manaCurve.ts`'s `MIN_JUDGED_FIGHT_DURATION_MS`, and others in the same
family. Exporting them is mechanical, no behavior change.

`content.mdx` imports these directly (aliased per-file to avoid name
collisions across modules, e.g.
`import { GOOD_MIN_PCT as GCD_GOOD_MIN, FAIR_MIN_PCT as GCD_FAIR_MIN } from "../../../metrics/gcdUtilization"`)
and interpolates them in prose as `{GCD_GOOD_MIN}%`. A future recalibration
story that changes a constant updates this page for free — no separate
doc-sync step, unlike `docs/thresholds.md`'s existing manual-sync convention.

A few thresholds aren't single constants — `manaCurve.ts`'s `judgeManaBand`
band edges, `restackTax.ts`'s `judgeRestackTax` duration-scaled formula, and
`judgement.ts`'s `weightedMedianJudgement`/`mixedJudgement` combining logic —
these are described in prose referencing the function/file rather than
interpolated numbers, since there's no single constant to import.

`docs/thresholds.md` stays as-is: the permanent dev-facing calibration
reference indexed to code comments, per principle 3. The new page is a
separate, user-facing document that cites the same live constants — not a
replacement for it.

## Content outline

One linear, general-to-specific document with a table of contents up top
(in-page anchor links to each section's slug):

1. **Why process, not output** — the zero-sum healing argument, expanded past
   Onboarding's version since this reader has already bought into the premise
   and wants the full reasoning.
2. **How judgements combine** — per-metric Good/Fair/Bad → `mixedJudgement`
   (a good+bad sibling mix reads fair, not a flat bad) → per-fight epic
   verdict → `weightedMedianJudgement` (duration-weighted across a whole
   report; a good+bad mix reads fair there too) → Swiftmend's card-scoped
   combine as a named, deliberately different exception. Also covers
   talent-gating (903c): a metric whose prerequisite talent is unreachable
   for the detected build is hidden, not judged bad.
3. **Per-metric-group sections** (7, one per row-group in
   `docs/thresholds.md`): GCD economy, Lifebloom discipline, Spell
   discipline, Mana economy, Death forensics, Crisis response, Prep hygiene.
   Each has a threshold table (good/fair/bad bands, live-interpolated from
   code) plus 1–2 sentences of _why_ that threshold sits where it does,
   drawn from the calibration rationale already written in
   `docs/thresholds.md`'s calibration-review notes.
4. **Where the data comes from** — conceptual WCL/GraphQL pipeline
   explanation (report → fights → combatant info → casts/buffs/resource
   events → computed client-side in the browser, nothing stored, nothing
   sent to a Bloomwatch server since there isn't one), the one collapsed
   real-query example, and the "Read more on GitHub" link.

Each section's headings carry the stable slugs used for
`#/judgements/<slug>` deep-links (e.g. `rejuv-clip-share`).

**No internal project jargon in the page's own text.** "Epic," "story," and
story numbers (e.g. "epic B," "story 908") are this repo's internal backlog
vocabulary — useful in `docs/thresholds.md` and this design doc, meaningless
to a reader of the actual page. `content.mdx`'s prose refers to metric
groups by their plain names only (e.g. "GCD economy," "Lifebloom
discipline") and never cites a story number as a source; where
`docs/thresholds.md`'s calibration rationale is adapted into page prose, it's
rewritten to drop that framing, not copied verbatim.

## Entry points & deep-linking

- **Footer** (`src/app/components/ui/Footer`): a second persistent link next
  to "About" — e.g. "How judgements work" — navigates to `#/judgements`.
- **About page** (`Onboarding`): a line/link near the bottom pointing to
  `#/judgements`.
- **`MetricCard`** (`src/app/components/ui/MetricCard`): gains an optional
  `rationaleSlug?: string` prop. When present, its existing `Disclosure`
  ("Why this threshold?") appends a "Read the full rationale →" link to
  `#/judgements/<rationaleSlug>` after the threshold text — a single
  shared-component change, matching the precedent set by `JudgementChip`'s
  label sweep. Populating `rationaleSlug` on each of the ~25 individual
  metric call sites across the app is mechanical, in-scope work.

## Testing & bookkeeping

- Component test for the new page: renders, table of contents links present,
  deep-link scroll behavior.
- Route-parsing tests for `hashRoute.ts`'s two new variants
  (`parseHash`/`serializeRoute` round-trips).
- `Onboarding`/`App` test updates for the redirect-on-first-visit behavior
  change (root → `#/about` for a first-time visitor; no redirect on a direct
  `#/about` visit thereafter).
- New backlog story under **Epic H — Reporting & UX** (`docs/backlog.md`) —
  exact story number picked at write-up time. `CLAUDE.md`'s repo-state
  paragraph gains an entry once shipped. `docs/thresholds.md` gains a
  one-line pointer to the new page's existence.
