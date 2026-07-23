# Judgement rollup breakdown tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user hover/focus/tap a judgement-bucket segment (e.g. "2 fair") in the
`ReportDashboard` epic chip strip to see, and click through to, exactly which fights it refers
to.

**Architecture:** A new hand-rolled, generic `Popover` UI primitive (hover + keyboard-focus +
click/tap, no external positioning library) wraps each interactive breakdown segment.
`rollupEpicJudgement` (`src/metrics/reportAggregation.ts`) grows a fight-identity companion to
its existing counts so the popover has something to list. A new `onOpenFightEpic` navigation
callback threads from `App.tsx` down to the popover's links so clicking a boss name jumps
straight to that fight's scorecard with the right epic focused.

**Tech Stack:** React 19 + TypeScript, CSS Modules, Vitest + React Testing Library
(`@testing-library/user-event`).

## Global Constraints

- No em dashes in any user-visible text (labels, headings, tooltips, error messages) —
  CLAUDE.md principle 6.
- No developer/planning vocabulary ("epic", "story", backlog numbers, etc.) anywhere a user
  can see it — CLAUDE.md principle 5. (This plan's own file may use that vocabulary freely;
  the UI code and its rendered text may not.)
- No new npm dependency — the project has no positioning/tooltip library today, and this
  feature must not introduce one (spec's non-goals).
- Commits follow Conventional Commits: `type(scope): summary` — use scope `judgements` for
  every commit in this plan, per CLAUDE.md.
- Do not bypass the pre-commit hook (`npm run typecheck && npm run lint && npm run
format:check` runs on every commit, full-project, not scoped to changed files).
- Every new/changed file must pass `npm run typecheck`, `npm run lint`, and `npm run
format:check` before committing — run `npx prettier --write <file>` if the pre-commit hook's
  `format:check` step flags formatting (it runs in check-only mode and will fail the commit
  rather than fixing it for you).

---

### Task 1: `EpicRollup` carries fight identity, not just counts

**Files:**

- Modify: `src/metrics/reportAggregation.ts:36-70`
- Test: `src/metrics/reportAggregation.test.ts:51-90`

**Interfaces:**

- Consumes: nothing new — this task only changes `rollupEpicJudgement`'s own input/output
  shape.
- Produces (for Task 4 to consume):

  ```ts
  export interface EpicRollup {
    judgement: Judgement;
    breakdown: Record<Judgement, number>;
    fights: Record<Judgement, { fightId: number; label: string }[]>;
  }

  export function rollupEpicJudgement(
    entries: {
      status: EpicSummaryStatus;
      weightMs: number;
      fightId: number;
      label: string;
    }[],
  ): EpicRollup | null;
  ```

  `entries` gained two new required fields (`fightId`, `label`) versus today's `{ status,
weightMs }`. `fights` groups every _ready_ entry's `{fightId, label}` by its own judgement,
  in the same order the entries were given (loading/errored entries are excluded, exactly like
  `breakdown` already excludes them today).

- [ ] **Step 1: Update the two existing `rollupEpicJudgement` tests to the new entry/return
      shape (still red until Step 3)**

  Replace the whole `describe("rollupEpicJudgement", ...)` block in
  `src/metrics/reportAggregation.test.ts` with:

  ```ts
  describe("rollupEpicJudgement", () => {
    it("returns null when nothing has resolved yet", () => {
      expect(
        rollupEpicJudgement([
          { status: loading, weightMs: 1000, fightId: 1, label: "Boss A" },
          { status: loading, weightMs: 1000, fightId: 2, label: "Boss B" },
        ]),
      ).toBeNull();
    });

    it("ignores not-yet-ready and errored entries, aggregating only the ready ones", () => {
      // Both good and bad are present among the ready entries, so the
      // fair-override in weightedMedianJudgement applies regardless of
      // which dominates by duration.
      expect(
        rollupEpicJudgement([
          { status: good, weightMs: 9000, fightId: 1, label: "Boss A" },
          { status: loading, weightMs: 9000, fightId: 2, label: "Boss B" },
          { status: errored, weightMs: 9000, fightId: 3, label: "Boss C" },
          { status: bad, weightMs: 1000, fightId: 4, label: "Boss D" },
        ]),
      ).toEqual({
        judgement: "fair",
        breakdown: { good: 1, fair: 0, bad: 1 },
        fights: {
          good: [{ fightId: 1, label: "Boss A" }],
          fair: [],
          bad: [{ fightId: 4, label: "Boss D" }],
        },
      });
    });

    it("reports fair, not a worst-of or a pure weighted median, when both good and bad fights are present", () => {
      expect(
        rollupEpicJudgement([
          { status: good, weightMs: 8000, fightId: 1, label: "Boss A" },
          { status: good, weightMs: 8000, fightId: 2, label: "Boss B" },
          { status: bad, weightMs: 1000, fightId: 3, label: "Boss C" },
        ]),
      ).toEqual({
        judgement: "fair",
        breakdown: { good: 2, fair: 0, bad: 1 },
        fights: {
          good: [
            { fightId: 1, label: "Boss A" },
            { fightId: 2, label: "Boss B" },
          ],
          fair: [],
          bad: [{ fightId: 3, label: "Boss C" }],
        },
      });
    });
  });
  ```

- [ ] **Step 2: Run the tests to confirm they fail on the new shape**

  Run: `npx vitest run src/metrics/reportAggregation.test.ts`
  Expected: FAIL — type error or assertion mismatch (`fights` missing from the actual value,
  and/or a TS error on the new `fightId`/`label` fields not existing on the old entry type).

- [ ] **Step 3: Update `rollupEpicJudgement` and `EpicRollup`**

  In `src/metrics/reportAggregation.ts`, replace lines 36-70 (the `EpicRollup` interface and
  `rollupEpicJudgement` function, plus its doc comment) with:

  ```ts
  export interface EpicRollup {
    judgement: Judgement;
    breakdown: Record<Judgement, number>;
    fights: Record<Judgement, { fightId: number; label: string }[]>;
  }

  // One epic's judgement across every fight in the report -> a single strip
  // chip, plus how many fights landed in each bucket (story 904) and which
  // fights those are (judgement rollup breakdown tooltip) so a user can
  // still see, and jump to, what drove the result even though the headline
  // is a duration-weighted median rather than a raw worst-of. Progressive:
  // counts only fights whose this-epic summary has resolved so far,
  // ignoring ones still loading or errored, so the chip can appear before
  // the whole report finishes computing and can only get more accurate as
  // more fights resolve.
  export function rollupEpicJudgement(
    entries: {
      status: EpicSummaryStatus;
      weightMs: number;
      fightId: number;
      label: string;
    }[],
  ): EpicRollup | null {
    const ready = entries.filter(
      (
        e,
      ): e is {
        status: Extract<EpicSummaryStatus, { status: "ready" }>;
        weightMs: number;
        fightId: number;
        label: string;
      } => e.status.status === "ready",
    );
    if (ready.length === 0) return null;
    const judgement = weightedMedianJudgement(
      ready.map((e) => ({
        judgement: e.status.judgement,
        weightMs: e.weightMs,
      })),
    );
    if (judgement === null) return null;
    const fights: Record<Judgement, { fightId: number; label: string }[]> = {
      good: [],
      fair: [],
      bad: [],
    };
    for (const e of ready) {
      fights[e.status.judgement].push({ fightId: e.fightId, label: e.label });
    }
    return {
      judgement,
      breakdown: judgementBreakdown(
        ready.map((e) => ({ judgement: e.status.judgement })),
      ),
      fights,
    };
  }
  ```

- [ ] **Step 4: Run the tests to confirm they pass**

  Run: `npx vitest run src/metrics/reportAggregation.test.ts`
  Expected: PASS (all tests in the file).

- [ ] **Step 5: Typecheck**

  Run: `npm run typecheck`
  Expected: no errors. (This will surface `ReportDashboard/index.tsx`'s now-outdated call to
  `rollupEpicJudgement` with the old two-field entry shape — that's expected and fixed in
  Task 4, not here. If `tsc -b`'s project-reference build fails the whole command because of
  that downstream error, that's fine; just confirm the error is specifically in
  `ReportDashboard/index.tsx` about the missing `fightId`/`label` fields, not somewhere in
  `reportAggregation.ts` or its test.)

- [ ] **Step 6: Commit**

  ```bash
  git add src/metrics/reportAggregation.ts src/metrics/reportAggregation.test.ts
  git commit -m "feat(judgements): carry fight identity through epic rollup breakdown"
  ```

---

### Task 2: `formatFightLabel` shared helper

**Files:**

- Modify: `src/report/fightRows.ts`
- Test: `src/report/fightRows.test.ts`

**Interfaces:**

- Consumes: `Fight` type (already imported in `fightRows.ts`).
- Produces (for Task 4 to consume):

  ```ts
  export function formatFightLabel(
    fight: Fight,
    pullNumber: number | null,
  ): string;
  ```

  Returns `fight.name` when `pullNumber` is `null`, otherwise `` `Pull ${pullNumber} · ${fight.name}` ``
  — byte-for-byte what `ReportDashboard`'s `FightRow` already computes inline today
  (`ReportDashboard/index.tsx:172-173`), extracted so both the fight-row label and the new
  popover's boss-name links render identical text for the same fight.

- [ ] **Step 1: Write the failing test**

  Add to `src/report/fightRows.test.ts` (new `describe` block, after the existing
  `describe("buildFightRows", ...)` block):

  ```ts
  describe("formatFightLabel", () => {
    it("returns the plain boss name when there's no pull number", () => {
      const fight = aFight({ name: "Lady Vashj" });
      expect(formatFightLabel(fight, null)).toBe("Lady Vashj");
    });

    it("prefixes the pull number when one is given", () => {
      const fight = aFight({ name: "Lady Vashj" });
      expect(formatFightLabel(fight, 2)).toBe("Pull 2 · Lady Vashj");
    });
  });
  ```

  Update the file's top import to:

  ```ts
  import {
    buildFightRows,
    formatDuration,
    formatFightLabel,
  } from "./fightRows";
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/report/fightRows.test.ts`
  Expected: FAIL — `formatFightLabel` is not exported.

- [ ] **Step 3: Implement `formatFightLabel`**

  In `src/report/fightRows.ts`, add after `formatDuration` (end of file):

  ```ts
  export function formatFightLabel(
    fight: Fight,
    pullNumber: number | null,
  ): string {
    return pullNumber === null
      ? fight.name
      : `Pull ${pullNumber} · ${fight.name}`;
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/report/fightRows.test.ts`
  Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

  ```bash
  git add src/report/fightRows.ts src/report/fightRows.test.ts
  git commit -m "feat(judgements): extract shared fight-row label formatter"
  ```

---

### Task 3: `Popover` UI primitive

**Files:**

- Create: `src/app/components/ui/Popover/index.tsx`
- Create: `src/app/components/ui/Popover/index.module.css`
- Test: `src/app/components/ui/Popover/index.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks — fully self-contained, generic.
- Produces (for Task 4 to consume):

  ```ts
  export interface PopoverProps {
    triggerLabel: ReactNode;
    triggerClassName?: string;
    children: ReactNode;
  }
  export function Popover(props: PopoverProps): JSX.Element;
  ```

  Renders a `<button>` trigger (always carrying the primitive's own reset styles, plus
  `triggerClassName` appended if given) and, when open, a positioned content panel containing
  `children`. Opens on mouse hover, keyboard focus, or click/tap on the trigger; closes on
  mouse-leave, blur (to somewhere outside the popover), Escape, or a click/tap outside its own
  DOM subtree.

- [ ] **Step 1: Write the failing tests**

  Create `src/app/components/ui/Popover/index.test.tsx`:

  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it } from "vitest";
  import { Popover } from "./index";

  describe("Popover", () => {
    it("is closed by default", () => {
      render(
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>,
      );
      expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "2 fair" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("opens on hover and closes on unhover", async () => {
      const user = userEvent.setup();
      render(
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>,
      );
      const trigger = screen.getByRole("button", { name: "2 fair" });

      await user.hover(trigger);
      expect(screen.getByText("Boss A")).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.unhover(trigger);
      expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
    });

    it("opens on keyboard focus and closes when focus moves elsewhere", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Popover triggerLabel="2 fair">
            <span>Boss A</span>
          </Popover>
          <button type="button">Elsewhere</button>
        </>,
      );

      await user.tab();
      expect(screen.getByText("Boss A")).toBeInTheDocument();

      await user.tab();
      expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
    });

    it("opens on click, for touch devices with no hover", async () => {
      const user = userEvent.setup();
      render(
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>,
      );
      const trigger = screen.getByRole("button", { name: "2 fair" });

      await user.click(trigger);
      expect(screen.getByText("Boss A")).toBeInTheDocument();
    });

    it("closes when clicking outside the popover", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Popover triggerLabel="2 fair">
            <span>Boss A</span>
          </Popover>
          <button type="button">Outside</button>
        </>,
      );

      await user.click(screen.getByRole("button", { name: "2 fair" }));
      expect(screen.getByText("Boss A")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Outside" }));
      expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
    });

    it("closes on Escape", async () => {
      const user = userEvent.setup();
      render(
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>,
      );

      await user.click(screen.getByRole("button", { name: "2 fair" }));
      expect(screen.getByText("Boss A")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run src/app/components/ui/Popover/index.test.tsx`
  Expected: FAIL — `./index` doesn't exist yet.

- [ ] **Step 3: Implement `Popover`**

  Create `src/app/components/ui/Popover/index.module.css`:

  ```css
  .container {
    position: relative;
    display: inline-block;
  }

  .trigger {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .content {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 20;
    margin-top: var(--space-1);
    min-width: 160px;
    max-width: 280px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-small-size);
  }

  .content.above {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: var(--space-1);
  }
  ```

  Create `src/app/components/ui/Popover/index.tsx`:

  ```tsx
  import {
    useEffect,
    useLayoutEffect,
    useId,
    useRef,
    useState,
    type FocusEvent,
    type ReactNode,
  } from "react";
  import styles from "./index.module.css";

  export interface PopoverProps {
    triggerLabel: ReactNode;
    triggerClassName?: string;
    children: ReactNode;
  }

  // Hand-rolled hover/focus/tap popover (the project has no positioning
  // library dependency) — one interaction model composes mouse, keyboard,
  // and touch input rather than branching on device type. See
  // docs/specs/judgement-rollup-tooltip-design.md.
  export function Popover({
    triggerLabel,
    triggerClassName,
    children,
  }: PopoverProps) {
    const [open, setOpen] = useState(false);
    const [placeAbove, setPlaceAbove] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const contentId = useId();

    useLayoutEffect(() => {
      if (!open) {
        setPlaceAbove(false);
        return;
      }
      const content = contentRef.current;
      if (!content) return;
      setPlaceAbove(
        content.getBoundingClientRect().bottom > window.innerHeight,
      );
    }, [open]);

    useEffect(() => {
      if (!open) return;
      function handlePointerDown(event: MouseEvent | TouchEvent) {
        if (!containerRef.current?.contains(event.target as Node)) {
          setOpen(false);
        }
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      }
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("touchstart", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("touchstart", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open]);

    function handleBlur(event: FocusEvent<HTMLDivElement>) {
      if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
        setOpen(false);
      }
    }

    // onClick always sets true, never toggles: a real click (mouse or touch,
    // which synthesizes a full mouse-event sequence) always fires mouseenter
    // immediately before click, so a toggle would open-then-instantly-close
    // on every tap. Closing is handled entirely by mouseleave/blur/Escape/
    // outside-click below.
    return (
      <div
        ref={containerRef}
        className={styles.container}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={handleBlur}
      >
        <button
          type="button"
          className={
            triggerClassName
              ? `${styles.trigger} ${triggerClassName}`
              : styles.trigger
          }
          aria-expanded={open}
          aria-controls={contentId}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
        >
          {triggerLabel}
        </button>
        {open && (
          <div
            ref={contentRef}
            id={contentId}
            className={
              placeAbove ? `${styles.content} ${styles.above}` : styles.content
            }
          >
            {children}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run src/app/components/ui/Popover/index.test.tsx`
  Expected: PASS (all 6 tests).

- [ ] **Step 5: Typecheck, lint, format**

  Run: `npm run typecheck && npm run lint && npx prettier --check src/app/components/ui/Popover`
  Expected: no errors. If Prettier flags formatting, run
  `npx prettier --write src/app/components/ui/Popover` and re-check.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/components/ui/Popover
  git commit -m "feat(judgements): add generic hover/focus/tap Popover primitive"
  ```

---

### Task 4: Wire the interactive breakdown into `ReportDashboard`

**Files:**

- Modify: `src/app/components/ReportDashboard/index.tsx`
- Modify: `src/app/components/ReportDashboard/index.module.css`
- Test: `src/app/components/ReportDashboard/index.test.tsx`

**Interfaces:**

- Consumes:
  - `EpicRollup` / `rollupEpicJudgement` from Task 1 (`src/metrics/reportAggregation.ts`) — now
    returns `{ judgement, breakdown, fights }` and requires `fightId`/`label` per entry.
  - `formatFightLabel(fight: Fight, pullNumber: number | null): string` from Task 2
    (`src/report/fightRows.ts`).
  - `Popover` from Task 3 (`src/app/components/ui/Popover`), props
    `{ triggerLabel: ReactNode; triggerClassName?: string; children: ReactNode }`.
- Produces (for Task 5 to consume):
  - New required prop on `ReportDashboardProps`:
    `onOpenFightEpic: (fightId: number, epicId: EpicId) => void;`

- [ ] **Step 1: Write the failing tests**

  In `src/app/components/ReportDashboard/index.test.tsx`:

  1. Add `import { within } from "@testing-library/react";` to the existing
     `@testing-library/react` import (change line 1 to
     `import { render, screen, waitFor, within } from "@testing-library/react";`).
  2. Add `onOpenFightEpic: vi.fn(),` to the `baseProps` object (after the existing
     `onSelectEpic: vi.fn(),` line).
  3. Add two new tests at the end of the file's `describe("ReportDashboard", ...)` block,
     after the existing `"shows a fight-count breakdown next to each aggregate chip..."` test:

  ```tsx
  it("keeps a single-bucket breakdown as plain text, not an interactive control", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    // A single fight means every chip's breakdown is single-bucket ("1
    // good"/"1 fair"/"1 bad") — none should render as an interactive
    // control, per the "only 2+ buckets are interactive" rule.
    expect(
      screen.queryAllByRole("button", { name: /^\d+ (good|fair|bad)$/ }),
    ).toHaveLength(0);
  });

  it("lists the bosses behind each judgement bucket in a popover, and clicking one navigates to that fight's scorecard with the right epic", async () => {
    const cleanFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const deadlyFight = aFight({
      id: 2,
      name: "Leotheras the Blind",
      kill: true,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      if (dataType === "Casts") {
        return Promise.resolve([
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
        ]);
      }
      if (fight.id === 2 && dataType === "Buffs") {
        return Promise.resolve([
          anApplyBuffEvent({
            sourceID: 101,
            targetID: 55,
            abilityGameID: 33763,
            timestamp: deadlyFight.startTime,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Deaths") {
        return Promise.resolve([
          aDeathEvent({
            targetID: 55,
            timestamp: deadlyFight.startTime + 10000,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "CombatantInfo") {
        return Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 101,
            talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
          }),
        ]);
      }
      return Promise.resolve([]);
    };
    const onOpenFightEpic = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={[cleanFight, deadlyFight]}
        fetchEvents={fetchEvents}
        onOpenFightEpic={onOpenFightEpic}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    const deathChip =
      screen.getByText("Death forensics").parentElement!.parentElement!;

    await user.click(within(deathChip).getByRole("button", { name: "1 bad" }));
    const link = within(deathChip).getByRole("button", {
      name: /Leotheras the Blind/,
    });
    expect(link).toBeInTheDocument();

    await user.click(link);
    expect(onOpenFightEpic).toHaveBeenCalledWith(2, "death");
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
  Expected: FAIL — `ReportDashboardProps` doesn't have `onOpenFightEpic` yet (TS error), and/or
  no `button` with name `"1 bad"` exists yet (the breakdown is still plain text).

- [ ] **Step 3: Implement the change in `ReportDashboard/index.tsx`**

  1. Update the imports at the top of the file:

     ```ts
     import {
       buildFightRows,
       formatDuration,
       formatFightLabel,
     } from "../../../report/fightRows";
     ```

     and add, alongside the existing `JudgementChip` import:

     ```ts
     import { Popover } from "../ui/Popover";
     ```

  2. Delete the `formatJudgementBreakdown` function (lines 81-89) entirely and replace it with:

     ```tsx
     const JUDGEMENTS: Judgement[] = ["good", "fair", "bad"];

     function JudgementBreakdown({
       breakdown,
       fights,
       epicId,
       onOpenFightEpic,
     }: {
       breakdown: Record<Judgement, number>;
       fights: Record<Judgement, { fightId: number; label: string }[]>;
       epicId: EpicId;
       onOpenFightEpic: (fightId: number, epicId: EpicId) => void;
     }) {
       const present = JUDGEMENTS.filter((j) => breakdown[j] > 0);
       const interactive = present.length >= 2;

       return (
         <span className={styles.chipBreakdown}>
           {present.map((judgement, index) => (
             <span key={judgement}>
               {index > 0 && " · "}
               {interactive ? (
                 <Popover
                   triggerLabel={`${breakdown[judgement]} ${judgement}`}
                   triggerClassName={styles.breakdownSegment}
                 >
                   <ul className={styles.breakdownList}>
                     {fights[judgement].map((fight) => (
                       <li key={fight.fightId}>
                         <button
                           type="button"
                           className={styles.breakdownLink}
                           onClick={() =>
                             onOpenFightEpic(fight.fightId, epicId)
                           }
                         >
                           {fight.label}
                         </button>
                       </li>
                     ))}
                   </ul>
                 </Popover>
               ) : (
                 `${breakdown[judgement]} ${judgement}`
               )}
             </span>
           ))}
         </span>
       );
     }
     ```

  3. In `FightRowProps`/`FightRow`, replace the inline label computation (line 172-173):

     ```tsx
     const label =
       pullNumber === null ? fight.name : `Pull ${pullNumber} · ${fight.name}`;
     ```

     with:

     ```tsx
     const label = formatFightLabel(fight, pullNumber);
     ```

  4. Add `onOpenFightEpic` to `ReportDashboardProps` (after `onSelectEpic`):

     ```ts
     onOpenFightEpic: (fightId: number, epicId: EpicId) => void;
     ```

  5. Add `onOpenFightEpic` to the destructured props in the `ReportDashboard` function
     signature (after `onSelectEpic,`).

  6. Update `onRoleEntries` to carry `pullNumber` through (replace lines 291-301):

     ```tsx
     const onRoleEntries = onRoleRows
       .map((row) => {
         const summaries = summariesByFight.get(row.fight.id);
         return summaries === undefined
           ? undefined
           : { fight: row.fight, pullNumber: row.pullNumber, summaries };
       })
       .filter(
         (
           e,
         ): e is {
           fight: Fight;
           pullNumber: number | null;
           summaries: FightEpicSummaries;
         } => e !== undefined,
       );
     ```

  7. Update the chip-strip's `rollupEpicJudgement` call and breakdown rendering (inside the
     `EPIC_META.map(({ id, label }) => { ... })` block):

     ```tsx
     const rollup = rollupEpicJudgement(
       onRoleEntries.map((e) => ({
         status: e.summaries[id],
         weightMs: e.fight.endTime - e.fight.startTime,
         fightId: e.fight.id,
         label: formatFightLabel(e.fight, e.pullNumber),
       })),
     );
     return (
       <div key={id} className={styles.chip}>
         <div className={styles.chipInfo}>
           <span className={styles.chipLabel}>{label}</span>
           {rollup !== null && (
             <JudgementBreakdown
               breakdown={rollup.breakdown}
               fights={rollup.fights}
               epicId={id}
               onOpenFightEpic={onOpenFightEpic}
             />
           )}
         </div>
         {rollup === null ? (
           <span className={styles.calculating}>Calculating…</span>
         ) : (
           <JudgementChip judgement={rollup.judgement} />
         )}
       </div>
     );
     ```

- [ ] **Step 4: Add the new CSS classes**

  In `src/app/components/ReportDashboard/index.module.css`, add after the existing
  `.chipBreakdown` rule:

  ```css
  .breakdownSegment {
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-underline-offset: 2px;
  }

  .breakdownList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .breakdownLink {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--accent);
    font: inherit;
    font-size: var(--text-small-size);
    cursor: pointer;
    text-align: left;
  }
  ```

- [ ] **Step 5: Run the tests to verify they pass**

  Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
  Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Typecheck, lint, format**

  Run:

  ```bash
  npm run typecheck && npm run lint && npx prettier --check src/app/components/ReportDashboard
  ```

  Expected: no errors. If Prettier flags formatting, run
  `npx prettier --write src/app/components/ReportDashboard` and re-check.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/components/ReportDashboard
  git commit -m "feat(judgements): make rollup breakdown segments interactive"
  ```

---

### Task 5: `App.tsx` navigation wiring

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `ReportDashboardProps.onOpenFightEpic` from Task 4; the existing `Route` union's
  `{screen: "fightEpic", reportCode, host, druidName, fightId, epicId}` member
  (`src/app/routing/hashRoute.ts:22-29`, unchanged by this plan).
- Produces: nothing further downstream — this is the top of the call chain.

- [ ] **Step 1: Add the handler**

  In `src/App.tsx`, add a new function directly after `handleSelectEpic` (after its closing
  brace, currently ending around line 309):

  ```tsx
  function handleOpenFightEpic(fightId: number, epicId: EpicId) {
    if (reportCode === null || selectedDruid === null || host === null) return;
    navigate({
      screen: "fightEpic",
      reportCode,
      host,
      druidName: selectedDruid.name,
      fightId,
      epicId,
    });
  }
  ```

- [ ] **Step 2: Pass it to `ReportDashboard`**

  In the `<ReportDashboard ... />` JSX (around line 569-593), add a new prop after
  `onSelectEpic={handleSelectEpic}`:

  ```tsx
  onOpenFightEpic = { handleOpenFightEpic };
  ```

- [ ] **Step 3: Typecheck**

  Run: `npm run typecheck`
  Expected: no errors — this was the last unresolved consumer of `ReportDashboardProps`.

- [ ] **Step 4: Run the full test suite**

  Run: `npm test`
  Expected: PASS, no regressions anywhere (this task only adds a prop/handler; no existing
  behavior changes).

- [ ] **Step 5: Lint and format**

  Run: `npm run lint && npx prettier --check src/App.tsx`
  Expected: no errors. If Prettier flags formatting, run `npx prettier --write src/App.tsx` and
  re-check.

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat(judgements): navigate straight to a fight's epic from the rollup tooltip"
  ```

---

### Task 6: Full verification, manual check, and paperwork retirement

**Files:**

- Modify: `CLAUDE.md` (Repo state section)
- Delete: `docs/specs/judgement-rollup-tooltip-design.md`
- Delete: `docs/plans/judgement-rollup-tooltip-plan.md`

**Interfaces:** none — this task only verifies and documents; no code interfaces change.

- [ ] **Step 1: Run the full local verification suite**

  Run:

  ```bash
  npm run typecheck && npm run lint && npm run format:check
  npm test
  ```

  Expected: everything passes with no errors and no regressions in any other test file.

- [ ] **Step 2: Manual smoke check in a running dev server**

  Run: `npm run dev` (or use this repo's `run` skill if available), open the app, load a real
  report with several fights spanning multiple judgement buckets in at least one epic chip
  (e.g. a report already listed in `docs/testing.md`'s "Known real test reports" table).
  Confirm:
  - A single-bucket chip (e.g. "12 good") is plain text with no underline and does nothing on
    hover/click.
  - A multi-bucket chip's segments (e.g. "2 fair", "10 bad") are subtly underlined, in the same
    text color as the rest of the breakdown line.
  - Hovering a segment (desktop mouse) opens a popover listing the right bosses; moving the
    mouse away closes it.
  - Tabbing to a segment (keyboard) opens it; tabbing away closes it.
  - Clicking/tapping a segment opens it; clicking outside closes it.
  - Clicking a boss name in the popover navigates to that fight's scorecard with the
    corresponding epic card focused.
  - Resize the browser to a narrow (mobile-width) viewport and confirm tapping still works and
    the popover doesn't get clipped off-screen illegibly.

- [ ] **Step 3: Update `CLAUDE.md`'s Repo state section**

  Append a new sentence to the end of the long "Repo state" paragraph in `CLAUDE.md`
  (immediately after the sentence ending "...confirmed 2026-07-21 to stay informational rather
  than gain a threshold."), summarizing what shipped, in the same style as the surrounding
  prose — for example:

  ```text
  The whole-report dashboard's epic chip strip also gained an interactive judgement rollup
  breakdown, requested directly (no backlog story) — a "2 fair" style segment is now
  interactive whenever its chip has 2+ distinct judgement buckets present (a single-bucket
  breakdown like "12 good" stays plain text), opening a popover on hover/keyboard-focus/tap
  that lists exactly which fights are in that bucket and lets you click straight through to
  that fight's scorecard with the relevant epic focused. Implemented via a new generic,
  hand-rolled `Popover` primitive (`src/app/components/ui/Popover`, no new dependency) and a
  new `onOpenFightEpic` callback threaded from `App.tsx` down through `ReportDashboard`;
  `rollupEpicJudgement` (`src/metrics/reportAggregation.ts`) now returns each bucket's fight
  identities alongside its existing counts, and a shared `formatFightLabel` helper
  (`src/report/fightRows.ts`) keeps the popover's boss-name links and the fight-row labels
  byte-for-byte consistent.
  ```

  (Write this as one continuous addition to the existing paragraph, not a new paragraph or
  heading — match how every other sentence in that section is appended.)

- [ ] **Step 4: Delete the spec and plan**

  ```bash
  rm docs/specs/judgement-rollup-tooltip-design.md
  rm docs/plans/judgement-rollup-tooltip-plan.md
  ```

  (Confirm first, via `grep -rn "judgement-rollup-tooltip" docs CLAUDE.md`, that nothing else
  in the repo still references either file path — expected to find nothing after this grep,
  since this plan is the only thing that ever pointed at them.)

- [ ] **Step 5: Final commit**

  ```bash
  git add CLAUDE.md docs/specs/judgement-rollup-tooltip-design.md docs/plans/judgement-rollup-tooltip-plan.md
  git commit -m "docs(judgements): record rollup breakdown tooltip in repo state, retire its spec/plan"
  ```

  Note: `git add` on the two deleted files stages their removal (`git rm` isn't required
  separately once the files are already deleted on disk).
