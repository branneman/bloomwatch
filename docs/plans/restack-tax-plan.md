# Re-stack Tax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 204 — count Lifebloom casts spent rebuilding a target's stack after it dropped below 3 (excluding each target's free first ramp), report the count plus an estimated mana cost, and surface both with fight-length-scaled R/O/G on the scorecard.

**Architecture:** A new pure metric function `computeRestackTax` in `src/metrics/restackTax.ts` merges a druid's Lifebloom cast events with the existing `reconstructLifebloomTimelines` stack reconstruction (already used by `refreshCadence.ts` and `accidentalBlooms.ts`) to classify each cast as free-ramp or re-stack-tax. `RestackTaxCard` (currently a static placeholder wired into `Scorecard`) is rewired to fetch `Buffs` + `Casts` events via the existing `fetchEvents` cache and render the real result, following the exact pattern `AccidentalBloomsCard` used for story 203.

**Tech Stack:** TypeScript, React, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded as "this ID means X" — cast filtering must use `lifebloomAbilityIds` (resolved at runtime), not a hardcoded gameID.
- Every R/O/G threshold and the mana-cost constant must have a comment pointing at its rationale (`docs/backlog.md` story 204, and the Wowhead source for the mana figure).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via the pre-commit hook — do not bypass it.
- A story isn't done until `docs/backlog.md` marks it `✅ Done` and its spec/plan files (`docs/specs/restack-tax-design.md`, this file) are deleted in the same commit as the last code change.

---

### Task 1: `computeRestackTax` metric

**Files:**

- Create: `src/metrics/restackTax.ts`
- Create: `src/metrics/restackTax.test.ts`

**Interfaces:**

- Consumes: `WclEvent` from `../wcl/events`; `Judgement`, `judgeThresholdBelow` from `./judgement` (existing — `src/metrics/judgement.ts`, signature `judgeThresholdBelow(value: number, thresholds: { greenMax: number; orangeMax: number }): Judgement`); `reconstructLifebloomTimelines`, `LifebloomTimelineEvent` from `./lifebloomStacks` (existing — `reconstructLifebloomTimelines(events: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>): Map<number, LifebloomTimelineEvent[]>`, where each event is `{ timestamp: number; kind: "open" | "stack-change" | "close" | "refresh"; stack?: number }`).
- Produces: `computeRestackTax(buffEvents: WclEvent[], castEvents: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>, fightDurationMs: number): RestackTaxResult`, where:

  ```ts
  export interface RestackTaxCast {
    timestampMs: number;
    targetId: number;
  }
  export interface RestackTaxResult {
    casts: RestackTaxCast[];
    castCount: number;
    estimatedMana: number;
    judgement: Judgement;
  }
  ```

  Task 2 imports `computeRestackTax` and both interfaces from `../../../metrics/restackTax`.

- [ ] **Step 1: Write the failing tests**

