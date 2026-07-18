# Story 903c — Hide metrics whose prerequisite talent is unreachable (app): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Swiftmend quality audit and Nature's Swiftness cards (with an explanatory placeholder) when the selected druid's actual per-fight Restoration point count can't reach that talent; exclude a hidden metric's judgement/stats from the pooled "Spell discipline" epic summary (shared by the Scorecard widget and `ReportDashboard`'s rollup); and fix Death Forensics' `unspentCount` inflation for the same reason.

**Architecture:** Extend 903a's `useArchetypeBucket` hook to expose the raw Restoration point count. Cards without their own talent fetch (`SwiftmendAuditCard`, `NaturesSwiftnessCard`) call that hook directly. Hooks that already run their own multi-dataType fetch (`useSpellDisciplineSummary`, `useDeathForensicsSummary`, `DeathForensicsCard`) add `CombatantInfo` to their existing `Promise.all` and call the underlying `parseTalentPoints` function directly instead of nesting a second hook.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (existing project stack — no new dependencies).

Full design rationale: `docs/specs/903c-talent-gated-card-hiding-design.md`. Backlog acceptance criteria: `docs/backlog.md` story 903c. The CLI calibration tool's own talent-aware pooling is explicitly out of scope — filed as story 907.

## Global Constraints

- Commits follow Conventional Commits (`type(scope): summary`).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via a pre-commit hook — never bypass it.
- `SWIFTMEND_MIN_RESTORATION = 30` and `NATURES_SWIFTNESS_MIN_RESTORATION = 20` must be defined once (`src/report/archetypeDetection.ts`) and reused everywhere — never redefined or hardcoded inline elsewhere.
- **Critical test-fixture consequence, present in almost every task below:** every existing test file touched in this plan uses a shared `makeFetchEvents`-style helper (or a bare `fetchEvents` mock) that does **not** currently branch on `"CombatantInfo"`. Once a component starts requesting that dataType, an un-updated mock will route it to whatever the helper's fallback case returns — which almost never has a valid `talents` field — making `parseTalentPoints` return `null`, `restoration` read `0`, and every gate fail. Concretely: `SwiftmendAuditCard`'s and `DeathForensicsCard`'s `makeFetchEvents` helpers currently fall through to returning `buffEvents` for any unmatched dataType; `NaturesSwiftnessCard`'s falls through to `[]`. Each task below identifies exactly which existing tests this breaks and how to fix them — this is required, not optional cleanup, the same as the fixture work in stories 903a/903b.
- `computeDeathForensics`'s two new boolean parameters must be passed in the same order at both call sites (`useDeathForensicsSummary`, `DeathForensicsCard`) — `CLAUDE.md` flags same-typed-parameter reordering as the one class of bug `npm run typecheck` won't catch.
- A story isn't done until its paperwork is retired: the final task deletes this plan and `docs/specs/903c-talent-gated-card-hiding-design.md`, and marks 903c done in `docs/backlog.md`, in the same commit.

---

### Task 1: Talent-threshold constants

**Files:**

- Modify: `src/report/archetypeDetection.ts`

**Interfaces:**

- Produces: `SWIFTMEND_MIN_RESTORATION: number`, `NATURES_SWIFTNESS_MIN_RESTORATION: number`, both exported. Used by Tasks 3-7.

- [ ] **Step 1: Add the two constants**

In `src/report/archetypeDetection.ts`, add directly below the existing `TalentBucket` type definition (before `classifyBucket`):

```ts
// Sourced from TBC's universal 5-points-per-talent-tier rule (tier N
// unlocks at 5*(N-1) points spent, uniform across every class/tree) applied
// to Nature's Swiftness's tier-5 placement — cross-validated against this
// file's own already-verified figures: Swiftmend (tier 7 -> 30 points) and
// Tree of Life (tier 9 -> 40 points to unlock the tier + 1 spent on the
// capstone itself = 41) both match this repo's existing, live-data-confirmed
// thresholds exactly (see docs/backlog.md).
export const NATURES_SWIFTNESS_MIN_RESTORATION = 20;
export const SWIFTMEND_MIN_RESTORATION = 30;
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS (no consumers yet — this step just confirms the file still compiles).

- [ ] **Step 3: Commit**

```bash
git add src/report/archetypeDetection.ts
git commit -m "feat(report): add Swiftmend/Nature's Swiftness talent-point thresholds"
```

---

### Task 2: Extend `useArchetypeBucket` to expose the raw Restoration point count

**Files:**

- Modify: `src/app/components/Scorecard/useArchetypeBucket.ts`
- Modify: `src/app/components/Scorecard/useArchetypeBucket.test.ts`

**Interfaces:**

- Produces: `ArchetypeBucketStatus`'s ready variant gains `restoration: number`. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Update the failing test first**

In `src/app/components/Scorecard/useArchetypeBucket.test.ts`, update the three existing `toEqual` assertions on the ready/error states to include the new field. Replace:

```ts
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({ status: "ready", bucket: "deep-resto" });
  });
