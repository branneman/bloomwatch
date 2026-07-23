# Deep-link judgement anchors don't scroll into view — design

Source: `docs/inbox.md`, "Deep-link judgement anchors don't scroll into
view". Small, well-scoped bug fix; no backlog story number assigned per the
inbox's own rule for small fixes.

## Problem

Linking deep to a judgement (e.g. a per-metric "read the full rationale"
link into `#/judgements/<slug>`, story 710) doesn't scroll the page to the
linked section — it always lands at the top instead.

## Root cause

Two effects race on the same navigation and the wrong one wins:

- `useHashRoute.ts`'s route-change effect (`src/app/routing/useHashRoute.ts:59-61`)
  unconditionally calls `window.scrollTo(0, 0)` on every route change. This
  is intentional, general behavior: every screen change (including
  epic-to-epic drill-down and browser back/forward) should read from the
  top, per the comment already on that effect and its own test
  (`useHashRoute.test.ts:126`, "scrolls to the top on every route change").
- `JudgementRationale` (`src/app/components/JudgementRationale/index.tsx:13-16`)
  has its own effect that scrolls the linked section into view via
  `document.getElementById(slug)?.scrollIntoView()`.

Both fire on the same navigation to a judgements deep link. Empirically the
top-scroll wins, so the anchor scroll never has a visible effect.

The existing `JudgementRationale` unit test (`index.test.tsx`) never caught
this because it renders the component standalone, without `useHashRoute` in
the tree — the bug only exists in the composition of the two, wired
together in `App.tsx`.

## Fix

Teach `useHashRoute`'s top-scroll effect to skip itself when the route is a
judgements screen with a slug, since `JudgementRationale` already owns
scrolling to that anchor and does so correctly in isolation. No ordering
assumption is needed since only one party ever scrolls:

```ts
useEffect(() => {
  if (route.screen === "judgements" && route.slug) return;
  window.scrollTo(0, 0);
}, [route]);
```

Update the existing comment above the effect to note the exception and why
(content-owned anchor scroll takes over for that one route shape).

No changes to `JudgementRationale` itself — its `scrollIntoView` effect is
already correct; it just needs the competing top-scroll out of the way.

## Why not centralize scroll logic in `useHashRoute` instead?

Considered moving the anchor-scroll (element lookup + `scrollIntoView`)
into `useHashRoute` itself, gated on `route.screen === "judgements"`, and
deleting `JudgementRationale`'s own effect. Rejected: it would couple the
generic routing hook to one screen's DOM/id structure (the heading ids
`content.mdx` produces), for no benefit over the surgical fix. The chosen
fix keeps routing generic (it only ever decides _whether_ to reset scroll)
and keeps content-specific scroll behavior inside the content component
that owns it.

## Testing

- `useHashRoute.test.ts`: add a case asserting `window.scrollTo` is _not_
  called when navigating to a judgements route with a slug, alongside the
  existing "scrolls to top on every route change" test
  (`useHashRoute.test.ts:126`) — pins the exception without weakening the
  general rule.
- `App.test.tsx`: add a regression test in the existing "About and
  Judgements routes" describe block (`App.test.tsx:496`) that pushes
  `#/judgements/<slug>` directly, mounts `<App />`, spies on both
  `window.scrollTo` and `Element.prototype.scrollIntoView`, and asserts the
  anchor element received the scroll while the top-scroll did not fire.
  This is the test that actually exercises the real bug, since it renders
  `App` (which wires `useHashRoute` and `JudgementRationale` together)
  rather than either piece in isolation like the existing unit tests do.

## Out of scope

The other two `docs/inbox.md` items (Prep Hygiene layout inconsistency,
Swiftmend "on cooldown" copy for talent-ineligible builds) are untouched by
this pass.