Create `src/metrics/restackTax.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRestackTax } from "./restackTax";
import {
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const DRUID_ID = 2;
const LIFEBLOOM_IDS = new Set([33763]);
const FIGHT_DURATION_MS = 341000; // 5:41 — matches the story's worked example

describe("computeRestackTax", () => {
  it("returns zero casts and green judgement with no events", () => {
    const result = computeRestackTax(
      [],
      [],
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result).toEqual({
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    });
  });

  it("does not count casts during a target's first ramp to 3 stacks", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("does not count a maintenance refresh cast made at 3 stacks", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRefreshBuffEvent({ timestamp: 20000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 20000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("counts a cast that rebuilds a stack after the target already reached 3 once", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(1);
    expect(result.casts).toEqual([{ timestampMs: 101000, targetId: 42 }]);
    expect(result.estimatedMana).toBe(220);
  });

  it("counts every cast in a full rebuild, not just the first", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 102500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 104000, targetID: 42, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
      aCastEvent({ timestamp: 102500, targetID: 42 }),
      aCastEvent({ timestamp: 104000, targetID: 42 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(3);
    expect(result.casts).toEqual([
      { timestampMs: 101000, targetId: 42 },
      { timestampMs: 102500, targetId: 42 },
      { timestampMs: 104000, targetId: 42 },
    ]);
    expect(result.estimatedMana).toBe(660);
  });

  it("treats each target's first ramp as free independently", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      anApplyBuffEvent({ timestamp: 15000, targetID: 43 }),
      anApplyBuffStackEvent({ timestamp: 16500, targetID: 43, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 18000, targetID: 43, stack: 3 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 15000, targetID: 43 }),
      aCastEvent({ timestamp: 16500, targetID: 43 }),
      aCastEvent({ timestamp: 18000, targetID: 43 }),
    ];

    const result = computeRestackTax(
      buffEvents,
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it("ignores casts from other sources and other abilities", () => {
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42, sourceID: 99 }),
      aCastEvent({ timestamp: 11000, targetID: 42, abilityGameID: 774 }),
    ];

    const result = computeRestackTax(
      [],
      castEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
      FIGHT_DURATION_MS,
    );
    expect(result.castCount).toBe(0);
  });

  it.each([
    { restackCasts: 2, expected: "green" },
    { restackCasts: 5, expected: "orange" },
    { restackCasts: 6, expected: "red" },
  ])(
    "judges a 5:41 fight $expected at $restackCasts re-stack casts",
    ({ restackCasts, expected }) => {
      const buffEvents = [
        anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
        anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
        anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
        aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      ];
      const castEvents = [
        aCastEvent({ timestamp: 10000, targetID: 42 }),
        aCastEvent({ timestamp: 11500, targetID: 42 }),
        aCastEvent({ timestamp: 13000, targetID: 42 }),
      ];
      // Each of these fires while the target sits at 0 stacks (no
      // intervening buff events put it back above 0), so every one
      // counts as a re-stack-tax cast.
      for (let i = 0; i < restackCasts; i++) {
        castEvents.push(
          aCastEvent({ timestamp: 101000 + i * 10000, targetID: 42 }),
        );
      }

      const result = computeRestackTax(
        buffEvents,
        castEvents,
        DRUID_ID,
        LIFEBLOOM_IDS,
        FIGHT_DURATION_MS,
      );
      expect(result.castCount).toBe(restackCasts);
      expect(result.judgement).toBe(expected);
    },
  );
});
```

The final test file contains exactly 8 cases: the 7 `it(...)` blocks above (zero-events, free-ramp, maintenance-refresh, single-rebuild, full-rebuild, independent-targets, ignores-other-source) plus the `it.each` block (3 judgement-boundary cases). No other tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/restackTax.test.ts`
Expected: FAIL — `Cannot find module './restackTax'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `computeRestackTax`**

