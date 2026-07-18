# Mana economy overheal recalibration (stories 905/907) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalibrate Bloom and Regrowth-direct overheal thresholds against real archetype-tagged corpus data (story 905), and fix `scripts/lib/rollup.ts`'s Nature's Swiftness informational-total pooling bug (story 907), which the plumbing this needs would otherwise leave half-done.

**Architecture:** `computeOverhealTable` gains an optional `archetypeBucket` parameter, defaulted to `"deep-resto"`. Bloom's threshold is recalibrated as one pooled value; a new `judgeRegrowthDirectOverheal` function branches on the bucket, mapping every non-dreamstate bucket to the deep-resto band. The two UI consumers (`OverhealTableCard`, `useManaEconomySummary`) each independently call the existing `useArchetypeBucket` hook (903a) to get the bucket, the same pattern `SwiftmendAuditCard` already uses. The CLI consumer (`scripts/lib/calibrateReport.ts`) already fetches the talent data this needs; it gains one `classifyBucket` call. Separately, `scripts/lib/rollup.ts`'s Nature's Swiftness informational totals are filtered to eligible fights, requiring `FightResult` to expose a new `hasNaturesSwiftness` field.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library.

## Global Constraints

- Spell/ability IDs are never hardcoded (project-wide rule) — not touched by this plan; `TalentBucket` values are an existing enum from `src/report/archetypeDetection.ts`, not spell IDs.
- Every R/O/G threshold constant must carry a sourcing comment pointing at its backlog story and `docs/thresholds.md` (principle 3). Every new/changed threshold in this plan follows that.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via the pre-commit hook — do not bypass it.
- Commits follow Conventional Commits (`type(scope): summary`).
- `docs/specs/mana-economy-recalibration-design.md` is the approved spec this plan implements — don't re-derive decisions already made there (archetype fallback rules, corpus sourcing, numeric candidates).

---

### Task 1: Recalibrate `computeOverhealTable`'s thresholds and add archetype-conditional Regrowth-direct judging

**Files:**

- Modify: `src/metrics/overhealTable.ts`
- Test: `src/metrics/overhealTable.test.ts`

**Interfaces:**

- Consumes: `TalentBucket` type from `src/report/archetypeDetection.ts` (already exists: `"deep-resto" | "likely-dreamstate-full" | "likely-dreamstate-partial" | "mostly-resto" | "mostly-balance" | "restokin-shaped" | "other-unclassified" | "unknown-no-talent-data"`).
- Produces: `computeOverhealTable(healingEvents, druidId, resolvedAbilities, archetypeBucket?)` — 4th parameter is new, optional, defaults to `"deep-resto"`. Every other task in this plan calls this new signature.

- [ ] **Step 1: Write the failing tests**

Open `src/metrics/overhealTable.test.ts`. Replace the existing Bloom boundary test (currently asserting the old 40/70 split) with the new 80/90 split, and add a new parametrized test for Regrowth-direct's archetype-conditional judging plus a default-bucket test. Replace this block:

```ts
it.each([
  { overhealPct: 39, expected: "green" },
  { overhealPct: 40, expected: "orange" },
  { overhealPct: 70, expected: "orange" },
  { overhealPct: 71, expected: "red" },
])(
  "judges a Bloom row at $overhealPct% overheal as $expected",
  ({ overhealPct, expected }) => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 33763,
        amount: 100 - overhealPct,
        overheal: overhealPct,
      }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows[0].judgement).toBe(expected);
  },
);
```

with:

```ts
it.each([
  { overhealPct: 79, expected: "green" },
  { overhealPct: 80, expected: "orange" },
  { overhealPct: 90, expected: "orange" },
  { overhealPct: 91, expected: "red" },
])(
  "judges a Bloom row at $overhealPct% overheal as $expected (recalibrated, story 905)",
  ({ overhealPct, expected }) => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 33763,
        amount: 100 - overhealPct,
        overheal: overhealPct,
      }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
    );

    expect(result.rows[0].judgement).toBe(expected);
  },
);

it.each([
  { bucket: "deep-resto" as const, overhealPct: 37, expected: "green" },
  { bucket: "deep-resto" as const, overhealPct: 38, expected: "orange" },
  { bucket: "deep-resto" as const, overhealPct: 60, expected: "orange" },
  { bucket: "deep-resto" as const, overhealPct: 61, expected: "red" },
  {
    bucket: "likely-dreamstate-full" as const,
    overhealPct: 59,
    expected: "green",
  },
  {
    bucket: "likely-dreamstate-full" as const,
    overhealPct: 60,
    expected: "orange",
  },
  {
    bucket: "likely-dreamstate-full" as const,
    overhealPct: 85,
    expected: "orange",
  },
  {
    bucket: "likely-dreamstate-full" as const,
    overhealPct: 86,
    expected: "red",
  },
  {
    bucket: "likely-dreamstate-partial" as const,
    overhealPct: 70,
    expected: "orange",
  },
  { bucket: "mostly-resto" as const, overhealPct: 61, expected: "red" },
  {
    bucket: "unknown-no-talent-data" as const,
    overhealPct: 61,
    expected: "red",
  },
])(
  "judges a Regrowth-direct row for $bucket at $overhealPct% overheal as $expected (story 905)",
  ({ bucket, overhealPct, expected }) => {
    const healingEvents = [
      aHealEvent({
        abilityGameID: 26980,
        amount: 100 - overhealPct,
        overheal: overhealPct,
      }),
    ];

    const result = computeOverhealTable(
      healingEvents,
      DRUID_ID,
      RESOLVED_ABILITIES,
      bucket,
    );

    expect(result.rows[0].judgement).toBe(expected);
  },
);

it("defaults Regrowth-direct to the deep-resto band when no archetype bucket is passed", () => {
  const healingEvents = [
    aHealEvent({ abilityGameID: 26980, amount: 39, overheal: 61 }),
  ];

  const result = computeOverhealTable(
    healingEvents,
    DRUID_ID,
    RESOLVED_ABILITIES,
  );

  expect(result.rows[0].judgement).toBe("red");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/overhealTable.test.ts`
