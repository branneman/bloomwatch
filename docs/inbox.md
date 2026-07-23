# Inbox — unrefined reports

Raw bug reports and story ideas, captured as-is so they aren't lost. Not
numbered, not yet acceptance-criteria'd, not part of `docs/backlog.md`'s
epic structure. When one is ready to become real work, give it a story
number/epic in `docs/backlog.md` (or just fix it directly if it's a small
bug) and delete its entry here.

---

## Deep-link judgement anchors don't scroll into view

Linking deep to a judgement (e.g. a per-metric "read the full rationale"
link into `#/judgements`, story 710) doesn't actually scroll the page —
always lands at the top instead of at the linked section.

Likely area: `useHashRoute.ts` / `JudgementRationale` — this is a
hash-routed SPA, not native browser anchors, so a hash change probably
isn't triggering a `scrollIntoView` the way a plain `<a href="#foo">`
would on a static page.

## Pull-time consumables check layout is inconsistent

`PrepHygieneCard`/`PrepHygieneContent` (story 601, now also carrying 602's
enchant/gem rows) mixes checkboxes and chips as its "green" affordance
inconsistently — needs a layout pass so the row types read as one
coherent design instead of two different visual languages.
