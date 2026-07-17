# Footer rate-limit budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the live WCL hourly rate-limit budget (`pointsSpentThisHour/limitPerHour`) in the footer, next to the version string, reflowing to a stacked 2-row right column below the app's 600px `sm` breakpoint.

**Architecture:** A new `useRateLimitUsageData()` hook exposes the raw `{ limitPerHour, pointsSpentThisHour }` object already flowing through `src/wcl/rateLimitUsage.ts`'s pub/sub; `useRateLimitUsage()` (percentage, used by `RateLimitBanner`) is rewritten to derive from it so its behavior is unchanged. `App.tsx` wires the raw hook into a new `Footer` prop. `Footer`'s CSS module gets a `sm` (600px) breakpoint that switches its right-hand info block between stacked and inline layout.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, CSS Modules.

## Global Constraints

- No rounding/formatting of the rate-limit numbers — display exactly what WCL's `rateLimitData` returns.
- Rate-limit budget line is omitted entirely (not shown as `—/—` or `0/0`) until the first WCL response of the session publishes usage data.
- Shown regardless of `usingDefaultClient` — no gating beyond what already wraps `<Footer>` in `App.tsx`.
- Breakpoint is exactly `600px` (`min-width`), matching every other `sm` breakpoint in the codebase (e.g. `src/app/components/ReportInput/index.module.css:14`).
- Static analysis (typecheck/lint/format) runs via pre-commit — do not bypass it.

---

### Task 1: Add `useRateLimitUsageData()` raw hook, rewrite `useRateLimitUsage()` on top of it

**Files:**

- Modify: `src/wcl/useRateLimitUsage.ts`
- Test: `src/wcl/useRateLimitUsage.test.ts`

**Interfaces:**

- Consumes: `subscribeRateLimitUsage`, `RateLimitUsage` from `./rateLimitUsage` (existing, unchanged).
- Produces: `useRateLimitUsageData(): RateLimitUsage | null` (new, exported). `useRateLimitUsage(): number | null` (existing signature, now implemented in terms of the new hook — Task 3 consumes `useRateLimitUsageData`).

- [ ] **Step 1: Write the failing tests for the new raw hook**

Add to `src/wcl/useRateLimitUsage.test.ts`, alongside the existing `describe("useRateLimitUsage", ...)` block (new `import` for the new hook, new `describe` block):

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRateLimitUsage, useRateLimitUsageData } from "./useRateLimitUsage";
import { publishRateLimitUsage } from "./rateLimitUsage";
import { aRateLimitUsage } from "../testUtils/factories";

describe("useRateLimitUsageData", () => {
  it("returns null until the first usage is published", () => {
    const { result } = renderHook(() => useRateLimitUsageData());
    expect(result.current).toBeNull();
  });

  it("returns the raw usage object after a publish", () => {
    const { result } = renderHook(() => useRateLimitUsageData());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3000, pointsSpentThisHour: 465 }),
      );
    });

    expect(result.current).toEqual({
      limitPerHour: 3000,
      pointsSpentThisHour: 465,
    });
  });

  it("updates again on a later publish", () => {
    const { result } = renderHook(() => useRateLimitUsageData());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });
    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    expect(result.current).toEqual({
      limitPerHour: 3600,
      pointsSpentThisHour: 900,
    });
  });

  it("stops updating after unmount (no leaked listener)", () => {
    const { result, unmount } = renderHook(() => useRateLimitUsageData());
    unmount();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBeNull();
  });
});
```

Update the top of the file's existing `import { useRateLimitUsage } ...` line to the combined import shown above (single import statement, both names) — don't leave two separate imports from the same module.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- --run src/wcl/useRateLimitUsage.test.ts`
Expected: FAIL — `useRateLimitUsageData` is not exported from `./useRateLimitUsage`.

- [ ] **Step 3: Implement `useRateLimitUsageData` and rewrite `useRateLimitUsage` on top of it**

Replace the full contents of `src/wcl/useRateLimitUsage.ts` with:

```ts
import { useEffect, useState } from "react";
import { subscribeRateLimitUsage, type RateLimitUsage } from "./rateLimitUsage";

export function useRateLimitUsageData(): RateLimitUsage | null {
  const [usage, setUsage] = useState<RateLimitUsage | null>(null);

  useEffect(() => subscribeRateLimitUsage(setUsage), []);

  return usage;
}

export function useRateLimitUsage(): number | null {
  const usage = useRateLimitUsageData();

  if (usage === null) return null;
  return (usage.pointsSpentThisHour / usage.limitPerHour) * 100;
}
```