```

with:

```ts
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      bucket: "deep-resto",
      restoration: 41,
    });
  });
```

Replace:

```ts
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      bucket: "unknown-no-talent-data",
    });
  });
```

with:

```ts
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      bucket: "unknown-no-talent-data",
      restoration: 0,
    });
  });
```

(The error-status test's assertion is unchanged — `restoration` only exists on the `ready` variant.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useArchetypeBucket.test.ts`
Expected: FAIL — both `toEqual` assertions above now expect a `restoration` field the current implementation doesn't return.

- [ ] **Step 3: Update the implementation**

In `src/app/components/Scorecard/useArchetypeBucket.ts`, replace:

```ts
export type ArchetypeBucketStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; bucket: TalentBucket };
```

with:

```ts
export type ArchetypeBucketStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; bucket: TalentBucket; restoration: number };
```

Replace:

```ts
fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo").then(
  (combatantInfoEvents) => {
    const talents = parseTalentPoints(combatantInfoEvents, druidId);
    const bucket: TalentBucket =
      talents === null
        ? "unknown-no-talent-data"
        : classifyBucket(talents[0], talents[1], talents[2]);
    setState({ accessToken, summary: { status: "ready", bucket } });
  },
);
```

with:

```ts
fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo").then(
  (combatantInfoEvents) => {
    const talents = parseTalentPoints(combatantInfoEvents, druidId);
    const bucket: TalentBucket =
      talents === null
        ? "unknown-no-talent-data"
        : classifyBucket(talents[0], talents[1], talents[2]);
    const restoration = talents === null ? 0 : talents[2];
    setState({
      accessToken,
      summary: { status: "ready", bucket, restoration },
    });
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useArchetypeBucket.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npx vitest run`
Expected: all PASS — this field is purely additive, so `Scorecard/index.tsx`'s existing destructuring of `archetypeStatus.bucket` is unaffected, and `Scorecard/index.test.tsx` should still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/useArchetypeBucket.ts src/app/components/Scorecard/useArchetypeBucket.test.ts
git commit -m "feat(scorecard): expose raw Restoration point count from useArchetypeBucket"
```

---

### Task 3: Gate `SwiftmendAuditCard`

**Files:**

- Modify: `src/app/components/SwiftmendAuditCard/index.tsx`
- Modify: `src/app/components/SwiftmendAuditCard/index.test.tsx`

**Interfaces:**

- Consumes: `useArchetypeBucket` from `../../../app/components/Scorecard/useArchetypeBucket` (relative path from this file: `../Scorecard/useArchetypeBucket`) — Task 2. `SWIFTMEND_MIN_RESTORATION` from `../../../report/archetypeDetection` — Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the hook call and gating logic to `SwiftmendAuditCard/index.tsx`**

Add these imports alongside the existing ones:

```ts
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";
import { SWIFTMEND_MIN_RESTORATION } from "../../../report/archetypeDetection";
```

Inside the component function, add the hook call directly below the existing `const [result, setResult] = useState<FetchResult | null>(null);` line (before the `useEffect`):

```ts
const archetypeStatus = useArchetypeBucket(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

Directly after the existing `if ("error" in result) { ... }` block (own-compute-error check) and before the final `const { casts, ... } = result.result;` line, insert:

```ts
  if (archetypeStatus.status === "loading") {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if (
    archetypeStatus.status === "ready" &&
    archetypeStatus.restoration < SWIFTMEND_MIN_RESTORATION
  ) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>
          Not shown — this build can&apos;t take Swiftmend (needs{" "}
          {SWIFTMEND_MIN_RESTORATION}+ Restoration points; this fight&apos;s
          build has {archetypeStatus.restoration}).
        </p>
      </MetricCard>
    );
  }
```

(`archetypeStatus.status === "error"` falls through neither branch, reaching the existing real-content render below — the intended fail-open behavior.)

- [ ] **Step 2: Fix the shared `makeFetchEvents` helper**

In `src/app/components/SwiftmendAuditCard/index.test.tsx`, add `aCombatantInfoEvent` to the existing factory import:

```ts
import {
  aFight,
  aCastEvent,
  aCombatantInfoEvent,
  anApplyBuffEvent,
  aRemoveBuffEvent,
  aHealEvent,
} from "../../../testUtils/factories";
```

Replace the `makeFetchEvents` helper:

```ts
function makeFetchEvents(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve(buffEvents);
  };
}
```

with:

```ts
function makeFetchEvents(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
        }),
      ]);
    }
    return Promise.resolve(buffEvents);
  };
}
```

(45 Restoration points comfortably clears both the 30-point Swiftmend threshold used here and the 20-point Nature's Swiftness threshold used in Task 4, for consistency across both files. `druidId={2}` is used by every test in this file, matching `aCombatantInfoEvent`'s own default `sourceID: 2`.)

This fixes the file's first three tests (`"shows the wasteful count/judgement..."`, `"shows a dash for Target HP%..."`, `"shows a message and green judgement when there are no Swiftmends"`) automatically, since all three route through `makeFetchEvents`.

- [ ] **Step 3: Fix the one test with a bespoke `fetchEvents` mock**

The test `"requests Healing events with includeResources: true"` uses `const fetchEvents = vi.fn().mockResolvedValue([]);`, which does not go through `makeFetchEvents` and would resolve `"CombatantInfo"` to `[]` too — making the fixture druid read `restoration: 0` and the card render the gated placeholder instead of `"No Swiftmends cast this fight."`, breaking this test's setup (though not its actual assertion, since it only inspects `fetchEvents.mock.calls` — but the `waitFor` line asserting `"No Swiftmends cast this fight."` appears would time out first). Replace:

```ts
const fetchEvents = vi.fn().mockResolvedValue([]);
```

with:

```ts
const fetchEvents = vi.fn(
  (
    _token: string,
    _report: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) =>
    dataType === "CombatantInfo"
      ? Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 2,
            talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
          }),
        ])
      : Promise.resolve([]),
);
```

- [ ] **Step 4: Add the new gating test**

Add this test to the end of the `describe("SwiftmendAuditCard", ...)` block:

```ts
  it("shows a placeholder instead of real content when Restoration is below Swiftmend's threshold", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> =>
      dataType === "CombatantInfo"
        ? Promise.resolve([
            aCombatantInfoEvent({
              sourceID: 2,
              talents: [{ id: 0 }, { id: 0 }, { id: 29 }],
            }),
          ])
        : Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Not shown — this build can't take Swiftmend/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Swiftmends cast this fight."),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Run the test suite**

Run: `npx vitest run src/app/components/SwiftmendAuditCard/index.test.tsx`
Expected: PASS, all 8 tests (7 existing + 1 new).

- [ ] **Step 6: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/SwiftmendAuditCard/index.tsx src/app/components/SwiftmendAuditCard/index.test.tsx
git commit -m "feat(spell-discipline): hide Swiftmend quality audit below its talent threshold"
```

---

### Task 4: Gate `NaturesSwiftnessCard`

**Files:**

- Modify: `src/app/components/NaturesSwiftnessCard/index.tsx`
- Modify: `src/app/components/NaturesSwiftnessCard/index.test.tsx`

**Interfaces:**

- Consumes: `useArchetypeBucket` from `../Scorecard/useArchetypeBucket` (Task 2). `NATURES_SWIFTNESS_MIN_RESTORATION` from `../../../report/archetypeDetection` (Task 1).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the hook call and gating logic to `NaturesSwiftnessCard/index.tsx`**

Add these imports alongside the existing ones:

```ts
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";
import { NATURES_SWIFTNESS_MIN_RESTORATION } from "../../../report/archetypeDetection";
```

Inside the component function, add the hook call directly below `const [result, setResult] = useState<FetchResult | null>(null);` (before the `useEffect`):

```ts
const archetypeStatus = useArchetypeBucket(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

Directly after the existing `if ("error" in result) { ... }` block and before the final `const { casts, castCount, availableWindows } = result.result;` line, insert:

```ts
  if (archetypeStatus.status === "loading") {
    return (
      <MetricCard
        icon={ICON}
        title="Nature's Swiftness audit"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if (
    archetypeStatus.status === "ready" &&
    archetypeStatus.restoration < NATURES_SWIFTNESS_MIN_RESTORATION
  ) {
    return (
      <MetricCard
        icon={ICON}
        title="Nature's Swiftness audit"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>
          Not shown — this build can&apos;t take Nature&apos;s Swiftness
          (needs {NATURES_SWIFTNESS_MIN_RESTORATION}+ Restoration points;
          this fight&apos;s build has {archetypeStatus.restoration}).
        </p>
      </MetricCard>
    );
  }
```

(Same fail-open behavior on `archetypeStatus.status === "error"` as Task 3 — falls through to the real content below.)

- [ ] **Step 2: Fix the shared `makeFetchEvents` helper**

In `src/app/components/NaturesSwiftnessCard/index.test.tsx`, add `aCombatantInfoEvent` to the existing factory import:

```ts
import {
  aFight,
  aCastEvent,
  aCombatantInfoEvent,
} from "../../../testUtils/factories";
```

Replace the `makeFetchEvents` helper:

```ts
function makeFetchEvents(castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    return Promise.resolve([]);
  };
}
```

with:

```ts
function makeFetchEvents(castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
        }),
      ]);
    }
    return Promise.resolve([]);
  };
}
```

This fixes the file's first three tests (`"shows the usage count..."`, `"shows 'no follow-up cast recorded'..."`, `"shows a message when Nature's Swiftness was not cast this fight"`) automatically.

- [ ] **Step 3: Add the new gating test**

Add this test to the end of the `describe("NaturesSwiftnessCard", ...)` block:

```ts
  it("shows a placeholder instead of real content when Restoration is below Nature's Swiftness's threshold", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 400000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> =>
      dataType === "CombatantInfo"
        ? Promise.resolve([
            aCombatantInfoEvent({
              sourceID: 2,
              talents: [{ id: 0 }, { id: 0 }, { id: 19 }],
            }),
          ])
        : Promise.resolve([]);

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          /Not shown — this build can't take Nature's Swiftness/,
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Nature's Swiftness was not cast this fight."),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run src/app/components/NaturesSwiftnessCard/index.test.tsx`
Expected: PASS, all 7 tests (6 existing + 1 new).

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/NaturesSwiftnessCard/index.tsx src/app/components/NaturesSwiftnessCard/index.test.tsx
git commit -m "feat(spell-discipline): hide Nature's Swiftness audit below its talent threshold"
```

---

### Task 5: Gate the pooled "Spell discipline" epic summary

**Files:**

- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/useSpellDisciplineSummary.ts`

**Interfaces:**

- Consumes: `SWIFTMEND_MIN_RESTORATION`, `parseTalentPoints` from `../../../report/archetypeDetection` (Task 1, and the pre-existing `parseTalentPoints`).
- Produces: `summarizeSpellDiscipline` gains a 4th parameter `hasSwiftmend: boolean`. No other file depends on this beyond what's touched here.

- [ ] **Step 1: Update `summarizeSpellDiscipline`'s existing test call sites**

In `src/metrics/epicSummary.test.ts`, there are 4 call sites of `summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking)` (or `GREEN_DOWNRANKING`) inside the `describe("summarizeSpellDiscipline", ...)` block (lines ~213, ~247, ~279, ~325 as of this plan's writing — search for `summarizeSpellDiscipline(` to find the current exact locations, since line numbers may have shifted). Add a 4th argument `true` to each, preserving today's behavior (all 4 existing tests assume Swiftmend eligibility, none are testing the new gating case):

```ts
summarizeSpellDiscipline(hotClips, swiftmendAudit, GREEN_DOWNRANKING, true);
```

(and similarly for the 4th call site, which passes `downranking` instead of `GREEN_DOWNRANKING`, and spans multiple lines — add `true` as a 4th argument there too.)

- [ ] **Step 2: Write the new failing test**

Add this test to the end of the `describe("summarizeSpellDiscipline", ...)` block:

```ts
it("excludes Swiftmend's judgement and stat line when hasSwiftmend is false", () => {
  const hotClips: HotClipDetectionResult = {
    rejuvenation: {
      spell: "Rejuvenation",
      castCount: 100,
      clipCount: 1,
      clipPct: 1,
      judgement: "green",
    },
    regrowth: {
      spell: "Regrowth",
      castCount: 30,
      clipCount: 0,
      clipPct: 0,
    },
    clipEvents: [],
  };
  const swiftmendAudit: SwiftmendAuditResult = {
    casts: [],
    swiftmendCastCount: 0,
    wastefulCount: 0,
    wastefulPct: 0,
    judgement: "red",
    availableWindows: 22,
  };

  const result = summarizeSpellDiscipline(
    hotClips,
    swiftmendAudit,
    GREEN_DOWNRANKING,
    false,
  );

  expect(result.judgement).toBe("green");
  expect(result.stats).toEqual(["Rejuvenation clips: 1.0%"]);
});
```

(`swiftmendAudit.judgement` is deliberately `"red"` here — if the exclusion logic were broken, the pooled result would read `"red"`, not `"green"`, so this test genuinely discriminates a working implementation from a broken one.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts -t "summarizeSpellDiscipline"`
Expected: FAIL — `summarizeSpellDiscipline` doesn't accept a 4th argument yet (TypeScript error) and/or the new test's assertions don't match current (unconditional) behavior.

- [ ] **Step 4: Update `summarizeSpellDiscipline`**

In `src/metrics/epicSummary.ts`, replace:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
  downranking: DownrankingDisciplineResult,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the worst-of calc (per
  // docs/backlog.md story 303) but doesn't get its own stat line — story
  // 701 caps a dashboard widget at 1-2 stats.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      swiftmendAudit.judgement,
      downranking.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`,
    ],
  };
}
```

with:

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
  swiftmendAudit: SwiftmendAuditResult,
  downranking: DownrankingDisciplineResult,
  hasSwiftmend: boolean,
): EpicSummary {
  // Regrowth clipping has no judgement of its own (informational only —
  // see docs/backlog.md story 301), so it can't move this verdict; the
  // widget's two stat lines show the two metrics that do carry a
  // judgement. Downranking's judgement also joins the worst-of calc (per
  // docs/backlog.md story 303) but doesn't get its own stat line — story
  // 701 caps a dashboard widget at 1-2 stats. Swiftmend's judgement/stat
  // line are excluded entirely (not scored, not shown as a spurious green)
  // when the druid's build can't reach Swiftmend's talent — story 903c.
  return {
    judgement: worstJudgement([
      hotClips.rejuvenation.judgement,
      ...(hasSwiftmend ? [swiftmendAudit.judgement] : []),
      downranking.judgement,
    ]),
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      ...(hasSwiftmend
        ? [`Swiftmend wasteful: ${swiftmendAudit.wastefulPct.toFixed(1)}%`]
        : []),
    ],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts -t "summarizeSpellDiscipline"`
