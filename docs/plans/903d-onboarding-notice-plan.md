# 903d — Onboarding notice on supported playstyles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn a user, both generically on the onboarding screen and contextually per-fight in the Scorecard, when Bloomwatch's judgements weren't validated for their detected talent build.

**Architecture:** Two independent, additive UI changes. No new detection logic, no new WCL fetches — both consume `TalentBucket` data 903a already computes (`src/report/archetypeDetection.ts`'s `classifyBucket`, surfaced via `useArchetypeBucket`, already wired into `Scorecard`).

**Tech Stack:** React + TypeScript, Vitest + React Testing Library (Tier 3 component tests), existing `Alert` UI component.

## Global Constraints

- Spec: `docs/specs/903d-onboarding-notice-design.md` (read it before starting — this plan implements it verbatim).
- No new metric thresholds, no card-hiding changes (that's 903c, already done) — this story only adds warning copy.
- `ReportDashboard` is out of scope — the notice is Scorecard-only, matching 903a's existing footprint.
- Every R/O/G-adjacent judgement/threshold change needs a sourced comment per `CLAUDE.md` principle 3 — the `UNSUPPORTED_ARCHETYPE_BUCKETS` set below must carry one.
- Full-project static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs via pre-commit hook — don't bypass it.

---

### Task 1: Contextual per-fight "unsupported build" Alert in Scorecard

**Files:**

- Modify: `src/report/archetypeDetection.ts` (add `UNSUPPORTED_ARCHETYPE_BUCKETS` export, after the existing `BUCKET_DEFINITIONS` block at line 56)
- Modify: `src/app/components/Scorecard/index.tsx` (import the new set, render the alert)
- Test: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `TalentBucket` (`src/report/archetypeDetection.ts`), `useArchetypeBucket`'s `ArchetypeBucketStatus` (`src/app/components/Scorecard/useArchetypeBucket.ts`, already imported in `Scorecard/index.tsx` as `archetypeStatus`), `ARCHETYPE_LABELS` (already defined in `Scorecard/index.tsx:70-79`), `Alert` (`src/app/components/ui/Alert`, already imported in `Scorecard/index.tsx`).
- Produces: `UNSUPPORTED_ARCHETYPE_BUCKETS: ReadonlySet<TalentBucket>`, exported from `src/report/archetypeDetection.ts`, importable anywhere `BUCKET_DEFINITIONS` already is.

- [ ] **Step 1: Write the failing tests**

Open `src/app/components/Scorecard/index.test.tsx`. Add `aCombatantInfoEvent` to the existing factories import (line 6):

```ts
import {
  aCastEvent,
  aCombatantInfoEvent,
  aFight,
} from "../../../testUtils/factories";
```

Add these two tests inside the existing `describe("Scorecard", ...)` block, after the `"shows an off-role Alert..."` test (after line 229, before the closing `});` of the describe block):

```tsx
it("shows an unsupported-build Alert when the detected archetype isn't well-supported", async () => {
  const fight = aFight({
    id: 6,
    name: "Lady Vashj",
    kill: true,
    startTime: 0,
    endTime: 341000,
  });
  const fetchEvents = (
    _token: string,
    _report: string,
    _fight: unknown,
    dataType: string,
  ) =>
    Promise.resolve(
      dataType === "CombatantInfo"
        ? [
            aCombatantInfoEvent({
              sourceID: 101,
              talents: [{ id: 25 }, { id: 0 }, { id: 10 }],
            }),
          ]
        : [],
    );

  render(<Scorecard {...baseProps} fight={fight} fetchEvents={fetchEvents} />);

  await waitFor(() =>
    expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
      "Talent archetype: Mostly Balance",
    ),
  );
  expect(
    screen.getByText(/isn't one Bloomwatch judges well yet/),
  ).toBeInTheDocument();
});

it("doesn't show the unsupported-build Alert for a deep-resto archetype", async () => {
  const fight = aFight({
    id: 6,
    name: "Lady Vashj",
    kill: true,
    startTime: 0,
    endTime: 341000,
  });
  const fetchEvents = (
    _token: string,
    _report: string,
    _fight: unknown,
    dataType: string,
  ) =>
    Promise.resolve(
      dataType === "CombatantInfo"
        ? [
            aCombatantInfoEvent({
              sourceID: 101,
              talents: [{ id: 0 }, { id: 0 }, { id: 41 }],
            }),
          ]
        : [],
    );

  render(<Scorecard {...baseProps} fight={fight} fetchEvents={fetchEvents} />);

  await waitFor(() =>
    expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
      "Talent archetype: Deep resto",
    ),
  );
  expect(
    screen.queryByText(/isn't one Bloomwatch judges well yet/),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: the two new tests FAIL — the "Mostly Balance" test fails because `screen.getByText(/isn't one Bloomwatch judges well yet/)` finds nothing; the "deep-resto" test's negative assertion trivially passes today (nothing renders that text yet) but the positive-case test above it must fail first to prove the assertion is meaningful.

- [ ] **Step 3: Add `UNSUPPORTED_ARCHETYPE_BUCKETS` to `archetypeDetection.ts`**

In `src/report/archetypeDetection.ts`, insert after the `BUCKET_DEFINITIONS` block (after line 56, before the `CombatantTalentEntry` interface):

```ts
// Story 903d: buckets the onboarding notice calls out as not well-supported —
// Regrowth-spec resto, Balance-as-healer, and the unclassified catch-all.
// Dreamstate stays unflagged per docs/backlog.md 903d ("supported to a lesser
// extent"), even though it's talent-indistinguishable from Restokin (see this
// file's restokin-shaped comment above and docs/backlog.md line 475).
export const UNSUPPORTED_ARCHETYPE_BUCKETS: ReadonlySet<TalentBucket> = new Set(
  ["mostly-resto", "mostly-balance", "other-unclassified", "restokin-shaped"],
);
```

- [ ] **Step 4: Render the alert in `Scorecard/index.tsx`**

Update the import block (lines 20-23) to include the new export:

```tsx
import {
  BUCKET_DEFINITIONS,
  UNSUPPORTED_ARCHETYPE_BUCKETS,
  type TalentBucket,
} from "../../../report/archetypeDetection";
```

Insert the new alert immediately after the closing `</p>` of the archetype line (after line 165, before the existing `healingRoleStatus` alert block at line 166):

```tsx
{
  archetypeStatus.status === "ready" &&
    UNSUPPORTED_ARCHETYPE_BUCKETS.has(archetypeStatus.bucket) && (
      <Alert tone="warning">
        This fight&apos;s detected build (
        {ARCHETYPE_LABELS[archetypeStatus.bucket]}) isn&apos;t one Bloomwatch
        judges well yet — the process judgements below may not be a fair read on
        this playstyle.
      </Alert>
    );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: all tests PASS, including the two new ones and the pre-existing `"renders the fight header..."` test (which relies on `unknown-no-talent-data` staying unflagged — that test's default `fetchEvents` returns `[]` for every data type, so `archetypeStatus.bucket` resolves to `"unknown-no-talent-data"`, which is not in `UNSUPPORTED_ARCHETYPE_BUCKETS`, so `screen.getByRole("alert")` still finds exactly one alert) and the `"shows an off-role Alert..."` test (same reasoning — still exactly 2 alerts, not 3).

- [ ] **Step 6: Run full project verification**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three PASS with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/report/archetypeDetection.ts src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx
git commit -m "feat(scorecard): warn when the fight's detected build isn't well-supported"
```

---

### Task 2: Onboarding "Which builds this fits" section

**Files:**

- Modify: `src/app/components/Onboarding/index.tsx`
- Test: `src/app/components/Onboarding/index.test.tsx`

**Interfaces:**

- Consumes: nothing new — plain static JSX, same `styles.section` class already used by every other paragraph in this file.
- Produces: nothing consumed elsewhere — this is a leaf UI change.

- [ ] **Step 1: Write the failing test**

In `src/app/components/Onboarding/index.test.tsx`, extend the first test (`"renders the What this is / Who it's for / healing meter sections"`, lines 7-24) to also assert the new heading and its copy:

```tsx
it("renders the What this is / Who it's for / healing meter sections", () => {
  render(<Onboarding onContinue={vi.fn()} />);

  expect(
    screen.getByRole("heading", { name: "What this is" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Who it's for" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Which builds this fits" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", {
      name: "Why not just look at the healing meter?",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Primary/)).toBeInTheDocument();
  expect(screen.getByText(/Secondary/)).toBeInTheDocument();
  expect(screen.getByText(/Tertiary/)).toBeInTheDocument();
  expect(
    screen.getByText(/deep resto gets the most precise read/),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Onboarding/index.test.tsx`
Expected: FAIL — `getByRole("heading", { name: "Which builds this fits" })` and the `deep resto gets the most precise read` text are both not found.

- [ ] **Step 3: Add the section to `Onboarding/index.tsx`**

Insert this block after the closing `</ul>` of the "Who it's for" section (after line 56) and before the `<h2>Why not just look at the healing meter?</h2>` heading (line 58):

```tsx
      <h2>Which builds this fits</h2>
      <p className={styles.section}>
        Bloomwatch&apos;s judgements are tuned for a Restoration-focused
        healer — deep resto gets the most precise read, and Dreamstate
        hybrids are reasonably covered too. A Regrowth-only resto build, a
        Restokin (Balance/healer hybrid), or a Balance druid playing an
        off-spec healer role don&apos;t have enough process data behind them
        yet, so their scorecards may not be a fair judgement of that play.
        Once you load a report, the fight screen will flag it directly if
        your detected build falls outside what&apos;s well-supported today.
      </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Onboarding/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full project verification**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Onboarding/index.tsx src/app/components/Onboarding/index.test.tsx
git commit -m "feat(onboarding): add a section on which druid builds Bloomwatch judges well"
```

---

### Task 3: Retire this story's paperwork

**Files:**

- Modify: `docs/backlog.md` (mark 903d done)
- Modify: `CLAUDE.md` (append a sentence to the "Repo state" paragraph)
- Delete: `docs/specs/903d-onboarding-notice-design.md`
- Delete: `docs/plans/903d-onboarding-notice-plan.md` (this file)

**Interfaces:** none — documentation only, no code.

- [ ] **Step 1: Mark 903d done in the backlog**

In `docs/backlog.md`, change the heading at (current) line 559 from:

```markdown
### 903d — Onboarding notice on supported playstyles 🔲 Todo
```

to:

```markdown
### 903d — Onboarding notice on supported playstyles ✅ Done
```

- [ ] **Step 2: Append a completion note to `CLAUDE.md`**

In `CLAUDE.md`'s "Repo state" section, find the sentence ending `"...Story 709's own backlog entry has been removed entirely, per the same precedent already used for story 004."` (end of the paragraph) and append immediately after it, still inside the same paragraph:

```markdown
Story 903d (onboarding notice on supported playstyles, epic I) is done too — the onboarding screen (705) gained a "Which builds this fits" section naming which archetypes are well-supported in generic terms, and `Scorecard` (which already surfaces 903a's detected bucket per fight) now also renders a warning `Alert` when that bucket is `mostly-resto`, `mostly-balance`, `other-unclassified`, or the currently-unreachable `restokin-shaped` — `likely-dreamstate-full`/`-partial` are deliberately left unflagged since the backlog calls Dreamstate "supported to a lesser extent," and `unknown-no-talent-data` is left unflagged too since a failed talent read can't honestly be called either supported or unsupported.
```

- [ ] **Step 3: Delete the design spec and this plan**

```bash
git rm docs/specs/903d-onboarding-notice-design.md docs/plans/903d-onboarding-notice-plan.md
```

- [ ] **Step 4: Verify nothing else references the deleted files**

Run: `grep -rn "903d-onboarding-notice" --include=*.md .`
Expected: no output (no dangling references).

- [ ] **Step 5: Run full project verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 903d, retire its design spec and plan"
```
