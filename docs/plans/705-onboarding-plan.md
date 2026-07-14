# Story 705 — Onboarding screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Onboarding screen, shown once per browser before the existing Connect screen, that explains what Bloomwatch is, who it's for, and why healing-meter judgement is misleading — per `docs/backlog.md` story 705 and `docs/specs/705-onboarding-design.md`.

**Architecture:** One new presentational component (`Onboarding`), gated in `App.tsx` by a `localStorage` boolean flag (same plain-key pattern `useWclAuth.ts` already uses), rendered as the very first conditional in `App.tsx`'s JSX — ahead of the existing `!accessToken` check — so it's viewable with zero auth. A small "About" link on the existing Connect screen re-opens it without clearing the flag.

**Tech Stack:** React + TypeScript (Vite), CSS Modules, Vitest + React Testing Library (Tier 3 component tests), existing `Shell`/`Button` UI primitives.

## Global Constraints

- Copy is pasted verbatim from `docs/design_v3/source/onboarding.jsx` — do not paraphrase or "improve" wording (per the design spec's fidelity note). A dedicated human review step at the end of this plan is the only place copy gets revisited.
- No hardcoded thresholds/spell IDs are involved in this story — not applicable here, but don't introduce any.
- No new dependencies. No secrets. Static analysis (`typecheck`, `lint`, `format:check`) must stay green full-project (pre-commit hook enforces this — do not bypass it).
- Follow existing component-folder convention: `src/app/components/<Name>/index.tsx` + `index.module.css` + `index.test.tsx`.
- Commits use Conventional Commits (`feat(onboarding): ...`, `test(onboarding): ...`).

---

## File Structure

- Modify: `src/app/components/ui/Shell/index.tsx` — widen `width` prop union to include `820` (the design frame's width).
- Modify: `src/app/components/ui/Shell/index.test.tsx` — add a coverage case for `width={820}`.
- Create: `src/app/components/Onboarding/index.tsx` — presentational component, all onboarding copy/markup.
- Create: `src/app/components/Onboarding/index.module.css` — styling, translated from `docs/design_v3/source/onboarding.jsx`'s inline styles into the project's CSS-module + `src/index.css` token convention.
- Create: `src/app/components/Onboarding/index.test.tsx` — Tier 3 component tests for `Onboarding` in isolation.
- Modify: `src/App.tsx` — import `Onboarding`, add the `localStorage`-backed gating state, restructure the top-level return to show `Onboarding` first, add the "About" re-open link to the Connect screen's footer.
- Modify: `src/App.module.css` — add `.aboutLink` (inline link-styled button, matching the existing `.backLink` pattern).
- Modify: `src/App.test.tsx` — default every existing test to "onboarding already seen" (via `beforeEach`), and add a new `describe("Onboarding")` block covering the gating behavior itself.

---

## Task 1: Widen `Shell`'s width prop to support the onboarding frame (820px)

**Files:**

- Modify: `src/app/components/ui/Shell/index.tsx`
- Test: `src/app/components/ui/Shell/index.test.tsx`

**Interfaces:**

- Produces: `ShellProps.width` now accepts `760 | 800 | 820` (was `760 | 800`). No other signature change — `<Shell width={820}>` becomes valid for Task 3's `App.tsx` usage.

- [ ] **Step 1: Write the failing test**

Add this test to `src/app/components/ui/Shell/index.test.tsx`, right after the existing `"applies the requested width as an inline style"` test (which stays unchanged):

```tsx
it("applies width 820 for the onboarding screen", () => {
  render(
    <Shell width={820}>
      <p>Onboarding</p>
    </Shell>,
  );
  expect(screen.getByText("Onboarding").parentElement).toHaveStyle({
    width: "820px",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Shell/index.test.tsx`
Expected: TypeScript error / test failure — `width={820}` is not assignable to `760 | 800` yet.

- [ ] **Step 3: Widen the prop type**

In `src/app/components/ui/Shell/index.tsx`, change:

```tsx
export interface ShellProps {
  width?: 760 | 800;
  children: ReactNode;
}
```

to:

```tsx
export interface ShellProps {
  width?: 760 | 800 | 820;
  children: ReactNode;
}
```

No other change to this file — `width = 760` stays the default, and the `style={{ width }}` usage already handles any numeric value.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Shell/index.test.tsx`
Expected: PASS (3 tests: renders children, width 800, width 820).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Shell/index.tsx src/app/components/ui/Shell/index.test.tsx
git commit -m "feat(shell): support 820px width for the onboarding screen"
```

---

## Task 2: Build the `Onboarding` component

**Files:**

- Create: `src/app/components/Onboarding/index.tsx`
- Create: `src/app/components/Onboarding/index.module.css`
- Test: `src/app/components/Onboarding/index.test.tsx`

**Interfaces:**

- Consumes: `Button` from `../ui/Button` (default export... actually named export `Button`, see `src/app/components/ui/Button/index.tsx`); the shared logo asset `src/assets/logo/lifebloom.jpg` (already imported the same way in `src/App.tsx` as `logo`).
- Produces: `Onboarding` component with `OnboardingProps = { onContinue: () => void }`. `onContinue` fires from **both** the "Continue" button and the "Skip intro →" control — Task 3 wires this single callback to dismiss-and-persist logic in `App.tsx`. No internal state, no `localStorage` access in this component.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/Onboarding/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Onboarding } from "./index";

describe("Onboarding", () => {
  it("renders the What this is / Who it's for / healing meter sections", () => {
    render(<Onboarding onContinue={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Who it's for" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Why not just look at the healing meter?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Primary/)).toBeInTheDocument();
    expect(screen.getByText(/Secondary/)).toBeInTheDocument();
    expect(screen.getByText(/Tertiary/)).toBeInTheDocument();
  });

  it("links to the TBC Resto Druid Rotation Game", () => {
    render(<Onboarding onContinue={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "TBC Resto Druid Rotation Game ↗" }),
    ).toHaveAttribute(
      "href",
      "https://branneman.github.io/tbc-resto-druid-rotation-game/",
    );
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalled();
  });

  it("calls onContinue when Skip intro is clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "Skip intro →" }));

    expect(onContinue).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Onboarding/index.test.tsx`
Expected: FAIL — `Failed to resolve import "./index"` (the component doesn't exist yet).

- [ ] **Step 3: Write the component**

Create `src/app/components/Onboarding/index.tsx`:

```tsx
import { Button } from "../ui/Button";
import logo from "../../../assets/logo/lifebloom.jpg";
import styles from "./index.module.css";

export interface OnboardingProps {
  onContinue: () => void;
}

export function Onboarding({ onContinue }: OnboardingProps) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={logo} width={40} height={40} alt="" />
          <h1>Bloomwatch</h1>
        </div>
        <button type="button" className={styles.skipLink} onClick={onContinue}>
          Skip intro →
        </button>
      </div>

      <p className={styles.tagline}>
        Keep your Lifeblooms rolling. Bloomwatch is a process-quality analyzer
        for TBC resto druid healers, built on Warcraft Logs.
      </p>

      <h2>What this is</h2>
      <p className={styles.section}>
        You paste a Warcraft Logs report link, pick a fight, and get a
        scorecard: every metric turned into a number with a red/orange/green
        judgement, so you can answer &quot;did I play well?&quot; independent of
        the healing meter.
      </p>

      <h2>Who it&apos;s for</h2>
      <ul className={styles.audienceList}>
        <li>
          <strong>Primary</strong> — a raiding resto druid on TBC Anniversary
          realms who wants objective, per-fight feedback on their own play.
        </li>
        <li>
          <strong>Secondary</strong> — healing officers and raid leads
          evaluating druids without falling into the parse trap.
        </li>
        <li>
          <strong>Tertiary</strong> — the broader Classic community, if this
          metric framework proves out for other HoT-centric specs.
        </li>
      </ul>

      <h2>Why not just look at the healing meter?</h2>
      <p className={styles.section}>
        Healing is zero-sum — every point of overheal on your target is a point
        your co-healer didn&apos;t need to spend. Effective-healing rankings
        measure your co-healers&apos; behavior as much as your own. This tool
        measures process instead of output: your GCD utilization, your Lifebloom
        refresh cadence, your mana-potion cooldown usage. Nobody can steal those
        from you, so they&apos;re a fair measure of how you actually played.
      </p>

      <div className={styles.actions}>
        <Button onClick={onContinue}>Continue</Button>
        <a
          href="https://branneman.github.io/tbc-resto-druid-rotation-game/"
          target="_blank"
          rel="noreferrer"
        >
          TBC Resto Druid Rotation Game ↗
        </a>
      </div>
      <p className={styles.caption}>
        Shown once on your first visit — reachable anytime after that from an
        &quot;About&quot; link in the footer.
      </p>
    </>
  );
}
```

Create `src/app/components/Onboarding/index.module.css`:

```css
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.headerLeft {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.headerLeft img {
  border-radius: 4px;
}
.skipLink {
  background: none;
  border: none;
  padding: 0;
  margin-top: var(--space-2);
  color: var(--text);
  font: inherit;
  font-size: var(--text-small-size);
  white-space: nowrap;
  cursor: pointer;
}
.tagline {
  margin-bottom: var(--space-6);
}
.section {
  margin-bottom: var(--space-5);
}
.audienceList {
  margin: 0 0 var(--space-5);
  padding-left: var(--space-4);
}
.audienceList li {
  margin-bottom: var(--space-2);
}
.audienceList li:last-child {
  margin-bottom: 0;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.caption {
  margin-top: var(--space-5);
  font-size: var(--text-small-size);
  color: var(--text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Onboarding/index.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Onboarding
git commit -m "feat(onboarding): add standalone Onboarding component"
```

---

## Task 3: Wire `Onboarding` into `App.tsx` with first-visit gating and an About re-open link

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.module.css`
- Modify: `src/App.test.tsx`

**Interfaces:**

- Consumes: `Onboarding` / `OnboardingProps` from Task 2 (`onContinue: () => void`); `Shell` with `width={820}` from Task 1.
- Produces: a `localStorage` key `"bloomwatch_onboarding_seen"` (`"true"` once dismissed) that other code (none currently, but future stories) can rely on as the documented flag name.

- [ ] **Step 1: Write the failing tests in `App.test.tsx`**

First, add a shared constant near the top of `src/App.test.tsx`, right after the existing `ACCESS_TOKEN_STORAGE_KEY` constant (around line 34):

```tsx
// Matches App.tsx's ONBOARDING_SEEN_KEY. Every test below defaults to
// "already seen" (set in beforeEach) since this file's existing tests
// exercise the report-loading flow, not onboarding itself — the dedicated
// "Onboarding" describe block below clears this key explicitly instead.
const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";
```

Then update the existing `beforeEach` (currently lines 79–83) from:

```tsx
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
```

to:

```tsx
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
});
```

Then add a new `describe` block. Insert it directly after the closing `});` of the existing `describe("App", ...)` block (i.e. as a sibling top-level describe at the end of the file):

```tsx
describe("App — Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows onboarding before Connect on a first visit (no seen flag)", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Connect to Warcraft Logs (WCL)",
      }),
    ).not.toBeInTheDocument();
  });

  it("dismisses onboarding and reveals Connect when Continue is clicked, persisting the seen flag", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });

  it("dismisses onboarding via Skip intro the same way", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Skip intro →" }));

    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });

  it("reopens onboarding from the About link without clearing the seen flag", async () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail (and old ones still pass)**

Run: `npx vitest run src/App.test.tsx`
Expected: the pre-existing tests still PASS (the seeded `ONBOARDING_SEEN_KEY` is inert until `App.tsx` reads it); the four new `"App — Onboarding"` tests FAIL, since `App.tsx` doesn't render `Onboarding` or the "About" link yet.

- [ ] **Step 3: Wire `Onboarding` into `App.tsx`**

Add the import, right after the existing `import { ConnectPanel } ...` line (around line 15):

```tsx
import { Onboarding } from "./app/components/Onboarding";
```

Add the storage key constant just above the `function App()` declaration (around line 33), matching `useWclAuth.ts`'s convention:

```tsx
const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";
```

Inside `function App()`, add the new state right after the existing `useState` declarations (after the `eventFetcher` state, around line 53):

```tsx
const [onboardingDismissed, setOnboardingDismissed] = useState(
  () => localStorage.getItem(ONBOARDING_SEEN_KEY) === "true",
);
```

Add the two handlers next to the other handler functions (e.g. right after `handleStartOver`, around line 92):

```tsx
function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  setOnboardingDismissed(true);
}

function reopenOnboarding() {
  setOnboardingDismissed(false);
}
```

Now restructure the returned JSX. The current return (from `return (` to the closing `);`) wraps three top-level conditionals inside a `<>...</>` fragment:

1. `{!accessToken && (<Shell>...connect screen...</Shell>)}`
2. `{accessToken && rateLimited && (<Shell>...rate-limit fallback...</Shell>)}`
3. `{accessToken && (<div ...>...main report flow...</div>)}`

Change the opening of the return to add the onboarding branch first, and gate the three existing branches behind `onboardingDismissed`:

Replace:

```tsx
  return (
    <>
      {!accessToken && (
        <Shell>
```

with:

```tsx
  return (
    <>
      {!onboardingDismissed && (
        <Shell width={820}>
          <Onboarding onContinue={dismissOnboarding} />
        </Shell>
      )}

      {onboardingDismissed && !accessToken && (
        <Shell>
```

Replace:

```tsx
      {accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
```

with:

```tsx
      {onboardingDismissed && accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
```

Replace:

```tsx
      {accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
```

with:

```tsx
      {onboardingDismissed && accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
```

Finally, add the "About" link to the Connect screen's footer paragraph. Replace:

```tsx
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs
            is made directly from your browser.
          </p>
        </Shell>
      )}
```

with:

```tsx
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs
            is made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={reopenOnboarding}
            >
              About
            </button>
          </p>
        </Shell>
      )}
```

- [ ] **Step 4: Add the `.aboutLink` style**

Add to `src/App.module.css`, after the existing `.connectFooter` rule:

```css
.aboutLink {
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
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS — all pre-existing tests plus the four new `"App — Onboarding"` tests.

Run: `npm test`
Expected: full Tier 1-3 suite PASS.

- [ ] **Step 6: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors. If `format:check` fails, run `npm run format` and re-stage.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.module.css src/App.test.tsx
git commit -m "feat(onboarding): show onboarding before Connect on first visit"
```

---

## Task 4 (human step — after Tasks 1–3 land): Review and redo the copy only

This step is **not** for the implementing agent to perform as part of the automated task loop — it's a manual checkpoint for the product owner (Bran). Do not let an agent unilaterally rewrite copy and self-approve it.

**Scope:** copy only, inside `src/app/components/Onboarding/index.tsx` — the tagline, the three section paragraphs/headings, the three audience bullets, and the caption line. **No functional or structural change**: same component, same props, same tests, same layout/CSS, same button/link behavior. If the reviewed copy changes wording, only the JSX text nodes (and, if a sentence's length changes enough to need it, minor CSS tweaks in `index.module.css`) should differ from what Tasks 1–3 produced.

**Process:**

- [ ] Read `src/app/components/Onboarding/index.tsx` as currently shipped (copy pasted verbatim from `docs/design_v3/source/onboarding.jsx` in Task 2).
- [ ] Compare against `docs/roadmap.md`'s Vision / "Who is this for" sections (the canonical source the design copy was paraphrasing) and decide if any wording should change.
- [ ] Edit only the JSX text content in `src/app/components/Onboarding/index.tsx` to the finalized copy.
- [ ] Run `npx vitest run src/app/components/Onboarding/index.test.tsx src/App.test.tsx` — if any test asserts on exact copy text that changed (e.g. `screen.getByText(/Primary/)` should still match, but a test asserting a full sentence would need updating), update the test's expected strings to match.
- [ ] Run `npm run typecheck && npm run lint && npm run format:check && npm test` — confirm still green.
- [ ] Commit the copy change separately from the implementation commits:

```bash
git add src/app/components/Onboarding/index.tsx
git commit -m "docs(onboarding): finalize onboarding copy"
```

---

## Self-Review Notes

- **Spec coverage:** content/sections (design doc "Content & copy") → Task 2; `Onboarding` component/props → Task 2; `App.tsx` gating + persistence → Task 3; Shell width extension → Task 1; About re-open link → Task 3; Tier 3 testing → Tasks 2 & 3. The design spec's "Explicitly out of scope" items (702's flow, story 009, versioned onboarding) are untouched by this plan, as intended.
- **Placeholder scan:** none — every step has literal code/commands.
- **Type consistency:** `OnboardingProps.onContinue: () => void` is used identically in Task 2's component and Task 3's `dismissOnboarding` wiring; `ShellProps.width` used as `820` in both Task 1's test and Task 3's `App.tsx` usage; `ONBOARDING_SEEN_KEY` string literal (`"bloomwatch_onboarding_seen"`) matches exactly between `App.tsx` (Task 3) and `App.test.tsx` (Task 3).