- [ ] **Step 4: Run all tests in the file to verify they pass**

Run: `npm test -- --run src/wcl/useRateLimitUsage.test.ts`
Expected: PASS — all `useRateLimitUsage` and `useRateLimitUsageData` tests green (7 tests total: 3 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/wcl/useRateLimitUsage.ts src/wcl/useRateLimitUsage.test.ts
git commit -m "feat(wcl-client): expose raw rate-limit usage via useRateLimitUsageData"
```

---

### Task 2: Add `rateLimitUsage` prop to `Footer`, render the budget line, add responsive layout

**Files:**

- Modify: `src/app/components/ui/Footer/index.tsx`
- Modify: `src/app/components/ui/Footer/index.module.css`
- Test: `src/app/components/ui/Footer/index.test.tsx`

**Interfaces:**

- Consumes: `RateLimitUsage` type from `../../../../wcl/rateLimitUsage` (path from `src/app/components/ui/Footer/index.tsx` — verify via the relative depth: `Footer` is 4 levels under `src`, `wcl` is a sibling of `app`, so `../../../../wcl/rateLimitUsage`).
- Produces: `FooterProps` gains `rateLimitUsage: RateLimitUsage | null` (required prop — Task 3 passes it in).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/components/ui/Footer/index.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./index";

describe("Footer", () => {
  it("calls onReopenOnboarding when the About link is clicked", async () => {
    const onReopenOnboarding = vi.fn();
    render(
      <Footer onReopenOnboarding={onReopenOnboarding} rateLimitUsage={null} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "About" }));

    expect(onReopenOnboarding).toHaveBeenCalledOnce();
  });

  it("shows a version string in Version: <commit-count>-<hash> form", () => {
    render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

    expect(
      screen.getByText(/^Version: \d+-[0-9a-f]{7,}\.?$/),
    ).toBeInTheDocument();
  });

  it("omits the rate-limit budget line when no usage data is available yet", () => {
    render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

    expect(screen.queryByText(/WCL rate limit budget/)).not.toBeInTheDocument();
  });

  it("shows the rate-limit budget line once usage data is available", () => {
    render(
      <Footer
        onReopenOnboarding={vi.fn()}
        rateLimitUsage={{ limitPerHour: 3000, pointsSpentThisHour: 465 }}
      />,
    );

    expect(
      screen.getByText("WCL rate limit budget: 465/3000."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/components/ui/Footer/index.test.tsx`
Expected: FAIL — `rateLimitUsage` prop doesn't exist on `FooterProps` (TS error) and the old bare-version assertion regex no longer matches.

- [ ] **Step 3: Implement the component change**

Replace the full contents of `src/app/components/ui/Footer/index.tsx` with:

```tsx
import type { RateLimitUsage } from "../../../../wcl/rateLimitUsage";
import styles from "./index.module.css";

export interface FooterProps {
  onReopenOnboarding: () => void;
  rateLimitUsage: RateLimitUsage | null;
}

export function Footer({ onReopenOnboarding, rateLimitUsage }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.aboutLink}
          onClick={onReopenOnboarding}
        >
          About
        </button>
        <div className={styles.meta}>
          {rateLimitUsage && (
            <span className={styles.rateLimit}>
              WCL rate limit budget: {rateLimitUsage.pointsSpentThisHour}/
              {rateLimitUsage.limitPerHour}.
            </span>
          )}
          <span className={styles.version}>Version: {__APP_VERSION__}.</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Add responsive CSS for the info block**

Replace the full contents of `src/app/components/ui/Footer/index.module.css` with:

```css
.footer {
  border-top: 1px solid var(--border);
}

.inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 16px var(--gutter);
  box-sizing: border-box;
  font-size: var(--text-small-size);
  color: var(--text);
}

.aboutLink {
  display: flex;
  align-items: center;
  min-height: 44px;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  color: var(--accent);
  font: inherit;
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
}