Expected: FAIL — the Bloom test fails because the old 40/70 thresholds still apply (79% is currently red, not green); the new Regrowth-direct tests fail because `computeOverhealTable` doesn't accept a 4th argument yet and the shared direct-overheal threshold (30/50) doesn't match the new expected values.

- [ ] **Step 3: Implement the recalibrated thresholds and archetype-conditional judging**

In `src/metrics/overhealTable.ts`, add the import:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow, worstJudgement } from "./judgement";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { TalentBucket } from "../report/archetypeDetection";
```

Replace the two threshold functions:

```ts
// Bloom overheal per docs/backlog.md story 404: green < 40%, orange 40-70%, red > 70%.
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 40, orangeMax: 70 });
}

// Direct heal overheal per docs/backlog.md story 404: green < 30%, orange 30-50%, red > 50%.
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 });
}
```

with:

```ts
// Bloom overheal per docs/backlog.md story 905 (recalibrated from story 404's original
// 40/70 against real exemplar data -- see docs/thresholds.md): green < 80%, orange
// 80-90%, red > 90%. Archetype-invariant: deep-resto and dreamstate exemplars showed
// nearly identical Bloom overheal distributions, so this threshold isn't split by
// bucket, unlike Regrowth-direct below.
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 80, orangeMax: 90 });
}

// Direct heal overheal for Healing Touch and Swiftmend, per docs/backlog.md story 404:
// green < 30%, orange 30-50%, red > 50%. Story 905's exemplar review found both spells
// already fit this threshold well in every archetype bucket, so it's unchanged.
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 });
}

