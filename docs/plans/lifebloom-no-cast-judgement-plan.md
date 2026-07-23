# Exclude Lifebloom Discipline From Judgement On Zero-Cast Fights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a druid casts zero Lifebloom-family spells in a fight, exclude the Lifebloom Discipline epic from judgement entirely (no chip, no per-metric detail cards) instead of the current behavior, where `computeAccidentalBlooms`/`computeRestackTax` both read a literal `0` as "Good" and the epic ends up rated "Good" for a fight where nothing Lifebloom-related happened at all.

**Architecture:** A new pure predicate, `hasLifebloomCast`, answers "did the druid cast any Lifebloom-family spell this fight" from cast events both consumers already fetch. `summarizeLifebloomDiscipline` takes that boolean and short-circuits to a `null` judgement before combining its five sibling metrics. `EpicSummary.judgement` widens from `Judgement` to `Judgement | null` to allow this, which ripples (type-only, not behaviorally) into the app's `EpicSummaryStatus` and the CLI calibration tool's mirrored `EpicResult<M>`, and into every place that consumes those unions generically (`rollupEpicJudgement`, `epicRollupBase`, `Scorecard`'s widget/chip rendering). The UI drops the chip, replaces the overview tile's stats with a note, and skips mounting the five per-metric detail cards (`LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `ConcurrentTargetsCard`) so none of them computes or displays a chip either.

**Tech Stack:** TypeScript, React, Vitest + React Testing Library, the existing WCL event-fetching layer.

## Global Constraints

- Full spec: `docs/specs/lifebloom-no-cast-judgement-design.md`. Read it before Task 1 if anything below is ambiguous.
- No em dash (`—`) in any user-facing string (labels, notes, alerts). Comments/docs are unaffected.
- Never expose developer/planning vocabulary ("epic", "story", backlog numbers, etc.) in user-facing text.
- `computeAccidentalBlooms` and `computeRestackTax` themselves are **out of scope** — do not modify them. Their cards simply stop mounting for an excluded fight.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via a pre-commit hook — never bypass it with `--no-verify`. Because `tsc -b` type-checks the whole project at once, a shared type widening (`EpicSummary`, `EpicSummaryStatus`, `EpicResult<M>`) and every one of its consumers must land in the **same commit**, even where a given consumer's own behavior doesn't change.
- Follow this repo's existing test co-location and factory conventions (`docs/testing.md`): tests live next to the file they cover as `*.test.ts`/`*.test.tsx`, fixtures come from `src/testUtils/factories.ts`.
- Commits follow Conventional Commits (`type(scope): summary`), e.g. `fix(lifebloom): exclude Lifebloom Discipline from judgement on zero-cast fights`.

---

## Task 1: `hasLifebloomCast` predicate

**Files:**

- Modify: `src/metrics/lifebloomStacks.ts`
- Test: `src/metrics/lifebloomStacks.test.ts`

**Interfaces:**

- Produces: `hasLifebloomCast(castEvents: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>): boolean`, exported from `src/metrics/lifebloomStacks.ts`. Task 2 and Task 3 both import this.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/metrics/lifebloomStacks.test.ts` (the file already imports `describe`, `expect`, `it` from `vitest` and a `WclEvent` type; add `hasLifebloomCast` to the existing named import from `./lifebloomStacks`, and add `aCastEvent` to the existing named import from `../testUtils/factories`):

```ts
describe("hasLifebloomCast", () => {
  it("returns false when there are no cast events at all", () => {
    expect(hasLifebloomCast([], 2, LB_IDS)).toBe(false);
  });

  it("returns false when the only casts are a different ability", () => {
    const events: WclEvent[] = [
      aCastEvent({ sourceID: 2, abilityGameID: 18550 }), // Tranquil Air Totem, not Lifebloom
    ];
    expect(hasLifebloomCast(events, 2, LB_IDS)).toBe(false);
  });

  it("returns false when the only Lifebloom casts are by a different player", () => {
    const events: WclEvent[] = [
      aCastEvent({ sourceID: 7, abilityGameID: 33763 }),
    ];
    expect(hasLifebloomCast(events, 2, LB_IDS)).toBe(false);
  });

  it("returns true when the druid cast a Lifebloom-family ability", () => {
    const events: WclEvent[] = [
      aCastEvent({ sourceID: 2, abilityGameID: 33763 }),
    ];
    expect(hasLifebloomCast(events, 2, LB_IDS)).toBe(true);
  });

  it("ignores non-cast events on the same ability", () => {
    const events: WclEvent[] = [
      {
        ...aCastEvent({ sourceID: 2, abilityGameID: 33763 }),
        type: "applybuff",
      },
    ];
    expect(hasLifebloomCast(events, 2, LB_IDS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: FAIL (`hasLifebloomCast` is not exported from `./lifebloomStacks`)

- [ ] **Step 3: Implement `hasLifebloomCast`**

Add to the end of `src/metrics/lifebloomStacks.ts`:

```ts
// Excludes a fight from Lifebloom Discipline judgement entirely
// (summarizeLifebloomDiscipline in epicSummary.ts) when false - a fact
// about actual cast events, independent of buff-timeline reconstruction
// or carry-in resolution, so a target whose Lifebloom merely carried in
// from the previous pull (and was never recast this fight) still counts
// as excluded.
export function hasLifebloomCast(
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): boolean {
  return castEvents.some(
    (event) =>
      event.type === "cast" &&
      event.sourceID === druidId &&
      event.abilityGameID !== undefined &&
      lifebloomAbilityIds.has(event.abilityGameID),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/lifebloomStacks.test.ts`
Expected: PASS (all tests in the file, including the 5 new ones)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors

```bash
git add src/metrics/lifebloomStacks.ts src/metrics/lifebloomStacks.test.ts
git commit -m "feat(lifebloom): add hasLifebloomCast predicate"
```

---

## Task 2: App-side exclusion (metrics, hook, aggregation, UI)

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Test: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/epicSummaryStatus.ts`
- Modify: `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`
- Test: `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
- Modify: `src/metrics/reportAggregation.ts`
- Test: `src/metrics/reportAggregation.test.ts`
- Modify: `src/app/components/Scorecard/index.tsx`
- Test: `src/app/components/Scorecard/index.test.tsx`
- Modify: `src/app/components/LifebloomDisciplineContent/index.tsx`
- Test: `src/app/components/LifebloomDisciplineContent/index.test.tsx`

**Interfaces:**

- Consumes: `hasLifebloomCast` from Task 1 (`src/metrics/lifebloomStacks.ts`).
- Produces: `summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent, hasLifebloomCast: boolean): EpicSummary` (6th parameter added; `EpicSummary.judgement: Judgement | null`). `LifebloomDisciplineContent` gains a required `showCards: boolean` prop. Task 3 (CLI) mirrors this same `summarizeLifebloomDiscipline` signature and the same `EpicSummary`/`Judgement | null` contract.

This task touches a shared type (`EpicSummary` → `EpicSummaryStatus`) that every one of the 7 epics' rendering code depends on generically, so it must land as one commit — see Global Constraints.

### Part A: `summarizeLifebloomDiscipline` short-circuit

- [ ] **Step 1: Update the existing tests to pass a 6th argument, and add the exclusion test**

In `src/metrics/epicSummary.test.ts`, `describe("summarizeLifebloomDiscipline", ...)` currently has 6 `it(...)` blocks, each calling `summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent-or-NEUTRAL_CONCURRENT)` with 5 arguments. Add `true` as a 6th argument to each of the 6 calls:

1. In `"ranges the LB3 uptime stat across multiple targets and formats the median"`:

```ts
    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
        true,
      ),
    ).toEqual({
```

2. In `"formats a single maintained target without a range"`:

```ts
    expect(
      summarizeLifebloomDiscipline(
        lb3,
        refresh,
        blooms,
        restack,
        NEUTRAL_CONCURRENT,
        true,
      ),
    ).toEqual({
```

3. In `"reports no maintained targets when there are none"`:

```ts
expect(
  summarizeLifebloomDiscipline(
    lb3,
    refresh,
    blooms,
    restack,
    NEUTRAL_CONCURRENT,
    true,
  ).stats[0],
).toBe("LB3 uptime: no maintained targets");
```

4. In `"reads fair (not bad) when a maintained target is good but restack tax is bad"`:

```ts
expect(
  summarizeLifebloomDiscipline(
    lb3,
    refresh,
    blooms,
    restack,
    NEUTRAL_CONCURRENT,
    true,
  ).judgement,
).toBe("fair");
```

5. In `"reduces 3 similarly-weighted per-target judgements (good/fair/good) to good before combining with other good siblings"`:

```ts
expect(
  summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent, true)
    .judgement,
).toBe("good");
```

6. In `"keeps the epic at fair when the weighted median genuinely favors the weaker target"`:

```ts
expect(
  summarizeLifebloomDiscipline(
    lb3,
    refresh,
    blooms,
    restack,
    NEUTRAL_CONCURRENT,
    true,
  ).judgement,
).toBe("fair");
```

Then add a new test at the end of the `describe("summarizeLifebloomDiscipline", ...)` block (immediately before its closing `});`):

```ts
it("excludes the fight from judgement when hasLifebloomCast is false, regardless of what the sibling metrics computed", () => {
  const lb3: Lb3UptimeResult = { targets: [] };
  const refresh: RefreshCadenceResult = {
    intervalCount: 0,
    medianMs: null,
    judgement: null,
    buckets: [],
  };
  // These two would normally read "good" (0 is within their good band) -
  // the whole point of the exclusion is that they're never consulted.
  const blooms: AccidentalBloomsResult = {
    accidentalBlooms: [],
    count: 0,
    judgement: "good",
  };
  const restack: RestackTaxResult = {
    casts: [],
    castCount: 0,
    estimatedMana: 0,
    judgement: "good",
  };

  expect(
    summarizeLifebloomDiscipline(
      lb3,
      refresh,
      blooms,
      restack,
      NEUTRAL_CONCURRENT,
      false,
    ),
  ).toEqual({
    judgement: null,
    stats: ["No Lifebloom casts this fight"],
  });
});
```

- [ ] **Step 2: Run the tests to verify the new one fails and the others fail to compile**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL (too many arguments to `summarizeLifebloomDiscipline`, which currently accepts 5)

- [ ] **Step 3: Widen `EpicSummary` and implement the short-circuit**

In `src/metrics/epicSummary.ts`, change:

```ts
export interface EpicSummary {
  judgement: Judgement;
  stats: string[];
}
```

to:

```ts
export interface EpicSummary {
  judgement: Judgement | null;
  stats: string[];
}
```

Then change the `summarizeLifebloomDiscipline` signature and add the short-circuit as its first statement:

```ts
export function summarizeLifebloomDiscipline(
  lb3: Lb3UptimeResult,
  refresh: RefreshCadenceResult,
  blooms: AccidentalBloomsResult,
  restack: RestackTaxResult,
  concurrent: ConcurrentLb3Result,
  hasLifebloomCast: boolean,
): EpicSummary {
  if (!hasLifebloomCast) {
    return { judgement: null, stats: ["No Lifebloom casts this fight"] };
  }

  // Per-target LB3 judgements are reduced to one representative judgement
```

(the rest of the function body is unchanged - leave the existing `weightedMedianJudgement`/`mixedJudgement` logic and its comments exactly as they are, just below the new short-circuit).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS (all tests in the file)

### Part B: hook wiring

- [ ] **Step 5: Update `useLifebloomDisciplineSummary`'s existing tests for the new cast-event dependency**

`hasLifebloomCast` is derived from cast events, which the hook already fetches but three existing tests in `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts` mock as returning `[]` for every data type except `"Buffs"`. Update those fixtures so they still exercise their original intent (real Lifebloom activity, not an excluded fight).

First, add `aCastEvent` to the existing factories import at the top of the file:

```ts
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aCastEvent,
  aFight,
} from "../../../testUtils/factories";
```

In the first test, `"starts loading, then reports the worst-of judgement and stat lines"`, change:

```ts
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);
```

to:

```ts
const castEvents = [aCastEvent({ timestamp: 0, sourceID: 2, targetID: 42 })];
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) =>
  Promise.resolve(
    dataType === "Buffs" ? buffEvents : dataType === "Casts" ? castEvents : [],
  );