@media (min-width: 600px) {
  .meta {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
}

.rateLimit {
  color: var(--text);
}

.version {
  color: var(--text);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- --run src/app/components/ui/Footer/index.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ui/Footer/index.tsx src/app/components/ui/Footer/index.module.css src/app/components/ui/Footer/index.test.tsx
git commit -m "feat(footer): show WCL rate-limit budget next to version, stacked below 600px"
```

---

### Task 3: Wire `App.tsx` to pass live rate-limit data into `Footer`

**Files:**

- Modify: `src/App.tsx:35-38` (imports), `src/App.tsx:58` (hook call), `src/App.tsx:536-538` (`<Footer>` render)

**Interfaces:**

- Consumes: `useRateLimitUsageData` from `./wcl/useRateLimitUsage` (Task 1). `Footer`'s `rateLimitUsage` prop (Task 2).
- Produces: nothing further downstream — this is the final wiring task.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, the existing import block has (around line 38):

```ts
import { useRateLimitUsage } from "./wcl/useRateLimitUsage";
```

Change it to:

```ts
import {
  useRateLimitUsage,
  useRateLimitUsageData,
} from "./wcl/useRateLimitUsage";
```

- [ ] **Step 2: Call the new hook**

In `src/App.tsx`, the existing line (around line 58):

```ts
const usagePct = useRateLimitUsage();
```

Change it to:

```ts
const usagePct = useRateLimitUsage();
const rateLimitUsage = useRateLimitUsageData();
```

- [ ] **Step 3: Pass the prop to `Footer`**

In `src/App.tsx`, the existing render (around lines 536-538):

```tsx
{
  onboardingDismissed && accessToken && (
    <Footer onReopenOnboarding={reopenOnboarding} />
  );
}
```

Change it to:

```tsx
{
  onboardingDismissed && accessToken && (
    <Footer
      onReopenOnboarding={reopenOnboarding}
      rateLimitUsage={rateLimitUsage}
    />
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this confirms `Footer`'s now-required `rateLimitUsage` prop is satisfied at its one call site, and no other `<Footer>` usage exists to update).

- [ ] **Step 5: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS — all tests green (no `App.tsx` test directly exercises this wiring beyond what Task 2's `Footer` tests and existing `App`-level tests already cover; this step is a regression check).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire live WCL rate-limit data into the footer"
```

---

### Task 4: Manual verification and backlog/CLAUDE.md paperwork

**Files:**

- Modify: `docs/backlog.md` (only if this work corresponds to a tracked story — see Step 1)
- Delete: `docs/specs/footer-rate-limit-budget-design.md`, `docs/plans/footer-rate-limit-budget-plan.md` (once shipped, per CLAUDE.md's "a story isn't done until its paperwork is retired" — only if Step 1 finds this is a tracked backlog story; if it's free-floating polish with no backlog entry, still delete these two files once merged, since CLAUDE.md's spec/plan lifecycle isn't contingent on backlog tracking)

- [ ] **Step 1: Check whether this maps to an existing backlog story**

Run: `grep -n "rate.limit\|footer" docs/backlog.md`

If a story exactly describing this footer budget line exists and isn't yet marked done, mark it `✅ Done` in the same commit that deletes the spec/plan files (Step 3). If no such story exists, this is free-floating UI polish — skip the backlog edit but still do Step 3's deletion.

- [ ] **Step 2: Manually verify in a browser**

```bash
npm run dev
```

Open the app, connect to WCL, load a real report (see `docs/testing.md`'s "Known real test reports" table for a code to use), and reach any screen where `<Footer>` renders (post-onboarding, post-auth). Verify:

- Before any WCL request completes, footer right side shows only `Version: <n>-<hash>.`.
- After the first request, it shows `WCL rate limit budget: <spent>/<limit>. Version: <n>-<hash>.` on one line at desktop width.
- Resize the browser below 600px width: the rate-limit line and version line stack into two right-aligned rows, with `About` still on the left.
- Resize back above 600px: they return to one line.

- [ ] **Step 3: Retire the spec/plan and update backlog if applicable**

```bash
git rm docs/specs/footer-rate-limit-budget-design.md docs/plans/footer-rate-limit-budget-plan.md
# If Step 1 found a matching backlog story, edit docs/backlog.md to mark it Done first,
# then: git add docs/backlog.md
git commit -m "docs: retire footer rate-limit budget spec/plan"
```