Create `src/metrics/restackTax.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow } from "./judgement";
import { reconstructLifebloomTimelines } from "./lifebloomStacks";

// Lifebloom base mana cost, TBC Classic, single rank — see
// https://www.wowhead.com/tbc/spell=33763/lifebloom. Intentionally NOT
// adjusted for talent/gear mana-cost reduction (e.g. Moonglow, set
// bonuses) — docs/backlog.md story 204 calls for an *estimate*, and
// per-log-accurate cost isn't reliably recoverable from WCL resource
// events.
const LIFEBLOOM_MANA_COST = 220;

export interface RestackTaxCast {
  timestampMs: number;
  targetId: number;
}

export interface RestackTaxResult {
  casts: RestackTaxCast[];
  castCount: number;
  estimatedMana: number;
  judgement: Judgement;
}

// R/O/G scales with fight length per docs/backlog.md story 204: one
// green-tier tax cast is allowed per 2 minutes elapsed, one orange-tier
// cast per minute elapsed. Reproduces the card mockup's worked example:
// a 5:41 fight allows green 0-2, orange 3-5, red 6+.
function judgeRestackTax(
  castCount: number,
  fightDurationMs: number,
): Judgement {
  const fightMinutes = fightDurationMs / 60000;
  const greenMax = Math.floor(fightMinutes / 2) + 1;
  const orangeMax = Math.floor(fightMinutes);
  return judgeThresholdBelow(castCount, { greenMax, orangeMax });
}

type MergedEvent =
  | { timestamp: number; order: 0; kind: "cast" }
  | {
      timestamp: number;
      order: 1;
      kind: "buff";
      buffKind: "open" | "stack-change" | "close" | "refresh";
      stack?: number;
    };

export function computeRestackTax(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightDurationMs: number,
): RestackTaxResult {
  const timelines = reconstructLifebloomTimelines(
    buffEvents,
    druidId,
    lifebloomAbilityIds,
  );

  const castTimestampsByTarget = new Map<number, number[]>();
  for (const event of castEvents) {
    if (event.sourceID !== druidId) continue;
    if (event.type !== "cast") continue;
    if (event.abilityGameID === undefined) continue;
    if (!lifebloomAbilityIds.has(event.abilityGameID)) continue;
    if (event.targetID === undefined) continue;

    const list = castTimestampsByTarget.get(event.targetID) ?? [];
    list.push(event.timestamp);
    castTimestampsByTarget.set(event.targetID, list);
  }

  const taxCasts: RestackTaxCast[] = [];

  for (const [targetId, castTimestamps] of castTimestampsByTarget) {
    const timeline = timelines.get(targetId) ?? [];

    // Casts sort before buff events at equal timestamps: a cast and the
    // stack-change/open it causes share a timestamp, and tax
    // classification needs the stack state going into the cast, not
    // the result of it.
    const merged: MergedEvent[] = [
      ...castTimestamps.map((timestamp): MergedEvent => ({
        timestamp,
        order: 0,
        kind: "cast",
      })),
      ...timeline.map((event): MergedEvent => ({
        timestamp: event.timestamp,
        order: 1,
        kind: "buff",
        buffKind: event.kind,
        stack: event.stack,
      })),
    ];
    merged.sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);

    let currentStack = 0;
    let everReached3 = false;

    for (const item of merged) {
      if (item.kind === "cast") {
        if (everReached3 && currentStack < 3) {
          taxCasts.push({ timestampMs: item.timestamp, targetId });
        }
        continue;
      }

      if (item.buffKind === "open") {
        currentStack = 1;
      } else if (item.buffKind === "stack-change") {
        currentStack = item.stack ?? currentStack;
      } else if (item.buffKind === "close") {
        currentStack = 0;
      }
      // "refresh" leaves currentStack unchanged.

      if (currentStack >= 3) {
        everReached3 = true;
      }
    }
  }

  taxCasts.sort((a, b) => a.timestampMs - b.timestampMs);

  const castCount = taxCasts.length;

  return {
    casts: taxCasts,
    castCount,
    estimatedMana: castCount * LIFEBLOOM_MANA_COST,
    judgement: judgeRestackTax(castCount, fightDurationMs),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/restackTax.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Full static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors. If `format:check` fails, run `npx prettier --write src/metrics/restackTax.ts src/metrics/restackTax.test.ts` and re-check.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/restackTax.ts src/metrics/restackTax.test.ts
git commit -m "feat(lifebloom): add re-stack tax metric"
```

---

### Task 2: Wire `RestackTaxCard` to real data

**Files:**

- Modify: `src/app/components/RestackTaxCard/index.tsx` (currently a static placeholder)
- Modify: `src/app/components/RestackTaxCard/index.test.tsx` (currently tests the static placeholder — fully replaced)
- Modify: `src/app/components/Scorecard/index.tsx:12,116-126` (add real props to `<RestackTaxCard />`)

**Interfaces:**

- Consumes: `computeRestackTax`, `RestackTaxResult` from `../../../metrics/restackTax` (Task 1); `Fight` from `../../../wcl/client`; `WclEvent`, `WclEventDataType` from `../../../wcl/events`; `EventFetcherFight` from `../../../wcl/eventCache`; `formatDuration` from `../../../report/fightRows`; `buildFightTimeUrl` from `../../../report/wclLinks`; `MetricCard` from `../ui/MetricCard`. All of these already exist and are used identically by `src/app/components/AccidentalBloomsCard/index.tsx` — use that file as the structural reference.
- Produces: `RestackTaxCard(props: RestackTaxCardProps)`, a React component consumed by `Scorecard`.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/components/RestackTaxCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RestackTaxCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[], castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> =>
    Promise.resolve(dataType === "Casts" ? castEvents : buffEvents);
}

