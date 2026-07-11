# Design System + Screen Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `docs/design/` mockup handoff into real, typed React components — a small reusable UI component library plus a retrofit of every existing screen — and assemble the story-701 Scorecard screen now, with static placeholder cards for the 4 metrics (202–205) that don't exist yet.

**Architecture:** New `src/app/components/ui/` folder holds design-system primitives (Button, Input, Checkbox, Field, Badge, JudgementChip, ProgressBar, Alert, Card, Disclosure, SpellIcon, Histogram, StackedBar, MetricCard, Shell), each with a colocated CSS Module for styling and a colocated test. Existing screens/components are retrofitted to use these primitives without changing their underlying fetch/compute logic. `App.tsx` moves from "every step stays visible" to single-screen-at-a-time. A new `Scorecard` component assembles the full story-701 layout.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest + @testing-library/react + @testing-library/user-event (existing), CSS Modules (new to this repo — first use), GraphicsMagick (`gm`, already available on this machine) for one-time favicon generation.

## Global Constraints

- Product principle: never add a metric based on HPS/parse percentile (n/a for this UI-only work, but don't introduce one).
- Product principle: no backend, all computation client-side (unaffected — this is presentation only).
- Product principle: every R/O/G threshold shown in the UI must match the value already encoded in `src/metrics/*.ts` (which cite `docs/backlog.md` story numbers in comments) — never invent a new threshold in a component.
- Spell/ability IDs are never hardcoded for computation — n/a here, since the only hardcoded strings this plan introduces are static icon _image paths_ (a visual choice per metric card), not ability IDs used in matching logic.
- Conventional Commits for every commit: `type(scope): summary`.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via the pre-commit hook — never bypass it (`--no-verify`). If unrelated pre-existing files fail `format:check`, run `npx prettier --write <file>` on them rather than skip the hook (this happened once already with `docs/design/*` in this session).
- Tests: colocated `index.test.tsx` beside `index.tsx`, using `render`/`screen` from `@testing-library/react`, `userEvent.setup()` for interactions, `vi.fn()` for mocks — matching every existing component test in this repo. Never assert on CSS Module class names (Vitest's default CSS handling doesn't guarantee real class names in jsdom) — assert on text, roles, and accessible names instead, exactly like `FightPicker/index.test.tsx` already does.
- `verbatimModuleSyntax: true` is on — every type-only import/export must use `import type` / `export type` explicitly.
- No shadows anywhere — every container is a single 1px `var(--border)` line.
- This work does not close any backlog story or add a new one — do not edit the `✅ Done` markers in `docs/backlog.md`.

---

## Task 1: CSS tokens

**Files:**

- Modify: `src/index.css`

**Interfaces:**

- Produces: `--space-1`…`--space-8` (4/8/12/16/24/32/48/64px), `--radius-sm` (4px), `--radius-md` (6px), `--radius-pill` (999px), `--text-small-size` (14px), `--judgement-green`/`-bg`, `--judgement-orange`/`-bg`, `--judgement-red`/`-bg` (light + dark), `--gray-400`, `--purple-600` — every later task's CSS Module references these by name.

- [ ] **Step 1: Add the new tokens to the light-mode `:root` block**

In `src/index.css`, inside the existing `:root { ... }` block (the one that currently starts with `--text: #6b6375;`), add these lines right after the existing `--shadow` declaration (which ends `rgba(0, 0, 0, 0.05) 0 4px 6px -2px;`):

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;

--radius-sm: 4px;
--radius-md: 6px;
--radius-pill: 999px;

--text-small-size: 14px;

--judgement-green: #1a9c4a;
--judgement-green-bg: rgba(26, 156, 74, 0.12);
--judgement-orange: #d97a1f;
--judgement-orange-bg: rgba(217, 122, 31, 0.12);
--judgement-red: #d1372f;
--judgement-red-bg: rgba(209, 55, 47, 0.12);

--gray-400: #9ca3af;
--purple-600: #7e22ce;
```

- [ ] **Step 2: Add dark-mode judgement overrides**

In the existing `@media (prefers-color-scheme: dark) { :root { ... } }` block (the one with `--text: #9ca3af;`), add after the existing `--shadow` override:

```css
--judgement-green: #34d17a;
--judgement-green-bg: rgba(52, 209, 122, 0.15);
--judgement-orange: #e8973a;
--judgement-orange-bg: rgba(232, 151, 58, 0.15);
--judgement-red: #ef5350;
--judgement-red-bg: rgba(239, 83, 80, 0.15);
```

- [ ] **Step 3: Point the existing `code, .counter` radius at the new token**

Change:

```css
code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: 4px;
  color: var(--text-h);
}
```

to:

```css
code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: var(--radius-sm);
  color: var(--text-h);
}
```

- [ ] **Step 4: Verify the build still compiles**

Run: `npm run typecheck && npm run build`
Expected: both succeed with no errors (CSS custom properties aren't type-checked, this just confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(design-system): add spacing, radius, and judgement color tokens"
```

---

## Task 2: Favicon + logo asset

**Files:**

- Create: `src/assets/logo/lifebloom.jpg`
- Create: `public/favicon.ico`
- Modify: `index.html`
- Delete: `public/favicon.svg`

**Interfaces:**

- Produces: `src/assets/logo/lifebloom.jpg` — imported by the Connect screen in Task 30 as the 40×40 logo mark.

- [ ] **Step 1: Copy the logo source into `src/assets`**

```bash
mkdir -p src/assets/logo
cp docs/design/assets/logo/lifebloom.jpg src/assets/logo/lifebloom.jpg
```

- [ ] **Step 2: Generate a multi-size favicon.ico with GraphicsMagick**

```bash
WORKDIR=$(mktemp -d)
gm convert docs/design/assets/logo/lifebloom.jpg -resize 16x16 "$WORKDIR/favicon-16.png"
gm convert docs/design/assets/logo/lifebloom.jpg -resize 32x32 "$WORKDIR/favicon-32.png"
gm convert docs/design/assets/logo/lifebloom.jpg -resize 48x48 "$WORKDIR/favicon-48.png"
gm convert "$WORKDIR/favicon-16.png" "$WORKDIR/favicon-32.png" "$WORKDIR/favicon-48.png" public/favicon.ico
rm -rf "$WORKDIR"
```

Expected: `public/favicon.ico` now exists. Verify: `file public/favicon.ico` should report `MS Windows icon resource - 3 icons`.

- [ ] **Step 3: Remove the old favicon and point index.html at the new one**

Delete `public/favicon.svg`:

```bash
rm public/favicon.svg
```

In `index.html`, change:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

to:

```html
<link rel="shortcut icon" href="/bloomwatch/favicon.ico" />
```

(matching `vite.config.ts`'s `base: "/bloomwatch/"`).

- [ ] **Step 4: Verify in the dev server**

Run: `npm run dev` (in background/separate terminal), open `http://localhost:5173/bloomwatch/` in a browser, confirm the browser tab shows the Lifebloom icon (not a 404/broken image). Stop the dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/assets/logo/lifebloom.jpg public/favicon.ico index.html
git rm public/favicon.svg
git commit -m "feat: replace abstract-bloom favicon with the Lifebloom spell icon"
```

---

## Task 3: `Button`

**Files:**

- Create: `src/app/components/ui/Button/index.tsx`
- Create: `src/app/components/ui/Button/index.module.css`
- Test: `src/app/components/ui/Button/index.test.tsx`

**Interfaces:**

- Produces: `Button` component, `ButtonProps { variant?: "primary" | "secondary" | "ghost"; size?: "md" | "sm" } & ButtonHTMLAttributes<HTMLButtonElement>`. Defaults: `variant="primary"`, `size="md"`, `type="button"` (override with `type="submit"` when used inside a form, as `ReportInput` will in Task 18).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./index";

describe("Button", () => {
  it("renders its label and calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Connect</Button>);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it never submits an enclosing form", () => {
    render(<Button>Get scorecard</Button>);
    expect(
      screen.getByRole("button", { name: "Get scorecard" }),
    ).toHaveAttribute("type", "button");
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Get scorecard
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Get scorecard" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Button --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component and its CSS Module**

`src/app/components/ui/Button/index.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";
import styles from "./index.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
```

`src/app/components/ui/Button/index.module.css`:

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font: inherit;
  font-size: var(--text-small-size);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.primary:hover:not(:disabled) {
  background: var(--purple-600);
  border-color: var(--purple-600);
}

.secondary {
  background: transparent;
  border-color: var(--border);
  color: var(--text-h);
}
.secondary:hover:not(:disabled) {
  border-color: var(--accent-border);
}

.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-h);
}
.ghost:hover:not(:disabled) {
  background: var(--accent-bg);
}

.sm {
  padding: var(--space-2) var(--space-3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Button --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Button
git commit -m "feat(ui): add Button component"
```

---

## Task 4: `Input`

**Files:**

- Create: `src/app/components/ui/Input/index.tsx`
- Create: `src/app/components/ui/Input/index.module.css`
- Test: `src/app/components/ui/Input/index.test.tsx`

**Interfaces:**

- Produces: `Input` component, `InputProps = InputHTMLAttributes<HTMLInputElement>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./index";

describe("Input", () => {
  it("renders the given placeholder and forwards typed input via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="Paste your Client ID" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Paste your Client ID");
    await user.type(input, "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Input --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Input/index.tsx`:

```tsx
import type { InputHTMLAttributes } from "react";
import styles from "./index.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  const classes = [styles.input, className].filter(Boolean).join(" ");
  return <input className={classes} {...rest} />;
}
```

`src/app/components/ui/Input/index.module.css`:

```css
.input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--text-small-size);
  color: var(--text-h);
  background: var(--bg);
}
.input:focus {
  outline: none;
  border-color: var(--accent-border);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Input --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Input
git commit -m "feat(ui): add Input component"
```

---

## Task 5: `Checkbox`

**Files:**

- Create: `src/app/components/ui/Checkbox/index.tsx`
- Create: `src/app/components/ui/Checkbox/index.module.css`
- Test: `src/app/components/ui/Checkbox/index.test.tsx`

**Interfaces:**

- Produces: `Checkbox` component, `CheckboxProps { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">`. Renders a `<label>` wrapping the checkbox and label text — no `id`/`htmlFor` needed, `getByLabelText(label)` works via wrapping.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./index";

describe("Checkbox", () => {
  it("renders with the given label and reflects the checked prop", () => {
    render(<Checkbox label="Show trash fights" checked readOnly />);
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
  });

  it("calls onChange when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Show trash fights"
        checked={false}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Checkbox --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Checkbox/index.tsx`:

```tsx
import type { InputHTMLAttributes } from "react";
import styles from "./index.module.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: string;
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}
```

`src/app/components/ui/Checkbox/index.module.css`:

```css
.checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-small-size);
  color: var(--text-h);
  cursor: pointer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Checkbox --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Checkbox
git commit -m "feat(ui): add Checkbox component"
```

---

## Task 6: `Field`

**Files:**

- Create: `src/app/components/ui/Field/index.tsx`
- Create: `src/app/components/ui/Field/index.module.css`
- Test: `src/app/components/ui/Field/index.test.tsx`

**Interfaces:**

- Produces: `Field` component, `FieldProps { label: string; children: ReactNode }`. Wraps children in a `<label>` (auto-associates with a single focusable child, no `htmlFor`/`id` needed).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./index";

describe("Field", () => {
  it("associates its label text with the wrapped input", () => {
    render(
      <Field label="WCL Client ID">
        <input placeholder="Paste your Client ID" />
      </Field>,
    );
    expect(screen.getByLabelText("WCL Client ID")).toHaveAttribute(
      "placeholder",
      "Paste your Client ID",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Field --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Field/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <div className={styles.labelText}>{label}</div>
      {children}
    </label>
  );
}
```

`src/app/components/ui/Field/index.module.css`:

```css
.field {
  display: block;
  margin-bottom: var(--space-4);
}
.labelText {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-bottom: var(--space-2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Field --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Field
git commit -m "feat(ui): add Field component"
```

---

## Task 7: `Badge`

**Files:**

- Create: `src/app/components/ui/Badge/index.tsx`
- Create: `src/app/components/ui/Badge/index.module.css`
- Test: `src/app/components/ui/Badge/index.test.tsx`

**Interfaces:**

- Produces: `Badge` component, `BadgeProps { tone: "kill" | "wipe" | "trash"; children: ReactNode }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./index";

describe("Badge", () => {
  it.each([
    ["kill", "Kill"],
    ["wipe", "Wipe (34%)"],
    ["trash", "Trash"],
  ] as const)("renders %s tone content", (tone, text) => {
    render(<Badge tone={tone}>{text}</Badge>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Badge --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Badge/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface BadgeProps {
  tone: "kill" | "wipe" | "trash";
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
```

`src/app/components/ui/Badge/index.module.css`:

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--text-small-size);
  font-weight: 600;
  white-space: nowrap;
}
.kill {
  color: var(--judgement-green);
  background: var(--judgement-green-bg);
}
.wipe {
  color: var(--judgement-orange);
  background: var(--judgement-orange-bg);
}
.trash {
  color: var(--gray-400);
  background: var(--code-bg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Badge --no-coverage`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Badge
git commit -m "feat(ui): add Badge component"
```

---

## Task 8: `JudgementChip`

**Files:**

- Create: `src/app/components/ui/JudgementChip/index.tsx`
- Create: `src/app/components/ui/JudgementChip/index.module.css`
- Test: `src/app/components/ui/JudgementChip/index.test.tsx`

**Interfaces:**

- Consumes: `Judgement` type from `src/metrics/judgement.ts` (`"green" | "orange" | "red"`).
- Produces: `JudgementChip` component, `JudgementChipProps { judgement: Judgement }`. Renders the label "Green"/"Orange"/"Red".

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudgementChip } from "./index";

describe("JudgementChip", () => {
  it.each([
    ["green", "Green"],
    ["orange", "Orange"],
    ["red", "Red"],
  ] as const)("renders the %s judgement as %s", (judgement, label) => {
    render(<JudgementChip judgement={judgement} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/JudgementChip --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/JudgementChip/index.tsx`:

```tsx
import type { Judgement } from "../../../../metrics/judgement";
import styles from "./index.module.css";

export interface JudgementChipProps {
  judgement: Judgement;
}

const LABEL: Record<Judgement, string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function JudgementChip({ judgement }: JudgementChipProps) {
  return (
    <span className={`${styles.chip} ${styles[judgement]}`}>
      {LABEL[judgement]}
    </span>
  );
}
```

`src/app/components/ui/JudgementChip/index.module.css`:

```css
.chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--text-small-size);
  font-weight: 600;
}
.green {
  color: var(--judgement-green);
  background: var(--judgement-green-bg);
}
.orange {
  color: var(--judgement-orange);
  background: var(--judgement-orange-bg);
}
.red {
  color: var(--judgement-red);
  background: var(--judgement-red-bg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/JudgementChip --no-coverage`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/JudgementChip
git commit -m "feat(ui): add JudgementChip component"
```

---

## Task 9: `ProgressBar`

**Files:**

- Create: `src/app/components/ui/ProgressBar/index.tsx`
- Create: `src/app/components/ui/ProgressBar/index.module.css`
- Test: `src/app/components/ui/ProgressBar/index.test.tsx`

**Interfaces:**

- Consumes: `Judgement` type from `src/metrics/judgement.ts`.
- Produces: `ProgressBar` component, `ProgressBarProps { pct: number; judgement: Judgement | "neutral" }`. Renders `role="progressbar"` with `aria-valuenow` clamped to [0, 100].

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./index";

describe("ProgressBar", () => {
  it("exposes pct as aria-valuenow", () => {
    render(<ProgressBar pct={87} judgement="green" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "87",
    );
  });

  it("clamps values above 100 down to 100", () => {
    render(<ProgressBar pct={140} judgement="neutral" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("clamps negative values up to 0", () => {
    render(<ProgressBar pct={-5} judgement="red" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/ProgressBar --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/ProgressBar/index.tsx`:

```tsx
import type { Judgement } from "../../../../metrics/judgement";
import styles from "./index.module.css";

export interface ProgressBarProps {
  pct: number;
  judgement: Judgement | "neutral";
}

export function ProgressBar({ pct, judgement }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`${styles.fill} ${styles[judgement]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
```

`src/app/components/ui/ProgressBar/index.module.css`:

```css
.track {
  width: 100%;
  height: 8px;
  border-radius: var(--radius-sm);
  background: var(--border);
  overflow: hidden;
}
.fill {
  height: 100%;
  transition: width 0.2s ease;
}
.green {
  background: var(--judgement-green);
}
.orange {
  background: var(--judgement-orange);
}
.red {
  background: var(--judgement-red);
}
.neutral {
  background: var(--accent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/ProgressBar --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/ProgressBar
git commit -m "feat(ui): add ProgressBar component"
```

---

## Task 10: `Alert`

**Files:**

- Create: `src/app/components/ui/Alert/index.tsx`
- Create: `src/app/components/ui/Alert/index.module.css`
- Test: `src/app/components/ui/Alert/index.test.tsx`

**Interfaces:**

- Produces: `Alert` component, `AlertProps { tone: "warning"; children: ReactNode }`. Renders `role="alert"`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./index";

describe("Alert", () => {
  it("renders its children with role=alert", () => {
    render(<Alert tone="warning">Save a Client ID first.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Save a Client ID first.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Alert --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Alert/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface AlertProps {
  tone: "warning";
  children: ReactNode;
}

export function Alert({ tone, children }: AlertProps) {
  return (
    <div role="alert" className={`${styles.alert} ${styles[tone]}`}>
      {children}
    </div>
  );
}
```

`src/app/components/ui/Alert/index.module.css`:

```css
.alert {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: var(--text-small-size);
}
.warning {
  border-color: var(--judgement-orange);
  background: var(--judgement-orange-bg);
  color: var(--text-h);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Alert --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Alert
git commit -m "feat(ui): add Alert component"
```

---

## Task 11: `Card`

**Files:**

- Create: `src/app/components/ui/Card/index.tsx`
- Create: `src/app/components/ui/Card/index.module.css`
- Test: `src/app/components/ui/Card/index.test.tsx`

**Interfaces:**

- Produces: `Card` component, `CardProps { children: ReactNode }`. Bordered box, no shadow.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./index";

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>GCD utilization</p>
      </Card>,
    );
    expect(screen.getByText("GCD utilization")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Card --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Card/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface CardProps {
  children: ReactNode;
}

export function Card({ children }: CardProps) {
  return <div className={styles.card}>{children}</div>;
}
```

`src/app/components/ui/Card/index.module.css`:

```css
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-sizing: border-box;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Card --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Card
git commit -m "feat(ui): add Card component"
```

---

## Task 12: `Disclosure`

**Files:**

- Create: `src/app/components/ui/Disclosure/index.tsx`
- Create: `src/app/components/ui/Disclosure/index.module.css`
- Test: `src/app/components/ui/Disclosure/index.test.tsx`

**Interfaces:**

- Produces: `Disclosure` component, `DisclosureProps { summary: string; children: ReactNode }`. Collapsed by default; a button toggles a chevron (rotates via CSS class) and reveals `children`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./index";

describe("Disclosure", () => {
  it("hides its content by default and reveals it on click", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="Why this threshold?">
        Green ≥ 85%, orange 70–85%, red &lt; 70%.
      </Disclosure>,
    );
    expect(screen.queryByText(/Green ≥ 85%/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Why this threshold?" }),
    );
    expect(screen.getByText(/Green ≥ 85%/)).toBeInTheDocument();
  });

  it("marks the toggle button's aria-expanded state", async () => {
    const user = userEvent.setup();
    render(<Disclosure summary="Why this threshold?">Detail text.</Disclosure>);
    const button = screen.getByRole("button", { name: "Why this threshold?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Disclosure --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Disclosure/index.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import styles from "./index.module.css";

export interface DisclosureProps {
  summary: string;
  children: ReactNode;
}

export function Disclosure({ summary, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className={`${styles.chevron} ${open ? styles.open : ""}`}>
          ▶
        </span>
        {summary}
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </div>
  );
}
```

`src/app/components/ui/Disclosure/index.module.css`:

```css
.disclosure {
  font-size: var(--text-small-size);
}
.summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: none;
  padding: 0;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-small-size);
}
.chevron {
  display: inline-block;
  transition: transform 0.15s ease;
  font-size: 10px;
}
.chevron.open {
  transform: rotate(90deg);
}
.content {
  margin-top: var(--space-2);
  color: var(--text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Disclosure --no-coverage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Disclosure
git commit -m "feat(ui): add Disclosure component"
```

---

## Task 13: `SpellIcon`

**Files:**

- Create: `src/app/components/ui/SpellIcon/index.tsx`
- Create: `src/app/components/ui/SpellIcon/index.module.css`
- Test: `src/app/components/ui/SpellIcon/index.test.tsx`

**Interfaces:**

- Produces: `SpellIcon` component, `SpellIconProps { src: string; size?: number }` (default `size=28`).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpellIcon } from "./index";

describe("SpellIcon", () => {
  it("renders an image at the given src, defaulting to 28x28", () => {
    render(<SpellIcon src="/icons/lifebloom.jpg" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/icons/lifebloom.jpg");
    expect(img).toHaveAttribute("width", "28");
    expect(img).toHaveAttribute("height", "28");
  });

  it("accepts a custom size", () => {
    render(<SpellIcon src="/icons/lifebloom.jpg" size={40} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("width", "40");
    expect(img).toHaveAttribute("height", "40");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/SpellIcon --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/SpellIcon/index.tsx`:

```tsx
import styles from "./index.module.css";

export interface SpellIconProps {
  src: string;
  size?: number;
}

export function SpellIcon({ src, size = 28 }: SpellIconProps) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      role="img"
      className={styles.icon}
    />
  );
}
```

`src/app/components/ui/SpellIcon/index.module.css`:

```css
.icon {
  border-radius: 3px;
  border: 1px solid var(--border);
  vertical-align: middle;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/SpellIcon --no-coverage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/SpellIcon
git commit -m "feat(ui): add SpellIcon component"
```

---

## Task 14: `Histogram`

**Files:**

- Create: `src/app/components/ui/Histogram/index.tsx`
- Create: `src/app/components/ui/Histogram/index.module.css`
- Test: `src/app/components/ui/Histogram/index.test.tsx`

**Interfaces:**

- Produces: `Histogram` component, `HistogramProps { buckets: { label: string; pct: number; color: string }[] }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Histogram } from "./index";

describe("Histogram", () => {
  it("renders one column per bucket with its label and percentage", () => {
    render(
      <Histogram
        buckets={[
          {
            label: "Early (< 5.5s)",
            pct: 14,
            color: "var(--judgement-orange)",
          },
          { label: "Ideal (5.5–7s)", pct: 71, color: "var(--judgement-green)" },
          { label: "Late (> 7s)", pct: 15, color: "var(--judgement-red)" },
        ]}
      />,
    );
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Histogram --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Histogram/index.tsx`:

```tsx
import styles from "./index.module.css";

export interface HistogramBucket {
  label: string;
  pct: number;
  color: string;
}

export interface HistogramProps {
  buckets: HistogramBucket[];
}

export function Histogram({ buckets }: HistogramProps) {
  const max = Math.max(...buckets.map((bucket) => bucket.pct));
  return (
    <div className={styles.histogram}>
      {buckets.map((bucket) => (
        <div key={bucket.label} className={styles.column}>
          <div className={styles.pctLabel}>{bucket.pct}%</div>
          <div
            className={styles.bar}
            style={{
              height: `${Math.max(6, (bucket.pct / max) * 80)}px`,
              background: bucket.color,
            }}
          />
          <div className={styles.bucketLabel}>{bucket.label}</div>
        </div>
      ))}
    </div>
  );
}
```

`src/app/components/ui/Histogram/index.module.css`:

```css
.histogram {
  display: flex;
  align-items: flex-end;
  gap: var(--space-5);
  height: 110px;
  margin-bottom: var(--space-4);
}
.column {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}
.pctLabel {
  font-size: var(--text-small-size);
  color: var(--text-h);
  margin-bottom: var(--space-2);
  font-weight: 500;
}
.bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
}
.bucketLabel {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-top: var(--space-2);
  text-align: center;
  line-height: 1.3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Histogram --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Histogram
git commit -m "feat(ui): add Histogram component"
```

---

## Task 15: `StackedBar`

**Files:**

- Create: `src/app/components/ui/StackedBar/index.tsx`
- Create: `src/app/components/ui/StackedBar/index.module.css`
- Test: `src/app/components/ui/StackedBar/index.test.tsx`

**Interfaces:**

- Produces: `StackedBar` component, `StackedBarProps { segments: { label: string; pct: number; color: string }[] }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StackedBar } from "./index";

describe("StackedBar", () => {
  it("renders a legend entry per segment with its percentage", () => {
    render(
      <StackedBar
        segments={[
          { label: "0 targets", pct: 3, color: "var(--border)" },
          { label: "1 target", pct: 41, color: "var(--accent-border)" },
          { label: "2 targets", pct: 56, color: "var(--accent)" },
        ]}
      />,
    );
    expect(screen.getByText("0 targets — 3%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 41%")).toBeInTheDocument();
    expect(screen.getByText("2 targets — 56%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/StackedBar --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/StackedBar/index.tsx`:

```tsx
import styles from "./index.module.css";

export interface StackedBarSegment {
  label: string;
  pct: number;
  color: string;
}

export interface StackedBarProps {
  segments: StackedBarSegment[];
}

export function StackedBar({ segments }: StackedBarProps) {
  return (
    <div>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${segment.pct}%`, background: segment.color }}
            title={`${segment.label}: ${segment.pct}%`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {segments.map((segment) => (
          <div key={segment.label} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: segment.color }}
            />
            {segment.label} — {segment.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}
```

`src/app/components/ui/StackedBar/index.module.css`:

```css
.bar {
  display: flex;
  height: 22px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--space-3);
}
.legend {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.legendItem {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-small-size);
  color: var(--text);
}
.swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/StackedBar --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/StackedBar
git commit -m "feat(ui): add StackedBar component"
```

---

## Task 16: `MetricCard`

**Files:**

- Create: `src/app/components/ui/MetricCard/index.tsx`
- Create: `src/app/components/ui/MetricCard/index.module.css`
- Test: `src/app/components/ui/MetricCard/index.test.tsx`

**Interfaces:**

- Consumes: `Card` (Task 11), `SpellIcon` (Task 13), `JudgementChip` (Task 8), `ProgressBar` (Task 9), `Disclosure` (Task 12), `Judgement` type.
- Produces: `MetricCard` component, `MetricCardProps { icon?: string; title: string; value?: string; pct?: number; judgement?: Judgement | null; note?: string; threshold: string; children?: ReactNode }`. This is what Tasks 21–28 render through.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./index";

describe("MetricCard", () => {
  it("renders title, value, and judgement chip", () => {
    render(
      <MetricCard
        title="GCD utilization"
        value="87%"
        pct={87}
        judgement="green"
        threshold="Green >= 85%."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "87",
    );
  });

  it("renders a note instead of a chip when judgement is absent", () => {
    render(
      <MetricCard
        title="Concurrent LB3 targets"
        value="Avg 1.6 · Peak 2"
        note="Informational — no judgement"
        threshold="No R/O/G."
      />,
    );
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
  });

  it("shows the threshold text only after opening the disclosure", async () => {
    const user = userEvent.setup();
    render(
      <MetricCard
        title="GCD utilization"
        value="87%"
        judgement="green"
        threshold="Green >= 85%, orange 70-85%, red < 70%."
      />,
    );
    expect(screen.queryByText(/Green >= 85%/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Why this threshold?" }),
    );
    expect(screen.getByText(/Green >= 85%/)).toBeInTheDocument();
  });

  it("renders children as the card body", () => {
    render(
      <MetricCard title="GCD utilization" judgement="green" threshold="...">
        <p>Time on the global cooldown.</p>
      </MetricCard>,
    );
    expect(
      screen.getByText("Time on the global cooldown."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/MetricCard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/MetricCard/index.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Judgement } from "../../../../metrics/judgement";
import { Card } from "../Card";
import { SpellIcon } from "../SpellIcon";
import { JudgementChip } from "../JudgementChip";
import { ProgressBar } from "../ProgressBar";
import { Disclosure } from "../Disclosure";
import styles from "./index.module.css";

export interface MetricCardProps {
  icon?: string;
  title: string;
  value?: string;
  pct?: number;
  judgement?: Judgement | null;
  note?: string;
  threshold: string;
  children?: ReactNode;
}

export function MetricCard({
  icon,
  title,
  value,
  pct,
  judgement,
  note,
  threshold,
  children,
}: MetricCardProps) {
  return (
    <Card>
      <div className={styles.header}>
        {icon && <SpellIcon src={icon} />}
        <h3 className={styles.title}>{title}</h3>
        {judgement ? (
          <JudgementChip judgement={judgement} />
        ) : note ? (
          <span className={styles.note}>{note}</span>
        ) : null}
      </div>
      {value !== undefined && <div className={styles.value}>{value}</div>}
      {pct !== undefined && (
        <div className={styles.progress}>
          <ProgressBar pct={pct} judgement={judgement ?? "neutral"} />
        </div>
      )}
      {children}
      <div className={styles.disclosure}>
        <Disclosure summary="Why this threshold?">{threshold}</Disclosure>
      </div>
    </Card>
  );
}
```

`src/app/components/ui/MetricCard/index.module.css`:

```css
.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.title {
  margin: 0;
  flex: 1;
}
.note {
  font-size: var(--text-small-size);
  color: var(--text);
  font-style: italic;
}
.value {
  font-size: 28px;
  color: var(--text-h);
  font-weight: 500;
  margin-bottom: var(--space-2);
}
.progress {
  margin-bottom: var(--space-3);
}
.disclosure {
  margin-top: var(--space-3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/MetricCard --no-coverage`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/MetricCard
git commit -m "feat(ui): add MetricCard component"
```

---

## Task 17: `Shell`

**Files:**

- Create: `src/app/components/ui/Shell/index.tsx`
- Create: `src/app/components/ui/Shell/index.module.css`
- Test: `src/app/components/ui/Shell/index.test.tsx`

**Interfaces:**

- Produces: `Shell` component, `ShellProps { width?: 760 | 800; children: ReactNode }` (default `width=760`). Bordered column container that `App.tsx` (Task 30) wraps every screen in, replacing `#root`'s current border/width styling (removed in Task 30).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./index";

describe("Shell", () => {
  it("renders its children", () => {
    render(
      <Shell>
        <h1>Bloomwatch</h1>
      </Shell>,
    );
    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
  });

  it("applies the requested width as an inline style", () => {
    render(
      <Shell width={800}>
        <p>Scorecard</p>
      </Shell>,
    );
    expect(screen.getByText("Scorecard").parentElement).toHaveStyle({
      width: "800px",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Shell --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ui/Shell/index.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ShellProps {
  width?: 760 | 800;
  children: ReactNode;
}

export function Shell({ width = 760, children }: ShellProps) {
  return (
    <div className={styles.shell} style={{ width }}>
      {children}
    </div>
  );
}
```

`src/app/components/ui/Shell/index.module.css`:

```css
.shell {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  padding: var(--space-6) var(--space-7) var(--space-7);
  box-sizing: border-box;
  max-width: 100%;
  margin: var(--space-6) auto;
  text-align: left;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Shell --no-coverage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Shell
git commit -m "feat(ui): add Shell component"
```

---

## Task 18: Retrofit `ReportInput`

**Files:**

- Modify: `src/app/components/ReportInput/index.tsx`
- Modify: `src/app/components/ReportInput/index.test.tsx`

**Interfaces:**

- Consumes: `Field` (Task 6), `Input` (Task 4), `Button` (Task 3), `Alert` (Task 10).
- Produces: same `ReportInputProps`/`ParsedReport` contract as before — no change for `App.tsx` to adapt to yet.

- [ ] **Step 1: Update the component**

Replace the full contents of `src/app/components/ReportInput/index.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { parseReportInput } from "../../../report/parseReportInput";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

export interface ParsedReport {
  reportCode: string;
  fightId: number | null;
}

export interface ReportInputProps {
  onSubmit: (report: ParsedReport) => void;
}

export function ReportInput({ onSubmit }: ReportInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseReportInput(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onSubmit({ reportCode: result.reportCode, fightId: result.fightId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Report URL or code">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://fresh.warcraftlogs.com/reports/..."
        />
      </Field>
      <Button type="submit">Load report</Button>
      {error && <Alert tone="warning">{error}</Alert>}
    </form>
  );
}
```

Note: this drops the explicit `htmlFor`/`useId` wiring the original had, since `Field` now auto-associates its label with the wrapped `Input` by wrapping it in a `<label>` — `getByLabelText(/report url or code/i)` in the existing test still resolves the same `Input`.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npx vitest run src/app/components/ReportInput --no-coverage`
Expected: PASS — all 4 existing tests pass with no test-file changes needed, since the accessible name, button role/name, and `role="alert"` error surface are unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/ReportInput
git commit -m "refactor(app): restyle ReportInput with the design system"
```

---

## Task 19: Retrofit `ConnectPanel`

**Files:**

- Modify: `src/app/components/ConnectPanel/index.tsx`

**Interfaces:**

- Consumes: `Alert` (Task 10).

- [ ] **Step 1: Swap the plain error paragraph for `Alert`**

In `src/app/components/ConnectPanel/index.tsx`, add the import:

```tsx
import { Alert } from "../ui/Alert";
```

Change:

```tsx
if ("error" in result) return <p role="alert">{result.error}</p>;
```

to:

```tsx
if ("error" in result) return <Alert tone="warning">{result.error}</Alert>;
```

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npx vitest run src/app/components/ConnectPanel --no-coverage`
Expected: PASS — `Alert` also renders `role="alert"`, so the existing `screen.getByRole("alert")` assertion in the error test is unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/ConnectPanel
git commit -m "refactor(app): use Alert for ConnectPanel's error state"
```

---

## Task 20: Retrofit `FightPicker`

**Files:**

- Modify: `src/app/components/FightPicker/index.tsx`
- Create: `src/app/components/FightPicker/index.module.css`

**Interfaces:**

- Consumes: `Badge` (Task 7), `Button` (Task 3), `Checkbox` (Task 5).
- Produces: same `FightPickerProps` contract — all selection logic is untouched, only the rendered markup/styling changes.

- [ ] **Step 1: Replace the render output**

Replace the full contents of `src/app/components/FightPicker/index.tsx` with:

```tsx
import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import {
  buildFightRows,
  formatDuration,
  groupFightsByZone,
} from "../../../report/fightRows";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import styles from "./index.module.css";

export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectionChange: (fightIds: number[]) => void;
}

function isInitialFightTrash(
  fights: Fight[],
  initialFightId: number | null,
): boolean {
  if (initialFightId === null) return false;
  const fight = fights.find((f) => f.id === initialFightId);
  return fight !== undefined && fight.encounterID === 0;
}

export function FightPicker({
  fights,
  initialFightId,
  onSelectionChange,
}: FightPickerProps) {
  const [showTrash, setShowTrash] = useState(() =>
    isInitialFightTrash(fights, initialFightId),
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(initialFightId === null ? [] : [initialFightId]),
  );

  const rows = buildFightRows(fights).filter(
    (row) => !row.isTrash || showTrash,
  );
  const zones = groupFightsByZone(fights);

  function commitSelection(next: Set<number>) {
    setSelectedIds(next);
    onSelectionChange(fights.map((f) => f.id).filter((id) => next.has(id)));
  }

  function toggleFight(fightId: number) {
    const next = new Set(selectedIds);
    if (next.has(fightId)) {
      next.delete(fightId);
    } else {
      next.add(fightId);
    }
    commitSelection(next);
  }

  function selectZone(fightIds: number[]) {
    commitSelection(new Set(fightIds));
  }

  return (
    <div>
      <Checkbox
        checked={showTrash}
        onChange={(event) => setShowTrash(event.target.checked)}
        label="Show trash fights"
      />
      {zones.length > 0 && (
        <div className={styles.zoneRow}>
          {zones.map((zone) => (
            <Button
              key={zone.zoneId}
              variant="secondary"
              size="sm"
              onClick={() => selectZone(zone.fightIds)}
            >
              {zone.zoneName} ({zone.fightIds.length})
            </Button>
          ))}
        </div>
      )}
      <div className={styles.rows}>
        {rows.map(({ fight, isTrash, pullNumber }) => {
          const label = isTrash
            ? fight.name
            : `Pull ${pullNumber} — ${fight.name}`;
          const duration = formatDuration(fight.endTime - fight.startTime);

          return (
            <label key={fight.id} className={styles.row}>
              <input
                type="checkbox"
                checked={selectedIds.has(fight.id)}
                onChange={() => toggleFight(fight.id)}
              />
              <span className={styles.label}>{label}</span>
              {fight.kill === true ? (
                <Badge tone="kill">Kill</Badge>
              ) : fight.kill === false ? (
                <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
              ) : null}
              <span className={styles.duration}>{duration}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
```

`src/app/components/FightPicker/index.module.css`:

```css
.zoneRow {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-4) 0 var(--space-6);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.label {
  flex: 1;
  font-size: var(--text-small-size);
  color: var(--text-h);
}
.duration {
  font-size: var(--text-small-size);
  color: var(--text);
  font-family: var(--mono);
}
```

Note: this deliberately keeps per-zone "select all" buttons (one per zone present in the report) rather than the mockup's single generic "Select all in zone" button — the real app already supports multi-zone reports (e.g. "SSC+TK"), which the mockup's single-zone assumption doesn't cover. This is a functional improvement over the mockup, not a regression, so it's kept.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `npx vitest run src/app/components/FightPicker --no-coverage`
Expected: PASS — all 11 existing tests pass with no test-file changes, since every accessible name (`getByLabelText`, `getByRole("button", ...)`) is preserved.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/FightPicker
git commit -m "refactor(app): restyle FightPicker with the design system"
```

---

## Task 21: Retrofit `DruidPicker`

**Files:**

- Modify: `src/app/components/DruidPicker/index.tsx`
- Modify: `src/app/components/DruidPicker/index.test.tsx`
- Create: `src/app/components/DruidPicker/index.module.css`

**Interfaces:**

- Produces: `DruidPickerProps` gains a new required `selectedDruidId: number | null` prop (App.tsx, Task 30, passes its existing `selectedDruidId` state through) — this is what lets the chip row show which druid is active, matching the mockup's `border-color: var(--accent-border)` / `background: var(--accent-bg)` active state.

- [ ] **Step 1: Update the component**

Replace the full contents of `src/app/components/DruidPicker/index.tsx` with:

```tsx
import { useEffect } from "react";
import type { DruidCandidate } from "../../../report/druidDetection";
import styles from "./index.module.css";

export interface DruidPickerProps {
  candidates: DruidCandidate[];
  selectedDruidId: number | null;
  onSelect: (druidId: number) => void;
}

export function DruidPicker({
  candidates,
  selectedDruidId,
  onSelect,
}: DruidPickerProps) {
  const soleCandidateId = candidates.length === 1 ? candidates[0].id : null;

  useEffect(() => {
    if (soleCandidateId !== null) onSelect(soleCandidateId);
  }, [soleCandidateId, onSelect]);

  if (candidates.length === 0) {
    return <p>No resto druids detected in this report.</p>;
  }

  if (candidates.length === 1) {
    return null;
  }

  return (
    <div className={styles.row}>
      {candidates.map((candidate) => {
        const active = candidate.id === selectedDruidId;
        const label = candidate.isRestoSpec
          ? `${candidate.name} — Restoration (${candidate.healingCastCount} heals)`
          : `${candidate.name} (${candidate.healingCastCount} heal casts)`;
        return (
          <label
            key={candidate.id}
            className={`${styles.chip} ${active ? styles.active : ""}`}
          >
            <input
              type="radio"
              name="druid"
              checked={active}
              onChange={() => onSelect(candidate.id)}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
```

`src/app/components/DruidPicker/index.module.css`:

```css
.row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-small-size);
  cursor: pointer;
}
.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}
```

- [ ] **Step 2: Update the test file to pass the new required prop**

Replace the full contents of `src/app/components/DruidPicker/index.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DruidPicker } from "./index";
import type { DruidCandidate } from "../../../report/druidDetection";

const dassz: DruidCandidate = {
  id: 2,
  name: "Dassz",
  healingCastCount: 1652,
  isRestoSpec: true,
};
const maoqi: DruidCandidate = {
  id: 4,
  name: "Maoqi",
  healingCastCount: 40,
  isRestoSpec: false,
};

describe("DruidPicker", () => {
  it("shows an informational message when there are no candidates", () => {
    render(
      <DruidPicker candidates={[]} selectedDruidId={null} onSelect={vi.fn()} />,
    );
    expect(
      screen.getByText("No resto druids detected in this report."),
    ).toBeInTheDocument();
  });

  it("auto-selects the sole candidate without rendering a picker", () => {
    const onSelect = vi.fn();
    render(
      <DruidPicker
        candidates={[dassz]}
        selectedDruidId={null}
        onSelect={onSelect}
      />,
    );
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("renders a radio option per candidate when there are multiple", () => {
    render(
      <DruidPicker
        candidates={[dassz, maoqi]}
        selectedDruidId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Dassz/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Maoqi/)).toBeInTheDocument();
  });

  it("shows a Restoration badge only for candidates WCL labeled as such", () => {
    render(
      <DruidPicker
        candidates={[dassz, maoqi]}
        selectedDruidId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Dassz/)).toHaveAccessibleName(/Restoration/);
    expect(screen.getByLabelText(/Maoqi/)).not.toHaveAccessibleName(
      /Restoration/,
    );
  });

  it("calls onSelect with the chosen druid's id when a radio option is picked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DruidPicker
        candidates={[dassz, maoqi]}
        selectedDruidId={null}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByLabelText(/Maoqi/));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("marks the candidate matching selectedDruidId as checked", () => {
    render(
      <DruidPicker
        candidates={[dassz, maoqi]}
        selectedDruidId={4}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Maoqi/)).toBeChecked();
    expect(screen.getByLabelText(/Dassz/)).not.toBeChecked();
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run src/app/components/DruidPicker --no-coverage`
Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/components/DruidPicker
git commit -m "refactor(app): restyle DruidPicker and make its selection controlled"
```

---

## Task 22: Retrofit `GCDUtilizationCard`

**Files:**

- Modify: `src/app/components/GCDUtilizationCard/index.tsx`
- Modify: `src/app/components/GCDUtilizationCard/index.test.tsx`
- Create: `src/assets/spell-icons/instantcast.jpg` (copied)

**Interfaces:**

- Consumes: `MetricCard` (Task 16).
- Produces: same `GCDUtilizationCardProps` contract — fetch/compute logic (`computeGcdUtilization`) is untouched. The rendered `<h3>` is now the metric title ("GCD utilization"), not the fight name — the fight name is dropped from this component entirely since `Scorecard` (Task 29) owns the fight-level heading.

- [ ] **Step 1: Copy the icon asset**

```bash
mkdir -p src/assets/spell-icons
cp docs/design/assets/spell-icons/instantcast.jpg src/assets/spell-icons/instantcast.jpg
```

- [ ] **Step 2: Replace the render output**

Replace the full contents of `src/app/components/GCDUtilizationCard/index.tsx` with:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeGcdUtilization,
  type GcdUtilizationResult,
} from "../../../metrics/gcdUtilization";
import { formatDuration } from "../../../report/fightRows";
import { MetricCard } from "../ui/MetricCard";
import instantcastIcon from "../../../assets/spell-icons/instantcast.jpg";

export interface GCDUtilizationCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: GcdUtilizationResult }
  | { accessToken: string; error: string };

export function GCDUtilizationCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GCDUtilizationCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const computed = computeGcdUtilization(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate GCD utilization.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) return <p>Calculating…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  const { utilizationPct, activeTimeMs, judgement } = result.result;

  return (
    <MetricCard
      icon={instantcastIcon}
      title="GCD utilization"
      value={`${Math.round(utilizationPct)}%`}
      pct={Math.min(100, utilizationPct)}
      judgement={judgement}
      threshold="Green ≥ 85%, orange 70–85%, red < 70%. ~40 casts/min is the theoretical ceiling at 0% haste (60s ÷ 1.5s GCD) — 100% is not a realistic target, just the ceiling the percentage is measured against."
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        Time spent on the global cooldown (1.5s per instant, actual cast time
        for cast-time spells) as a share of total fight duration. Active time
        this fight: {formatDuration(activeTimeMs)}.
      </p>
    </MetricCard>
  );
}
```

- [ ] **Step 3: Update the test file**

Replace the full contents of `src/app/components/GCDUtilizationCard/index.test.tsx` with:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GCDUtilizationCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("GCDUtilizationCard", () => {
  it("renders the computed active time and GCD utilization once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 10000,
    });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("30%")).toBeInTheDocument());
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(
      screen.getByText(/Active time this fight: 0:03/),
    ).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <GCDUtilizationCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/GCDUtilizationCard --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GCDUtilizationCard src/assets/spell-icons/instantcast.jpg
git commit -m "refactor(app): render GCDUtilizationCard through MetricCard"
```

---

## Task 23: Retrofit `IdleGapsCard`

**Files:**

- Modify: `src/app/components/IdleGapsCard/index.tsx`
- Modify: `src/app/components/IdleGapsCard/index.test.tsx`

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `instantcastIcon` asset (copied in Task 22).

- [ ] **Step 1: Replace the render output**

Replace the full contents of `src/app/components/IdleGapsCard/index.tsx` with:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeIdleGaps,
  type IdleGapsResult,
} from "../../../metrics/idleGaps";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import instantcastIcon from "../../../assets/spell-icons/instantcast.jpg";

export interface IdleGapsCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: IdleGapsResult }
  | { accessToken: string; error: string };

export function IdleGapsCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: IdleGapsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const computed = computeIdleGaps(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate idle gaps.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) return <p>Calculating…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  const { deadTimePct, totalDeadTimeMs, gaps, longestGaps, judgement } =
    result.result;

  return (
    <MetricCard
      icon={instantcastIcon}
      title="Idle gaps"
      value={`${Math.round(deadTimePct)}% dead time`}
      pct={Math.min(100, deadTimePct)}
      judgement={judgement}
      threshold="Green < 5%, orange 5–15%, red > 15% of fight duration, measured as total dead time as a share of the fight."
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        Every gap &gt; 1.7s between your casts, measured from end-of-GCD to next
        cast start. Total dead time: {formatDuration(totalDeadTimeMs)} (
        {gaps.length} gap{gaps.length === 1 ? "" : "s"}).
      </p>
      {longestGaps.length > 0 && (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {longestGaps.map((gap) => (
            <li key={gap.startMs}>
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  gap.startMs,
                  gap.endMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(gap.startMs - fight.startTime)} for{" "}
                {formatDuration(gap.durationMs)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 2: Update the test file**

Replace the full contents of `src/app/components/IdleGapsCard/index.test.tsx` with:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdleGapsCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("IdleGapsCard", () => {
  it("renders total dead time, judgement, and the longest gaps once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 100000,
    });
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("4% dead time")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(
      screen.getByText(/Total dead time: 0:04 \(1 gap\)/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "0:02 for 0:04" });
    expect(link).toHaveAttribute(
      "href",
      "https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8#fight=6&type=summary&start=1500&end=5000",
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run src/app/components/IdleGapsCard --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/components/IdleGapsCard
git commit -m "refactor(app): render IdleGapsCard through MetricCard"
```

---

## Task 24: Retrofit `LB3UptimeCard`

**Files:**

- Modify: `src/app/components/LB3UptimeCard/index.tsx`
- Modify: `src/app/components/LB3UptimeCard/index.test.tsx`
- Create: `src/assets/spell-icons/lifebloom.jpg` (copied)

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `JudgementChip` (Task 8), `ProgressBar` (Task 9).

- [ ] **Step 1: Copy the icon asset**

```bash
cp docs/design/assets/spell-icons/lifebloom.jpg src/assets/spell-icons/lifebloom.jpg
```

- [ ] **Step 2: Replace the render output**

Replace the full contents of `src/app/components/LB3UptimeCard/index.tsx` with:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeLb3Uptime,
  type Lb3UptimeResult,
} from "../../../metrics/lb3Uptime";
import { MetricCard } from "../ui/MetricCard";
import { JudgementChip } from "../ui/JudgementChip";
import { ProgressBar } from "../ui/ProgressBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface LB3UptimeCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: Lb3UptimeResult }
  | { accessToken: string; error: string };

export function LB3UptimeCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: LB3UptimeCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then((events) => {
        const computed = computeLb3Uptime(
          events,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate LB3 uptime.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) return <p>Calculating…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="LB3 uptime per target"
      threshold="Measured from first reaching 3 stacks. Green ≥ 90%, orange 75–90%, red < 75%, per target. Only targets with ≥ 30% overall LB uptime are shown — one-off casts don't count as maintained."
    >
      {result.result.targets.length === 0 ? (
        <p>No maintained targets.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {result.result.targets.map((target) => (
            <div key={target.targetId}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "var(--text-small-size)",
                }}
              >
                <span>
                  {targetNames.get(target.targetId) ??
                    `Target #${target.targetId}`}
                </span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <strong style={{ color: "var(--text-h)" }}>
                    {Math.round(target.lb3UptimePct)}%
                  </strong>
                  <JudgementChip judgement={target.judgement} />
                </span>
              </div>
              <ProgressBar
                pct={Math.min(100, target.lb3UptimePct)}
                judgement={target.judgement}
              />
            </div>
          ))}
        </div>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 3: Update the test file**

Replace the full contents of `src/app/components/LB3UptimeCard/index.test.tsx` with:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LB3UptimeCard } from "./index";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

describe("LB3UptimeCard", () => {
  it("renders per-target LB3 uptime once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 11000,
    });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Fanah"]])}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "LB3 uptime per target" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fanah")).toBeInTheDocument());
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("falls back to a numeric target label when the name is unknown", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 11000 });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Target #42")).toBeInTheDocument(),
    );
  });

  it("shows a message when there are no maintained targets", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No maintained targets.")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/LB3UptimeCard --no-coverage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LB3UptimeCard src/assets/spell-icons/lifebloom.jpg
git commit -m "refactor(app): render LB3UptimeCard through MetricCard"
```

---

## Task 25: `RefreshCadenceCard` (static placeholder for story 202)

**Files:**

- Create: `src/app/components/RefreshCadenceCard/index.tsx`
- Test: `src/app/components/RefreshCadenceCard/index.test.tsx`

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `Histogram` (Task 14), `lifebloomIcon` asset (copied in Task 24).
- Produces: `RefreshCadenceCard` — a zero-prop, presentational-only component rendering the story-202 mock fixture verbatim. Replaced with real computation once story 202 lands.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefreshCadenceCard } from "./index";

describe("RefreshCadenceCard", () => {
  it("renders the static mock refresh-cadence content", () => {
    render(<RefreshCadenceCard />);
    expect(
      screen.getByRole("heading", { name: "Refresh cadence" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Median 6.4s")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/RefreshCadenceCard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/RefreshCadenceCard/index.tsx`:

```tsx
import { MetricCard } from "../ui/MetricCard";
import { Histogram } from "../ui/Histogram";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function RefreshCadenceCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Refresh cadence"
      value="Median 6.4s"
      judgement="green"
      threshold="Green median 6–7s, orange 5–6s, red < 5s. Only refreshes on already-3-stacked targets count. Late cases are judged separately, by the accidental-bloom counter below."
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 4px" }}>
        Interval between your Lifebloom refreshes on 3-stacked targets — too
        early wastes mana and GCDs, too late risks an accidental bloom.
      </p>
      <Histogram
        buckets={[
          {
            label: "Early (< 5.5s)",
            pct: 14,
            color: "var(--judgement-orange)",
          },
          { label: "Ideal (5.5–7s)", pct: 71, color: "var(--judgement-green)" },
          { label: "Late (> 7s)", pct: 15, color: "var(--judgement-red)" },
        ]}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/RefreshCadenceCard --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RefreshCadenceCard
git commit -m "feat(app): add static RefreshCadenceCard placeholder for story 202"
```

---

## Task 26: `AccidentalBloomsCard` (static placeholder for story 203)

**Files:**

- Create: `src/app/components/AccidentalBloomsCard/index.tsx`
- Test: `src/app/components/AccidentalBloomsCard/index.test.tsx`

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `lifebloomIcon` asset.
- Produces: `AccidentalBloomsCard` — zero-prop static placeholder for story 203.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccidentalBloomsCard } from "./index";

describe("AccidentalBloomsCard", () => {
  it("renders the static mock accidental-blooms content", () => {
    render(<AccidentalBloomsCard />);
    expect(
      screen.getByRole("heading", { name: "Accidental blooms" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("2:53 — Offtank")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/AccidentalBloomsCard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/AccidentalBloomsCard/index.tsx`:

```tsx
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function AccidentalBloomsCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Accidental blooms"
      value="1"
      judgement="orange"
      threshold="Green 0, orange 1–2, red ≥ 3 per fight. An accidental bloom is a re-application of Lifebloom on the same target within 3s of it blooming — the stack was rebuilt, not deliberately reset."
    >
      <ul
        style={{
          margin: "0 0 4px",
          paddingLeft: "16px",
          fontSize: "var(--text-small-size)",
        }}
      >
        <li>2:53 — Offtank</li>
      </ul>
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/AccidentalBloomsCard --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AccidentalBloomsCard
git commit -m "feat(app): add static AccidentalBloomsCard placeholder for story 203"
```

---

## Task 27: `RestackTaxCard` (static placeholder for story 204)

**Files:**

- Create: `src/app/components/RestackTaxCard/index.tsx`
- Test: `src/app/components/RestackTaxCard/index.test.tsx`

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `lifebloomIcon` asset.
- Produces: `RestackTaxCard` — zero-prop static placeholder for story 204.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RestackTaxCard } from "./index";

describe("RestackTaxCard", () => {
  it("renders the static mock re-stack-tax content", () => {
    render(<RestackTaxCard />);
    expect(
      screen.getByRole("heading", { name: "Re-stack tax" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 casts · ~2,400 mana")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/RestackTaxCard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/RestackTaxCard/index.tsx`:

```tsx
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function RestackTaxCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Re-stack tax"
      value="3 casts · ~2,400 mana"
      judgement="orange"
      threshold="R/O/G scales with fight length. For a fight this length (5:41), 0–2 re-stack casts is green, 3–5 is orange, 6+ is red. Excludes the opener and each target's first, free ramp."
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: 0 }}>
        Lifebloom casts spent rebuilding a stack that had dropped below 3 — the
        concrete cost of dropped stacks, after the opener.
      </p>
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/RestackTaxCard --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RestackTaxCard
git commit -m "feat(app): add static RestackTaxCard placeholder for story 204"
```

---

## Task 28: `ConcurrentTargetsCard` (static placeholder for story 205)

**Files:**

- Create: `src/app/components/ConcurrentTargetsCard/index.tsx`
- Test: `src/app/components/ConcurrentTargetsCard/index.test.tsx`

**Interfaces:**

- Consumes: `MetricCard` (Task 16), `StackedBar` (Task 15), `lifebloomIcon` asset.
- Produces: `ConcurrentTargetsCard` — zero-prop static placeholder for story 205, the one card with no judgement chip (renders the "Informational — no judgement" note instead).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrentTargetsCard } from "./index";

describe("ConcurrentTargetsCard", () => {
  it("renders the static mock concurrent-targets content with no judgement chip", () => {
    render(<ConcurrentTargetsCard />);
    expect(
      screen.getByRole("heading", { name: "Concurrent LB3 targets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Avg 1.6 · Peak 2")).toBeInTheDocument();
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
    expect(screen.getByText("0 targets — 3%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 41%")).toBeInTheDocument();
    expect(screen.getByText("2 targets — 56%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/ConcurrentTargetsCard/index.tsx`:

```tsx
import { MetricCard } from "../ui/MetricCard";
import { StackedBar } from "../ui/StackedBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export function ConcurrentTargetsCard() {
  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Concurrent LB3 targets"
      value="Avg 1.6 · Peak 2"
      note="Informational — no judgement"
      threshold="No R/O/G — the right number of concurrent targets depends on your assignments, not a universal target."
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        How many targets simultaneously had your LB3, as a share of the fight.
        Maintaining multiple tanks at once is recognized as the skill it is.
      </p>
      <StackedBar
        segments={[
          { label: "0 targets", pct: 3, color: "var(--border)" },
          { label: "1 target", pct: 41, color: "var(--accent-border)" },
          { label: "2 targets", pct: 56, color: "var(--accent)" },
        ]}
      />
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ConcurrentTargetsCard --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ConcurrentTargetsCard
git commit -m "feat(app): add static ConcurrentTargetsCard placeholder for story 205"
```

---

## Task 29: `Scorecard` assembly component

**Files:**

- Create: `src/app/components/Scorecard/index.tsx`
- Create: `src/app/components/Scorecard/index.module.css`
- Test: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `GCDUtilizationCard`, `IdleGapsCard`, `LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `ConcurrentTargetsCard` (Tasks 22–28), `Alert` (Task 10), `Button` (Task 3), `DruidCandidate` type from `src/report/druidDetection.ts`, `buildFightTimeUrl` from `src/report/wclLinks.ts`.
- Produces: `Scorecard` component, `ScorecardProps { accessToken: string; reportCode: string; fight: Fight; druidId: number; druid: DruidCandidate; lifebloomAbilityIds: Set<number>; targetNames: Map<number, string>; fetchEvents: (...) => Promise<WclEvent[]>; onStartOver: () => void }`. `App.tsx` (Task 30) renders one of these per selected fight, each inside its own `Shell width={800}`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Scorecard } from "./index";
import { aFight } from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
};

describe("Scorecard", () => {
  it("renders the fight header, both epic groups, and the footer", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      pull: undefined,
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const onStartOver = vi.fn();
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={101}
        druid={druid}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        onStartOver={onStartOver}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Lady Vashj \(Kill, 5:41\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fernwhisper — Restoration")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "GCD economy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Lifebloom discipline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Refresh cadence" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /can't judge target selection/,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard --no-coverage`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the component**

`src/app/components/Scorecard/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { DruidCandidate } from "../../../report/druidDetection";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { GCDUtilizationCard } from "../GCDUtilizationCard";
import { IdleGapsCard } from "../IdleGapsCard";
import { LB3UptimeCard } from "../LB3UptimeCard";
import { RefreshCadenceCard } from "../RefreshCadenceCard";
import { AccidentalBloomsCard } from "../AccidentalBloomsCard";
import { RestackTaxCard } from "../RestackTaxCard";
import { ConcurrentTargetsCard } from "../ConcurrentTargetsCard";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
  onStartOver: () => void;
}

export function Scorecard({
  accessToken,
  reportCode,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
  onStartOver,
}: ScorecardProps) {
  const outcome =
    fight.kill === true
      ? "Kill"
      : fight.kill === false
        ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
        : "Trash";
  const duration = formatDuration(fight.endTime - fight.startTime);
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} — Restoration`
    : druid.name;

  return (
    <div>
      <h2 className={styles.fightHeading}>
        {fight.name} ({outcome}, {duration})
      </h2>
      <p className={styles.druidLine}>{druidLabel}</p>
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
        <a
          href={buildFightTimeUrl(
            reportCode,
            fight.id,
            0,
            fight.endTime - fight.startTime,
          )}
          target="_blank"
          rel="noreferrer"
        >
          View on Warcraft Logs →
        </a>
      </p>

      <h2>GCD economy</h2>
      <div className={styles.group}>
        <GCDUtilizationCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          fetchEvents={fetchEvents}
        />
        <IdleGapsCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          fetchEvents={fetchEvents}
        />
      </div>

      <h2>Lifebloom discipline</h2>
      <div className={styles.group}>
        <LB3UptimeCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          lifebloomAbilityIds={lifebloomAbilityIds}
          targetNames={targetNames}
          fetchEvents={fetchEvents}
        />
        <RefreshCadenceCard />
        <AccidentalBloomsCard />
        <RestackTaxCard />
        <ConcurrentTargetsCard />
      </div>

      <div className={styles.footer}>
        <Alert tone="warning">
          This scorecard can&apos;t judge target selection, assignment
          adherence, or positioning — only your process.
        </Alert>
      </div>
      <div className={styles.startOver}>
        <Button variant="secondary" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </div>
  );
}
```

`src/app/components/Scorecard/index.module.css`:

```css
.fightHeading {
  margin-top: 0;
}
.druidLine {
  color: var(--text);
  margin-bottom: var(--space-1);
}
.reportLine {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-bottom: var(--space-6);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.footer {
  margin-top: var(--space-6);
}
.startOver {
  margin-top: var(--space-5);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard
git commit -m "feat(app): add Scorecard assembly component for story 701"
```

---

## Task 30: `App.tsx` — single-screen-at-a-time restructure

**Files:**

- Modify: `src/App.tsx`
- Delete: `src/App.css` (unused — never imported by `main.tsx`)
- Create: `src/App.module.css`
- Modify: `test/e2e/smoke.spec.ts` (verify only — see Step 3)

**Interfaces:**

- Consumes every component from Tasks 3–29: `Shell`, `Field`, `Input`, `Button`, `Alert`, `ReportInput`, `ConnectPanel`, `AbilityResolver`, `FightPicker`, `DruidDetector`, `DruidPicker`, `Scorecard`, plus the `src/assets/logo/lifebloom.jpg` asset from Task 2.

- [ ] **Step 1: Delete the unused App.css**

```bash
git rm src/App.css
```

- [ ] **Step 2: Replace App.tsx**

Replace the full contents of `src/App.tsx` with:

```tsx
import { useCallback, useMemo, useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  type ReportFights,
  type CastTableEntry,
} from "./wcl/client";
import { createEventFetcher } from "./wcl/eventCache";
import {
  resolveSpellAbilityIds,
  type ResolvedAbility,
} from "./abilities/resolveAbilities";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import { AbilityResolver } from "./app/components/AbilityResolver";
import { Scorecard } from "./app/components/Scorecard";
import { Shell } from "./app/components/ui/Shell";
import { Field } from "./app/components/ui/Field";
import { Input } from "./app/components/ui/Input";
import { Button } from "./app/components/ui/Button";
import { Alert } from "./app/components/ui/Alert";
import type { DruidCandidate } from "./report/druidDetection";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [selectedFightIds, setSelectedFightIds] = useState<number[]>([]);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [selectedDruidId, setSelectedDruidId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [scorecardRequested, setScorecardRequested] = useState(false);
  const [eventFetcher] = useState(() => createEventFetcher());

  function resetReportState() {
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setResolvedAbilities(null);
    setScorecardRequested(false);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    resetReportState();
  }

  function handleStartOver() {
    setReport(null);
    resetReportState();
  }

  const handleEntriesLoaded = useCallback((entries: CastTableEntry[]) => {
    setActorNames(new Map(entries.map((e) => [e.id, e.name])));
  }, []);

  const lifebloomAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Lifebloom")
        : null,
    [resolvedAbilities],
  );

  const selectedDruid =
    druidCandidates?.find((d) => d.id === selectedDruidId) ?? null;

  const canGetScorecard =
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    selectedFightIds.length > 0;

  return (
    <>
      {!accessToken && (
        <Shell>
          <div className={styles.connectHeader}>
            <img src={logo} width={40} height={40} alt="" />
            <h1>Bloomwatch</h1>
          </div>
          <p className={styles.tagline}>
            Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
            scorecard that judges your process — not another parse percentile
            that healing, being zero-sum, can&apos;t fairly measure.
          </p>
          <Field label="WCL Client ID">
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Paste your Client ID"
            />
          </Field>
          <Button onClick={connect}>Connect</Button>
          {authError && <Alert tone="warning">{authError}</Alert>}
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.
          </p>
        </Shell>
      )}

      {accessToken && !loadedReport && (
        <Shell>
          <ReportInput onSubmit={handleReportSubmit} />
          {report && (
            <ConnectPanel
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchReportFights={fetchReportFights}
              onReportLoaded={setLoadedReport}
            />
          )}
          {report && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={fetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}
        </Shell>
      )}

      {accessToken && report && loadedReport && !scorecardRequested && (
        <Shell>
          <h2>{loadedReport.title}</h2>
          <FightPicker
            fights={loadedReport.fights}
            initialFightId={report.fightId}
            onSelectionChange={setSelectedFightIds}
          />
          <DruidDetector
            accessToken={accessToken}
            reportCode={report.reportCode}
            fightIds={loadedReport.fights.map((f) => f.id)}
            fetchCastsTable={fetchCastsTable}
            onDruidsDetected={setDruidCandidates}
            onEntriesLoaded={handleEntriesLoaded}
          />
          {druidCandidates !== null && (
            <div className={styles.druidSection}>
              <h3>Druid</h3>
              <DruidPicker
                candidates={druidCandidates}
                selectedDruidId={selectedDruidId}
                onSelect={setSelectedDruidId}
              />
            </div>
          )}
          <Button
            disabled={!canGetScorecard}
            onClick={() => setScorecardRequested(true)}
          >
            Get scorecard
          </Button>
        </Shell>
      )}

      {accessToken &&
        report &&
        loadedReport &&
        scorecardRequested &&
        selectedDruid !== null &&
        lifebloomAbilityIds !== null &&
        loadedReport.fights
          .filter((f) => selectedFightIds.includes(f.id))
          .map((f) => (
            <Shell width={800} key={f.id}>
              <Scorecard
                accessToken={accessToken}
                reportCode={report.reportCode}
                fight={f}
                druidId={selectedDruid.id}
                druid={selectedDruid}
                lifebloomAbilityIds={lifebloomAbilityIds}
                targetNames={actorNames}
                fetchEvents={eventFetcher.fetchEvents}
                onStartOver={handleStartOver}
              />
            </Shell>
          ))}
    </>
  );
}

export default App;
```

- [ ] **Step 3: Create App.module.css**

`src/App.module.css`:

```css
.connectHeader {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.connectHeader img {
  border-radius: 4px;
}
.tagline {
  margin-bottom: var(--space-6);
}
.connectFooter {
  margin-top: var(--space-5);
  font-size: var(--text-small-size);
  color: var(--text);
}
.druidSection {
  margin-bottom: var(--space-6);
}
```

- [ ] **Step 4: Update `#root`'s global styling to stop double-bordering the new Shell**

In `src/index.css`, change:

```css
#root {
  width: 1126px;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
  border-inline: 1px solid var(--border);
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
```

to:

```css
#root {
  max-width: 100%;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
```

(The bordered-column look now comes from `Shell`, not `#root` — `#root` just centers whichever `Shell` is currently on screen.)

- [ ] **Step 5: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass (every component test from Tasks 3–29, plus any other pre-existing suite untouched by this plan, e.g. `src/metrics/*.test.ts`, `src/report/*.test.ts`, `src/wcl/*.test.ts`).

- [ ] **Step 6: Manually verify the flow in a browser**

Run: `npm run dev`, open `http://localhost:5173/bloomwatch/`. Confirm:

- Connect screen shows the logo, tagline, "WCL Client ID" field (no "optional" language), Connect button, footer note, inside a single bordered 760px column.
- After connecting (needs a real WCL Client ID) and pasting a report, only the "Load a report" screen is visible until the report loads, then only the "Pick fights & druid" screen is visible.
- Selecting fights/a druid enables "Get scorecard"; clicking it swaps to the Scorecard screen(s) (800px wide), one per selected fight, each showing GCD economy + Lifebloom discipline groups (with the 4 static placeholder cards).
- "Start over" returns to the "Load a report" screen (not Connect) with a blank report field.

Stop the dev server after confirming.

- [ ] **Step 7: Check whether the Playwright e2e smoke test still passes (only if a live token is available)**

Run: `set -a; source .env.local; set +a; npm run test:e2e` (skips automatically per `test.skip(!accessToken, ...)` if `WCL_TEST_ACCESS_TOKEN` isn't set in `.env.local`).
Expected: PASS if a token is configured (the test's label/button-name assertions — "Report URL or code", "Load report", "Pull \\d+" checkboxes — are all preserved by this plan); otherwise it reports skipped, which is fine.

- [ ] **Step 8: Run full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three succeed with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(app): move App.tsx to single-screen-at-a-time with the new design system"
```

---

## Final check

After Task 30, run the complete verification suite once more:

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: everything green. This confirms all 30 tasks compose correctly end-to-end.
