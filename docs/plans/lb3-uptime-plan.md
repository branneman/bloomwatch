# LB3 Uptime Per Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 201 — a per-target 3-stack Lifebloom uptime scorecard, matching `docs/specs/lb3-uptime-design.md`.

**Architecture:** Reconstruct per-target Lifebloom stack intervals from `Buffs` events (`applybuff`/`applybuffstack`/`refreshbuff`/`removebuff`), filtered to the resolved Lifebloom ability IDs and the selected druid as caster. A new `AbilityResolver` component lifts a report-scoped `masterData.abilities` resolution to `App.tsx`; `DruidDetector` is extended to also lift raw cast-table entries for target-name display. A new `LB3UptimeCard` renders the per-target results, wired in next to the existing GCD/idle-gap cards.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library — matches the rest of the codebase, no new dependencies.

## Global Constraints

- Spell/ability IDs must never be hardcoded — Lifebloom's gameIDs are resolved from `masterData.abilities` at runtime via `resolveAbilities`/`resolveSpellAbilityIds`, never hardcoded in the metric or card.
- Every R/O/G threshold must be documented with a comment pointing at its rationale in `docs/backlog.md` (story 201: maintained-target gate 30%; green ≥90%, orange 75–90%, red <75%).
- No backend, no server-side code — all computation stays client-side in `src/metrics/lb3Uptime.ts`.
- Commits follow Conventional Commits (`feat(lifebloom): ...`, `test(lifebloom): ...`, etc. — scope `lifebloom` per `CLAUDE.md`).
- The pre-commit hook runs `typecheck`, `lint`, and `format:check` full-project on every commit — do not bypass it; if a commit fails, fix and recommit rather than `--no-verify`.
- Tier 1 unit tests are co-located `*.test.ts`/`*.test.tsx`; test data uses factory functions in `src/testUtils/factories.ts` (extend, don't duplicate).
- Story isn't done until its paperwork is retired: `docs/backlog.md` marked `✅ Done` and `docs/specs/lb3-uptime-design.md` + this plan file deleted in the final task's commit.

---

### Task 1: `WclEvent.stack` field + buff-event test factories

**Files:**

- Modify: `src/wcl/events.ts`
- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Produces: `WclEvent.stack?: number`; factories `anApplyBuffEvent`, `anApplyBuffStackEvent`, `aRefreshBuffEvent`, `aRemoveBuffEvent`, each `(overrides?: Partial<WclEvent>) => WclEvent`, mirroring the existing `aCastEvent`/`aBegincastEvent` shape. Live-verified against report `4GYHZRdtL3bvhpc8` fight 6 (Dassz, actor id 2, target actor id 42).

- [ ] **Step 1: Add the `stack` field to `WclEvent`**

In `src/wcl/events.ts`, add `stack?: number;` to the `WclEvent` interface, right after `abilityGameID`:

```ts
export interface WclEvent {
  timestamp: number;
  type: string;
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  stack?: number;
  fight: number;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Add buff-event factories**

In `src/testUtils/factories.ts`, add after `aBegincastEvent`:

```ts
export function anApplyBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1880312,
    type: "applybuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function anApplyBuffStackEvent(
  overrides: Partial<WclEvent> = {},
): WclEvent {
  return {
    timestamp: 1881811,
    type: "applybuffstack",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    stack: 2,
    fight: 6,
    ...overrides,
  };
}

export function aRefreshBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1881811,
    type: "refreshbuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}

export function aRemoveBuffEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1903349,
    type: "removebuff",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/wcl/events.ts src/testUtils/factories.ts
