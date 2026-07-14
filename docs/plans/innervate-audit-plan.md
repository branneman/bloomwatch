# Innervate Audit (Story 403) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 403 — audit the druid's own Innervate usage, rewarding handing it to a mana-using ally and flagging both an unused Innervate on a mana-constrained fight and a wasted cast on a non-mana-using target.

**Architecture:** A new pure metrics module (`src/metrics/innervateAudit.ts`) computes the judged first cast plus any later informational casts, using data already fetched for the other mana-economy cards (no new WCL query type). A new `InnervateAuditCard` renders it via the existing `MetricCard` primitive and is wired into `ManaEconomyContent`. Target class/spec resolution reuses `App.tsx`'s existing whole-report actor table (`fetchCastsTable`, already fetched for druid detection) by extending it to also expose each actor's class/spec, threaded down the same path as the existing `targetNames` map.

**Tech Stack:** Vite + React + TypeScript, Vitest + React Testing Library, existing WCL client (`src/wcl/`).

## Global Constraints

- Spell/ability IDs are never hardcoded — resolve via `resolvedAbilities` (a `Map<number, ResolvedAbility>` built at runtime from the report's `masterData.abilities`), never a literal gameID in metrics logic.
- No server-side code, no new secrets, no new WCL query type — everything here reuses data already fetched client-side.
- Every R/O/G threshold must trace to `docs/backlog.md` story 403 (already written); the mana-use class/spec table is a fixed TBC game-mechanics fact, not a tunable threshold, so it's documented with an inline code comment instead (same precedent as `prepHygiene.ts`'s elixir/flask name lists) — no separate rationale doc needed.
- Static analysis (`npm run typecheck && npm run lint && npm run format:check`) runs full-project via a pre-commit hook — never bypass it (`--no-verify` is forbidden). Because this hook runs `tsc -b` across the _whole_ project on every commit, a signature/prop change with only one call site cannot be split into separate commits across separate tasks — the call site update must land in the same commit as the signature change, or the hook blocks the commit outright. (This plan originally staged the `ManaEconomyContent`/`epicSummary`/`useManaEconomySummary`/`Scorecard`/`App.tsx` prop-threading chain across three separate tasks/commits; that was found to be incompatible with the hook during execution and folded into one atomic task — see Task 3 below.)
- Tests are co-located: `*.test.ts` next to unit-tested modules (Tier 1), `*.test.tsx` next to components (Tier 3). New shared test data goes in `src/testUtils/factories.ts` only if an existing factory doesn't already cover the shape — this plan doesn't need any new factories.
- Commits follow Conventional Commits (`feat(mana): ...`, `docs: ...`).
- Work happens directly on `main`, committing after each task — no worktree/branch isolation for this plan (explicit user instruction).
- A story isn't done until its paperwork is retired: `docs/backlog.md`'s 403 heading gets `✅ Done`, and `docs/specs/innervate-audit-design.md` plus this plan file (`docs/plans/innervate-audit-plan.md`) are deleted in the final task's commit.

---

### Task 1: `computeInnervateAudit` metrics module

**Files:**

- Create: `src/metrics/innervateAudit.ts`
- Test: `src/metrics/innervateAudit.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`), `ResolvedAbility` (`src/abilities/resolveAbilities.ts`), `Judgement` (`src/metrics/judgement.ts`), `extractManaSamples`/`ManaSample` (`src/metrics/manaSamples.ts`).
- Produces (used by Task 2 and Task 3):
  - `export interface ActorClass { class: string; specIcon: string }`
  - `export function isManaUsingActor(actorClass: ActorClass | undefined): boolean`
  - `export interface InnervateCast { timestampMs: number; isSelfCast: boolean; targetId: number; targetClass: ActorClass | undefined; manaPct: number | null }`
  - `export interface InnervateAuditResult { firstCast: (InnervateCast & { judgement: Judgement }) | null; laterCasts: InnervateCast[]; judgement: Judgement | null }`
  - `export function computeInnervateAudit(castEvents: WclEvent[], druidId: number, resolvedAbilities: Map<number, ResolvedAbility>, actorClasses: Map<number, ActorClass>, fightDurationMs: number, fightStartMs: number): InnervateAuditResult`

- [ ] **Step 1: Write the failing test file**

