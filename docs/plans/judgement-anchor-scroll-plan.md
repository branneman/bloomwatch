# Deep-link judgement anchor scroll fix implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deep links into `#/judgements/<slug>` actually scroll the linked section into view, instead of always landing at the top of the page.

**Architecture:** `useHashRoute`'s route-change effect currently force-scrolls to the top on every navigation, which clobbers `JudgementRationale`'s own `scrollIntoView` effect for the one route shape that needs different behavior. Add a one-line exception to `useHashRoute`'s effect so it skips the top-scroll when the route is `{screen: "judgements", slug: <something>}`, leaving that case entirely to `JudgementRationale`, which already handles it correctly in isolation.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library.

## Global Constraints

- Commits follow Conventional Commits: `type(scope): summary`.
- No hardcoded thresholds/judgement vocabulary involved in this change — not applicable here, but static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via pre-commit hook; do not bypass it.
- No em dashes in user-facing text — not applicable here (no user-facing copy changes in this plan).
- Tier 1 unit tests are co-located `*.test.ts`; Tier 3 component tests are co-located `*.test.tsx` — both patterns are used unchanged in this plan (see `docs/testing.md`).

Full design context: `docs/specs/judgement-anchor-scroll-design.md`.

---

### Task 1: Reproduce the bug with a failing `App`-level regression test

**Files:**

- Modify: `src/App.test.tsx` (add a new test inside the existing `describe("App — About and Judgements routes", ...)` block, which starts at line 496 and already has a `beforeEach` that clears storage, resets the hash to `#`, clears mocks, and marks onboarding as seen — see the existing test `"shows the Judgement Rationale screen when visited directly"` at line 516 for the exact pattern this new test extends)

**Interfaces:**

- Consumes: `App` (default export of `src/App.tsx`), `render`/`screen` from `@testing-library/react`, `vi` from `vitest` — all already imported at the top of `src/App.test.tsx`.
- Produces: nothing consumed by later tasks; this is a standalone regression test.

- [ ] **Step 1: Write the failing test**

Add this test immediately after the existing `"shows the Judgement Rationale screen when visited directly"` test (after line 524, before the `"links from About to the Judgement Rationale page"` test) in `src/App.test.tsx`:

```tsx
it("scrolls to the linked section instead of resetting to the top when visited directly with a slug (docs/inbox.md regression)", () => {
  const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const scrollIntoViewSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewSpy;
  window.history.pushState(null, "", "#/judgements/gcd-economy");

  render(<App />);

  expect(scrollIntoViewSpy).toHaveBeenCalled();
  expect(scrollToSpy).not.toHaveBeenCalled();
});
```

This uses the same `#/judgements/gcd-economy` slug the existing `JudgementRationale` unit test suite already exercises (`src/app/components/JudgementRationale/index.test.tsx`), which corresponds to a real `## GCD economy` heading id in `content.mdx`. `window.scrollTo` and `Element.prototype.scrollIntoView` are the only two scroll call sites in the entire app (confirmed via `grep -rn "scrollTo\|scrollIntoView" src --include=*.ts --include=*.tsx`, excluding tests), so asserting on them directly is unambiguous — no other code path could cause either spy to fire.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx -t "scrolls to the linked section instead of resetting to the top"`

Expected: FAIL. `scrollToSpy` gets called (with `0, 0`), because `useHashRoute`'s route-change effect unconditionally resets scroll before `JudgementRationale`'s own effect result is observable as "the only scroll call that happened." The exact failing assertion may be either the `scrollIntoViewSpy` or `scrollToSpy` expectation depending on effect timing — either failure confirms the bug is reproduced.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/App.test.tsx
git commit -m "test(judgements): reproduce deep-link anchor scroll bug at the App level"
```

Committing the red test on its own is intentional here (unlike the usual same-commit red/green pairing) so the reproduction is preserved as its own step in history, matching the design doc's emphasis that only an `App`-level test (not either unit test in isolation) actually exercises the real composition bug.

---

### Task 2: Fix `useHashRoute` and add the accompanying unit test

**Files:**