Expected: PASS, all 5 tests (4 existing + 1 new).

- [ ] **Step 6: Wire `useSpellDisciplineSummary` to compute and pass `hasSwiftmend`**

In `src/app/components/Scorecard/useSpellDisciplineSummary.ts`, add this import:

```ts
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
} from "../../../report/archetypeDetection";
```

Replace:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
```

with:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(([buffEvents, castEvents, healingEvents, combatantInfoEvents]) => {
        const talents = parseTalentPoints(combatantInfoEvents, druidId);
        const restoration = talents === null ? 0 : talents[2];
        const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
```

Replace:

```ts
setState({
  accessToken,
  summary: {
    status: "ready",
    ...summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking),
  },
});
```

with:

```ts
setState({
  accessToken,
  summary: {
    status: "ready",
    ...summarizeSpellDiscipline(
      hotClips,
      swiftmendAudit,
      downranking,
      hasSwiftmend,
    ),
  },
});
```

- [ ] **Step 7: Run `useSpellDisciplineSummary`'s existing tests to confirm no breakage**

Run: `npx vitest run src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`
Expected: PASS, both existing tests unchanged. Neither test asserts specific stats/judgement content (only `.status`), and the first test's mock `fetchEvents` already returns `[]` for any unmatched dataType (its ternary only branches on `"Buffs"`) — `"CombatantInfo"` falls to that same `[]` default, `parseTalentPoints([], ...)` returns `null`, `hasSwiftmend` becomes `false`, but since the test doesn't inspect `stats`/`judgement` content, it stays green either way. No fixture fix needed for this file.