Create `src/metrics/innervateAudit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeInnervateAudit,
  isManaUsingActor,
  type ActorClass,
} from "./innervateAudit";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const MAGE_ID = 10;
const WARRIOR_ID = 11;
const INNERVATE_ID = 29166;
const FIGHT_START = 0;
const FIGHT_DURATION = 300_000; // 5 min

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [INNERVATE_ID, { kind: "spell", spell: "Innervate", rank: 1 }],
]);

const MAGE: ActorClass = { class: "Mage", specIcon: "Mage-Fire" };
const WARRIOR: ActorClass = { class: "Warrior", specIcon: "Warrior-Fury" };
const FERAL_DRUID: ActorClass = {
  class: "Druid",
  specIcon: "Druid-Feral Combat",
};
const BALANCE_DRUID: ActorClass = {
  class: "Druid",
  specIcon: "Druid-Balance",
};

const ACTOR_CLASSES = new Map<number, ActorClass>([
  [MAGE_ID, MAGE],
  [WARRIOR_ID, WARRIOR],
]);

function anInnervateCast(timestamp: number, targetID?: number) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    abilityGameID: INNERVATE_ID,
    targetID,
    resourceActor: 1,
    classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }], // 29%
  });
}

function aManaSampleEvent(
  sourceID: number,
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("isManaUsingActor", () => {
  it("treats Warrior and Rogue as non-mana-using", () => {
    expect(isManaUsingActor(WARRIOR)).toBe(false);
    expect(isManaUsingActor({ class: "Rogue", specIcon: "Rogue-Combat" })).toBe(
      false,
    );
  });

  it("treats Feral Druid as non-mana-using but Balance/Restoration Druid as mana-using", () => {
    expect(isManaUsingActor(FERAL_DRUID)).toBe(false);
    expect(isManaUsingActor(BALANCE_DRUID)).toBe(true);
    expect(
      isManaUsingActor({ class: "Druid", specIcon: "Druid-Restoration" }),
    ).toBe(true);
  });

  it("treats every other class as mana-using", () => {
    expect(isManaUsingActor(MAGE)).toBe(true);
  });

  it("assumes mana-using when the actor's class couldn't be resolved", () => {
    expect(isManaUsingActor(undefined)).toBe(true);
  });
});

describe("computeInnervateAudit", () => {
  it("judges green when cast on a mana-using ally, reading the ally's mana% from its nearest own sample", () => {
    const events = [
      aManaSampleEvent(MAGE_ID, 9000, 4500), // 45%, closest sample to the 10000ms cast
      aManaSampleEvent(MAGE_ID, 20000, 9000),
      anInnervateCast(10000, MAGE_ID),
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toMatchObject({
      timestampMs: 10000,
      isSelfCast: false,
      targetId: MAGE_ID,
      targetClass: MAGE,
      manaPct: 45,
      judgement: "green",
    });
    expect(result.judgement).toBe("green");
  });

  it("judges red when cast on a non-mana-using ally (Warrior)", () => {
    const events = [anInnervateCast(10000, WARRIOR_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("red");
    expect(result.judgement).toBe("red");
  });

  it("judges red when cast on a Feral-spec Druid", () => {
    const FERAL_ID = 12;
    const actorClasses = new Map([[FERAL_ID, FERAL_DRUID]]);
    const events = [anInnervateCast(10000, FERAL_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      actorClasses,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("red");
  });

  it("judges self-cast green when it's well within the fight, reading mana straight off the cast event", () => {
    const events = [anInnervateCast(10000, DRUID_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toMatchObject({
      isSelfCast: true,
      targetId: DRUID_ID,
      targetClass: undefined,
      manaPct: 29,
      judgement: "green",
    });
  });

  it("treats an omitted targetID as a self-cast", () => {
    const events = [anInnervateCast(10000)]; // no targetID
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.isSelfCast).toBe(true);
  });

  it("judges self-cast orange when it lands in the fight's final 10%", () => {
    const events = [anInnervateCast(280_000, DRUID_ID)]; // 93.3% elapsed of 300_000
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("orange");
  });

  it("only judges the first cast; later casts are listed but carry no judgement", () => {
    const events = [
      anInnervateCast(10000, DRUID_ID), // first: self-cast, green
      anInnervateCast(200_000, WARRIOR_ID), // second: would be red, but doesn't count
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.judgement).toBe("green");
    expect(result.laterCasts).toHaveLength(1);
    expect(result.laterCasts[0]).toMatchObject({
      timestampMs: 200_000,
      isSelfCast: false,
      targetId: WARRIOR_ID,
    });
    expect(result.laterCasts[0]).not.toHaveProperty("judgement");
  });

  it("is red when never cast on a mana-constrained fight of at least 3 minutes", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 6000)]; // 60%, below 70%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      180_000,
      FIGHT_START,
    );
    expect(result.firstCast).toBeNull();
    expect(result.judgement).toBe("red");
  });

  it("is informational (no judgement) when never cast but mana never dropped below 70%", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 8000)]; // 80%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      300_000,
      FIGHT_START,
    );
    expect(result.judgement).toBeNull();
  });

  it("is informational (no judgement) when never cast and the fight is under 3 minutes, even if mana-constrained", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 6000)]; // 60%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      179_999,
      FIGHT_START,
    );
    expect(result.judgement).toBeNull();
  });

  it("reports an unknown mana% when the target has no cast-with-resources event in the fight, but still judges on class", () => {
    const events = [anInnervateCast(10000, MAGE_ID)]; // Mage never casts anything else
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.manaPct).toBeNull();
    expect(result.firstCast?.judgement).toBe("green");
  });

  it("ignores casts from other players and non-Innervate abilities", () => {
    const events = [
      aCastEvent({
        timestamp: 5000,
        sourceID: MAGE_ID,
        abilityGameID: INNERVATE_ID,
      }), // different source
      aCastEvent({
        timestamp: 6000,
        sourceID: DRUID_ID,
        abilityGameID: 33763,
      }), // Lifebloom, unresolved by RESOLVED_ABILITIES here
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/innervateAudit.test.ts`
Expected: FAIL — `Cannot find module './innervateAudit'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/metrics/innervateAudit.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { Judgement } from "./judgement";
import { extractManaSamples, type ManaSample } from "./manaSamples";

// docs/backlog.md story 403: reuses 401/402's "mana dropped below 70% at any
// point" signal for "mana-constrained", and additionally requires the fight
// run >= 3 min before an unused Innervate counts as a real miss.
const MANA_DROP_THRESHOLD_PCT = 70;
const MANA_CONSTRAINED_MIN_DURATION_MS = 180_000;
// Self-cast is judged "too late" once it lands in the fight's final 10%.
const LATE_CAST_FRACTION = 0.9;

export interface ActorClass {
  class: string; // CastTableEntry.type, e.g. "Mage", "Warrior", "Druid"
  specIcon: string; // CastTableEntry.icon, e.g. "Druid-Feral Combat"
}

// TBC ruleset fact, not a tunable threshold: every class has a mana pool
// except Warrior and Rogue; Druid is the only class whose mana-use depends
// on spec (Feral doesn't use mana, Balance/Restoration do). No
// docs/backlog.md rationale pointer is needed (principle 3 requires sourcing
// for R/O/G *thresholds*; this is a fixed game-mechanics fact, the same way
// prepHygiene.ts documents its elixir/flask name lists).
const NON_MANA_CLASSES = new Set(["Warrior", "Rogue"]);
const FERAL_DRUID_SPEC_ICON = "Druid-Feral Combat";

export function isManaUsingActor(actorClass: ActorClass | undefined): boolean {
  // Unknown class (couldn't be resolved from the report's actor table):
  // assume mana-using rather than falsely flagging a real ally as "wasted".
  if (actorClass === undefined) return true;
  if (NON_MANA_CLASSES.has(actorClass.class)) return false;
  if (actorClass.class === "Druid")
    return actorClass.specIcon !== FERAL_DRUID_SPEC_ICON;
  return true;
}

export interface InnervateCast {
  timestampMs: number;
  isSelfCast: boolean;
  targetId: number;
  targetClass: ActorClass | undefined;
  manaPct: number | null; // null = unknown (no mana sample found near the cast)
}

export interface InnervateAuditResult {
  firstCast: (InnervateCast & { judgement: Judgement }) | null;
  // TBC's 3-min cooldown allows a 2nd cast in a long fight; informational
  // only, per docs/backlog.md story 403 — it doesn't affect `judgement`.
  laterCasts: InnervateCast[];
  judgement: Judgement | null; // null = informational, no verdict
}

function selfManaPctAtCast(castEvent: WclEvent): number | null {
  if (castEvent.resourceActor !== 1) return null;
  const classResources = castEvent.classResources;
  if (!Array.isArray(classResources) || classResources.length === 0)
    return null;
  const resource = classResources[0] as { type?: unknown; amount?: unknown };
  if (typeof resource.type !== "number" || typeof resource.amount !== "number")
    return null;
  return (resource.type / resource.amount) * 100;
}

function nearestManaPct(samples: ManaSample[], atMs: number): number | null {
  if (samples.length === 0) return null;
  let nearest = samples[0];
  let bestDiffMs = Math.abs(samples[0].timestampMs - atMs);
  for (const sample of samples) {
    const diffMs = Math.abs(sample.timestampMs - atMs);
    if (diffMs < bestDiffMs) {
      nearest = sample;
      bestDiffMs = diffMs;
    }
  }
  return (nearest.currentMana / nearest.maxMana) * 100;
}

function buildCast(
  castEvent: WclEvent,
  druidId: number,
  actorClasses: Map<number, ActorClass>,
  allCastEvents: WclEvent[],
): InnervateCast {
  const rawTargetId = castEvent.targetID;
  const isSelfCast = rawTargetId === undefined || rawTargetId === druidId;
  const targetId = isSelfCast ? druidId : rawTargetId;
  const targetClass = isSelfCast ? undefined : actorClasses.get(targetId);
  const manaPct = isSelfCast
    ? selfManaPctAtCast(castEvent)
    : nearestManaPct(
        extractManaSamples(allCastEvents, targetId),
        castEvent.timestamp,
      );

  return {
    timestampMs: castEvent.timestamp,
    isSelfCast,
    targetId,
    targetClass,
    manaPct,
  };
}

function judgeCast(
  cast: InnervateCast,
  fightStartMs: number,
  fightDurationMs: number,
): Judgement {
  if (cast.isSelfCast) {
    const elapsedFraction = (cast.timestampMs - fightStartMs) / fightDurationMs;
    return elapsedFraction >= LATE_CAST_FRACTION ? "orange" : "green";
  }
  return isManaUsingActor(cast.targetClass) ? "green" : "red";
}

export function computeInnervateAudit(
  castEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fightDurationMs: number,
  fightStartMs: number,
): InnervateAuditResult {
  const innervateCasts = castEvents
    .filter((event) => {
      if (event.sourceID !== druidId || event.type !== "cast") return false;
      if (event.abilityGameID === undefined) return false;
      const resolved = resolvedAbilities.get(event.abilityGameID);
      return resolved?.kind === "spell" && resolved.spell === "Innervate";
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (innervateCasts.length === 0) {
    const manaConstrained = extractManaSamples(castEvents, druidId).some(
      (sample) =>
        (sample.currentMana / sample.maxMana) * 100 < MANA_DROP_THRESHOLD_PCT,
    );
    const judgement =
      manaConstrained && fightDurationMs >= MANA_CONSTRAINED_MIN_DURATION_MS
        ? "red"
        : null;
    return { firstCast: null, laterCasts: [], judgement };
  }

  const [firstEvent, ...laterEvents] = innervateCasts;
  const first = buildCast(firstEvent, druidId, actorClasses, castEvents);
  const judgement = judgeCast(first, fightStartMs, fightDurationMs);
  const laterCasts = laterEvents.map((event) =>
    buildCast(event, druidId, actorClasses, castEvents),
  );

  return {
    firstCast: { ...first, judgement },
    laterCasts,
    judgement,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/metrics/innervateAudit.test.ts`
