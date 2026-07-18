# Story 903b — Per-fight healing-role detection: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect per-fight (not per-report) whether the selected druid actually cast enough healing spells to count as healing that pull, exclude off-role fights from 702's aggregate rollup, label them in the fight list, and surface a caveat in the single-fight Scorecard — retiring story 709 in the process.

**Architecture:** A new pure function (`detectHealingRoleThisFight`) reuses story 005's existing `HEALING_SPELL_NAMES`/`MIN_HEALING_CASTS_FOR_DETECTION`, fed by a new hook (`useHealingRoleThisFight`) that fetches `Casts` events through the app's existing cached `fetchEvents` — the same cache key `useGcdEconomySummary` already populates for the same fight, so this adds no new network requests. `ReportDashboard`/`FightRow` and `Scorecard` both consume the hook.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (existing project stack — no new dependencies).

Full design rationale: `docs/specs/903b-per-fight-role-detection-design.md`. Backlog acceptance criteria: `docs/backlog.md` story 903b (which absorbs and retires story 709).

## Global Constraints

- Commits follow Conventional Commits (`type(scope): summary`).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via a pre-commit hook — never bypass it.
- `MIN_HEALING_CASTS_FOR_DETECTION` and `HEALING_SPELL_NAMES` (both already in `src/report/druidDetection.ts`) must be reused unchanged, not duplicated or redefined.
- `event.type === "cast"` (lowercase) is this codebase's established convention for a completed-cast event (see `src/metrics/castIntervals.ts`) — match it exactly.
- No spell/ability IDs are hardcoded in new detection logic — `detectHealingRoleThisFight` identifies healing casts via `resolvedAbilities` (already runtime-resolved per story 007), not literal IDs.
- **Important test-fixture consequence:** every existing `Scorecard`/`ReportDashboard` test whose `fetchEvents` mock returns `[]` for `"Casts"` (with the shared `resolvedAbilities: new Map()` in each file's `baseProps`) will, after this story ships, resolve `healingCastCount: 0` — i.e. every such fixture becomes "off-role" by default. Two existing tests rely on the _opposite_ assumption (a fight resolves a normal on-role judgement) and will break unless fixed: `Scorecard/index.test.tsx`'s first test (`getByRole("alert")` assumes exactly one alert — a second, off-role alert would make that query ambiguous) and `ReportDashboard/index.test.tsx`'s `"shows each fight's own worst-of judgement..."` and `"shows six aggregated epic chips..."` tests (both assume the fight's judgement/chips resolve to a real color, not get excluded as off-role). Tasks 3 and 4 below fix these specific tests as part of wiring in the new behavior — this is not optional cleanup, it's required for the suite to stay green.
- A story isn't done until its paperwork is retired: the final task deletes this plan and `docs/specs/903b-per-fight-role-detection-design.md`, marks 903b done in `docs/backlog.md`, and removes story 709's entry from `docs/backlog.md` entirely (per the existing story-004 precedent — supersession recorded in `CLAUDE.md`'s repo-state narrative, not left as a stale backlog marker), in the same commit.

---

### Task 1: `detectHealingRoleThisFight` in `src/report/druidDetection.ts`

**Files:**

- Modify: `src/report/druidDetection.ts`
- Modify: `src/report/druidDetection.test.ts`

**Interfaces:**

- Produces: `HealingRoleThisFight` interface (`{ healingCastCount: number; isHealingThisFight: boolean }`) and `detectHealingRoleThisFight(events: WclEvent[], druidId: number, resolvedAbilities: Map<number, ResolvedAbility>): HealingRoleThisFight`, both exported from `src/report/druidDetection.ts`. Used by Task 2's hook.

- [ ] **Step 1: Write the failing test**

Add to `src/report/druidDetection.test.ts` (append a new `describe` block; check the file's existing imports first and extend them rather than duplicating — it already imports `describe`, `expect`, `it` from `vitest` and factories from `../testUtils/factories`):

```ts
import { detectDruids, detectHealingRoleThisFight } from "./druidDetection";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

// ... existing describe("detectDruids", ...) block stays unchanged ...

describe("detectHealingRoleThisFight", () => {
  const resolvedAbilities = new Map<number, ResolvedAbility>([
    [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
    [17116, { kind: "spell", spell: "Nature's Swiftness", rank: null }],
  ]);

  it("counts healing casts and clears the threshold at 3", () => {
    const events = [
      aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
      aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
      aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 3, isHealingThisFight: true });
  });

  it("stays below the threshold at 2 healing casts", () => {
    const events = [
      aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
      aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 2, isHealingThisFight: false });
  });

  it("does not count a cast resolving to a non-healing spell (e.g. Nature's Swiftness)", () => {
    const events = [
      aCastEvent({ sourceID: 101, abilityGameID: 17116, timestamp: 1000 }),
      aCastEvent({ sourceID: 101, abilityGameID: 17116, timestamp: 2000 }),
      aCastEvent({ sourceID: 101, abilityGameID: 17116, timestamp: 3000 }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 0, isHealingThisFight: false });
  });

  it("does not count a cast whose abilityGameID has no resolution", () => {
    const events = [
      aCastEvent({ sourceID: 101, abilityGameID: 99999, timestamp: 1000 }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 0, isHealingThisFight: false });
  });

  it("ignores casts from a different sourceID", () => {
    const events = [
      aCastEvent({ sourceID: 999, abilityGameID: 33763, timestamp: 1000 }),
      aCastEvent({ sourceID: 999, abilityGameID: 33763, timestamp: 2000 }),
      aCastEvent({ sourceID: 999, abilityGameID: 33763, timestamp: 3000 }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 0, isHealingThisFight: false });
  });

  it("ignores non-cast event types (e.g. begincast)", () => {
    const events = [
      aCastEvent({
        sourceID: 101,
        abilityGameID: 33763,
        timestamp: 1000,
        type: "begincast",
      }),
    ];
    const result = detectHealingRoleThisFight(events, 101, resolvedAbilities);
    expect(result).toEqual({ healingCastCount: 0, isHealingThisFight: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/druidDetection.test.ts`
Expected: FAIL — `detectHealingRoleThisFight is not a function` (or a TypeScript resolution error), since the export doesn't exist yet.

- [ ] **Step 3: Write the implementation**

In `src/report/druidDetection.ts`, add this import at the top (alongside the existing `CastTableEntry` import):

```ts
import type { CastTableEntry } from "../wcl/client";
import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
```

Append this to the end of the file (after `detectDruids`):

```ts
export interface HealingRoleThisFight {
  healingCastCount: number;
  isHealingThisFight: boolean;
}

export function detectHealingRoleThisFight(
  events: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): HealingRoleThisFight {
  const healingCastCount = events.filter((event) => {
    if (event.sourceID !== druidId) return false;
    if (event.type !== "cast") return false;
    if (event.abilityGameID === undefined) return false;
    const resolved = resolvedAbilities.get(event.abilityGameID);
    return (
      resolved?.kind === "spell" && HEALING_SPELL_NAMES.includes(resolved.spell)
    );
  }).length;
  return {
    healingCastCount,
    isHealingThisFight: healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/druidDetection.test.ts`
Expected: PASS, all `detectDruids` tests (unchanged) plus the 6 new `detectHealingRoleThisFight` tests.

- [ ] **Step 5: Commit**

```bash
git add src/report/druidDetection.ts src/report/druidDetection.test.ts
git commit -m "feat(report): add detectHealingRoleThisFight per-fight healing-role check"
```

---

### Task 2: `useHealingRoleThisFight` hook

**Files:**

- Create: `src/app/components/Scorecard/useHealingRoleThisFight.ts`
- Test: `src/app/components/Scorecard/useHealingRoleThisFight.test.ts`

**Interfaces:**

- Consumes: `detectHealingRoleThisFight` from `../../../report/druidDetection` (Task 1); `Fight` from `../../../wcl/client`; `WclEvent`, `WclEventDataType` from `../../../wcl/events`; `EventFetcherFight` from `../../../wcl/eventCache`; `ResolvedAbility` from `../../../abilities/resolveAbilities`.
- Produces: `HealingRoleStatus` (`{status:"loading"} | {status:"error"; error:string} | {status:"ready"; healingCastCount:number; isHealingThisFight:boolean}`) and `useHealingRoleThisFight(accessToken, reportCode, fight, druidId, resolvedAbilities, fetchEvents): HealingRoleStatus`, consumed by Tasks 3 and 4.

This hook mirrors `useArchetypeBucket.ts`'s structure exactly (itself mirroring `usePrepHygieneSummary.ts`): a catch-all `.catch` into a local error status, an `accessToken`-tagged loading guard.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/Scorecard/useHealingRoleThisFight.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHealingRoleThisFight } from "./useHealingRoleThisFight";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";

describe("useHealingRoleThisFight", () => {
  const resolvedAbilities = new Map<number, ResolvedAbility>([
    [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  ]);

  it("starts loading, then reports on-role once the healing-cast threshold clears", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
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

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      healingCastCount: 3,
      isHealingThisFight: true,
    });
  });

  it("reports off-role when no healing casts resolve", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      healingCastCount: 0,
      isHealingThisFight: false,
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useHealingRoleThisFight.test.ts`
Expected: FAIL — `Cannot find module './useHealingRoleThisFight'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/Scorecard/useHealingRoleThisFight.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { detectHealingRoleThisFight } from "../../../report/druidDetection";

export type HealingRoleStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; healingCastCount: number; isHealingThisFight: boolean };

type TaggedState = { accessToken: string; summary: HealingRoleStatus };

export function useHealingRoleThisFight(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): HealingRoleStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    fetchEvents(accessToken, reportCode, fightArg, "Casts", true)
      .then((events) => {
        const { healingCastCount, isHealingThisFight } =
          detectHealingRoleThisFight(events, druidId, resolvedAbilities);
        setState({
          accessToken,
          summary: { status: "ready", healingCastCount, isHealingThisFight },
        });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to detect healing role this fight.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    resolvedAbilities,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useHealingRoleThisFight.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useHealingRoleThisFight.ts src/app/components/Scorecard/useHealingRoleThisFight.test.ts
git commit -m "feat(scorecard): add useHealingRoleThisFight hook"
```

---

### Task 3: Wire the hook into `Scorecard` and fix the resulting test

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `useHealingRoleThisFight` from `./useHealingRoleThisFight` (Task 2).
- Produces: nothing new for later tasks — Task 4 (`ReportDashboard`) uses the hook independently, not anything from this task.

- [ ] **Step 1: Add the hook call and off-role Alert to `Scorecard/index.tsx`**

Add this import alongside the existing same-directory imports:

```ts
import { useHealingRoleThisFight } from "./useHealingRoleThisFight";
```

Inside the `Scorecard` function body, add the hook call directly below the existing `useArchetypeBucket(...)` call:

```ts
const healingRoleStatus = useHealingRoleThisFight(
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
);
```

In the JSX, replace:

```tsx
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
```

with:

```tsx
      {healingRoleStatus.status === "ready" &&
        !healingRoleStatus.isHealingThisFight && (
          <Alert tone="warning">
            {druid.name} cast {healingRoleStatus.healingCastCount} healing
            spell{healingRoleStatus.healingCastCount === 1 ? "" : "s"} this
            fight — the judgements below may not be meaningful for an
            off-role pull.
          </Alert>
        )}
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
```

(`Alert` is already imported in this file — no import change needed for it specifically.)

- [ ] **Step 2: Fix the existing test broken by this change**

In `src/app/components/Scorecard/index.test.tsx`, this shared `baseProps` currently has `resolvedAbilities: new Map(),` — an empty map. Combined with the first test's `fetchEvents = () => Promise.resolve([]);`, the fight now resolves `healingCastCount: 0` (0 real healing casts, since `resolvedAbilities` is empty regardless of any events), making it off-role and triggering the new `Alert` — which breaks that test's `expect(screen.getByRole("alert"))` (now ambiguous: two `role="alert"` elements match).

Fix this by changing that one test (`"renders the fight header, all 6 epic widgets, and the footer"`) to supply real healing-cast data, keeping the fight on-role so the singular `getByRole("alert")` query still matches exactly one element (the footer's). This file already imports `aCastEvent` from `../../../testUtils/factories` (used by the second test) — reuse it here too. Change:

```ts
const fetchEvents = () => Promise.resolve([]);
```

to:

```ts
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) =>
  Promise.resolve(
    dataType === "Casts"
      ? [
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
        ]
      : [],
  );
```

Then update the shared `baseProps` object's `resolvedAbilities` field from:

```ts
  resolvedAbilities: new Map(),
```

to:

```ts
  resolvedAbilities: new Map([
    [33763, { kind: "spell" as const, spell: "Lifebloom" as const, rank: 1 }],
  ]),
```

This shared change is safe for every other test in the file: none of the other tests assert on `resolvedAbilities`-driven content directly, and this only adds one resolvable ability — it doesn't change what any other test's `fetchEvents` mock returns.

- [ ] **Step 3: Add a new test for the off-role Alert appearing**

Add a new test to `src/app/components/Scorecard/index.test.tsx`:

```ts
  it("shows an off-role Alert when the druid didn't clear the healing-cast threshold this fight", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onBackToFights={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("alert")).toHaveLength(2),
    );
    expect(
      screen.getByText(/cast 0 healing spells this fight/),
    ).toBeInTheDocument();
  });
```

(This test relies on Step 2's updated `baseProps.resolvedAbilities` — even with a real Lifebloom resolution available, an empty `fetchEvents` result means zero actual casts, so `healingCastCount` is 0 regardless.)

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS, all existing tests (including the fixed first test) plus the new off-role test.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS. Pay particular attention to any other test file that imports `Scorecard`'s `baseProps`-equivalent pattern (there shouldn't be any — `baseProps` is local to this test file) and to whether any other currently-passing test elsewhere unexpectedly starts failing due to the `resolvedAbilities` default change (it shouldn't, since that field is local to `Scorecard/index.test.tsx`'s own `baseProps`).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx
git commit -m "feat(scorecard): surface an off-role caveat when the druid didn't heal this fight"
```

---

### Task 4: Wire the hook into `ReportDashboard`/`FightRow`, exclude off-role fights from aggregation, and fix the resulting tests

**Files:**

- Modify: `src/app/components/ReportDashboard/index.tsx`
- Modify: `src/app/components/ReportDashboard/index.module.css`
- Modify: `src/app/components/ReportDashboard/index.test.tsx`

**Interfaces:**

- Consumes: `useHealingRoleThisFight` from `../Scorecard/useHealingRoleThisFight` (Task 2).
- Produces: nothing new for later tasks — this is the terminal wiring for 903b's core acceptance criteria (aggregation exclusion + fight-list labeling).

- [ ] **Step 1: Add the hook call and reporting callback to `FightRow`**

In `src/app/components/ReportDashboard/index.tsx`, add this import alongside the existing ones:

```ts
import { useHealingRoleThisFight } from "../Scorecard/useHealingRoleThisFight";
```

Add a new prop to `FightRowProps` (directly below `onSummaries`):

```ts
  onSummaries: (fightId: number, summaries: FightEpicSummaries) => void;
  onHealingRole: (fightId: number, isHealingThisFight: boolean) => void;
```

Inside `FightRow`, add the new prop to the destructured parameters (directly after `onSummaries`) and add the hook call directly below the existing `useFightEpicSummaries(...)` call:

```ts
const healingRole = useHealingRoleThisFight(
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
);
```

Replace the existing summary-reporting effect:

```ts
const summaryDeps = EPIC_META.map(({ id }) => epicKey(summaries[id]));
useEffect(() => {
  onSummaries(fight.id, summaries);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryDeps flattens `summaries` into stable string keys; `summaries` itself is a fresh object every render and would refire this effect every render if listed directly
}, [fight.id, onSummaries, ...summaryDeps]);
```

with (adding a second effect for the healing-role report, kept separate since it has its own resolved-status dependency rather than piggybacking on `summaryDeps`):

```ts
const summaryDeps = EPIC_META.map(({ id }) => epicKey(summaries[id]));
useEffect(() => {
  onSummaries(fight.id, summaries);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryDeps flattens `summaries` into stable string keys; `summaries` itself is a fresh object every render and would refire this effect every render if listed directly
}, [fight.id, onSummaries, ...summaryDeps]);

useEffect(() => {
  if (healingRole.status !== "ready") return;
  onHealingRole(fight.id, healingRole.isHealingThisFight);
}, [fight.id, onHealingRole, healingRole]);
```

Unlike `summaries` (a fresh object literal assembled from six separate hook results every render, hence the `summaryDeps` flattening trick), `healingRole` is the direct return value of `useHealingRoleThisFight` — referentially stable across re-renders except when its own internal `setState` actually fires, so it's safe to list directly without an `eslint-disable` comment. The one harmless exception: `useHealingRoleThisFight` returns a fresh `{status: "loading"}` literal on every render before it resolves, causing a few extra no-op effect invocations while loading (the `status !== "ready"` guard makes each a no-op) — not a bug, just a minor inefficiency during the loading window, consistent with this codebase's existing tolerance for similar harmless over-firing elsewhere.

- [ ] **Step 2: Change the row's own rendering for an off-role fight**

Replace:

```tsx
return (
  <button type="button" className={styles.row} onClick={() => onOpen(fight.id)}>
    <span className={styles.rowLabel}>{label}</span>
    {fight.kill === true ? (
      <Badge tone="kill">Kill</Badge>
    ) : fight.kill === false ? (
      <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
    ) : null}
    <span className={styles.duration}>{duration}</span>
    {overall.status === "ready" ? (
      <JudgementChip judgement={overall.judgement} />
    ) : overall.status === "error" ? (
      <span className={styles.calculating}>{overall.error}</span>
    ) : (
      <span className={styles.calculating}>Calculating…</span>
    )}
  </button>
);
```

with:

```tsx
const isOffRole =
  healingRole.status === "ready" && !healingRole.isHealingThisFight;

return (
  <button
    type="button"
    className={isOffRole ? `${styles.row} ${styles.offRole}` : styles.row}
    onClick={() => onOpen(fight.id)}
  >
    <span className={styles.rowLabel}>{label}</span>
    {fight.kill === true ? (
      <Badge tone="kill">Kill</Badge>
    ) : fight.kill === false ? (
      <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
    ) : null}
    <span className={styles.duration}>{duration}</span>
    {isOffRole ? (
      <span className={styles.offRoleLabel}>Not healing this fight</span>
    ) : overall.status === "ready" ? (
      <JudgementChip judgement={overall.judgement} />
    ) : overall.status === "error" ? (
      <span className={styles.calculating}>{overall.error}</span>
    ) : (
      <span className={styles.calculating}>Calculating…</span>
    )}
  </button>
);
```

- [ ] **Step 3: Add the CSS classes**

In `src/app/components/ReportDashboard/index.module.css`, add directly after the existing `.duration` rule:

```css
.offRole {
  opacity: 0.6;
}

.offRoleLabel {
  font-size: var(--text-small-size);
  color: var(--text);
}
```

- [ ] **Step 4: Track healing-role status in `ReportDashboard` and exclude off-role fights from the aggregate strip**

In the `ReportDashboard` function, add a new state directly below the existing `summariesByFight` state:

```ts
const [summariesByFight, setSummariesByFight] = useState<
  Map<number, FightEpicSummaries>
>(new Map());
const [healingRoleByFight, setHealingRoleByFight] = useState<
  Map<number, boolean>
>(new Map());
```

Add a new callback directly below the existing `handleSummaries` callback:

```ts
const handleSummaries = useCallback(
  (fightId: number, summaries: FightEpicSummaries) => {
    setSummariesByFight((prev) => {
      const next = new Map(prev);
      next.set(fightId, summaries);
      return next;
    });
  },
  [],
);
const handleHealingRole = useCallback(
  (fightId: number, isHealingThisFight: boolean) => {
    setHealingRoleByFight((prev) => {
      const next = new Map(prev);
      next.set(fightId, isHealingThisFight);
      return next;
    });
  },
  [],
);
```

Replace:

```ts
const allSummaries = Array.from(summariesByFight.values());
```

with:

```ts
const onRoleRows = rows.filter(
  (row) => healingRoleByFight.get(row.fight.id) !== false,
);
const allSummaries = onRoleRows
  .map((row) => summariesByFight.get(row.fight.id))
  .filter((s): s is FightEpicSummaries => s !== undefined);
```

(`rows` is already defined above this point in the function — no new variable needed for it.)

Pass the new prop to each `FightRow` — replace:

```tsx
          <FightRow
            key={fight.id}
            fight={fight}
            pullNumber={pullNumber}
            onOpen={onOpenFight}
            onSummaries={handleSummaries}
```

with:

```tsx
          <FightRow
            key={fight.id}
            fight={fight}
            pullNumber={pullNumber}
            onOpen={onOpenFight}
            onSummaries={handleSummaries}
            onHealingRole={handleHealingRole}
```

- [ ] **Step 5: Fix the two existing tests broken by this change**

In `src/app/components/ReportDashboard/index.test.tsx`, this shared `baseProps` currently has `resolvedAbilities: new Map(),`. Change it to:

```ts
  resolvedAbilities: new Map([
    [33763, { kind: "spell" as const, spell: "Lifebloom" as const, rank: 1 }],
  ]),
```

Then find the test `"shows each fight's own worst-of judgement once its six epics resolve"`. Its `fetchEvents = () => Promise.resolve([]);` currently means the fight resolves 0 healing casts, making it off-role — after this task's change, the row would show "Not healing this fight" instead of a judgement chip, breaking this test's `toHaveTextContent(/Good|Fair|Bad/)` assertion. Change its `fetchEvents` to:

```ts
const fetchEvents = (
  _token: string,
  _report: string,
  _fight: unknown,
  dataType: string,
) =>
  Promise.resolve(
    dataType === "Casts"
      ? [
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
        ]
      : [],
  );
```

(Add `aCastEvent` to this file's existing `import { aFight } from "../../../testUtils/factories";` line, making it `import { aCastEvent, aFight } from "../../../testUtils/factories";`.)

Apply the exact same `fetchEvents` fix to the test `"shows six aggregated epic chips that resolve once every fight's data is in"` — its single fight must also stay on-role, or `allSummaries` becomes empty (since the only fight is filtered out as off-role) and the aggregate strip's `worstReadyJudgement` stays `null` forever, breaking that test's `expect(screen.queryAllByText("Calculating…")).toHaveLength(0)` assertion (the row's own "Calculating…" would clear, but the strip's five chips would not).

- [ ] **Step 6: Add a new test for off-role exclusion from the aggregate strip**

Add a new test to `src/app/components/ReportDashboard/index.test.tsx`:

```ts
  it("excludes an off-role fight's judgements from the aggregate strip and labels its row", async () => {
    const onRoleFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const offRoleFight = aFight({
      id: 2,
      name: "Hydross the Unstable",
      kill: true,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      if (dataType !== "Casts") return Promise.resolve([]);
      if (fight.id !== 1) return Promise.resolve([]);
      return Promise.resolve([
        aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
        aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
        aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
      ]);
    };

    render(
      <ReportDashboard
        {...baseProps}
        fights={[onRoleFight, offRoleFight]}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Hydross the Unstable/ }),
      ).toHaveTextContent("Not healing this fight"),
    );
    expect(
      screen.queryByRole("button", {
        name: /Hydross the Unstable/,
      }),
    ).not.toHaveTextContent(/Good|Fair|Bad/);
  });
```

- [ ] **Step 7: Run the test suite**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS, all existing tests (including the two fixed ones) plus the new off-role test.

- [ ] **Step 8: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/components/ReportDashboard/index.tsx src/app/components/ReportDashboard/index.module.css src/app/components/ReportDashboard/index.test.tsx
git commit -m "feat(report-dashboard): exclude off-role fights from the aggregate rollup and label them"
```

---

### Task 5: Real-data spot-check, docs, story 709 retirement, and story close-out

**Files:**

- Modify: `docs/testing.md`
- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/903b-per-fight-role-detection-design.md`
- Delete: `docs/plans/903b-per-fight-role-detection-plan.md` (this file)

**Interfaces:** None — this task is verification and documentation only, no application code.

- [ ] **Step 1: Real-data spot-check against the known off-role report**

This step requires `WCL_TEST_ACCESS_TOKEN` (see `docs/testing.md`) and is a manual verification, not an automated test. Run the app locally (`npm run dev`), load report `F7aL6x13zVq8kTRt`, select the druid Nebd, and confirm in the whole-report dashboard: fights 4 (Hydross the Unstable) and 8 (The Lurker Below) show "Not healing this fight" and a dimmed row; every other fight (12, 17, 21, 22, 30, 32, 36, 40) shows a normal judgement chip. Open fight 4's Scorecard directly and confirm the off-role `Alert` appears with "Nebd cast 0 healing spells this fight". Open fight 30 (High Astromancer Solarian — the borderline case, 6 healing casts despite a `Druid-Balance` WCL spec icon) and confirm it does **not** show as off-role (6 ≥ the 3-cast threshold).

If any of this doesn't match, stop and debug before proceeding — do not mark the story done with a known real-data mismatch.

- [ ] **Step 2: Add `F7aL6x13zVq8kTRt` to `docs/testing.md`'s known-reports table**

Add a new row to the "Known real test reports" table (find the existing table by searching for `"| \`4GYHZRdtL3bvhpc8\`"`or similar existing rows) documenting: report code`F7aL6x13zVq8kTRt`, druid Nebd (druidId 33), a hybrid Balance/healer swapping role per pull with no respec — 0 healing casts on fights 4 (Hydross) and 8 (Lurker Below), 6-120 healing casts on the other 8 fights (including a borderline 6-cast case on fight 30 despite a self-reported `Druid-Balance`WCL spec icon that pull) — the basis for story 903b's per-fight healing-role detection. This also resolves the stale cross-reference in`docs/backlog.md` story 903b's own acceptance criteria, which already names this report/table entry.

- [ ] **Step 3: Mark story 903b done and remove story 709's entry from `docs/backlog.md`**

Change the story 903b heading from:

```
### 903b — Per-fight healing-role detection 🔲 Todo
```

to:

```
### 903b — Per-fight healing-role detection ✅ Done
```

Find story 709's full entry (search for `"### 709 — Exclude off-role fights"`) and delete it entirely — heading, prose, and acceptance criteria bullets — following this repo's existing precedent for story 004 (fully removed from `docs/backlog.md` when superseded by 702, per `CLAUDE.md`'s repo-state narrative).

- [ ] **Step 4: Update `CLAUDE.md`'s repo-state narrative**

Add a sentence to `CLAUDE.md`'s "Repo state" paragraph (append near where story 903a's closure would already be mentioned, or at the end of the paragraph if 903a hasn't added its own sentence yet) along these lines: "Story 903b (per-fight healing-role detection, epic I) is done too — it retires story 709, whose off-role-fight exclusion is now a special case of `detectHealingRoleThisFight`'s general per-fight mechanism; story 709's own backlog entry has been removed entirely, per the same precedent already used for story 004."

- [ ] **Step 5: Delete the spec and plan docs**

First, grep the repo to confirm nothing references either file path:

```bash
grep -rn "903b-per-fight-role-detection" --include="*.md" --include="*.ts" --include="*.tsx" .
```

Expected: no references outside `docs/backlog.md`'s own prose about the story (which references the story number, not the file path).

Then delete both files:

```bash
git rm docs/specs/903b-per-fight-role-detection-design.md docs/plans/903b-per-fight-role-detection-plan.md
```

- [ ] **Step 6: Commit**

```bash
git add docs/testing.md docs/backlog.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: close out story 903b, retire story 709 and 903b's design spec/plan

Real-data spot-check against F7aL6x13zVq8kTRt (Nebd) confirmed fights
4 and 8 correctly detect as off-role (0 healing casts) while the
borderline 6-cast case on fight 30 correctly stays on-role, despite
its self-reported Druid-Balance WCL spec icon that pull.
EOF
)"
```