git commit -m "feat(lifebloom): add buff stack field and buff-event test factories"
```

---

### Task 2: `resolveSpellAbilityIds` helper

**Files:**

- Modify: `src/abilities/resolveAbilities.ts`
- Modify: `src/abilities/resolveAbilities.test.ts`

**Interfaces:**

- Consumes: `ResolvedAbility`, `DruidHealingSpell` (already defined in `resolveAbilities.ts`).
- Produces: `resolveSpellAbilityIds(resolved: Map<number, ResolvedAbility>, spell: DruidHealingSpell): Set<number>` — consumed by `App.tsx` in Task 7 to derive Lifebloom's gameIDs.

- [ ] **Step 1: Write the failing tests**

Append to `src/abilities/resolveAbilities.test.ts` (add `resolveSpellAbilityIds` to the existing import from `"./resolveAbilities"`):

```ts
import { resolveAbilities, resolveSpellAbilityIds } from "./resolveAbilities";
```

```ts
describe("resolveSpellAbilityIds", () => {
  it("returns every gameID resolved to the given spell, including rank: null fallbacks", () => {
    const resolved = resolveAbilities([
      aReportAbility({ gameID: 33763, name: "Lifebloom" }),
      aReportAbility({ gameID: 33778, name: "Lifebloom" }),
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(resolveSpellAbilityIds(resolved, "Lifebloom")).toEqual(
      new Set([33763, 33778]),
    );
  });

  it("returns an empty set when the spell has no resolved abilities", () => {
    const resolved = resolveAbilities([
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(resolveSpellAbilityIds(resolved, "Lifebloom")).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: FAIL — `resolveSpellAbilityIds is not a function` (or a TS error, since it isn't exported yet).

- [ ] **Step 3: Implement `resolveSpellAbilityIds`**

Append to `src/abilities/resolveAbilities.ts`:

```ts
export function resolveSpellAbilityIds(
  resolved: Map<number, ResolvedAbility>,
  spell: DruidHealingSpell,
): Set<number> {
  const ids = new Set<number>();
  for (const [gameID, ability] of resolved) {
    if (ability.kind === "spell" && ability.spell === spell) {
      ids.add(gameID);
    }
  }
  return ids;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/abilities/resolveAbilities.ts src/abilities/resolveAbilities.test.ts
git commit -m "feat(lifebloom): add resolveSpellAbilityIds helper"
```

---

### Task 3: `computeLb3Uptime` metric

**Files:**

- Create: `src/metrics/lb3Uptime.ts`
- Create: `src/metrics/lb3Uptime.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`, now with `.stack?: number`), `Judgement`/`judgeThreshold` (`src/metrics/judgement.ts`).
- Produces: `computeLb3Uptime(events: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>, fightStart: number, fightEnd: number): Lb3UptimeResult`, where:

```ts
export interface Lb3TargetResult {
  targetId: number;
  lbUptimePct: number;
  lb3UptimeMs: number;
  windowMs: number;
  lb3UptimePct: number;
  judgement: Judgement;
}

export interface Lb3UptimeResult {
  targets: Lb3TargetResult[];
}
```

Consumed by `LB3UptimeCard` in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/lb3Uptime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeLb3Uptime } from "./lb3Uptime";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("computeLb3Uptime", () => {
  it("excludes the ramp-up period from the 3-stack window", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 3000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 20000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 20000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 100,
        lb3UptimeMs: 17000,
        windowMs: 17000,
        lb3UptimePct: 100,
        judgement: "green",
      },
    ]);
  });

  it("reports multiple targets independently", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 4000, targetID: 47 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets.map((t) => t.targetId)).toEqual([42, 47]);
    expect(result.targets[1]).toMatchObject({
      targetId: 47,
      lb3UptimeMs: 0,
      lb3UptimePct: 0,
      judgement: "red",
    });
  });

  it("excludes a target below the 30% maintained-uptime threshold", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 99 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 99 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 100000);
    expect(result.targets).toEqual([]);
  });

  it("closes an interval still open at fightEnd", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 5000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 100,
        lb3UptimeMs: 3000,
        windowMs: 3000,
        lb3UptimePct: 100,
        judgement: "green",
      },
    ]);
  });

  it("reports 0% and red for a maintained target that never reaches 3 stacks", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 8000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 80,
        lb3UptimeMs: 0,
        windowMs: 10000,
        lb3UptimePct: 0,
        judgement: "red",
      },
    ]);
  });

  it("accumulates 3-stack time across a drop and re-ramp, keeping the first-reached timestamp", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 70,
        lb3UptimeMs: 5000,
        windowMs: 9000,
        lb3UptimePct: (5000 / 9000) * 100,
        judgement: "red",
      },
    ]);
  });

  it("judges orange between 75% and 90%, green at or above 90%", () => {
    const baseEvents = (dropAt: number, reopenAt: number) => [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: dropAt, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: reopenAt, stack: 3, targetID: 42 }),
    ];

    const greenResult = computeLb3Uptime(
      baseEvents(6000, 6500),
      2,
      LB_IDS,
      0,
      11000,
    );
    expect(greenResult.targets[0].lb3UptimePct).toBe(95);
    expect(greenResult.targets[0].judgement).toBe("green");

    const orangeResult = computeLb3Uptime(
      baseEvents(6000, 8000),
      2,
      LB_IDS,
      0,
      11000,
    );
    expect(orangeResult.targets[0].lb3UptimePct).toBe(80);
    expect(orangeResult.targets[0].judgement).toBe("orange");
  });

  it("ignores events from a different caster and non-Lifebloom abilities", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, sourceID: 99 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 3,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: FAIL — `Cannot find module './lb3Uptime'`.

- [ ] **Step 3: Implement `computeLb3Uptime`**

Create `src/metrics/lb3Uptime.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import { judgeThreshold, type Judgement } from "./judgement";

// Backlog story 201: targets under 30% any-stack Lifebloom uptime are
// one-off casts, not "maintained" targets, and are excluded entirely.
const MAINTAINED_MIN_UPTIME_PCT = 30;

// R/O/G thresholds per docs/backlog.md story 201: green >= 90%, orange 75-90%, red < 75%.
const GREEN_MIN_PCT = 90;
const ORANGE_MIN_PCT = 75;

export interface Lb3TargetResult {
  targetId: number;
  lbUptimePct: number;
  lb3UptimeMs: number;
  windowMs: number;
  lb3UptimePct: number;
  judgement: Judgement;
}

export interface Lb3UptimeResult {
  targets: Lb3TargetResult[];
}

interface TargetState {
  currentStack: number;
  openAt: number | null;
  stack3OpenAt: number | null;
  firstReached3At: number | null;
  totalAnyStackMs: number;
  totalStack3Ms: number;
}

function newTargetState(): TargetState {
  return {
    currentStack: 0,
    openAt: null,
    stack3OpenAt: null,
    firstReached3At: null,
    totalAnyStackMs: 0,
    totalStack3Ms: 0,
  };
}

export function computeLb3Uptime(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): Lb3UptimeResult {
  const states = new Map<number, TargetState>();
  const targetOrder: number[] = [];

  for (const event of events) {
    if (event.sourceID !== druidId) continue;
    if (event.abilityGameID === undefined) continue;
    if (!lifebloomAbilityIds.has(event.abilityGameID)) continue;
    if (event.targetID === undefined) continue;

    let state = states.get(event.targetID);
    if (!state) {
      state = newTargetState();
      states.set(event.targetID, state);
      targetOrder.push(event.targetID);
    }

    if (event.type === "applybuff") {
      state.openAt = event.timestamp;
      state.currentStack = 1;
      continue;
    }

    if (event.type === "applybuffstack") {
      const stack =
        typeof event.stack === "number" ? event.stack : state.currentStack;
      state.currentStack = stack;
      if (stack >= 3 && state.stack3OpenAt === null) {
        state.stack3OpenAt = event.timestamp;
        if (state.firstReached3At === null) {
          state.firstReached3At = event.timestamp;
        }
      } else if (stack < 3 && state.stack3OpenAt !== null) {
        state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
        state.stack3OpenAt = null;
      }
      continue;
    }

    if (event.type === "removebuff") {
      if (state.openAt !== null) {
        state.totalAnyStackMs += event.timestamp - state.openAt;
        state.openAt = null;
      }
      if (state.stack3OpenAt !== null) {
        state.totalStack3Ms += event.timestamp - state.stack3OpenAt;
        state.stack3OpenAt = null;
      }
      state.currentStack = 0;
      continue;
    }

    // refreshbuff: no stack change, nothing to record.
  }

  const fightDurationMs = fightEnd - fightStart;
  const results: Lb3TargetResult[] = [];

  for (const targetId of targetOrder) {
    const state = states.get(targetId);
    if (!state) continue;

    if (state.openAt !== null) {
      state.totalAnyStackMs += fightEnd - state.openAt;
      state.openAt = null;
    }
    if (state.stack3OpenAt !== null) {
      state.totalStack3Ms += fightEnd - state.stack3OpenAt;
      state.stack3OpenAt = null;
    }

    const lbUptimePct = (state.totalAnyStackMs / fightDurationMs) * 100;
    if (lbUptimePct < MAINTAINED_MIN_UPTIME_PCT) continue;

    const windowMs =
      state.firstReached3At === null
        ? fightDurationMs
        : fightEnd - state.firstReached3At;
    const lb3UptimeMs = state.totalStack3Ms;
    const lb3UptimePct = windowMs > 0 ? (lb3UptimeMs / windowMs) * 100 : 0;

    results.push({
      targetId,
      lbUptimePct,
      lb3UptimeMs,
      windowMs,
      lb3UptimePct,
      judgement: judgeThreshold(lb3UptimePct, {
        greenMin: GREEN_MIN_PCT,
        orangeMin: ORANGE_MIN_PCT,
      }),
    });
  }

  return { targets: results };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/lb3Uptime.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/lb3Uptime.ts src/metrics/lb3Uptime.test.ts
git commit -m "feat(lifebloom): compute per-target LB3 uptime from buff events"
```

---

### Task 4: `LB3UptimeCard` component

**Files:**

- Create: `src/app/components/LB3UptimeCard/index.tsx`
- Create: `src/app/components/LB3UptimeCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeLb3Uptime`, `Lb3UptimeResult` (Task 3); `Fight` (`src/wcl/client.ts`); `WclEvent`, `WclEventDataType` (`src/wcl/events.ts`); `EventFetcherFight` (`src/wcl/eventCache.ts`).
- Produces: `LB3UptimeCard` React component with props `{ accessToken: string; reportCode: string; fight: Fight; druidId: number; lifebloomAbilityIds: Set<number>; targetNames: Map<number, string>; fetchEvents: (...) => Promise<WclEvent[]> }`, consumed by `App.tsx` in Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/LB3UptimeCard/index.test.tsx`:

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
      screen.getByRole("heading", { name: "The Lurker Below" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Fanah: 100% — Green")).toBeInTheDocument(),
    );
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
      expect(screen.getByText("Target #42: 100% — Green")).toBeInTheDocument(),
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/LB3UptimeCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement `LB3UptimeCard`**

Create `src/app/components/LB3UptimeCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeLb3Uptime,
  type Lb3UptimeResult,
} from "../../../metrics/lb3Uptime";
import type { Judgement } from "../../../metrics/judgement";

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