- [ ] **Step 8: Add a new test proving the gating behavior at the hook level**

Add this test to `src/app/components/Scorecard/useSpellDisciplineSummary.test.ts`:

```ts
it("excludes Swiftmend from the pooled judgement when the druid can't reach its talent", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
  const fetchEvents = (
    _token: string,
    _report: string,
    _fight: unknown,
    dataType: string,
  ) => Promise.resolve(dataType === "CombatantInfo" ? [] : []);

  const { result } = renderHook(() =>
    useSpellDisciplineSummary(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      fight,
      2,
      new Set([26982]),
      new Set([26980]),
      new Set([18562]),
      new Map(),
      fetchEvents,
    ),
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  if (result.current.status !== "ready") throw new Error("unreachable");
  expect(
    result.current.stats.some((line) => line.startsWith("Swiftmend")),
  ).toBe(false);
});
```

(All-empty events already produce `restoration: 0` via the existing mock's `[]` default for `"CombatantInfo"` — this test just makes that consequence explicit and asserts on it directly, rather than relying on it being an unstated side effect of Step 7's passing tests.)

- [ ] **Step 9: Run the full test suite**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts src/app/components/Scorecard/useSpellDisciplineSummary.ts
git commit -m "feat(spell-discipline): exclude talent-unreachable Swiftmend from the pooled epic summary"
```

---

### Task 6: Fix `computeDeathForensics`'s `unspentCount` inflation

**Files:**

- Modify: `src/metrics/deathForensics.ts`
- Modify: `src/metrics/deathForensics.test.ts`

**Interfaces:**

- Produces: `computeDeathForensics` gains two new parameters, `hasSwiftmend: boolean` and `hasNaturesSwiftness: boolean`, inserted directly after `lifebloomAbilityIds` and before `fightStart` in the parameter list. Consumed by Task 7's two call sites.

- [ ] **Step 1: Update all 11 existing test call sites**

In `src/metrics/deathForensics.test.ts`, every call to `computeDeathForensics(...)` currently ends with `LB_IDS, <fightStart>, <fightEnd>,` as its last three arguments. Insert `true, true,` (both new booleans) directly after `LB_IDS` and before the fight-start/fight-end pair, at all 11 call sites in this file (search for `computeDeathForensics(` to find each one). For example, the first call site:

```ts
const result = computeDeathForensics(
  deathEvents,
  [],
  buffEvents,
  DRUID_ID,
  SWIFTMEND_IDS,
  NS_IDS,
  LB_IDS,
  0,
  100000,
);
```

becomes:

```ts
const result = computeDeathForensics(
  deathEvents,
  [],
  buffEvents,
  DRUID_ID,
  SWIFTMEND_IDS,
  NS_IDS,
  LB_IDS,
  true,
  true,
  0,
  100000,
);
```

Apply the same `LB_IDS,` → `LB_IDS,\n      true,\n      true,` insertion at all 11 call sites in this file. This preserves every existing test's current behavior exactly — none of them are testing talent-unreachability, all assume both cooldowns are talent-available and are testing the cooldown-timing/idle-window logic itself.

- [ ] **Step 2: Write the two new failing tests**

Add these two tests to the end of the `describe("computeDeathForensics", ...)` block:

```ts
it("swiftmendReady is false when hasSwiftmend is false, even with no prior Swiftmend cast recorded", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
    anApplyBuffStackEvent({
      timestamp: 1000,
      stack: 2,
      targetID: 50,
      abilityGameID: 33763,
    }),
    anApplyBuffStackEvent({
      timestamp: 2000,
      stack: 3,
      targetID: 50,
      abilityGameID: 33763,
    }),
  ];
  const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

  const result = computeDeathForensics(
    deathEvents,
    [],
    buffEvents,
    DRUID_ID,
    SWIFTMEND_IDS,
    NS_IDS,
    LB_IDS,
    false,
    true,
    0,
    100000,
  );

  expect(result.deaths[0].swiftmendReady).toBe(false);
  expect(result.deaths[0].nsReady).toBe(true);
  expect(result.deaths[0].unspentCount).toBe(2);
});