describe("RestackTaxCard", () => {
  it("shows re-stack cast count, estimated mana, and judgement once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
    ];

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Re-stack tax" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 casts · ~220 mana")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("1:41 — Offtank")).toBeInTheDocument();
  });

  it("shows a message when there is no re-stack tax", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No re-stack tax this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <RestackTaxCard
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
      <RestackTaxCard
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/RestackTaxCard/index.test.tsx`
Expected: FAIL — the component still renders static mock content (`"3 casts · ~2,400 mana"`, no `accessToken`/`fetch` handling), so none of the new assertions match.

- [ ] **Step 3: Rewire the component**

Replace the full contents of `src/app/components/RestackTaxCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeRestackTax,
  type RestackTaxResult,
} from "../../../metrics/restackTax";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface RestackTaxCardProps {
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
  | { accessToken: string; result: RestackTaxResult }
  | { accessToken: string; error: string };

const THRESHOLD =
  "R/O/G scales with fight length: roughly one green-tier cast per 2 minutes elapsed, one orange-tier cast per minute elapsed. Each target's first ramp to 3 stacks is free — only casts that rebuild a stack after it was already established count, at an estimated 220 mana each (Lifebloom's flat TBC base cost, not adjusted for talents or gear).";

export function RestackTaxCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: RestackTaxCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
    ])
      .then(([buffEvents, castEvents]) => {
        const computed = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate re-stack tax.",
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

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Re-stack tax"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Re-stack tax"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { casts, castCount, estimatedMana, judgement } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Re-stack tax"
      value={`${castCount} casts · ~${estimatedMana} mana`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {casts.length === 0 ? (
        <p>No re-stack tax this fight.</p>
      ) : (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {casts.map((cast) => (
            <li key={`${cast.timestampMs}-${cast.targetId}`}>
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  cast.timestampMs,
                  cast.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(cast.timestampMs - fight.startTime)} —{" "}
                {targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Wire real props through `Scorecard`**

In `src/app/components/Scorecard/index.tsx`, replace line 125 (`<RestackTaxCard />`) with:

```tsx
<RestackTaxCard
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/RestackTaxCard/index.test.tsx src/app/components/Scorecard/index.test.tsx`
Expected: PASS for both files.

- [ ] **Step 6: Full test suite and static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: all pass. If `format:check` fails, run `npx prettier --write src/app/components/RestackTaxCard/index.tsx src/app/components/RestackTaxCard/index.test.tsx src/app/components/Scorecard/index.tsx` and re-check.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/RestackTaxCard/index.tsx src/app/components/RestackTaxCard/index.test.tsx src/app/components/Scorecard/index.tsx
git commit -m "feat(lifebloom): wire RestackTaxCard to real re-stack-tax data"
```

---

### Task 3: Close out story 204

**Files:**

- Modify: `docs/backlog.md` (mark story 204 `✅ Done`)
- Modify: `CLAUDE.md` (advance the "Repo state" paragraph to name the next story)
- Delete: `docs/specs/restack-tax-design.md`
- Delete: `docs/plans/restack-tax-plan.md` (this file)

**Interfaces:** None — documentation-only task.

- [ ] **Step 1: Confirm nothing else references the spec/plan files**

Run: `grep -rn "restack-tax-design\|restack-tax-plan" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: no output other than the files themselves (if the grep also matches inside them, that's fine — the check is for _other_ files referencing them).

- [ ] **Step 2: Mark the story done**

In `docs/backlog.md`, change the story 204 heading:

```diff
-### 204 — Re-stack tax
+### 204 — Re-stack tax ✅ Done
```

- [ ] **Step 3: Advance repo state in `CLAUDE.md`**

In `CLAUDE.md`, under "## Repo state", update the sentence that currently ends `...and story 203 (accidental bloom counter) are complete and live. Phase 1 MVP work continues with backlog story 204 (re-stack tax) next.` to:

```
...and story 204 (re-stack tax) are complete and live. Phase 1 MVP work continues with backlog story 205 (concurrent LB3 targets) next.
```

(Keep the full existing list of prior completed stories — only append story 204 to it and advance the "next" pointer to 205, per `docs/backlog.md`'s dependency order.)

- [ ] **Step 4: Delete the spec and plan files**

```bash
git rm docs/specs/restack-tax-design.md docs/plans/restack-tax-plan.md
```

- [ ] **Step 5: Verify static analysis still passes**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass (this task touches only Markdown, but the pre-commit hook runs full-project checks regardless).

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: close out story 204 (re-stack tax)"
```