// Regrowth-direct overheal per docs/backlog.md story 905 (split from the shared
// "direct" threshold above because real exemplar data showed a genuine archetype
// divergence -- see docs/thresholds.md): deep-resto green < 38%, orange 38-60%, red
// > 60%; dreamstate (full or partial) green < 60%, orange 60-85%, red > 85%. Every
// other bucket (mostly-resto, mostly-balance, restokin-shaped, other-unclassified,
// unknown-no-talent-data) falls back to deep-resto's band -- those builds aren't
// well-supported by this tool yet (story 903d), so this story doesn't manufacture a
// new precision claim about them.
function judgeRegrowthDirectOverheal(
  overhealPct: number,
  bucket: TalentBucket,
): Judgement {
  if (
    bucket === "likely-dreamstate-full" ||
    bucket === "likely-dreamstate-partial"
  ) {
    return judgeThresholdBelow(overhealPct, { greenMax: 60, orangeMax: 85 });
  }
  return judgeThresholdBelow(overhealPct, { greenMax: 38, orangeMax: 60 });
}
```

Update the `RowSpec` interface's `judge` field type:

```ts
interface RowSpec {
  category: OverhealCategory;
  spell: string;
  judge: ((overhealPct: number, bucket: TalentBucket) => Judgement) | null;
}
```

(`judgeBloomOverheal` and `judgeDirectOverheal` keep their 1-parameter signatures — TypeScript allows assigning a function with fewer declared parameters to a type expecting more, since JS ignores extra call arguments a function doesn't declare.)

Update `REGROWTH_DIRECT`'s row spec to use the new function:

```ts
const REGROWTH_DIRECT: RowSpec = {
  category: "direct",
  spell: "Regrowth (direct)",
  judge: judgeRegrowthDirectOverheal,
};
```

Update `computeOverhealTable`'s signature (add the 4th parameter with a default):

```ts
export function computeOverhealTable(
  healingEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  archetypeBucket: TalentBucket = "deep-resto",
): OverhealTableResult {
```

Update the row-judging call inside the function body:

```ts
rows.push({
  category: rowSpec.category,
  spell: rowSpec.spell,
  amount: totalsForRow.amount,
  overheal: totalsForRow.overheal,
  overhealPct,
  judgement:
    rowSpec.judge === null ? null : rowSpec.judge(overhealPct, archetypeBucket),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/overhealTable.test.ts`
Expected: PASS — all tests green, including the untouched Healing-Touch/Swiftmend boundary test and the worst-of test (both use Swiftmend, whose threshold is unchanged).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This will surface any other `computeOverhealTable` call site that doesn't yet compile — expected, since Tasks 2-4 haven't updated them yet. If Task 1 is executed standalone, confirm the only errors are at the three known call sites (`OverhealTableCard/index.tsx`, `useManaEconomySummary.ts`, `scripts/lib/calibrateReport.ts`) and that they're unrelated to Task 1's own changes (they're all still valid — the 4th parameter is optional).

- [ ] **Step 6: Commit**

```bash
git add src/metrics/overhealTable.ts src/metrics/overhealTable.test.ts
git commit -m "feat(mana-economy): recalibrate Bloom overheal and split Regrowth-direct by archetype"
```

---

### Task 2: Wire `OverhealTableCard` to the detected archetype bucket

**Files:**

- Modify: `src/app/components/OverhealTableCard/index.tsx`
- Test: `src/app/components/OverhealTableCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeOverhealTable(healingEvents, druidId, resolvedAbilities, archetypeBucket?)` from Task 1; `useArchetypeBucket(accessToken, reportCode, fight, druidId, fetchEvents): ArchetypeBucketStatus` (existing, `src/app/components/Scorecard/useArchetypeBucket.ts`) — `ArchetypeBucketStatus` is `{status: "loading"} | {status: "error"; error: string} | {status: "ready"; bucket: TalentBucket; restoration: number}`.
- Produces: no new exports — this task only changes `OverhealTableCard`'s internal behavior and copy text.

- [ ] **Step 1: Write the failing test**

Open `src/app/components/OverhealTableCard/index.test.tsx`. Add `aCombatantInfoEvent` to the existing factories import:

```tsx
import {
  aCombatantInfoEvent,
  aFight,
  aHealEvent,
} from "../../../testUtils/factories";
```

Add this test at the end of the `describe` block, before the closing `});`:

```tsx
it("judges Regrowth-direct overheal against the detected archetype's threshold band", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
  const resolvedAbilities = new Map<number, ResolvedAbility>([
    [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  ]);
  const healingEvents = [
    aHealEvent({ abilityGameID: 26980, amount: 30, overheal: 70 }), // 70% overheal, direct (not tick)
  ];
  const fetchEvents = (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 35 }, { id: 0 }, { id: 13 }],
        }),
      ]);
    }
    return Promise.resolve([]);
  };

  render(
    <OverhealTableCard
      accessToken="test-token"
      reportCode="4GYHZRdtL3bvhpc8"
      fight={fight}
      druidId={2}
      resolvedAbilities={resolvedAbilities}
      fetchEvents={fetchEvents}
    />,
  );

  await waitFor(() =>
    expect(screen.getByText("Regrowth (direct)")).toBeInTheDocument(),
  );
  // 70% overheal is red under deep-resto's band (>60%) but only orange under
  // dreamstate's wider band (60-85%). This druid's talents (35/0/13) classify as
  // likely-dreamstate-full, so it must land orange ("Fair"), not red ("Bad").
  expect(screen.getByText("Fair")).toBeInTheDocument();
  expect(screen.queryByText("Bad")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/OverhealTableCard/index.test.tsx`
Expected: FAIL — the new test fails because `OverhealTableCard` doesn't yet read the archetype bucket, so Regrowth-direct is judged under the deep-resto default (60% falls inside deep-resto's 38-60 orange band too... check: 70% > 60 is red under deep-resto, so today it renders "Bad", not "Fair" — the test's `expect(screen.getByText("Fair"))` fails, or times out if "Fair" never appears).

- [ ] **Step 3: Wire the archetype bucket**

In `src/app/components/OverhealTableCard/index.tsx`, add the import:

```tsx
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";
```

Update the `THRESHOLD` copy:

```tsx
const THRESHOLD =
  "Separate thresholds by heal type. Bloom overheal (Lifebloom): green < 80%, orange 80-90%, red > 90%. Regrowth-direct overheal varies by detected talent archetype: deep-resto green < 38%, orange 38-60%, red > 60%; Dreamstate green < 60%, orange 60-85%, red > 85% (other/undetected archetypes use the deep-resto band). Healing Touch and Swiftmend overheal: green < 30%, orange 30-50%, red > 50%. HoT tick overheal (Rejuvenation, Regrowth's HoT portion) is shown for context only, with no judgement of its own — high overheal is inherent to HoTs whose ticks often land on a target other healers are also topping off.";
```

Inside the component function, add the hook call right after `const [result, setResult] = useState<FetchResult | null>(null);`:

```tsx
const archetypeStatus = useArchetypeBucket(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
const archetypeBucket =
  archetypeStatus.status === "ready" ? archetypeStatus.bucket : undefined;
```

Update the `computeOverhealTable` call inside `useEffect` to pass `archetypeBucket`, and add it to the effect's dependency array:

```tsx
      .then((healingEvents) => {
        try {
          const computed = computeOverhealTable(
            healingEvents,
            druidId,
            resolvedAbilities,
            archetypeBucket,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the overheal table.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    resolvedAbilities,
    archetypeBucket,
    fetchEvents,
  ]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/OverhealTableCard/index.test.tsx`
Expected: PASS — all 8 tests (7 existing + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/OverhealTableCard/index.tsx src/app/components/OverhealTableCard/index.test.tsx
git commit -m "feat(mana-economy): use detected archetype bucket in OverhealTableCard"
```

---

### Task 3: Wire `useManaEconomySummary` to the detected archetype bucket

**Files:**

- Modify: `src/app/components/Scorecard/useManaEconomySummary.ts`
- Test: `src/app/components/Scorecard/useManaEconomySummary.test.ts`

**Interfaces:**

- Consumes: same `computeOverhealTable` and `useArchetypeBucket` as Task 2 (same directory, so `useArchetypeBucket` imports as `./useArchetypeBucket`).
- Produces: no external signature change — `useManaEconomySummary`'s own parameters and return type (`EpicSummaryStatus`) are unchanged, so `useFightEpicSummaries.ts` (its only caller) needs no changes.

- [ ] **Step 1: Write the failing test**

Open `src/app/components/Scorecard/useManaEconomySummary.test.ts`. Add `aCombatantInfoEvent` to the existing factories import:

```ts
import {
  aCastEvent,
  aCombatantInfoEvent,
  aFight,
  aHealEvent,
} from "../../../testUtils/factories";
```

Add this test at the end of the `describe` block, before the closing `});`:

```ts
it("uses the detected archetype's Regrowth-direct band when pooling the overheal table", async () => {
  const fight = aFight({
    id: 6,
    kill: false,
    startTime: 0,
    endTime: 120_000,
  });
  const castEvents = [
    aCastEvent({
      timestamp: 1000,
      sourceID: 2,
      resourceActor: 1,
      classResources: [{ amount: 10000, max: 0, type: 9000, cost: 0 }],
    }),
  ];
  const healingEvents = [
    aHealEvent({ abilityGameID: 26980, amount: 30, overheal: 70 }), // Regrowth direct, 70% overheal
  ];
  const resolvedAbilities = new Map<number, ResolvedAbility>([
    [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  ]);
  const fetchEvents = (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 35 }, { id: 0 }, { id: 13 }],
        }),
      ]);
    }
    return Promise.resolve(castEvents);
  };

  const { result } = renderHook(() =>
    useManaEconomySummary(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      fight,
      2,
      resolvedAbilities,
      new Map(),
      fetchEvents,
    ),
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  // 70% overheal is red under deep-resto's Regrowth-direct band (>60%) but only
  // orange under dreamstate's (60-85%). This druid's talents (35/0/13) classify as
  // likely-dreamstate-full, so the pooled judgement must be orange, not red.
  expect(result.current).toMatchObject({
    status: "ready",
    judgement: "orange",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: FAIL — the new test fails because the hook doesn't yet fetch/apply the archetype bucket, so the 70% Regrowth-direct overheal is judged red under the deep-resto default, not orange.

- [ ] **Step 3: Wire the archetype bucket**

In `src/app/components/Scorecard/useManaEconomySummary.ts`, add the import:

```ts
import { useArchetypeBucket } from "./useArchetypeBucket";
```

Add the hook call right after `const [state, setState] = useState<TaggedState | null>(null);`:

```ts
const archetypeStatus = useArchetypeBucket(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
const archetypeBucket =
  archetypeStatus.status === "ready" ? archetypeStatus.bucket : undefined;
```

Update the `computeOverhealTable` call inside the effect:

```ts
const overhealTable = computeOverhealTable(
  healingEvents,
  druidId,
  resolvedAbilities,
  archetypeBucket,
);
```

Add `archetypeBucket` to the effect's dependency array (after `actorClasses,`):

```ts
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    fight.kill,
    druidId,
    resolvedAbilities,
    actorClasses,
    archetypeBucket,
    fetchEvents,
  ]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: PASS — all 4 tests (3 existing + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useManaEconomySummary.ts src/app/components/Scorecard/useManaEconomySummary.test.ts
git commit -m "feat(mana-economy): use detected archetype bucket in useManaEconomySummary"
```

---

### Task 4: Thread the archetype bucket into `scripts/lib/calibrateReport.ts`'s `computeOverhealTable` call

**Files:**

- Modify: `scripts/lib/calibrateReport.ts`

**Interfaces:**

- Consumes: `classifyBucket(balance, feral, restoration): TalentBucket` (existing, `src/report/archetypeDetection.ts`); `computeOverhealTable`'s new 4th parameter from Task 1.
- Produces: no new exports — internal wiring only. `scripts/lib/rollup.ts` (Task 5) does not depend on this task's output; they're independent and can be done in either order, but are numbered sequentially here since both touch `calibrateReport.ts`'s neighborhood.

There is no unit-test file for `scripts/lib/calibrateReport.ts` in this repo (verified — no test files exist anywhere under `scripts/`), so this task has no test step. Its safety net is Tier 0 typecheck plus the live verification in Task 5's Step 4, which exercises this exact code path end-to-end against a real report.

- [ ] **Step 1: Add the `classifyBucket` import**

In `scripts/lib/calibrateReport.ts`, update the import from `archetypeDetection`:

```ts
import {
  classifyBucket,
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../src/report/archetypeDetection";
```

- [ ] **Step 2: Compute the archetype bucket alongside the existing talent-derived flags**

Find this existing block (around line 208-211):

```ts
const talents = parseTalentPoints(combatantInfoEvents, druidId);
const restoration = talents === null ? 0 : talents[2];
const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
const hasNaturesSwiftness = restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
```

Add one line after it:

```ts
const talents = parseTalentPoints(combatantInfoEvents, druidId);
const restoration = talents === null ? 0 : talents[2];
const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
const hasNaturesSwiftness = restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
const archetypeBucket =
  talents === null
    ? "unknown-no-talent-data"
    : classifyBucket(talents[0], talents[1], talents[2]);
```

- [ ] **Step 3: Pass the bucket into the `computeOverhealTable` call**

Find this existing block (inside the `manaEconomy` epic's `toEpicResult` callback):

```ts
const overhealTable = computeOverhealTable(
  healingEvents,
  druidId,
  ctx.resolvedAbilities,
);
```

Change it to:

```ts
const overhealTable = computeOverhealTable(
  healingEvents,
  druidId,
  ctx.resolvedAbilities,
  archetypeBucket,
);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/calibrateReport.ts
git commit -m "feat(mana-economy): thread archetype bucket into calibrate.ts's overheal computation"
```

---

### Task 5: Fix Nature's Swiftness informational-total pooling (story 907)

**Files:**

- Modify: `scripts/lib/types.ts`
- Modify: `scripts/lib/calibrateReport.ts`
- Modify: `scripts/lib/rollup.ts`

**Interfaces:**

- Consumes: the existing `hasNaturesSwiftness` local variable in `calibrateReport.ts` (computed in Task 4's Step 2, or already present if Task 4 hasn't run — it predates this plan).
- Produces: `FightResult.hasNaturesSwiftness: boolean` (new field) — consumed only by `rollup.ts`'s informational pooling in this task; no other consumer needed.

This task, like Task 4, has no unit-test file to extend (no test precedent under `scripts/`). Verification is Tier 0 typecheck plus a live `npm run calibrate` run against a real report with a documented Nature's-Swiftness-ineligible druid.

- [ ] **Step 1: Add `hasNaturesSwiftness` to `FightResult`**

In `scripts/lib/types.ts`, find the `FightResult` interface:

```ts
export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  epics: {
```

Add the new field after `durationMs`:

```ts
export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  hasNaturesSwiftness: boolean;
  epics: {
```

- [ ] **Step 2: Populate it in `calibrateReport.ts`'s returned `FightResult`**

Find the `return` statement at the end of `computeFightResult` (around line 374):

```ts
  return {
    fightId: fight.id,
    bossName: fight.name,
    kill: fight.kill,
    bossPercentage: fight.bossPercentage,
    pullNumber,
    durationMs,
    epics: {
```

Add the field:

```ts
  return {
    fightId: fight.id,
    bossName: fight.name,
    kill: fight.kill,
    bossPercentage: fight.bossPercentage,
    pullNumber,
    durationMs,
    hasNaturesSwiftness,
    epics: {
```

- [ ] **Step 3: Filter the informational pooling in `rollup.ts`**

Find this block in `scripts/lib/rollup.ts` (in the `// --- Informational (no epic judgement) ---` section):

```ts
    naturesSwiftnessCastsTotal: sum(
      fights.map((f) => f.informational.naturesSwiftnessAudit.castCount),
    ),
    naturesSwiftnessAvailableWindowsTotal: sum(
      fights.map((f) => f.informational.naturesSwiftnessAudit.availableWindows),
    ),
```

Replace it with:

```ts
    // Story 907: a fight where this druid's build can't reach Nature's Swiftness's
    // 20-Restoration requirement has no real availability -- computeNaturesSwiftnessAudit's
    // cooldown-based availableWindows estimate is fictitious there (the player could
    // never actually cast it), so both totals below exclude those fights the same way
    // story 903c already excludes them from the live app's NaturesSwiftnessCard.
    naturesSwiftnessCastsTotal: sum(
      fights
        .filter((f) => f.hasNaturesSwiftness)
        .map((f) => f.informational.naturesSwiftnessAudit.castCount),
    ),
    naturesSwiftnessAvailableWindowsTotal: sum(
      fights
        .filter((f) => f.hasNaturesSwiftness)
        .map((f) => f.informational.naturesSwiftnessAudit.availableWindows),
    ),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Live verification against a real Nature's-Swiftness-ineligible druid**

`docs/testing.md`'s known-reports table already documents report `F7aL6x13zVq8kTRt`, druid Nebd (druidId 33), talents 48/0/13 — Restoration 13 is below both Swiftmend's 30 and Nature's Swiftness's 20 thresholds, so every one of his fights should now be excluded from the Nature's Swiftness informational totals.

Run: `npm run calibrate -- F7aL6x13zVq8kTRt`

This writes `calibration-data/F7aL6x13zVq8kTRt.json`. Open it and inspect Nebd's `rollup.informational` object:

- Confirm `naturesSwiftnessCastsTotal` and `naturesSwiftnessAvailableWindowsTotal` are both `0` (previously `availableWindowsTotal` would have been a nonzero cooldown-based estimate summed across his fights, despite him never being able to cast it).
- Spot-check one other druid in the same output who _is_ Nature's-Swiftness-eligible (Restoration ≥ 20) and confirm their `naturesSwiftnessAvailableWindowsTotal` is still nonzero — this confirms the filter excludes the right fights, not all of them.

If `WCL_TEST_ACCESS_TOKEN` isn't set in `.env.local`, follow `CLAUDE.md`'s "Running live WCL queries yourself" section to obtain one before running this step — do not skip it or substitute a synthetic check, since this is the only verification this task has.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts scripts/lib/rollup.ts
git commit -m "fix(mana-economy): exclude Nature's Swiftness-ineligible fights from calibrate.ts's informational pooling"
```

---

### Task 6: Update `docs/thresholds.md` with the recalibrated values

**Files:**

- Modify: `docs/thresholds.md`

**Interfaces:**

- Consumes: the final threshold values from Task 1 (Bloom 80/90; Regrowth-direct deep-resto 38/60, dreamstate 60/85).
- Produces: nothing consumed by other tasks — pure documentation.

- [ ] **Step 1: Update the mana economy threshold table**

In `docs/thresholds.md`, find the mana economy section's table row:

```
| Bloom overheal                                        | green / orange / red          | <40% / 40–70% / >70%                                                          | story 404 | `src/metrics/overhealTable.ts`                                                                                         |
| Direct heal overheal (Regrowth direct, HT, Swiftmend) | green / orange / red          | <30% / 30–50% / >50%                                                          | story 404 | `src/metrics/overhealTable.ts`                                                                                         |
```

Replace it with three rows (splitting Regrowth-direct out from HT/Swiftmend):

```
| Bloom overheal                                        | green / orange / red          | <80% / 80–90% / >90%                                                          | story 404, revised story 905 | `src/metrics/overhealTable.ts`                                                                                         |
| Regrowth-direct overheal (deep-resto)                 | green / orange / red          | <38% / 38–60% / >60%                                                          | story 404, revised story 905 | `src/metrics/overhealTable.ts`                                                                                         |
| Regrowth-direct overheal (dreamstate, full or partial) | green / orange / red          | <60% / 60–85% / >85%                                                          | story 905 | `src/metrics/overhealTable.ts`                                                                                         |
| Direct heal overheal (Healing Touch, Swiftmend)       | green / orange / red          | <30% / 30–50% / >50%                                                          | story 404 | `src/metrics/overhealTable.ts`                                                                                         |
```

- [ ] **Step 2: Add a dated calibration-review paragraph**

Immediately after the mana economy table (matching the style of the existing GCD-economy and Lifebloom-discipline calibration-review paragraphs elsewhere in this file), add:

```markdown
**Calibration review (story 905, 2026-07):** mana economy's whole-report rollup was found to be driven almost entirely by overheal (204/393 real fight-rows red; mana curve, consumables, and Innervate were all reasonably distributed on their own). Reviewed against the same story-901 exemplar corpus 902/908 used for deep-resto data, plus the broader talent-tagged `calibration-data/` corpus for dreamstate (no dedicated dreamstate exemplar hunt exists yet — see below).

- **Bloom (Lifebloom) overheal: green boundary revised 40% → 80%, red boundary revised 70% → 90%, unchanged across archetypes.** Real deep-resto and dreamstate exemplars both cluster at 72-74% median overheal — the old 70% red line convicted the median real player of any archetype. The new bands land roughly 60% green / 25% orange / 15% red across the pooled sample.
- **Regrowth-direct overheal split by archetype for the first time.** deep-resto's real median (31%) sat close to the old boundary already, so its band moved modestly (green < 30% → < 38%, red > 50% → > 60%). Dreamstate's real median (50%, p75 84%) is structurally much higher, so its band is substantially wider (green < 60%, red > 85%) — **this number is provisional**, calibrated against the broader talent-tagged corpus rather than a behaviorally-validated exemplar set (no dreamstate equivalent of story 901's deep-resto exemplar hunt exists yet); a future "901 but for dreamstate" story would strengthen it. Every other archetype bucket (mostly-resto, mostly-balance, restokin-shaped, other-unclassified, unknown-no-talent-data) uses the deep-resto band as a fallback default, since those builds aren't well-supported by this tool yet (story 903d) and this review doesn't manufacture a new precision claim about them.
- **Healing Touch and Swiftmend overheal: no change.** Both already fit the existing 30%/50% bands well in every archetype bucket (median 0-4% overheal) — real validation, not a guess.
```

- [ ] **Step 3: Format and typecheck**

Run: `npm run format` then `npm run typecheck`
Expected: no errors (this is a markdown-only change, so typecheck is a formality, but the pre-commit hook runs it regardless).

- [ ] **Step 4: Commit**

```bash
git add docs/thresholds.md
git commit -m "docs: record story 905's overheal threshold recalibration in the threshold catalog"
```

---

### Task 7: Retire stories 905/907's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/mana-economy-recalibration-design.md`

**Interfaces:**

- Consumes: nothing — this is a documentation-only cleanup task, run last.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Grep for any other reference to the spec file before deleting it**

Run: `grep -rn "mana-economy-recalibration-design" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only `docs/backlog.md` (if it was ever linked there — it wasn't, per this plan) and the file itself. If nothing else references it, proceed.

- [ ] **Step 2: Mark story 905 done in `docs/backlog.md`**

Find:

```
### 905 — Recalibrate mana economy thresholds 🔲 Todo

I want mana economy's thresholds reviewed against real data, so that judgements reflect real play rather than an artifact of overheal thresholds tuned for a different gear/content-progression assumption. Real corpus data showed mana economy driven almost entirely by the overheal sub-metric (204/393 fight-rows red — mana curve, consumables, and Innervate were all reasonably distributed on their own). Scope and approach are not yet decided — parked pending the outcome of stories 900-903, since overheal patterns likely split by talent archetype too (a Balance-hybrid healer's overheal profile may look nothing like a deep-resto one's).

**Acceptance criteria**

- TBD — revisit once stories 900-903 land and the corpus can be split by archetype; recalibrating overheal against an un-archetyped corpus risks repeating story 802's original mistake (judging a mixed population against one playstyle's thresholds).
```

Replace with:

```
### 905 — Recalibrate mana economy thresholds ✅ Done

I want mana economy's thresholds reviewed against real data, so that judgements reflect real play rather than an artifact of overheal thresholds tuned for a different gear/content-progression assumption. Real corpus data showed mana economy driven almost entirely by the overheal sub-metric (204/393 fight-rows red — mana curve, consumables, and Innervate were all reasonably distributed on their own). Pooling the corpus by story 900/903a's archetype buckets found two distinct problems: Bloom overheal was miscalibrated for every archetype alike (both deep-resto and dreamstate exemplars cluster at ~72-74% median overheal against an old 70% red line), while Regrowth-direct overheal genuinely differs by archetype (deep-resto median 31% vs. dreamstate median 50%, p75 84%) — Healing Touch and Swiftmend overheal, by contrast, already fit the existing threshold well in both archetypes and needed no change. See `docs/thresholds.md`'s story 905 calibration-review paragraph for the full numeric findings, including the explicit caveat that dreamstate's Regrowth-direct number is provisional (calibrated against the broader talent-tagged corpus, not a behaviorally-validated exemplar set — no dreamstate equivalent of story 901 exists yet).

**Acceptance criteria**

- Bloom overheal's threshold is recalibrated as a single value, unchanged across archetypes (`src/metrics/overhealTable.ts`'s `judgeBloomOverheal`).
- Regrowth-direct overheal gets its own threshold per archetype bucket, computed by `computeOverhealTable`'s new `archetypeBucket` parameter (default `"deep-resto"`) and consumed by `OverhealTableCard`, `useManaEconomySummary`, and `scripts/lib/calibrateReport.ts` alike, each sourcing the bucket from 903a's existing `useArchetypeBucket`/`classifyBucket`.
- Healing Touch and Swiftmend overheal are left unchanged.
- `docs/thresholds.md` is updated with the new values and a dated calibration-review paragraph.
```

- [ ] **Step 3: Mark story 907 done in `docs/backlog.md`**

Find:

```
### 907 — Talent-aware pooling for the calibration CLI tool 🔲 Todo

Depends on 903c. I want `scripts/lib/rollup.ts`'s whole-report pooling (used by `scripts/calibrate.ts`) to exclude a fight's Swiftmend/Nature's Swiftness metrics from a druid's numeric rollup when 903a's per-fight talent data shows the build can't reach that talent, so the CLI tool's own calibration output doesn't suffer the same fake-green/fake-availability distortion 903c fixes in the live app.

**Acceptance criteria**

- `scripts/calibrate.ts`'s fight-context building fetches `CombatantInfo` per fight (reusing 903a's `parseTalentPoints`) and threads the resulting Restoration point count into its metrics pipeline.
- `scripts/lib/rollup.ts`'s `SpellDisciplineRollup` pooling excludes a fight's Swiftmend audit judgement/stats from the whole-report numeric rollup when that fight's druid can't reach Swiftmend's talent threshold (903c's threshold constant, reused not redefined), and similarly for Nature's Swiftness.
- Confirmed against a real report already known to include a Swiftmend-ineligible druid (e.g. `docs/testing.md`'s `bKRZ68XqgwYkxtzm` entry).
```

Replace with:

```
### 907 — Talent-aware pooling for the calibration CLI tool ✅ Done

Depends on 903c. I want `scripts/lib/rollup.ts`'s whole-report pooling (used by `scripts/calibrate.ts`) to exclude a fight's Swiftmend/Nature's Swiftness metrics from a druid's numeric rollup when 903a's per-fight talent data shows the build can't reach that talent, so the CLI tool's own calibration output doesn't suffer the same fake-green/fake-availability distortion 903c fixes in the live app. Implemented alongside story 905, whose archetype-bucket plumbing this reuses. Investigating this against the real code (not just the story's original hunch) found the described Swiftmend distortion doesn't actually reproduce: `computeSwiftmendAudit` already returns `wastefulPct: 0` with `weight: 0` (zero real casts) for an ineligible fight, and a zero-weight entry is mathematically neutral in `scripts/lib/rollup.ts`'s `countWeightedAverage` — confirmed against real corpus output (`swiftmendWastefulPctPooled: null`, not a fake number, for a talent-confirmed Swiftmend-ineligible druid). The real live bug was in `InformationalRollup.naturesSwiftnessAvailableWindowsTotal`, a plain `sum()` with no such protection, silently accumulating a fictitious cooldown-based "available windows" count from Nature's-Swiftness-ineligible fights.

**Acceptance criteria**

- `scripts/lib/calibrateReport.ts`'s fight-context building already fetches `CombatantInfo` per fight and computes `hasNaturesSwiftness` (predates this story) — it now also exposes `hasNaturesSwiftness` on the returned `FightResult`.
- `scripts/lib/rollup.ts`'s informational pooling excludes a fight's Nature's Swiftness `castCount`/`availableWindows` from `naturesSwiftnessCastsTotal`/`naturesSwiftnessAvailableWindowsTotal` when that fight's druid can't reach Nature's Swiftness's talent threshold.
- Swiftmend's own `swiftmendWastefulPctPooled` needed no change — verified safe by the corpus check above, documented here rather than silently left unexamined.
- Confirmed against a real report already known to include a Nature's-Swiftness-ineligible druid (`docs/testing.md`'s `F7aL6x13zVq8kTRt` entry, druid Nebd, Restoration 13).
```

- [ ] **Step 4: Delete the spec**

```bash
rm docs/specs/mana-economy-recalibration-design.md
```

- [ ] **Step 5: Format, typecheck, lint**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md
git rm docs/specs/mana-economy-recalibration-design.md
git commit -m "docs: close out stories 905/907, retire the mana-economy recalibration spec"
```

---

## Self-Review Notes

- **Spec coverage:** every acceptance criterion the spec implies is covered — Bloom recalibration (Task 1), Regrowth-direct archetype split (Task 1) with all three consumers wired (Tasks 2-4), the 907 fold-in corrected to its real target (Task 5), docs (Tasks 6-7).
- **Type consistency:** `archetypeBucket` is spelled identically across Tasks 1-4; `hasNaturesSwiftness` is spelled identically across Task 5's three files; `TalentBucket`'s member names (`"likely-dreamstate-full"`, `"likely-dreamstate-partial"`, etc.) are copied verbatim from `src/report/archetypeDetection.ts` in every task that references them.
- **No placeholders:** every threshold value, file path, and code block above is concrete; nothing deferred to "TBD."