```

In the third test, `"fetches a lookback window and resolves a carry-in target instead of excluding it"`, change:

```ts
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);
```

to:

```ts
// A genuine in-fight 3-stack maintenance refresh (the aRefreshBuffEvent
// above) is always preceded by a real cast at essentially the same
// timestamp - without this, hasLifebloomCast would read false and the
// whole fight would be excluded rather than exercising carry-in
// resolution.
const castEvents = [
  aCastEvent({ timestamp: 2016447, targetID: 5, sourceID: 2 }),
];
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) =>
  Promise.resolve(
    dataType === "Buffs" ? buffEvents : dataType === "Casts" ? castEvents : [],
  );
```

In the fourth test, `"never calls fetchLookbackEvents when no target's timeline is ambiguous"`, change:

```ts
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);
```

to:

```ts
const castEvents = [aCastEvent({ timestamp: 0, sourceID: 2, targetID: 42 })];
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) =>
  Promise.resolve(
    dataType === "Buffs" ? buffEvents : dataType === "Casts" ? castEvents : [],
  );
```

Then add a new test at the end of the `describe("useLifebloomDisciplineSummary", ...)` block:

```ts
it("excludes the epic when the druid cast zero Lifebloom-family spells this fight", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
  const fetchEvents = () => Promise.resolve([]);
  const fetchLookbackEvents = () => Promise.resolve([]);

  const { result } = renderHook(() =>
    useLifebloomDisciplineSummary(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      fight,
      2,
      new Set([33763]),
      fetchEvents,
      fetchLookbackEvents,
    ),
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current).toEqual({
    status: "ready",
    judgement: null,
    stats: ["No Lifebloom casts this fight"],
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: FAIL (too few arguments to `summarizeLifebloomDiscipline` - the hook doesn't pass a 6th argument yet)

- [ ] **Step 7: Wire `hasLifebloomCast` into the hook**

In `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`, change the import:

```ts
import { detectCarryInTargets } from "../../../metrics/lifebloomStacks";
```

to:

```ts
import {
  detectCarryInTargets,
  hasLifebloomCast,
} from "../../../metrics/lifebloomStacks";
```

Then change the `summarizeLifebloomDiscipline` call inside the `.then(async ([buffEvents, castEvents, healEvents]) => {` callback:

```ts
setState({
  accessToken,
  summary: {
    status: "ready",
    ...summarizeLifebloomDiscipline(lb3, refresh, blooms, restack, concurrent),
  },
});
```

to:

```ts
setState({
  accessToken,
  summary: {
    status: "ready",
    ...summarizeLifebloomDiscipline(
      lb3,
      refresh,
      blooms,
      restack,
      concurrent,
      hasLifebloomCast(castEvents, druidId, lifebloomAbilityIds),
    ),
  },
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: PASS (all tests in the file)

### Part C: `epicSummaryStatus.ts` and `reportAggregation.ts`

- [ ] **Step 9: Widen `EpicSummaryStatus`**

In `src/app/components/Scorecard/epicSummaryStatus.ts`, change:

```ts
export type EpicSummaryStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement; stats: string[] };
```

to:

```ts
export type EpicSummaryStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement | null; stats: string[] };
```

- [ ] **Step 10: Write the failing `rollupEpicJudgement`/`combineFightEpicStatus` tests**

In `src/metrics/reportAggregation.test.ts`, add a new fixture next to the existing `good`/`fair`/`bad`/`errored` constants:

```ts
const excluded: EpicSummaryStatus = {
  status: "ready",
  judgement: null,
  stats: ["No Lifebloom casts this fight"],
};
```

Add a test inside `describe("combineFightEpicStatus", ...)`:

```ts
it("excludes a ready-but-null-judgement epic from the worst-of, without blocking readiness", () => {
  expect(combineFightEpicStatus([good, excluded, fair])).toEqual({
    status: "ready",
    judgement: "fair",
  });
});
```

Add two tests inside `describe("rollupEpicJudgement", ...)`:

```ts
it("excludes a ready-but-null-judgement entry from the median, breakdown, and fights buckets", () => {
  expect(
    rollupEpicJudgement([
      { status: good, weightMs: 8000, fightId: 1, label: "Boss A" },
      { status: excluded, weightMs: 8000, fightId: 2, label: "Boss B" },
    ]),
  ).toEqual({
    judgement: "good",
    breakdown: { good: 1, fair: 0, bad: 0 },
    fights: {
      good: [{ fightId: 1, label: "Boss A" }],
      fair: [],
      bad: [],
    },
  });
});

it("returns null when every ready entry has a null judgement", () => {
  expect(
    rollupEpicJudgement([
      { status: excluded, weightMs: 8000, fightId: 1, label: "Boss A" },
    ]),
  ).toBeNull();
});
```

- [ ] **Step 11: Run the tests to verify they fail (or fail to compile)**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: FAIL to compile (`e.status.judgement` is `Judgement | null`, not assignable where `rollupEpicJudgement`'s internals currently assume non-null)

- [ ] **Step 12: Fix `rollupEpicJudgement`**

`combineFightEpicStatus` needs no code change - `worstJudgement` already accepts `(Judgement | null)[]` and filters nulls, so it compiles and behaves correctly as soon as `EpicSummaryStatus` is widened.

In `src/metrics/reportAggregation.ts`, change `rollupEpicJudgement`:

```ts
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

to:

```ts
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
  // A fight excluded from this epic (e.g. Lifebloom Discipline with zero
  // Lifebloom casts) is "ready" but carries no judgement - drop it from
  // the median/breakdown/fights buckets the same way a still-loading or
  // errored fight already is, without touching combineFightEpicStatus's
  // own per-fight worst-of (which tolerates null natively).
  const judged = ready
    .filter((e) => e.status.judgement !== null)
    .map((e) => ({
      judgement: e.status.judgement as Judgement,
      weightMs: e.weightMs,
      fightId: e.fightId,
      label: e.label,
    }));
  const judgement = weightedMedianJudgement(
    judged.map((e) => ({ judgement: e.judgement, weightMs: e.weightMs })),
  );
  if (judgement === null) return null;
  const fights: Record<Judgement, { fightId: number; label: string }[]> = {
    good: [],
    fair: [],
    bad: [],
  };
  for (const e of judged) {
    fights[e.judgement].push({ fightId: e.fightId, label: e.label });
  }
  return {
    judgement,
    breakdown: judgementBreakdown(
      judged.map((e) => ({ judgement: e.judgement })),
    ),
    fights,
  };
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/reportAggregation.test.ts`
Expected: PASS (all tests in the file)

### Part D: `Scorecard` and `LifebloomDisciplineContent`

- [ ] **Step 14: Add `showCards` to `LifebloomDisciplineContent` and update its test**

In `src/app/components/LifebloomDisciplineContent/index.tsx`, add `showCards: boolean` to the props interface (right after `host`) and destructure it, then gate the five cards behind it:

```ts
export interface LifebloomDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  showCards: boolean;
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
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function LifebloomDisciplineContent({
  accessToken,
  reportCode,
  host,
  showCards,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
  fetchLookbackEvents,
}: LifebloomDisciplineContentProps) {
  if (!showCards) {
    return (
      <p>No Lifebloom casts this fight, so there&apos;s nothing to grade here.</p>
    );
  }

  return (
    <div className={styles.group}>
```

(the closing `</div>` and the five `<...Card .../>` elements inside it are unchanged; only the new early-return block above them, and the prop threading, are new).

In `src/app/components/LifebloomDisciplineContent/index.test.tsx`, add `showCards={true}` to the existing render call:

```tsx
render(
  <LifebloomDisciplineContent
    accessToken="test-token"
    reportCode="4GYHZRdtL3bvhpc8"
    host="fresh"
    showCards={true}
    fight={fight}
    druidId={2}
    lifebloomAbilityIds={new Set([33763])}
    targetNames={new Map()}
    fetchEvents={fetchEvents}
    fetchLookbackEvents={fetchLookbackEvents}
  />,
);
```

Add a new test in the same `describe` block:

```ts
  it("shows an explanatory message and none of the five cards when showCards is false", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);
    const fetchLookbackEvents = () => Promise.resolve([]);

    render(
      <LifebloomDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        showCards={false}
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    expect(
      screen.getByText(
        "No Lifebloom casts this fight, so there's nothing to grade here.",
      ),
    ).toBeInTheDocument();
    for (const title of [
      "LB3 uptime per target",
      "Refresh cadence",
      "Accidental blooms",
      "Re-stack tax",
      "Concurrent LB3 targets",
    ]) {
      expect(
        screen.queryByRole("heading", { name: title }),
      ).not.toBeInTheDocument();
    }
  });
```

- [ ] **Step 15: Run the `LifebloomDisciplineContent` tests to verify the new one fails**

Run: `npx vitest run src/app/components/LifebloomDisciplineContent/index.test.tsx`
Expected: FAIL to compile (`showCards` is not a known prop yet)

Then apply Step 14's `index.tsx` change and re-run:

Run: `npx vitest run src/app/components/LifebloomDisciplineContent/index.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 16: Write the failing `Scorecard` test**

Add a new test to `src/app/components/Scorecard/index.test.tsx`, in the `describe("Scorecard", ...)` block:

```ts
  it("excludes Lifebloom discipline from judgement when the druid cast none this fight, hiding its chip and detail cards", async () => {
    const fight = aFight({
      id: 6,
      name: "Solarian",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const fetchEvents = () => Promise.resolve([]);

    const { rerender } = render(
      <Scorecard {...baseProps} fight={fight} fetchEvents={fetchEvents} />,
    );

    const lifebloomWidget = await screen.findByRole("button", {
      name: /Lifebloom discipline/,
    });
    await waitFor(() =>
      expect(lifebloomWidget).toHaveTextContent(
        "No Lifebloom casts this fight",
      ),
    );
    expect(lifebloomWidget).not.toHaveTextContent(/Good|Fair|Bad/);

    rerender(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        activeEpic="lifebloom"
      />,
    );

    expect(
      await screen.findByText(
        "No Lifebloom casts this fight, so there's nothing to grade here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "LB3 uptime per target" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Accidental blooms" }),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 17: Run the test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL to compile (`LifebloomDisciplineContent` now requires `showCards`, which `Scorecard` doesn't pass yet; the Widget/JudgementChip null-handling below is also not yet in place)

- [ ] **Step 18: Update `Scorecard`'s widget grid, detail header, and detail body**

In `src/app/components/Scorecard/index.tsx`, the 6 non-Lifebloom `Widget` declarations (GCD economy, Spell discipline, Mana economy, Death forensics, Crisis response, Prep hygiene) each have a `judgement` prop of this shape - using GCD economy as an example:

```tsx
              judgement={
                gcdSummary.status === "ready" ? gcdSummary.judgement : undefined
              }
```

Change each of the 6 to coalesce the now-possible `null` to `undefined` (mechanical, one line each - `gcdSummary` becomes `spellSummary`, `manaSummary`, `deathSummary`, `crisisSummary`, `prepSummary` respectively):

```tsx
              judgement={
                gcdSummary.status === "ready"
                  ? (gcdSummary.judgement ?? undefined)
                  : undefined
              }
```

The Lifebloom `Widget` declaration needs the fuller 3-way treatment (no chip, no stats, and a note when excluded). Change:

```tsx
<Widget
  icon={lifebloomIcon}
  label="Lifebloom discipline"
  onOpen={() => onSelectEpic("lifebloom")}
  judgement={
    lifebloomSummary.status === "ready" ? lifebloomSummary.judgement : undefined
  }
  stats={
    lifebloomSummary.status === "ready" ? lifebloomSummary.stats : undefined
  }
  note={
    lifebloomSummary.status === "loading"
      ? "Calculating…"
      : lifebloomSummary.status === "error"
        ? lifebloomSummary.error
        : undefined
  }
/>
```

to:

```tsx
<Widget
  icon={lifebloomIcon}
  label="Lifebloom discipline"
  onOpen={() => onSelectEpic("lifebloom")}
  judgement={
    lifebloomSummary.status === "ready" && lifebloomSummary.judgement !== null
      ? lifebloomSummary.judgement
      : undefined
  }
  stats={
    lifebloomSummary.status === "ready" && lifebloomSummary.judgement !== null
      ? lifebloomSummary.stats
      : undefined
  }
  note={
    lifebloomSummary.status === "loading"
      ? "Calculating…"
      : lifebloomSummary.status === "error"
        ? lifebloomSummary.error
        : lifebloomSummary.status === "ready" &&
            lifebloomSummary.judgement === null
          ? "No Lifebloom casts this fight"
          : undefined
  }
/>
```

Next, all 7 detail-header `JudgementChip` renders (one per `activeEpic === "..."` block) have this shape - using GCD economy as an example:

```tsx
{
  gcdSummary.status === "ready" && (
    <JudgementChip judgement={gcdSummary.judgement} />
  );
}
```

Add a null guard to all 7 (`gcdSummary`, `lifebloomSummary`, `spellSummary`, `manaSummary`, `deathSummary`, `crisisSummary`, `prepSummary`):

```tsx
{
  gcdSummary.status === "ready" && gcdSummary.judgement !== null && (
    <JudgementChip judgement={gcdSummary.judgement} />
  );
}
```

Finally, in the `activeEpic === "lifebloom"` block, pass `showCards` to `LifebloomDisciplineContent`. Change:

```tsx
<LifebloomDisciplineContent
  accessToken={accessToken}
  reportCode={reportCode}
  host={host}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
  fetchLookbackEvents={fetchLookbackEvents}
/>
```

to:

```tsx
<LifebloomDisciplineContent
  accessToken={accessToken}
  reportCode={reportCode}
  host={host}
  showCards={
    !(
      lifebloomSummary.status === "ready" && lifebloomSummary.judgement === null
    )
  }
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
  fetchLookbackEvents={fetchLookbackEvents}
/>
```

- [ ] **Step 19: Run the `Scorecard` tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 20: Run the full app test suite, typecheck, lint, and format, then commit**

Run: `npx vitest run`
Expected: PASS (every test file)

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors (run `npx prettier --write <file>` on anything `format:check` flags, then re-stage it)

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts \
  src/app/components/Scorecard/epicSummaryStatus.ts \
  src/app/components/Scorecard/useLifebloomDisciplineSummary.ts \
  src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts \
  src/metrics/reportAggregation.ts src/metrics/reportAggregation.test.ts \
  src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx \
  src/app/components/LifebloomDisciplineContent/index.tsx \
  src/app/components/LifebloomDisciplineContent/index.test.tsx
git commit -m "fix(lifebloom): exclude Lifebloom Discipline from judgement on zero-cast fights"
```

---

## Task 3: CLI calibration tool mirror

**Files:**

- Modify: `scripts/lib/types.ts`
- Modify: `scripts/lib/calibrateReport.ts`
- Modify: `scripts/lib/rollup.ts`
- Test: `scripts/lib/rollup.test.ts`

**Interfaces:**

- Consumes: `hasLifebloomCast` (Task 1) and the now-nullable `EpicSummary.judgement`/`summarizeLifebloomDiscipline` 6-argument signature (Task 2), both already committed.
- Produces: `EpicResult<M>`'s `"ready"` variant has `judgement: Judgement | null`; `epicRollupBase` filters null-judgement entries out of the judgement/breakdown calculation while still counting them in `fightsReady`.

This task's files are covered by `tsconfig.scripts.json` (checked via `npm run typecheck`, which runs `tsc -b && tsc --noEmit -p tsconfig.scripts.json`), separately from Task 2's `src/` files - it must still land as one commit internally, for the same whole-project-typecheck reason as Task 2.

- [ ] **Step 1: Widen `EpicResult<M>`**

In `scripts/lib/types.ts`, change:

```ts
export type EpicResult<M> =
  | { status: "ready"; judgement: Judgement; stats: string[]; metrics: M }
  | { status: "error"; error: string };
```

to:

```ts
export type EpicResult<M> =
  | {
      status: "ready";
      judgement: Judgement | null;
      stats: string[];
      metrics: M;
    }
  | { status: "error"; error: string };
```

- [ ] **Step 2: Write the failing `rollupDruid` test**

In `scripts/lib/rollup.test.ts`, add `LifebloomDisciplineMetrics` to the existing type-only import:

```ts
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
} from "./types";
```

Add two new helpers after the existing `readyGcd` function:

```ts
function readyLifebloom(
  judgement: Judgement | null,
): EpicResult<LifebloomDisciplineMetrics> {
  return {
    status: "ready",
    judgement,
    stats: [],
    metrics: {
      lb3Uptime: { targets: [] },
      refreshCadence: {
        intervalCount: 0,
        medianMs: null,
        judgement: null,
        buckets: [],
      },
      accidentalBlooms: { accidentalBlooms: [], count: 0, judgement: "good" },
      restackTax: {
        casts: [],
        castCount: 0,
        estimatedMana: 0,
        judgement: "good",
      },
      concurrentLb3Targets: {
        avgConcurrent: 0,
        peakConcurrent: 0,
        levels: [],
        judgement: null,
      },
    },
  };
}

function aFightResultWithLifebloom(
  fightId: number,
  lifebloomEpic: EpicResult<LifebloomDisciplineMetrics>,
): FightResult {
  return {
    fightId,
    bossName: "Test Boss",
    kill: true,
    bossPercentage: null,
    pullNumber: 1,
    durationMs: 5000,
    hasNaturesSwiftness: false,
    epics: {
      gcdEconomy: erroredEpic(),
      lifebloomDiscipline: lifebloomEpic,
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      crisisResponse: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
  };
}
```

Add a new test inside `describe("rollupDruid", ...)`:

```ts
it("excludes a null-judgement (zero-cast) fight's lifebloomDiscipline from the judgement/breakdown, while still counting it toward fightsReady", () => {
  const fights: FightResult[] = [
    aFightResultWithLifebloom(1, readyLifebloom("good")),
    aFightResultWithLifebloom(2, readyLifebloom(null)),
  ];
  const rollup = rollupDruid(fights);
  expect(rollup.lifebloomDiscipline.judgement).toBe("good");
  expect(rollup.lifebloomDiscipline.judgementBreakdown).toEqual({
    good: 1,
    fair: 0,
    bad: 0,
  });
  expect(rollup.lifebloomDiscipline.fightsReady).toBe(2);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: FAIL (`rollup.lifebloomDiscipline.judgement` is `"bad"` or a type error surfaces - `epicRollupBase` doesn't yet exclude null-judgement entries from the median)

- [ ] **Step 4: Fix `epicRollupBase` and `ReadyEntry<M>`**

In `scripts/lib/rollup.ts`, change:

```ts
interface ReadyEntry<M> {
  metrics: M;
  judgement: Judgement;
  durationMs: number;
}
```

to:

```ts
interface ReadyEntry<M> {
  metrics: M;
  judgement: Judgement | null;
  durationMs: number;
}
```

Then change `epicRollupBase`:

```ts
function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  return {
    judgement: weightedMedianJudgement(
      ready.map((r) => ({ judgement: r.judgement, weightMs: r.durationMs })),
    ),
    judgementBreakdown: judgementBreakdown(
      ready.map((r) => ({ judgement: r.judgement })),
    ),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}
```

to:

```ts
function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  // A fight excluded from this epic (e.g. Lifebloom Discipline with zero
  // Lifebloom casts) is "ready" but carries no judgement - it still
  // counts toward fightsReady (it didn't error), but is dropped from the
  // judgement/breakdown pooling, same as reportAggregation.ts's
  // rollupEpicJudgement handles the app-side equivalent.
  const judged = ready.filter(
    (r): r is ReadyEntry<M> & { judgement: Judgement } => r.judgement !== null,
  );
  return {
    judgement: weightedMedianJudgement(
      judged.map((r) => ({ judgement: r.judgement, weightMs: r.durationMs })),
    ),
    judgementBreakdown: judgementBreakdown(
      judged.map((r) => ({ judgement: r.judgement })),
    ),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Wire `hasLifebloomCast` into `calibrateReport.ts`**

In `scripts/lib/calibrateReport.ts`, change the import:

```ts
import { detectCarryInTargets } from "../../src/metrics/lifebloomStacks";
```

to:

```ts
import {
  detectCarryInTargets,
  hasLifebloomCast,
} from "../../src/metrics/lifebloomStacks";
```

Then, inside `computeFightResult`'s `lifebloomDiscipline` block, change:

```ts
return {
  summary: summarizeLifebloomDiscipline(
    lb3Uptime,
    refreshCadence,
    accidentalBlooms,
    restackTax,
    concurrentLb3Targets,
  ),
  metrics: {
    lb3Uptime,
    refreshCadence,
    accidentalBlooms,
    restackTax,
    concurrentLb3Targets,
  },
};
```

to:

```ts
return {
  summary: summarizeLifebloomDiscipline(
    lb3Uptime,
    refreshCadence,
    accidentalBlooms,
    restackTax,
    concurrentLb3Targets,
    hasLifebloomCast(castEvents, druidId, ctx.lifebloomAbilityIds),
  ),
  metrics: {
    lb3Uptime,
    refreshCadence,
    accidentalBlooms,
    restackTax,
    concurrentLb3Targets,
  },
};
```

- [ ] **Step 7: Run the full test suite and full typecheck**

Run: `npx vitest run`
Expected: PASS (every test file, app and scripts alike)

Run: `npm run typecheck`
Expected: no errors (this runs both `tsc -b` for `src/` and `tsc --noEmit -p tsconfig.scripts.json` for `scripts/`)

- [ ] **Step 8: Smoke-test the CLI tool against a real report**

Run: `npm run calibrate -- 4GYHZRdtL3bvhpc8` (a known-good report per `docs/testing.md`'s "Known real test reports" table)
Expected: completes without throwing; spot-check the printed Lifebloom Discipline section still has sensible numbers for a report where the druid casts Lifebloom throughout

- [ ] **Step 9: Lint, format, and commit**

Run: `npm run lint && npm run format:check`
Expected: no errors (run `npx prettier --write <file>` on anything flagged, then re-stage it)

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts scripts/lib/rollup.ts \
  scripts/lib/rollup.test.ts
git commit -m "fix(lifebloom): mirror the zero-cast exclusion in the CLI calibration tool"
```

---

## Task 4: Retire the spec

**Files:**

- Modify: `CLAUDE.md`
- Delete: `docs/specs/lifebloom-no-cast-judgement-design.md`

**Interfaces:** None - documentation only, no code.

- [ ] **Step 1: Append a note to CLAUDE.md's "Repo state" section**

Open `CLAUDE.md` and find the end of the single long running paragraph under `## Repo state` (it currently ends with the sentence describing story 602's enchant/gem coverage work). Append this new sentence directly after the final period of that paragraph, before the next `##` heading:

```
Also fixed the same week, free-floating (no backlog story): fights where the druid casts zero Lifebloom-family spells (e.g. a tank-less pure-raid-healing pull) now exclude Lifebloom Discipline from judgement entirely, rather than reading a false "Good" from `computeAccidentalBlooms`/`computeRestackTax` treating a literal `0` as clean data - `summarizeLifebloomDiscipline` (`src/metrics/epicSummary.ts`) short-circuits on a new `hasLifebloomCast` predicate (`src/metrics/lifebloomStacks.ts`), `EpicSummary.judgement` is now `Judgement | null` throughout the app's `EpicSummaryStatus` and the CLI calibration tool's mirrored `EpicResult<M>`, the overview widget and detail page show a plain note instead of a chip and skip mounting the five per-metric cards, and excluded fights are silently dropped from the whole-report rollup and `npm run calibrate`'s pooled stats, the same way still-loading/errored fights already are.
```

- [ ] **Step 2: Delete the shipped spec**

```bash
git rm docs/specs/lifebloom-no-cast-judgement-design.md
```

- [ ] **Step 3: Confirm nothing else references the deleted spec**

Run: `grep -r "lifebloom-no-cast-judgement-design" --include="*.md" .`
Expected: no output (the plan file `docs/plans/lifebloom-no-cast-judgement-plan.md` itself may reference the spec by path in its Global Constraints section - that's fine and expected, plans aren't retired until the branch merges)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: retire the lifebloom-no-cast-judgement spec"
```