- Modify: `src/app/routing/useHashRoute.ts:56-61`
- Modify: `src/app/routing/useHashRoute.test.ts` (add a new test immediately after the existing `"scrolls to the top on every route change, not just the initial mount"` test, which ends at line 150)

**Interfaces:**

- Consumes: `Route` type from `./hashRoute` (already imported in `useHashRoute.ts`); `renderHook`, `act` from `@testing-library/react` and `vi` from `vitest` (already imported in `useHashRoute.test.ts`).
- Produces: the fixed `useHashRoute` behavior that Task 1's `App.test.tsx` test asserts on.

- [ ] **Step 1: Write the failing unit test**

Add this test in `src/app/routing/useHashRoute.test.ts`, immediately after the existing `"scrolls to the top on every route change, not just the initial mount"` test (after line 150, before the `"re-syncs on a hashchange event..."` test):

```ts
it("does not scroll to the top when navigating to a judgements route with a slug, leaving the anchor scroll to JudgementRationale", () => {
  const scrollToSpy = vi.spyOn(window, "scrollTo");
  const { result } = renderHook(() => useHashRoute());
  scrollToSpy.mockClear(); // only interested in scrolls caused by navigation, not mount

  act(() => {
    result.current.navigate({ screen: "judgements", slug: "gcd-economy" });
  });

  expect(scrollToSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts -t "does not scroll to the top when navigating to a judgements route with a slug"`

Expected: FAIL. `scrollToSpy` was called with `(0, 0)`, since the current implementation has no exception for the judgements+slug case.

- [ ] **Step 3: Implement the fix**

In `src/app/routing/useHashRoute.ts`, replace lines 56-61:

```ts
// Every screen change — including epic-to-epic drill-down within a fight,
// and browser back/forward — should read from the top, not carry over
// whatever scroll position the previous screen was left at.
useEffect(() => {
  window.scrollTo(0, 0);
}, [route]);
```

with:

```ts
// Every screen change — including epic-to-epic drill-down within a fight,
// and browser back/forward — should read from the top, not carry over
// whatever scroll position the previous screen was left at. The one
// exception: a judgements deep link with a slug (e.g. a per-metric "read
// the full rationale" link into #/judgements/<slug>) already has its own
// scroll target, handled by JudgementRationale's own scrollIntoView
// effect — resetting to the top here would race against and clobber
// that, which is exactly the bug this exception fixes (docs/inbox.md).
useEffect(() => {
  if (route.screen === "judgements" && route.slug) return;
  window.scrollTo(0, 0);
}, [route]);
```

- [ ] **Step 4: Run both new tests to verify they pass**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts src/App.test.tsx`

Expected: PASS for every test in both files, including:

- `useHashRoute.test.ts`'s new `"does not scroll to the top when navigating to a judgements route with a slug..."` test
- `useHashRoute.test.ts`'s existing `"scrolls to the top on every route change, not just the initial mount"` test (still passing — the general rule is unweakened, since neither of its two navigations is a judgements route)
- `App.test.tsx`'s new `"scrolls to the linked section instead of resetting to the top when visited directly with a slug..."` test from Task 1

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`

Expected: PASS, no regressions elsewhere (in particular, `JudgementRationale/index.test.tsx`'s own `"scrolls to the section matching the given slug"` and `"does not scroll when no slug is given"` tests, and any other test touching route changes, e.g. story 703's shareable-URL-state tests in `App.test.tsx`).

- [ ] **Step 6: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`

Expected: all three pass with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/routing/useHashRoute.ts src/app/routing/useHashRoute.test.ts
git commit -m "fix(judgements): stop top-scroll from clobbering deep-link anchor scroll"
```

---

## After both tasks: manual follow-up (not part of this worktree)

`docs/inbox.md` is untracked in the main checkout (never committed to git), so it does not exist in this worktree and cannot be edited or committed from here. Once this branch is merged to `main`, manually delete the "Deep-link judgement anchors don't scroll into view" entry from `docs/inbox.md` in the main checkout, per that file's own rule ("When one is ready to become real work, ... delete its entry here"). This is a small direct edit, not a task requiring a subagent.