Expected: PASS, all 13 tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/innervateAudit.ts src/metrics/innervateAudit.test.ts
git commit -m "feat(mana): add Innervate audit metrics module"
```

---

### Task 2: `InnervateAuditCard` component

**Files:**

- Create: `src/app/components/InnervateAuditCard/index.tsx`
- Test: `src/app/components/InnervateAuditCard/index.test.tsx`

**Interfaces:**

- Consumes (from Task 1): `computeInnervateAudit`, `ActorClass`, `InnervateAuditResult` from `../../../metrics/innervateAudit`.
- Consumes (existing): `MetricCard` (`../ui/MetricCard`), `formatDuration` (`../../../report/fightRows`), `buildFightTimeUrl` (`../../../report/wclLinks`), `Fight`/`ResolvedAbility`/`WclEvent`/`WclEventDataType`/`EventFetcherFight` types as used by sibling cards (e.g. `ManaCurveCard`).
- Produces (used by Task 3): `export function InnervateAuditCard(props: InnervateAuditCardProps)` where

```ts
export interface InnervateAuditCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}
```

- [ ] **Step 1: Write the failing test file**

Create `src/app/components/InnervateAuditCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InnervateAuditCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { aCastEvent, aFight } from "../../../testUtils/factories";

const INNERVATE_ID = 29166;
const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [INNERVATE_ID, { kind: "spell", spell: "Innervate", rank: 1 }],
]);