const JUDGEMENT_LABEL: Record<Judgement, string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

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

  return (
    <section>
      <h3>{fight.name}</h3>
      {!isCurrent && <p>Calculating…</p>}
      {isCurrent && "error" in result && <p role="alert">{result.error}</p>}
      {isCurrent && !("error" in result) && (
        <>
          {result.result.targets.length === 0 ? (
            <p>No maintained targets.</p>
          ) : (
            <ul>
              {result.result.targets.map((target) => (
                <li key={target.targetId}>
                  {targetNames.get(target.targetId) ??
                    `Target #${target.targetId}`}
                  : {Math.round(target.lb3UptimePct)}% —{" "}
                  {JUDGEMENT_LABEL[target.judgement]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/LB3UptimeCard/index.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LB3UptimeCard
git commit -m "feat(lifebloom): add LB3UptimeCard component"
```

---

### Task 5: `DruidDetector` — lift raw cast-table entries

**Files:**

- Modify: `src/app/components/DruidDetector/index.tsx`
- Modify: `src/app/components/DruidDetector/index.test.tsx`

**Interfaces:**

- Produces: new optional prop `onEntriesLoaded?: (entries: CastTableEntry[]) => void` on `DruidDetector`, called with the same raw entries `fetchCastsTable` resolved (before the druid-only filter). Consumed by `App.tsx` in Task 7 to build a target-name map.

- [ ] **Step 1: Write the failing test**

Add to `src/app/components/DruidDetector/index.test.tsx`, inside the `describe` block:

```tsx
it("calls onEntriesLoaded with the raw cast-table entries once loaded", async () => {
  const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
  const fanah = aCastTableEntry({ id: 42, name: "Fanah", type: "Paladin" });
  const fetchCastsTable = () => Promise.resolve([dassz, fanah]);
  const onEntriesLoaded = vi.fn();
  render(
    <DruidDetector
      accessToken="test-token"
      reportCode="4GYHZRdtL3bvhpc8"
      fightIds={[6]}
      fetchCastsTable={fetchCastsTable}
      onDruidsDetected={vi.fn()}
      onEntriesLoaded={onEntriesLoaded}
    />,
  );
  await waitFor(() =>
    expect(onEntriesLoaded).toHaveBeenCalledWith([dassz, fanah]),
  );
});
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run src/app/components/DruidDetector/index.test.tsx`
Expected: FAIL on the new test — `onEntriesLoaded` prop doesn't exist / is never called (TS error on the prop, or assertion failure if TS is loose at test time).

- [ ] **Step 3: Add the `onEntriesLoaded` callback**

In `src/app/components/DruidDetector/index.tsx`, add the prop to the interface:

```tsx
export interface DruidDetectorProps {
  accessToken: string;
  reportCode: string;
  fightIds: number[];
  fetchCastsTable: (
    accessToken: string,
    reportCode: string,
    fightIds: number[],
  ) => Promise<CastTableEntry[]>;
  onDruidsDetected: (candidates: DruidCandidate[]) => void;
  onEntriesLoaded?: (entries: CastTableEntry[]) => void;
}
```

Destructure it in the component signature and call it in the effect, and add it to the dependency array:

```tsx
export function DruidDetector({
  accessToken,
  reportCode,
  fightIds,
  fetchCastsTable,
  onDruidsDetected,
  onEntriesLoaded,
}: DruidDetectorProps) {
  const fightIdsKey = fightIds.join(",");
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const ids = fightIdsKey === "" ? [] : fightIdsKey.split(",").map(Number);
    fetchCastsTable(accessToken, reportCode, ids)
      .then((entries) => {
        const candidates = detectDruids(entries);
        setResult({ accessToken, candidates });
        onDruidsDetected(candidates);
        onEntriesLoaded?.(entries);
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error ? err.message : "Failed to detect druids.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fightIdsKey,
    fetchCastsTable,
    onDruidsDetected,
    onEntriesLoaded,
  ]);
```

(The rest of the component is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/DruidDetector/index.test.tsx`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/DruidDetector
git commit -m "feat(lifebloom): lift raw cast-table entries from DruidDetector"
```

---

### Task 6: `AbilityResolver` component

**Files:**

- Create: `src/app/components/AbilityResolver/index.tsx`
- Create: `src/app/components/AbilityResolver/index.test.tsx`

**Interfaces:**

- Consumes: `ReportAbility` (`src/wcl/client.ts`), `resolveAbilities`, `ResolvedAbility` (`src/abilities/resolveAbilities.ts`).
- Produces: `AbilityResolver` component with props `{ accessToken: string; reportCode: string; fetchMasterDataAbilities: (accessToken: string, reportCode: string) => Promise<ReportAbility[]>; onResolved: (resolved: Map<number, ResolvedAbility>) => void }`, consumed by `App.tsx` in Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/AbilityResolver/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AbilityResolver } from "./index";
import { aReportAbility } from "../../../testUtils/factories";

describe("AbilityResolver", () => {
  it("fetches master data abilities and reports the resolved map once loaded", async () => {
    const ability = aReportAbility({ gameID: 33763, name: "Lifebloom" });
    const fetchMasterDataAbilities = () => Promise.resolve([ability]);
    const onResolved = vi.fn();
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={onResolved}
      />,
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        new Map([[33763, { kind: "spell", spell: "Lifebloom", rank: 1 }]]),
      ),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fetchMasterDataAbilities = () => new Promise<never>(() => {});
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText("Resolving abilities…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchMasterDataAbilities = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/AbilityResolver/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement `AbilityResolver`**

Create `src/app/components/AbilityResolver/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ReportAbility } from "../../../wcl/client";
import {
  resolveAbilities,
  type ResolvedAbility,
} from "../../../abilities/resolveAbilities";

export interface AbilityResolverProps {
  accessToken: string;
  reportCode: string;
  fetchMasterDataAbilities: (
    accessToken: string,
    reportCode: string,
  ) => Promise<ReportAbility[]>;
  onResolved: (resolved: Map<number, ResolvedAbility>) => void;
}

type FetchResult =
  | { accessToken: string; resolved: Map<number, ResolvedAbility> }
  | { accessToken: string; error: string };

export function AbilityResolver({
  accessToken,
  reportCode,
  fetchMasterDataAbilities,
  onResolved,
}: AbilityResolverProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchMasterDataAbilities(accessToken, reportCode)
      .then((abilities) => {
        const resolved = resolveAbilities(abilities);
        setResult({ accessToken, resolved });
        onResolved(resolved);
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error ? err.message : "Failed to resolve abilities.",
        }),
      );
  }, [accessToken, reportCode, fetchMasterDataAbilities, onResolved]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Resolving abilities…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/AbilityResolver/index.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AbilityResolver
git commit -m "feat(lifebloom): add AbilityResolver component"
```

---

### Task 7: Wire everything into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `AbilityResolver` (Task 6), `DruidDetector`'s new `onEntriesLoaded` (Task 5), `LB3UptimeCard` (Task 4), `resolveSpellAbilityIds` (Task 2), `fetchMasterDataAbilities` (existing, `src/wcl/client.ts`).

- [ ] **Step 1: Replace `src/App.tsx` with the wired-up version**

Replace the full contents of `src/App.tsx`:

```tsx
import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  type ReportFights,
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
import { GCDUtilizationCard } from "./app/components/GCDUtilizationCard";
import { IdleGapsCard } from "./app/components/IdleGapsCard";
import { LB3UptimeCard } from "./app/components/LB3UptimeCard";
import type { DruidCandidate } from "./report/druidDetection";

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
  const [eventFetcher] = useState(() => createEventFetcher());

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setResolvedAbilities(null);
  }

  const lifebloomAbilityIds = resolvedAbilities
    ? resolveSpellAbilityIds(resolvedAbilities, "Lifebloom")
    : null;

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      {accessToken && <ReportInput onSubmit={handleReportSubmit} />}
      {accessToken && report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={fetchReportFights}
          onReportLoaded={setLoadedReport}
        />
      )}
      {accessToken && report && (
        <AbilityResolver
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchMasterDataAbilities={fetchMasterDataAbilities}
          onResolved={setResolvedAbilities}
        />
      )}
      {loadedReport && (
        <FightPicker
          fights={loadedReport.fights}
          initialFightId={report?.fightId ?? null}
          onSelectionChange={setSelectedFightIds}
        />
      )}
      {accessToken && loadedReport && report && (
        <DruidDetector
          accessToken={accessToken}
          reportCode={report.reportCode}
          fightIds={loadedReport.fights.map((f) => f.id)}
          fetchCastsTable={fetchCastsTable}
          onDruidsDetected={setDruidCandidates}
          onEntriesLoaded={(entries) =>
            setActorNames(new Map(entries.map((e) => [e.id, e.name])))
          }
        />
      )}
      {druidCandidates !== null && (
        <DruidPicker
          candidates={druidCandidates}
          onSelect={setSelectedDruidId}
        />
      )}
      {accessToken &&
        report &&
        loadedReport &&
        selectedDruidId !== null &&
        lifebloomAbilityIds !== null &&
        selectedFightIds.length > 0 && (
          <div>
            {loadedReport.fights
              .filter((f) => selectedFightIds.includes(f.id))
              .map((f) => (
                <div key={f.id}>
                  <GCDUtilizationCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                  <IdleGapsCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                  <LB3UptimeCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    lifebloomAbilityIds={lifebloomAbilityIds}
                    targetNames={actorNames}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                </div>
              ))}
          </div>
        )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Run typecheck, lint, and the full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass — no new failures.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(lifebloom): wire LB3UptimeCard into App"
```

---

### Task 8: Retire the story's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/lb3-uptime-design.md`
- Delete: `docs/plans/lb3-uptime-plan.md` (this file)

- [ ] **Step 1: Mark story 201 done in the backlog**

In `docs/backlog.md`, change the heading:

```diff
-### 201 — LB3 uptime per target
+### 201 — LB3 uptime per target ✅ Done
```

- [ ] **Step 2: Point `CLAUDE.md`'s repo-state note at the next story**

In `CLAUDE.md`, under `## Repo state`, update the sentence to include story 201 as complete and point at story 202 next:

```diff
-Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), story 006 (event fetching & caching layer), story 007 (ability resolution table), story 101 (active time & GCD utilization), and story 102 (idle-gap detection) are complete and live. Phase 1 MVP work continues with backlog story 201 (LB3 uptime per target) next.
+Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), story 006 (event fetching & caching layer), story 007 (ability resolution table), story 101 (active time & GCD utilization), story 102 (idle-gap detection), and story 201 (LB3 uptime per target) are complete and live. Phase 1 MVP work continues with backlog story 202 (refresh cadence histogram) next.
```

- [ ] **Step 3: Confirm nothing else references the spec/plan paths**

Run: `grep -rn "lb3-uptime-design\|lb3-uptime-plan" --include=*.md --include=*.ts --include=*.tsx .`
Expected: no output (besides the files themselves, which this task deletes next).

- [ ] **Step 4: Delete the spec and plan files**

```bash
git rm docs/specs/lb3-uptime-design.md docs/plans/lb3-uptime-plan.md
```

- [ ] **Step 5: Run the full verification suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 201 done, delete its spec/plan, point at story 202"
```