it("nsReady is false when hasNaturesSwiftness is false, even with no prior Nature's Swiftness cast recorded", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
    anApplyBuffStackEvent({
      timestamp: 1000,
      stack: 2,
      targetID: 50,
      abilityGameID: 33763,
    }),
    anApplyBuffStackEvent({
      timestamp: 2000,
      stack: 3,
      targetID: 50,
      abilityGameID: 33763,
    }),
  ];
  const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

  const result = computeDeathForensics(
    deathEvents,
    [],
    buffEvents,
    DRUID_ID,
    SWIFTMEND_IDS,
    NS_IDS,
    LB_IDS,
    true,
    false,
    0,
    100000,
  );

  expect(result.deaths[0].swiftmendReady).toBe(true);
  expect(result.deaths[0].nsReady).toBe(false);
  expect(result.deaths[0].unspentCount).toBe(2);
});
```

(Both fixtures are otherwise identical to the file's first existing test — a maintained target, no casts at all, `idlePreceding` true — which today reports `unspentCount: 3` with both cooldowns "ready" via `isReady`'s "no prior cast = ready" rule. These two new tests prove that a talent-unreachable resource is forced `false` regardless of that rule, bringing `unspentCount` down to 2 instead of 3.)

- [ ] **Step 3: Run tests to verify the new ones fail and the 11 existing ones still compile-fail**

Run: `npx vitest run src/metrics/deathForensics.test.ts`
Expected: FAIL — TypeScript error on every call site (wrong argument count) until Step 1 and Step 4 are both applied; if Step 1 was already done, the 11 existing tests type-check and pass, and only the 2 new ones fail on their assertions (current code always sets `swiftmendReady`/`nsReady` from `isReady(...)` alone, ignoring the new booleans it doesn't accept yet).

- [ ] **Step 4: Update `computeDeathForensics`**

In `src/metrics/deathForensics.ts`, replace:

```ts
export function computeDeathForensics(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): DeathForensicsResult {
```

with:

```ts
export function computeDeathForensics(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
  fightStart: number,
  fightEnd: number,
): DeathForensicsResult {
```

Replace:

```ts
const swiftmendReady = isReady(
  swiftmendCasts,
  timestampMs,
  SWIFTMEND_COOLDOWN_MS,
);
const nsReady = isReady(nsCasts, timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
```

with:

```ts
const swiftmendReady =
  hasSwiftmend && isReady(swiftmendCasts, timestampMs, SWIFTMEND_COOLDOWN_MS);
const nsReady =
  hasNaturesSwiftness &&
  isReady(nsCasts, timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/metrics/deathForensics.test.ts`
Expected: PASS, all 15 tests (13 existing, including the two `it.each` blocks — 11 individually-listed call sites plus the 2 parameterized ones already counted among those 11 — plus 2 new).

- [ ] **Step 6: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS — this will show compile errors in `useDeathForensicsSummary.ts` and `DeathForensicsCard/index.tsx` (both still call the old 9-argument signature) until Task 7 lands; that's expected at this point in the plan, not a regression to fix here.

- [ ] **Step 7: Commit**

```bash
git add src/metrics/deathForensics.ts src/metrics/deathForensics.test.ts
git commit -m "fix(death-forensics): stop counting a talent-unreachable resource as unspent"
```

---

### Task 7: Thread talent eligibility through Death Forensics' two call sites

**Files:**

- Modify: `src/app/components/Scorecard/useDeathForensicsSummary.ts`
- Modify: `src/app/components/Scorecard/useDeathForensicsSummary.test.ts`
- Modify: `src/app/components/DeathForensicsCard/index.tsx`
- Modify: `src/app/components/DeathForensicsCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeDeathForensics`'s new 9-parameter-then-`hasSwiftmend`-`hasNaturesSwiftness` signature (Task 6); `parseTalentPoints`, `SWIFTMEND_MIN_RESTORATION`, `NATURES_SWIFTNESS_MIN_RESTORATION` from `../../../report/archetypeDetection` (Task 1 and pre-existing).
- Produces: nothing new for later tasks — this is the terminal wiring for the Death Forensics fix.

- [ ] **Step 1: Update `useDeathForensicsSummary.ts`**

Add this import:

```ts
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";
```

Replace:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
    ])
      .then(([deathEvents, castEvents, buffEvents]) => {
        const computed = computeDeathForensics(
          deathEvents,
          castEvents,
          buffEvents,
          druidId,
          swiftmendAbilityIds,
          naturesSwiftnessAbilityIds,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
```

with:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(([deathEvents, castEvents, buffEvents, combatantInfoEvents]) => {
        const talents = parseTalentPoints(combatantInfoEvents, druidId);
        const restoration = talents === null ? 0 : talents[2];
        const computed = computeDeathForensics(
          deathEvents,
          castEvents,
          buffEvents,
          druidId,
          swiftmendAbilityIds,
          naturesSwiftnessAbilityIds,
          lifebloomAbilityIds,
          restoration >= SWIFTMEND_MIN_RESTORATION,
          restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
          fight.startTime,
          fight.endTime,
        );
```

- [ ] **Step 2: Run `useDeathForensicsSummary`'s existing tests to confirm no breakage**

Run: `npx vitest run src/app/components/Scorecard/useDeathForensicsSummary.test.ts`
Expected: PASS, both existing tests unchanged (neither has any deaths in its fixture, so `swiftmendReady`/`nsReady`/`unspentCount` never get computed either way).

- [ ] **Step 3: Add a new test proving the gating behavior at the hook level**

Add this test to `src/app/components/Scorecard/useDeathForensicsSummary.test.ts`:

```ts
it("doesn't count a talent-unreachable resource as unspent", async () => {
  const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
  const fetchEvents = (
    _token: string,
    _report: string,
    _fight: unknown,
    dataType: string,
  ) => Promise.resolve(dataType === "Deaths" ? [] : []);

  const { result } = renderHook(() =>
    useDeathForensicsSummary(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      fight,
      2,
      new Set([18562]),
      new Set([17116]),
      new Set([33763]),
      fetchEvents,
    ),
  );

  await waitFor(() => expect(result.current.status).toBe("ready"));
  if (result.current.status !== "ready") throw new Error("unreachable");
  expect(result.current.stats).toEqual(["No friendly deaths"]);
});
```

(All-empty fixture — this confirms the hook still resolves cleanly end-to-end with the new 4th fetch and gating logic in place, even though there are no deaths to exercise `unspentCount` on directly; `deathForensics.test.ts`'s Task 6 tests are the ones that exercise the actual gating math.)

- [ ] **Step 4: Update `DeathForensicsCard/index.tsx`**

Add this import:

```ts
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";
```

Replace:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
    ])
      .then(([deathEvents, castEvents, buffEvents]) => {
        try {
          const computed = computeDeathForensics(
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            fight.startTime,
            fight.endTime,
          );
```

with:

```ts
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(([deathEvents, castEvents, buffEvents, combatantInfoEvents]) => {
        try {
          const talents = parseTalentPoints(combatantInfoEvents, druidId);
          const restoration = talents === null ? 0 : talents[2];
          const computed = computeDeathForensics(
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            restoration >= SWIFTMEND_MIN_RESTORATION,
            restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
            fight.startTime,
            fight.endTime,
          );
```

- [ ] **Step 5: Fix the shared `makeFetchEvents` helper in `DeathForensicsCard/index.test.tsx`**

Add `aCombatantInfoEvent` to the existing factory import:

```ts
import {
  aFight,
  aDeathEvent,
  aCombatantInfoEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";
```

Replace the `makeFetchEvents` helper:

```ts
function makeFetchEvents(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Deaths") return Promise.resolve(deathEvents);
    if (dataType === "Casts") return Promise.resolve(castEvents);
    return Promise.resolve(buffEvents);
  };
}
```

with:

```ts
function makeFetchEvents(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Deaths") return Promise.resolve(deathEvents);
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
        }),
      ]);
    }
    return Promise.resolve(buffEvents);
  };
}
```

This fixes the file's first three tests (`"shows the flagged count..."`, `"shows a message and green judgement..."`, `"falls back to 'Target #<id>'..."`) automatically — Restoration 45 clears both thresholds, preserving today's "both cooldowns talent-available" assumption those tests rely on.

- [ ] **Step 6: Add a new test proving the gating behavior at the card level**

Add this test to the end of the `describe("DeathForensicsCard", ...)` block:

```ts
  it("doesn't flag a maintained target's death as red purely from a talent-unreachable resource", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> => {
      if (dataType === "Deaths") return Promise.resolve(deathEvents);
      if (dataType === "Casts") return Promise.resolve([]);
      if (dataType === "CombatantInfo") {
        // 26 Restoration: below Swiftmend's 30-point threshold, at/above
        // Nature's Swiftness's 20-point threshold -> exactly the real
        // Dreamstate-build shape confirmed in docs/testing.md's
        // bKRZ68XqgwYkxtzm entry.
        return Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 2,
            talents: [{ id: 0 }, { id: 0 }, { id: 26 }],
          }),
        ]);
      }
      return Promise.resolve(buffEvents);
    };

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[50, "Offtank"]])}
        fetchEvents={fetchEvents}
      />,
    );

    // Both cooldowns look "unspent" by isReady's no-prior-cast rule, but
    // Swiftmend is talent-unreachable at 26 Restoration -> only Nature's
    // Swiftness (talent-reachable) and idle-preceding count -> unspentCount
    // 2 -> still red, but for the right reason (2, not 3). This test's
    // real assertion is in the per-death card's own detail, not the
    // overall MetricCard verdict, since both unspentCount 2 and 3 read
    // "Bad" at the MetricCard level per judgeDeathReadiness — open the
    // fight's own detail if this needs a stronger assertion than judgement
    // text; verifying via deathForensics.test.ts's Task 6 unit coverage
    // (which does assert the exact unspentCount) is the load-bearing test
    // for the actual number, this one just proves the card renders
    // end-to-end with real talent data wired through.
    await waitFor(() =>
      expect(screen.getByText("1 of 1 deaths flagged")).toBeInTheDocument(),
    );
  });
```

- [ ] **Step 7: Run the full test suite**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/Scorecard/useDeathForensicsSummary.ts src/app/components/Scorecard/useDeathForensicsSummary.test.ts src/app/components/DeathForensicsCard/index.tsx src/app/components/DeathForensicsCard/index.test.tsx
git commit -m "fix(death-forensics): thread real talent eligibility into both call sites"
```

---

### Task 8: Real-data spot-check and story close-out

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/903c-talent-gated-card-hiding-design.md`
- Delete: `docs/plans/903c-talent-gated-card-hiding-plan.md` (this file)

**Interfaces:** None — this task is verification and documentation only, no application code.

- [ ] **Step 1: Real-data spot-check against two known reports**

This step requires `WCL_TEST_ACCESS_TOKEN` (see `docs/testing.md`) and is a manual verification, not an automated test. Run the app locally (`npm run dev`).

Load report `bKRZ68XqgwYkxtzm`, select the druid Neepzendruid (26 Restoration, already documented in `docs/testing.md`), open any fight, go to "Spell discipline": confirm the Swiftmend quality audit card shows the "Not shown — this build can't take Swiftmend" placeholder, and the Nature's Swiftness card renders normally (26 ≥ 20). Confirm the "Spell discipline" overview widget's judgement/stats don't include a Swiftmend line. Check "Death forensics" for any death on a maintained target and confirm the reasoning is consistent with Swiftmend being unavailable (cross-reference against `deathForensics.test.ts`'s Task 6 coverage rather than trying to hand-verify the exact count live).

Load report `4GYHZRdtL3bvhpc8`, select Dassz (49 Restoration, deep-resto, already documented in `docs/testing.md`), open any fight, confirm both the Swiftmend quality audit and Nature's Swiftness cards render normally (not hidden), as a control.

If either doesn't match, stop and debug before proceeding — do not mark the story done with a known real-data mismatch.

- [ ] **Step 2: Mark story 903c done in `docs/backlog.md`**

Change the story 903c heading from:

```
### 903c — Hide metrics whose prerequisite talent is unreachable (app) 🔲 Todo
```

to:

```
### 903c — Hide metrics whose prerequisite talent is unreachable (app) ✅ Done
```

- [ ] **Step 3: Delete the spec and plan docs**

First, grep the repo to confirm nothing references either file path:

```bash
grep -rn "903c-talent-gated-card-hiding" --include="*.md" --include="*.ts" --include="*.tsx" .
```

Expected: no references outside `docs/backlog.md`'s own prose about the story (which references the story number, not the file path).

Then delete both files:

```bash
git rm docs/specs/903c-talent-gated-card-hiding-design.md docs/plans/903c-talent-gated-card-hiding-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md
git commit -m "$(cat <<'EOF'
docs: close out story 903c, retire its design spec and plan

Real-data spot-check against bKRZ68XqgwYkxtzm (Neepzendruid, 26
Restoration) confirmed the Swiftmend quality audit is hidden while
Nature's Swiftness stays visible; 4GYHZRdtL3bvhpc8 (Dassz, 49
Restoration) confirmed both render normally as a control.
EOF
)"
```