function makeFetchEvents(castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    _dataType: WclEventDataType,
  ): Promise<WclEvent[]> => Promise.resolve(castEvents);
}

describe("InnervateAuditCard", () => {
  it("shows the loading state before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={() => new Promise<never>(() => {})}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Innervate audit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={() =>
          Promise.reject(new Error("WCL API responded 500: server error"))
        }
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });

  it("renders a green chip and the ally's name/class when cast on a mana-using ally", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 50,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [50, { class: "Mage", specIcon: "Mage-Fire" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[50, "Aggrolol"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Cast at 0:10, Aggrolol (Mage)"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("renders a red chip when cast on a non-mana-using ally", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 51,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [51, { class: "Warrior", specIcon: "Warrior-Fury" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[51, "Bigaxe"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Red")).toBeInTheDocument());
  });

  it("renders 'self' and the own mana% for a self-cast", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 2,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Cast at 0:10, self")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Own mana at cast: 29%/)).toBeInTheDocument();
  });

  it("shows 'Not cast this fight' with no chip when never cast and not mana-constrained", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Not cast this fight")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Red")).not.toBeInTheDocument();
  });

  it("lists a 2nd cast as informational without its own chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 2,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
      aCastEvent({
        timestamp: 200_000,
        sourceID: 2,
        targetID: 51,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 5000, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [51, { class: "Warrior", specIcon: "Warrior-Fury" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[51, "Bigaxe"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Also cast at/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Bigaxe/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/InnervateAuditCard/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/InnervateAuditCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeInnervateAudit,
  type ActorClass,
  type InnervateAuditResult,
} from "../../../metrics/innervateAudit";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";

export interface InnervateAuditCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: InnervateAuditResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_lightning.jpg";

const THRESHOLD =
  "Only the first Innervate cast of the fight is judged (a 2nd is possible on a long fight thanks to the 3-min cooldown, but is listed as informational context only). Red if never cast on a fight that's mana-constrained (own mana dropped below 70% at some point) and at least 3 minutes long. Cast on another player: green if they're a mana-using class/spec, red if not (mana wasted on a Warrior, Rogue, or Feral-spec Druid). Self-cast: green normally, orange if cast in the fight's final 10%.";

function describeTarget(
  cast: {
    isSelfCast: boolean;
    targetId: number;
    targetClass: ActorClass | undefined;
  },
  targetNames: Map<number, string>,
): string {
  if (cast.isSelfCast) return "self";
  const name = targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`;
  return cast.targetClass ? `${name} (${cast.targetClass.class})` : name;
}

export function InnervateAuditCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  targetNames,
  fetchEvents,
}: InnervateAuditCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
      true,
    )
      .then((events) => {
        const computed = computeInnervateAudit(
          events,
          druidId,
          resolvedAbilities,
          actorClasses,
          fight.endTime - fight.startTime,
          fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Innervate audit.",
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
    actorClasses,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard icon={ICON} title="Innervate audit" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="Innervate audit" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { firstCast, laterCasts, judgement } = result.result;

  if (firstCast === null) {
    return (
      <MetricCard
        icon={ICON}
        title="Innervate audit"
        value="Not cast this fight"
        judgement={judgement}
        note={
          judgement === null
            ? "Informational — not mana-constrained, or under 3 minutes"
            : undefined
        }
        threshold={THRESHOLD}
      >
        <p>Innervate was not cast this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Innervate audit"
      value={`Cast at ${formatDuration(firstCast.timestampMs - fight.startTime)}, ${describeTarget(firstCast, targetNames)}`}
      judgement={firstCast.judgement}
      threshold={THRESHOLD}
    >
      <p>
        {firstCast.isSelfCast
          ? "Own"
          : `${describeTarget(firstCast, targetNames)}'s`}{" "}
        mana at cast:{" "}
        {firstCast.manaPct === null
          ? "unknown"
          : `${Math.round(firstCast.manaPct)}%`}
        .
      </p>
      {laterCasts.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {laterCasts.map((cast) => (
            <li key={cast.timestampMs}>
              Also cast at{" "}
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
                {formatDuration(cast.timestampMs - fight.startTime)}
              </a>
              , {describeTarget(cast, targetNames)} (informational — only the
              first cast is judged).
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/InnervateAuditCard/index.test.tsx`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/InnervateAuditCard
git commit -m "feat(mana): add InnervateAuditCard"
```

---

### Task 3: Wire Innervate audit into `ManaEconomyContent`, the epic summary, and the App/Scorecard data-plumbing chain

**Files:**

- Modify: `src/app/components/ManaEconomyContent/index.tsx`
- Modify: `src/app/components/ManaEconomyContent/index.test.tsx`
- Modify: `src/metrics/epicSummary.ts`
- Modify: `src/metrics/epicSummary.test.ts`
- Modify: `src/app/components/Scorecard/useManaEconomySummary.ts`
- Modify: `src/app/components/Scorecard/useManaEconomySummary.test.ts`
- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes (from Task 1): `computeInnervateAudit`, `ActorClass`, `InnervateAuditResult`.
- Consumes (from Task 2): `InnervateAuditCard`, `InnervateAuditCardProps`.
- Produces: `ManaEconomyContentProps` gains `actorClasses: Map<number, ActorClass>` and `targetNames: Map<number, string>`. `summarizeManaEconomy` gains a 4th required param `innervateAudit: InnervateAuditResult`. `useManaEconomySummary` gains a new required param `actorClasses: Map<number, ActorClass>` (inserted after `resolvedAbilities`, before `fetchEvents`). `ScorecardProps` gains `actorClasses: Map<number, ActorClass>`. `App.tsx` builds and owns `actorClasses` state.

**Why this is one task, not three:** all of these files are directly coupled through prop/argument threading — `Scorecard/index.tsx` is the single call site for both `ManaEconomyContent` and `useManaEconomySummary`, and `App.tsx` is the single source of the `actorClasses` data both of them need. Because the pre-commit hook runs `tsc -b` across the whole project on every commit, none of these signature changes can be committed until every one of their call sites is updated in the same commit — there is exactly one commit at the end of this task, not one per file group. Work through the steps below in order — each is still independently useful for tracking progress via its own focused test — but do not run `git commit` until Step 21; earlier steps will leave the project-wide typecheck in a broken state, and that is expected.

- [ ] **Step 1: Update the `ManaEconomyContent` test to expect the new props and card**

In `src/app/components/ManaEconomyContent/index.test.tsx`, add the import and two new props to the existing `render(<ManaEconomyContent ... />)` call, and assert the new heading:

```ts
import type { ActorClass } from "../../../metrics/innervateAudit";
```

Change the render call to:

```tsx
render(
  <ManaEconomyContent
    accessToken="test-token"
    reportCode="4GYHZRdtL3bvhpc8"
    fight={fight}
    druidId={2}
    resolvedAbilities={RESOLVED_ABILITIES}
    actorClasses={new Map<number, ActorClass>()}
    targetNames={new Map()}
    fetchEvents={fetchEvents}
  />,
);

expect(
  screen.getByRole("heading", { name: "Mana curve & ending mana" }),
).toBeInTheDocument();
expect(
  screen.getByRole("heading", { name: "Consumable throughput" }),
).toBeInTheDocument();
expect(
  screen.getByRole("heading", { name: "Innervate audit" }),
).toBeInTheDocument();
expect(
  screen.getByRole("heading", { name: "HoT-aware overheal table" }),
).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: FAIL — TypeScript error (missing `actorClasses`/`targetNames` props) or missing "Innervate audit" heading.

- [ ] **Step 3: Update `ManaEconomyContent/index.tsx`**

Replace the contents of `src/app/components/ManaEconomyContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { ManaCurveCard } from "../ManaCurveCard";
import { ConsumableThroughputCard } from "../ConsumableThroughputCard";
import { InnervateAuditCard } from "../InnervateAuditCard";
import { OverhealTableCard } from "../OverhealTableCard";
import styles from "./index.module.css";

export interface ManaEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function ManaEconomyContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  targetNames,
  fetchEvents,
}: ManaEconomyContentProps) {
  return (
    <div className={styles.group}>
      <ManaCurveCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
      <ConsumableThroughputCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
      <InnervateAuditCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        actorClasses={actorClasses}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <OverhealTableCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ManaEconomyContent/index.test.tsx`
Expected: PASS. (Project-wide `npm run typecheck` will still show an error at `Scorecard/index.tsx`'s call to `ManaEconomyContent` at this point — expected, keep going, do not commit yet.)

- [ ] **Step 5: Update `epicSummary.ts`'s test to cover the new param**

In `src/metrics/epicSummary.test.ts`, add the import:

```ts
import type { InnervateAuditResult } from "./innervateAudit";
```

Add a shared neutral fixture right after `OVERHEAL_TABLE_GREEN` inside `describe("summarizeManaEconomy", ...)`:

```ts
const INNERVATE_NEUTRAL: InnervateAuditResult = {
  firstCast: null,
  laterCasts: [],
  judgement: null,
};
```

Add `INNERVATE_NEUTRAL` as a 4th argument to all four existing `summarizeManaEconomy(...)` calls in that `describe` block. There are four call sites; change each exactly as follows.

Call site 1 (in `"reports the mana curve's own judgement and ending mana stat when consumables are exempt"`), change:

```ts
    expect(
      summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES, OVERHEAL_TABLE_GREEN),
    ).toEqual({
```

to:

```ts
    expect(
      summarizeManaEconomy(
        manaCurve,
        EXEMPT_CONSUMABLES,
        OVERHEAL_TABLE_GREEN,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
```

Call site 2 (in `"reports a no-data stat and defaults to green when there are no samples"`), change:

```ts
    expect(
      summarizeManaEconomy(manaCurve, EXEMPT_CONSUMABLES, OVERHEAL_TABLE_GREEN),
    ).toEqual({
```

to:

```ts
    expect(
      summarizeManaEconomy(
        manaCurve,
        EXEMPT_CONSUMABLES,
        OVERHEAL_TABLE_GREEN,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
```

Call site 3 (in `"formats the potion/rune stat line and takes the worst-of judgement"`), change:

```ts
    expect(
      summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        OVERHEAL_TABLE_GREEN,
      ),
    ).toEqual({
```

to:

```ts
    expect(
      summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        OVERHEAL_TABLE_GREEN,
        INNERVATE_NEUTRAL,
      ),
    ).toEqual({
```

Call site 4 (in `"folds the overheal table's judgement into the worst-of without adding a stat line"`), change:

```ts
const result = summarizeManaEconomy(
  manaCurve,
  EXEMPT_CONSUMABLES,
  overhealTable,
);
```

to:

```ts
const result = summarizeManaEconomy(
  manaCurve,
  EXEMPT_CONSUMABLES,
  overhealTable,
  INNERVATE_NEUTRAL,
);
```

Then add one new test right after the existing `"folds the overheal table's judgement..."` test, before the closing `});` of the `describe("summarizeManaEconomy", ...)` block:

```ts
it("folds the innervate audit's judgement into the worst-of without adding a stat line", () => {
  const manaCurve: ManaCurveResult = {
    points: [{ timestampMs: 1000, pct: 20 }],
    endingPct: 20,
    judgement: "green",
  };
  const innervateAudit: InnervateAuditResult = {
    firstCast: null,
    laterCasts: [],
    judgement: "red",
  };
  const result = summarizeManaEconomy(
    manaCurve,
    EXEMPT_CONSUMABLES,
    OVERHEAL_TABLE_GREEN,
    innervateAudit,
  );
  expect(result.judgement).toBe("red");
  expect(result.stats).toEqual([
    "Ending mana: 20%",
    "Consumables: not mana-constrained",
  ]);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — TypeScript arity error on `summarizeManaEconomy` calls (missing 4th argument) once Step 7 hasn't happened yet; if TS doesn't block the test runner, the new test fails with a wrong judgement instead. Either way, confirms the current signature doesn't yet account for Innervate.

- [ ] **Step 7: Update `epicSummary.ts`**

In `src/metrics/epicSummary.ts`, add the import near the other `metrics/*Result` type imports:

```ts
import type { InnervateAuditResult } from "./innervateAudit";
```

Change `summarizeManaEconomy` to:

```ts
export function summarizeManaEconomy(
  manaCurve: ManaCurveResult,
  consumableThroughput: ConsumableThroughputResult,
  overhealTable: OverhealTableResult,
  innervateAudit: InnervateAuditResult,
): EpicSummary {
  const consumablesStat = consumableThroughput.exempt
    ? "Consumables: not mana-constrained"
    : consumableThroughput.rows
        .map(
          (row) =>
            `${row.label === "Mana Potion" ? "Potions" : "Runes"}: ${row.used}/${row.expectedFloor}`,
        )
        .join(", ");

  return {
    // overhealTable's and innervateAudit's judgements both join the worst-of
    // calc (per docs/backlog.md stories 404 and 403) but neither gets its own
    // stat line — story 701 caps a dashboard widget at 1-2 stats, same
    // precedent as Downranking Discipline joining Spell Discipline's worst-of
    // silently.
    judgement: worstJudgement([
      manaCurve.judgement,
      consumableThroughput.judgement,
      overhealTable.judgement,
      innervateAudit.judgement,
    ]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
      consumablesStat,
    ],
  };
}
```

- [ ] **Step 8: Run `epicSummary.test.ts` to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS.

- [ ] **Step 9: Update `useManaEconomySummary.test.ts`**

In `src/app/components/Scorecard/useManaEconomySummary.test.ts`, insert `new Map(),` as a new `actorClasses` argument in each of the three `renderHook(() => useManaEconomySummary(...))` calls, immediately after the existing 5th argument and before the `fetchEvents`-producing argument.

Call site 1 (in `"starts loading, then reports the worst-of judgement and both stat lines"`), change:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Map(),
    makeFetchEvents(castEvents, []),
  ),
);
```

to:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Map(),
    new Map(),
    makeFetchEvents(castEvents, []),
  ),
);
```

Call site 2 (in `"folds a red overheal-table judgement into the worst-of"`), change:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    resolvedAbilities,
    makeFetchEvents(castEvents, healingEvents),
  ),
);
```

to:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    resolvedAbilities,
    new Map(),
    makeFetchEvents(castEvents, healingEvents),
  ),
);
```

Call site 3 (in `"reports an error status when the fetch rejects"`), change:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Map(),
    fetchEvents,
  ),
);
```

to:

```ts
const { result } = renderHook(() =>
  useManaEconomySummary(
    "test-token",
    "4GYHZRdtL3bvhpc8",
    fight,
    2,
    new Map(),
    new Map(),
    fetchEvents,
  ),
);
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: FAIL — TypeScript arity error (`useManaEconomySummary` doesn't accept this many arguments yet).

- [ ] **Step 11: Update `useManaEconomySummary.ts`**

Replace `src/app/components/Scorecard/useManaEconomySummary.ts`'s contents:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { computeManaCurve } from "../../../metrics/manaCurve";
import { computeConsumableThroughput } from "../../../metrics/consumableThroughput";
import { computeOverhealTable } from "../../../metrics/overhealTable";
import {
  computeInnervateAudit,
  type ActorClass,
} from "../../../metrics/innervateAudit";
import { summarizeManaEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useManaEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([castEvents, healingEvents]) => {
        const manaCurve = computeManaCurve(
          castEvents,
          druidId,
          fight.kill === true,
          fight.endTime - fight.startTime,
        );
        const consumableThroughput = computeConsumableThroughput(
          castEvents,
          druidId,
          resolvedAbilities,
          fight.endTime - fight.startTime,
        );
        const overhealTable = computeOverhealTable(
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        const innervateAudit = computeInnervateAudit(
          castEvents,
          druidId,
          resolvedAbilities,
          actorClasses,
          fight.endTime - fight.startTime,
          fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeManaEconomy(
              manaCurve,
              consumableThroughput,
              overhealTable,
              innervateAudit,
            ),
          },
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
                : "Failed to summarize mana economy.",
          },
        }),
      );
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
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useManaEconomySummary.test.ts`
Expected: PASS. (Project-wide typecheck still has an error at `Scorecard/index.tsx`'s call to `useManaEconomySummary(...)` at this point — expected, keep going, do not commit yet.)

- [ ] **Step 13: Update `Scorecard/index.test.tsx` to pass the new `actorClasses` prop**

In `src/app/components/Scorecard/index.test.tsx`, add `actorClasses={new Map()}` immediately after each existing `targetNames={new Map()}` line (there are two `render(...)` call sites, at what are currently lines 42 and 124).

- [ ] **Step 14: Run the test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — TypeScript error, `Scorecard` doesn't accept `actorClasses` yet.

- [ ] **Step 15: Update `Scorecard/index.tsx`**

Add the import near the other type imports:

```ts
import type { ActorClass } from "../../../metrics/innervateAudit";
```

Add to `ScorecardProps` (immediately after `targetNames: Map<number, string>;`):

```ts
actorClasses: Map<number, ActorClass>;
```

Add `actorClasses` to the destructured props list (immediately after `targetNames,`).

Update the `useManaEconomySummary(...)` call (the one passing `accessToken, reportCode, fight, druidId, resolvedAbilities, fetchEvents`) to insert `actorClasses` before `fetchEvents`:

```ts
const manaSummary = useManaEconomySummary(
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
);
```

Update the `<ManaEconomyContent ... />` JSX block to add both new props (it currently passes `accessToken, reportCode, fight, druidId, resolvedAbilities, fetchEvents`):

```tsx
<ManaEconomyContent
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  resolvedAbilities={resolvedAbilities}
  actorClasses={actorClasses}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 16: Run the test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS.

- [ ] **Step 17: Update `App.tsx`**

Add the import near the other type imports:

```ts
import type { ActorClass } from "./metrics/innervateAudit";
```

Add new state right after the existing `actorNames` state declaration:

```ts
const [actorClasses, setActorClasses] = useState<Map<number, ActorClass>>(
  new Map(),
);
```

In `resetReportState()`, add a reset call right after `setActorNames(new Map());`:

```ts
setActorClasses(new Map());
```

Change `handleEntriesLoaded` to build both maps:

```ts
const handleEntriesLoaded = useCallback((entries: CastTableEntry[]) => {
  setActorNames(new Map(entries.map((e) => [e.id, e.name])));
  setActorClasses(
    new Map(entries.map((e) => [e.id, { class: e.type, specIcon: e.icon }])),
  );
}, []);
```

Add `actorClasses={actorClasses}` to the `<Scorecard ... />` JSX block, immediately after the existing `targetNames={actorNames}` line.

- [ ] **Step 18: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions in `App.test.tsx` or elsewhere.

- [ ] **Step 19: Typecheck, lint, and format check — the whole chain should now be clean**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors anywhere in the project. This is the first point in this task where the full project is expected to be clean — if there's still an error, find and fix the remaining stale call site before continuing. If Prettier flags formatting, run `npm run format` and re-check.

- [ ] **Step 20: Manual verification**

Run: `npm run dev`, open the app, load a real report (e.g. `4GYHZRdtL3bvhpc8` from `docs/testing.md`'s known-reports table), select the druid, open the Mana economy epic detail, and confirm the "Innervate audit" card renders without errors (whatever its actual judgement is for that report/fight).

- [ ] **Step 21: Commit**

```bash
git add src/app/components/ManaEconomyContent src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts \
  src/app/components/Scorecard/useManaEconomySummary.ts src/app/components/Scorecard/useManaEconomySummary.test.ts \
  src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx src/App.tsx
git commit -m "feat(mana): wire Innervate audit into mana economy widget"
```

---

### Task 4: Retire story 403's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/innervate-audit-design.md`
- Delete: `docs/plans/innervate-audit-plan.md` (this file)

- [ ] **Step 1: Check for dangling references**

Run: `grep -rn "innervate-audit-design\|innervate-audit-plan" docs/ src/ CLAUDE.md`
Expected: only this plan file and the design spec itself reference their own paths. If anything else references them, resolve that reference first before deleting.

- [ ] **Step 2: Mark story 403 done in `docs/backlog.md`**

Change the heading:

```md
### 403 — Innervate audit
```

to:

```md
### 403 — Innervate audit ✅ Done
```

- [ ] **Step 3: Update `CLAUDE.md`'s repo-state paragraph**

In `CLAUDE.md`'s "Repo state" section, find the sentence:

```
Epic E (mana economy) has stories 401 (mana curve & ending mana), 402 (consumable throughput), and 404 (HoT-aware overheal table) done, implemented ahead of 403 (Innervate audit) — the maintainer isn't yet convinced 403's premise (auditing the druid's own Innervate usage) is the right shape, since Innervate is often assigned to a mana-starved caster rather than kept by the druid; story 403 remains open pending that decision.
```

Replace it with:

```
Epic E (mana economy) has stories 401 (mana curve & ending mana), 402 (consumable throughput), 403 (Innervate audit), and 404 (HoT-aware overheal table) done — 403 rewards handing Innervate to a mana-using ally rather than assuming self-cast is the goal, since druids have strong natural mana regen from Spirit; see docs/backlog.md story 403 for the full R/O/G shape.
```

- [ ] **Step 4: Delete the retired spec and plan files**

```bash
git rm docs/specs/innervate-audit-design.md docs/plans/innervate-audit-plan.md
```

- [ ] **Step 5: Run full verification one more time**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 403 done, retire its design spec and plan"
```
