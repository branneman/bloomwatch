# Near-death response audit (story 1001, Epic J) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new "Crisis response" epic (backlog story 1001): detect raid-wide near-death moments (a target's HP dropping to ≤15% and surviving) and judge whether the druid landed a reactive heal in the response window, reusing story 501's readiness machinery for the unspent-resource tally.

**Architecture:** One new pure metrics module (`src/metrics/nearDeathResponse.ts`) computing crisis episodes from a per-target merged HP timeline (`DamageTaken` + `Healing` events, with `Deaths` events merged in as terminal markers — not timestamp-proximity guessed). A new `CrisisCard` UI leaf, a `NearDeathResponseCard` fetch+compute+render component (mirrors `DeathForensicsCard`), a `NearDeathResponseContent` wrapper, and a `useNearDeathResponseSummary` hook — wired into `Scorecard`, `ReportDashboard`, and the URL-hash router the same generic way every other epic already is.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library — matches the rest of this repo, no new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded — resolved from `masterData.abilities` at runtime via `src/abilities/resolveAbilities.ts`.
- Every R/O/G threshold must be documented with a comment pointing at its rationale in `docs/backlog.md` (story 1001) — `CRISIS_THRESHOLD_PCT = 15` is explicitly provisional, flagged for a future calibration story.
- No backend, no server-side code — all computation is a pure function running client-side, consistent with every other `compute*` module in `src/metrics/`.
- `docs/testing.md`'s Tier 1 (co-located `*.test.ts`, Vitest) and Tier 3 (co-located `*.test.tsx`, React Testing Library) conventions apply; no new test tier needed.
- Follow Conventional Commits (`type(scope): summary`) for every commit in this plan; scope is `crisis-response` unless a step touches an unrelated shared file, in which case use that file's own established scope (e.g. `wcl-client`).
- `npm run typecheck`, `npm run lint`, `npm run format:check` run full-project via the pre-commit hook — never bypass it.

---

### Task 1: Add `DamageTaken` to the WCL event data-type union

**Files:**

- Modify: `src/wcl/events.ts:3-4`

**Interfaces:**

- Produces: `WclEventDataType` now includes `"DamageTaken"`, consumed by every later task that calls `fetchEvents(..., "DamageTaken", true)`.

No fetch-layer logic needs to change — `fetchEventsPage`/`fetchAllPages` (`src/wcl/events.ts`, `src/wcl/eventCache.ts`) already interpolate `dataType` generically into the GraphQL query string. This was confirmed live during this story's design: `DamageTaken` with `includeResources: true` returns real `hitPoints`/`maxHitPoints` percentages (report `4GYHZRdtL3bvhpc8`, fight 6 — see the `docs/testing.md` update in Task 14).

- [ ] **Step 1: Widen the type**

Edit `src/wcl/events.ts`:

```ts
export type WclEventDataType =
  | "Casts"
  | "Buffs"
  | "Healing"
  | "Resources"
  | "Deaths"
  | "CombatantInfo"
  | "DamageTaken";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors (this is a pure type-union widening, no call sites break).

- [ ] **Step 3: Commit**

```bash
git add src/wcl/events.ts
git commit -m "feat(wcl-client): add DamageTaken to the fetchable event data types"
```

---

### Task 2: Add a `DamageTaken` event test factory

**Files:**

- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Produces: `aDamageEvent(overrides?: Partial<WclEvent>): WclEvent`, used by every later test in this plan that needs a synthetic `DamageTaken` event.

- [ ] **Step 1: Add the factory**

Add to `src/testUtils/factories.ts`, right after the existing `aHealEvent` function (after line 159):

```ts
export function aDamageEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1926345,
    type: "damage",
    sourceID: 72,
    targetID: 42,
    abilityGameID: 1,
    fight: 6,
    amount: 1110,
    hitPoints: 50,
    maxHitPoints: 100,
    ...overrides,
  };
}
```

Field shapes taken directly from the live capture during this story's design (report `4GYHZRdtL3bvhpc8`, fight 6, target 37's real death sequence — see `docs/testing.md`'s Task 14 update).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/testUtils/factories.ts
git commit -m "test(crisis-response): add aDamageEvent factory"
```

---

### Task 3: Export shared readiness/idle helpers from `deathForensics.ts`

**Files:**

- Modify: `src/metrics/deathForensics.ts:39-65` (add `export` to three existing functions, no behavior change)

**Interfaces:**

- Produces: `export function judgeDeathReadiness(unspentCount: number): Judgement`, `export function isReady(sortedCasts: WclEvent[], atTimestamp: number, cooldownMs: number): boolean`, `export function wasIdlePreceding(castIntervals: CastInterval[], atTimestamp: number, fightStart: number): boolean` — consumed by Task 5's `computeNearDeathResponse`.

Story 1001 reuses story 501's exact R/O/G scale (0/1/≥2 unspent resources → green/orange/red) and its exact Swiftmend-ready/NS-ready/idle-preceding checks — these three functions are currently module-private in `deathForensics.ts`. Exporting them (no logic change) keeps the threshold defined in exactly one place rather than duplicating it, per this repo's DRY convention. `wasIdlePreceding`'s second parameter is renamed from `deathTimestamp` to `atTimestamp` since it's no longer death-specific — a pure rename, not a behavior change.

- [ ] **Step 1: Export the three helpers and generalize the parameter name**

In `src/metrics/deathForensics.ts`, change:

```ts
function isReady(
  sortedCasts: WclEvent[],
  deathTimestamp: number,
  cooldownMs: number,
): boolean {
  const last = lastCastBefore(sortedCasts, deathTimestamp);
  if (last === undefined) return true;
  return deathTimestamp - last.timestamp >= cooldownMs;
}
```

to:

```ts
export function isReady(
  sortedCasts: WclEvent[],
  atTimestamp: number,
  cooldownMs: number,
): boolean {
  const last = lastCastBefore(sortedCasts, atTimestamp);
  if (last === undefined) return true;
  return atTimestamp - last.timestamp >= cooldownMs;
}
```

and:

```ts
function wasIdlePreceding(
  castIntervals: CastInterval[],
  deathTimestamp: number,
  fightStart: number,
): boolean {
  let lastIntervalBefore: CastInterval | undefined;
  for (const interval of castIntervals) {
    if (interval.start > deathTimestamp) break;
    lastIntervalBefore = interval;
  }
  if (lastIntervalBefore === undefined) {
    return deathTimestamp - fightStart >= DEATH_IDLE_WINDOW_MS;
  }
  if (lastIntervalBefore.end > deathTimestamp) return false;
  return deathTimestamp - lastIntervalBefore.end >= DEATH_IDLE_WINDOW_MS;
}
```

to:

```ts
export function wasIdlePreceding(
  castIntervals: CastInterval[],
  atTimestamp: number,
  fightStart: number,
): boolean {
  let lastIntervalBefore: CastInterval | undefined;
  for (const interval of castIntervals) {
    if (interval.start > atTimestamp) break;
    lastIntervalBefore = interval;
  }
  if (lastIntervalBefore === undefined) {
    return atTimestamp - fightStart >= DEATH_IDLE_WINDOW_MS;
  }
  if (lastIntervalBefore.end > atTimestamp) return false;
  return atTimestamp - lastIntervalBefore.end >= DEATH_IDLE_WINDOW_MS;
}
```

and:

```ts
function judgeDeathReadiness(unspentCount: number): Judgement {
```

to:

```ts
export function judgeDeathReadiness(unspentCount: number): Judgement {
```

(Leave every call site inside `deathForensics.ts` itself unchanged — they still call these functions by their same local names; only the export visibility and one parameter name changed.)

- [ ] **Step 2: Run the existing test suite to confirm no regression**

Run: `npx vitest run src/metrics/deathForensics.test.ts`
Expected: all existing tests still pass unchanged (pure rename + export, no behavior change).

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/metrics/deathForensics.ts
git commit -m "refactor(death-forensics): export readiness/idle helpers for reuse by story 1001"
```

---

### Task 4: `computeNearDeathResponse` — crisis detection and judgement (TDD)

**Files:**

- Create: `src/metrics/nearDeathResponse.ts`
- Test: `src/metrics/nearDeathResponse.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`), `Judgement`/`worstJudgement` (`src/metrics/judgement.ts`), `reconstructLifebloomTimelines`/`deriveLifebloomTargetState` (`src/metrics/lifebloomStacks.ts`), `MAINTAINED_MIN_UPTIME_PCT` (`src/metrics/lb3Uptime.ts`), `SWIFTMEND_COOLDOWN_MS` (`src/metrics/swiftmendAudit.ts`), `NATURES_SWIFTNESS_COOLDOWN_MS` (`src/metrics/naturesSwiftnessAudit.ts`), `isReady`/`wasIdlePreceding`/`judgeDeathReadiness` (`src/metrics/deathForensics.ts`, exported in Task 3), `computeCastIntervals` (`src/metrics/castIntervals.ts`), `resolveSpellAbilityIds`/`ResolvedAbility`/`DruidHealingSpell` (`src/abilities/resolveAbilities.ts`).
- Produces: `CRISIS_THRESHOLD_PCT: number`, `getHealingAbilityIds(resolvedAbilities: Map<number, ResolvedAbility>): Set<number>`, `CrisisEvent` interface, `NearDeathResponseResult` interface, `computeNearDeathResponse(...): NearDeathResponseResult` — consumed by Task 6 (`NearDeathResponseCard`) and Task 8 (`useNearDeathResponseSummary`).

This is the core logic task. Write the full test file first (TDD), watch it fail, then implement.

- [ ] **Step 1: Write the failing test file**

Create `src/metrics/nearDeathResponse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeNearDeathResponse,
  getHealingAbilityIds,
} from "./nearDeathResponse";
import {
  aDamageEvent,
  aHealEvent,
  aDeathEvent,
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const SWIFTMEND_IDS = new Set([18562]);
const NS_IDS = new Set([17116]);
const LB_IDS = new Set([33763]);
const HEALING_TOUCH_ID = 26979;
const HEALING_IDS = new Set([33763, 774, 8936, HEALING_TOUCH_ID, 18562, 740]);

describe("computeNearDeathResponse", () => {
  it("judges green when the druid lands a reactive heal inside the crisis window", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 12 }),
    ];
    const healingEvents = [
      aHealEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 10500,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: HEALING_TOUCH_ID,
      }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      healingEvents,
      [],
      castEvents,
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
    expect(result.crises[0]).toMatchObject({
      timestampMs: 10000,
      targetId: 50,
      hitPointsPct: 12,
      judged: true,
      responded: true,
      judgement: "green",
    });
    expect(result.judgement).toBe("green");
  });

  it("judges by the unspent-resource tally when nobody responded, on a target with no clear tank assignment", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 12000, targetID: 50, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].responded).toBe(false);
    expect(result.crises[0].judged).toBe(true);
    expect(result.crises[0].unspentCount).toBe(3);
    expect(result.crises[0].judgement).toBe("red");
  });

  it("closes the crisis window on recovery, not on every subsequent low reading", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 8 }),
      aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 60 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
  });

  it("excludes an episode that ends in death rather than recovery", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 0 }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 10525, targetID: 50 })];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      deathEvents,
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(0);
  });

  it("does not misread a battle-rez gap as one long survived crisis (live-validated shape: death, then a much-later healthy reading)", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 0 }),
      // Post-rez, ~90s later, a fresh healthy reading — must not be treated
      // as "the same crisis recovering".
      aDamageEvent({ timestamp: 100000, targetID: 50, hitPoints: 81 }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 10525, targetID: 50 })];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      deathEvents,
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      200000,
    );

    expect(result.crises).toHaveLength(0);
  });

  it("still reports a survived crisis left unresolved when the fight ends before recovery", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 50, hitPoints: 5 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
    expect(result.crises[0].timestampMs).toBe(90000);
  });

  it("judges a crisis on a maintained target even when the druid has a clear tank assignment", () => {
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
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 50, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].maintained).toBe(true);
    expect(result.crises[0].judged).toBe(true);
  });

  it("shows a crisis on a non-maintained target as context only (not judged) when the druid has a clear 1-2 target tank assignment", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 60,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 60,
        abilityGameID: 33763,
      }),
    ];
    // targetID 999 is never maintained -> the druid has exactly one
    // maintained target (60) elsewhere, a clear tank assignment.
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].maintained).toBe(false);
    expect(result.crises[0].judged).toBe(false);
    expect(result.crises[0].judgement).toBeNull();
    expect(result.flaggedCount).toBe(0);
  });

  it("judges a crisis on any raider when the druid has no clear tank assignment (0 maintained targets)", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].judged).toBe(true);
  });

  it("does not count a HoT tick that was already rolling before the crisis as a response", () => {
    // A Lifebloom cast lands well before the crisis opens -> ticks during
    // the window are Healing events, not new Casts events, so they're
    // invisible to the responded check (which only looks at castEvents).
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 10500,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: 33763,
        tick: true,
      }),
    ];
    const castEvents = [
      // The cast that opened this HoT happened long before the crisis.
      aCastEvent({
        timestamp: 1000,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      healingEvents,
      [],
      castEvents,
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].responded).toBe(false);
  });

  it("resolves to a green judgement with no crises when there are none", () => {
    const result = computeNearDeathResponse(
      [],
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result).toEqual({ crises: [], flaggedCount: 0, judgement: "green" });
  });
});

describe("getHealingAbilityIds", () => {
  it("unions every tracked healing spell's ability ids, excluding Nature's Swiftness and Innervate", () => {
    const resolved = new Map<number, ResolvedAbility>([
      [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
      [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
      [29166, { kind: "spell", spell: "Innervate", rank: 1 }],
      [26979, { kind: "spell", spell: "Healing Touch", rank: 13 }],
    ]);

    const ids = getHealingAbilityIds(resolved);

    expect(ids.has(33763)).toBe(true);
    expect(ids.has(26979)).toBe(true);
    expect(ids.has(17116)).toBe(false);
    expect(ids.has(29166)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/metrics/nearDeathResponse.test.ts`
Expected: FAIL — `Cannot find module './nearDeathResponse'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `src/metrics/nearDeathResponse.ts`**

```ts
import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { worstJudgement } from "./judgement";
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
} from "./lifebloomStacks";
import { MAINTAINED_MIN_UPTIME_PCT } from "./lb3Uptime";
import { SWIFTMEND_COOLDOWN_MS } from "./swiftmendAudit";
import { NATURES_SWIFTNESS_COOLDOWN_MS } from "./naturesSwiftnessAudit";
import {
  isReady,
  wasIdlePreceding,
  judgeDeathReadiness,
} from "./deathForensics";
import { computeCastIntervals } from "./castIntervals";
import {
  resolveSpellAbilityIds,
  type ResolvedAbility,
  type DruidHealingSpell,
} from "../abilities/resolveAbilities";

// Backlog story 1001: a raider's HP dropping to or below this percentage
// (WCL's own `hitPoints` field on DamageTaken/Healing events, already a real
// 0-100 percentage when fetched with includeResources: true — confirmed live
// against report 4GYHZRdtL3bvhpc8, fight 6, see docs/testing.md) counts as a
// crisis. Provisional: not yet calibrated against real exemplar data, same
// as several metrics before their own Epic I calibration pass (see 909-913).
export const CRISIS_THRESHOLD_PCT = 15;

// Spells that count as "the druid responded" — excludes Nature's Swiftness
// (a cast-time modifier, not a heal itself; its follow-up cast is what
// actually lands and is already a tracked healing spell) and Innervate (mana,
// not healing). Tranquility is included for completeness, though as a
// raid-wide channel its per-target Casts targetID may not reliably match a
// specific crisis target — a known, documented limitation, not a bug to fix
// here (Tranquility is a rare panic cooldown, not the common case).
const HEALING_SPELLS_FOR_RESPONSE: DruidHealingSpell[] = [
  "Lifebloom",
  "Rejuvenation",
  "Regrowth",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
];

export function getHealingAbilityIds(
  resolvedAbilities: Map<number, ResolvedAbility>,
): Set<number> {
  const ids = new Set<number>();
  for (const spell of HEALING_SPELLS_FOR_RESPONSE) {
    for (const id of resolveSpellAbilityIds(resolvedAbilities, spell)) {
      ids.add(id);
    }
  }
  return ids;
}

interface HpReading {
  kind: "reading";
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
}
interface DeathMarker {
  kind: "death";
  timestampMs: number;
  targetId: number;
}
type TimelineEntry = HpReading | DeathMarker;

// Merges DamageTaken + Healing readings with Deaths markers into one
// per-target, timestamp-sorted timeline. Deaths are modeled as explicit
// markers (not inferred from timestamp proximity to a damage event) because
// a battle-rez can leave a long gap between a death and that target's next
// real HP reading — live-validated against report 4GYHZRdtL3bvhpc8, fight 6,
// target 37 (dies twice in one fight): the fatal hit reads hitPoints: 0, the
// Deaths event fires ~25-59ms later, and the next real DamageTaken reading
// for that target (a healthy 81%, post-rez) doesn't appear until ~90s
// afterward. A rule that closed the crisis on "next reading above threshold"
// alone would misread that whole 90s gap as one long survived crisis.
function buildHpTimelines(
  damageEvents: WclEvent[],
  healingEvents: WclEvent[],
  deathEvents: WclEvent[],
): Map<number, TimelineEntry[]> {
  const byTarget = new Map<number, TimelineEntry[]>();

  function push(entry: TimelineEntry): void {
    let list = byTarget.get(entry.targetId);
    if (!list) {
      list = [];
      byTarget.set(entry.targetId, list);
    }
    list.push(entry);
  }

  for (const event of damageEvents) {
    if (event.type !== "damage") continue;
    if (event.targetID === undefined) continue;
    if (typeof event.hitPoints !== "number") continue;
    push({
      kind: "reading",
      timestampMs: event.timestamp,
      targetId: event.targetID,
      hitPointsPct: event.hitPoints,
    });
  }
  for (const event of healingEvents) {
    if (event.type !== "heal") continue;
    if (event.targetID === undefined) continue;
    if (typeof event.hitPoints !== "number") continue;
    push({
      kind: "reading",
      timestampMs: event.timestamp,
      targetId: event.targetID,
      hitPointsPct: event.hitPoints,
    });
  }
  for (const event of deathEvents) {
    if (event.type !== "death") continue;
    if (event.targetID === undefined) continue;
    push({
      kind: "death",
      timestampMs: event.timestamp,
      targetId: event.targetID,
    });
  }

  for (const list of byTarget.values()) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }
  return byTarget;
}

interface CrisisEpisode {
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
  windowEndMs: number;
}

// Walks each target's merged timeline, opening a crisis on a <=threshold
// reading and closing it either on a death (excluded — story 501's
// territory) or on a later >threshold reading (survived). A crisis still
// open when the timeline runs out is a survived crisis unresolved by the
// fight's end (e.g. an execute-phase near-miss).
function findCrisisEpisodes(
  timelinesByTarget: Map<number, TimelineEntry[]>,
  fightEnd: number,
): CrisisEpisode[] {
  const episodes: CrisisEpisode[] = [];

  for (const [targetId, timeline] of timelinesByTarget) {
    let crisisStart: HpReading | null = null;

    for (const entry of timeline) {
      if (crisisStart === null) {
        if (
          entry.kind === "reading" &&
          entry.hitPointsPct <= CRISIS_THRESHOLD_PCT
        ) {
          crisisStart = entry;
        }
        continue;
      }

      if (entry.kind === "death") {
        crisisStart = null;
        continue;
      }

      if (entry.hitPointsPct > CRISIS_THRESHOLD_PCT) {
        episodes.push({
          timestampMs: crisisStart.timestampMs,
          targetId,
          hitPointsPct: crisisStart.hitPointsPct,
          windowEndMs: entry.timestampMs,
        });
        crisisStart = null;
      }
    }

    if (crisisStart !== null) {
      episodes.push({
        timestampMs: crisisStart.timestampMs,
        targetId,
        hitPointsPct: crisisStart.hitPointsPct,
        windowEndMs: fightEnd,
      });
    }
  }

  episodes.sort((a, b) => a.timestampMs - b.timestampMs);
  return episodes;
}

export interface CrisisEvent {
  timestampMs: number;
  targetId: number;
  hitPointsPct: number;
  maintained: boolean;
  judged: boolean;
  responded: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  unspentCount: number;
  judgement: Judgement | null;
}

export interface NearDeathResponseResult {
  crises: CrisisEvent[];
  flaggedCount: number;
  judgement: Judgement;
}

export function computeNearDeathResponse(
  damageEvents: WclEvent[],
  healingEvents: WclEvent[],
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  healingAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
  fightStart: number,
  fightEnd: number,
): NearDeathResponseResult {
  const timelinesByTarget = buildHpTimelines(
    damageEvents,
    healingEvents,
    deathEvents,
  );
  const episodes = findCrisisEpisodes(timelinesByTarget, fightEnd);

  // Scope/exemption: "maintained targets" is exactly story 201/501's
  // definition. A clear tank assignment (1-2 maintained targets) exempts
  // crises on other raiders from judgement — they're shown as context only.
  const lifebloomTimelines = reconstructLifebloomTimelines(
    buffEvents,
    druidId,
    lifebloomAbilityIds,
  );
  const fightDurationMs = fightEnd - fightStart;
  const maintainedTargetIds = new Set<number>();
  for (const [targetId, timeline] of lifebloomTimelines) {
    const state = deriveLifebloomTargetState(timeline, fightStart, fightEnd);
    if (
      (state.totalAnyStackMs / fightDurationMs) * 100 >=
      MAINTAINED_MIN_UPTIME_PCT
    ) {
      maintainedTargetIds.add(targetId);
    }
  }
  const hasClearAssignment =
    maintainedTargetIds.size >= 1 && maintainedTargetIds.size <= 2;

  const druidCasts = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const swiftmendCasts = druidCasts.filter((event) =>
    swiftmendAbilityIds.has(event.abilityGameID as number),
  );
  const nsCasts = druidCasts.filter((event) =>
    naturesSwiftnessAbilityIds.has(event.abilityGameID as number),
  );
  const castIntervals = computeCastIntervals(castEvents, druidId);

  const crises: CrisisEvent[] = episodes.map((episode) => {
    const maintained = maintainedTargetIds.has(episode.targetId);
    const judged = maintained || !hasClearAssignment;

    const responded = druidCasts.some(
      (cast) =>
        cast.targetID === episode.targetId &&
        healingAbilityIds.has(cast.abilityGameID as number) &&
        cast.timestamp >= episode.timestampMs &&
        cast.timestamp <= episode.windowEndMs,
    );

    const swiftmendReady =
      hasSwiftmend &&
      isReady(swiftmendCasts, episode.timestampMs, SWIFTMEND_COOLDOWN_MS);
    const nsReady =
      hasNaturesSwiftness &&
      isReady(nsCasts, episode.timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
    const idlePreceding = wasIdlePreceding(
      castIntervals,
      episode.timestampMs,
      fightStart,
    );
    const unspentCount = [swiftmendReady, nsReady, idlePreceding].filter(
      Boolean,
    ).length;

    const judgement = !judged
      ? null
      : responded
        ? "green"
        : judgeDeathReadiness(unspentCount);

    return {
      timestampMs: episode.timestampMs,
      targetId: episode.targetId,
      hitPointsPct: episode.hitPointsPct,
      maintained,
      judged,
      responded,
      swiftmendReady,
      nsReady,
      idlePreceding,
      unspentCount,
      judgement,
    };
  });

  return {
    crises,
    flaggedCount: crises.filter((c) => c.judgement === "red").length,
    judgement: worstJudgement(crises.map((c) => c.judgement)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/metrics/nearDeathResponse.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/metrics/nearDeathResponse.ts src/metrics/nearDeathResponse.test.ts
git commit -m "feat(crisis-response): compute near-death crisis detection and readiness judgement"
```

---

### Task 5: `summarizeNearDeathResponse` in `epicSummary.ts`

**Files:**

- Modify: `src/metrics/epicSummary.ts` (add one new function + one new import)
- Modify: `src/metrics/epicSummary.test.ts` (add matching test block)

**Interfaces:**

- Consumes: `NearDeathResponseResult` (Task 4).
- Produces: `summarizeNearDeathResponse(result: NearDeathResponseResult): EpicSummary`, consumed by Task 7 (`useNearDeathResponseSummary`).

- [ ] **Step 1: Write the failing test**

Add to `src/metrics/epicSummary.test.ts`, alongside the existing `summarizeDeathForensics` import and describe block:

```ts
import { summarizeNearDeathResponse } from "./epicSummary";
import type { NearDeathResponseResult } from "./nearDeathResponse";
```

```ts
describe("summarizeNearDeathResponse", () => {
  it("reports the crises/flagged stat lines and the rollup judgement", () => {
    const nearDeathResponse: NearDeathResponseResult = {
      crises: [
        {
          timestampMs: 90000,
          targetId: 50,
          hitPointsPct: 10,
          maintained: true,
          judged: true,
          responded: false,
          swiftmendReady: true,
          nsReady: true,
          idlePreceding: true,
          unspentCount: 3,
          judgement: "red",
        },
      ],
      flaggedCount: 1,
      judgement: "red",
    };

    expect(summarizeNearDeathResponse(nearDeathResponse)).toEqual({
      judgement: "red",
      stats: ["Crises: 1", "Flagged: 1"],
    });
  });

  it("reports 'No crises' when there are none", () => {
    const nearDeathResponse: NearDeathResponseResult = {
      crises: [],
      flaggedCount: 0,
      judgement: "green",
    };

    expect(summarizeNearDeathResponse(nearDeathResponse)).toEqual({
      judgement: "green",
      stats: ["No crises"],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — `summarizeNearDeathResponse` is not exported.

- [ ] **Step 3: Implement**

In `src/metrics/epicSummary.ts`, add the import near the other `Result` type imports:

```ts
import type { NearDeathResponseResult } from "./nearDeathResponse";
```

and add the function, mirroring `summarizeDeathForensics` exactly:

```ts
export function summarizeNearDeathResponse(
  nearDeathResponse: NearDeathResponseResult,
): EpicSummary {
  const { crises, flaggedCount, judgement } = nearDeathResponse;
  return {
    judgement,
    stats:
      crises.length === 0
        ? ["No crises"]
        : [`Crises: ${crises.length}`, `Flagged: ${flaggedCount}`],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts
git commit -m "feat(crisis-response): summarize near-death response for the widget grid"
```

---

### Task 6: `CrisisCard` UI leaf component

**Files:**

- Create: `src/app/components/ui/CrisisCard/index.tsx`
- Create: `src/app/components/ui/CrisisCard/index.module.css`
- Test: `src/app/components/ui/CrisisCard/index.test.tsx`

**Interfaces:**

- Consumes: `Judgement` (`src/metrics/judgement.ts`), `JudgementChip` (`src/app/components/ui/JudgementChip`).
- Produces: `CrisisCardProps`, `CrisisCard(props: CrisisCardProps): JSX.Element`, consumed by Task 7 (`NearDeathResponseCard`).

Mirrors `DeathCard`'s structure/props exactly, swapping "LB3 rolling on target"/"idle preceding" rows for this metric's own fields and adding a "context only" badge for unjudged crises (per the scope-exemption rule).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ui/CrisisCard/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrisisCard } from "./index";

describe("CrisisCard", () => {
  it("shows a judgement chip and the resource rows when judged and not responded", () => {
    render(
      <CrisisCard
        target="Offtank"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={false}
        swiftmendReady={true}
        nsReady={false}
        idlePreceding={true}
        judgement="orange"
      />,
    );

    expect(screen.getByText("Offtank")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("On cooldown")).toBeInTheDocument();
  });

  it("shows 'Context only' instead of a judgement chip when not judged", () => {
    render(
      <CrisisCard
        target="Random raider"
        time="2:10"
        hitPointsPct={12}
        maintained={false}
        judged={false}
        responded={false}
        swiftmendReady={true}
        nsReady={true}
        idlePreceding={true}
        judgement={null}
      />,
    );

    expect(screen.getByText("Context only")).toBeInTheDocument();
  });

  it("shows 'Responded' with no resource rows when the druid reacted", () => {
    render(
      <CrisisCard
        target="Offtank"
        time="0:45"
        hitPointsPct={8}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        judgement="green"
      />,
    );

    expect(screen.getByText("Responded")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/ui/CrisisCard/index.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `src/app/components/ui/CrisisCard/index.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Judgement } from "../../../../metrics/judgement";
import { JudgementChip } from "../JudgementChip";
import styles from "./index.module.css";

export interface CrisisCardProps {
  target: string;
  time: ReactNode;
  hitPointsPct: number;
  maintained: boolean;
  judged: boolean;
  responded: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  judgement: Judgement | null;
}

export function CrisisCard({
  target,
  time,
  hitPointsPct,
  maintained,
  judged,
  responded,
  swiftmendReady,
  nsReady,
  idlePreceding,
  judgement,
}: CrisisCardProps) {
  const rows: [string, string][] = [
    ["HP at crisis", `${Math.round(hitPointsPct)}%`],
    ["Maintained target", maintained ? "Yes" : "No"],
    ["Reactive heal landed", responded ? "Responded" : "No"],
  ];
  if (!responded) {
    rows.push(
      ["Swiftmend available", swiftmendReady ? "Ready" : "On cooldown"],
      ["Nature's Swiftness available", nsReady ? "Ready" : "On cooldown"],
      ["Idle in preceding 5s", idlePreceding ? "Yes" : "No"],
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <strong className={styles.target}>{target}</strong>
          <span className={styles.time}>{time}</span>
        </div>
        {judged ? (
          judgement ? (
            <JudgementChip judgement={judgement} />
          ) : null
        ) : (
          <span className={styles.contextOnly}>Context only</span>
        )}
      </div>
      <div className={styles.grid}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <span className={styles.label}>{label}: </span>
            <span className={styles.value}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note: `JudgementChip` renders the judgement label capitalized (e.g. "Orange") — matches the existing `DeathCard`/`JudgementChip` convention already in the codebase, hence the test asserting `screen.getByText("Orange")`.

- [ ] **Step 4: Create the CSS module**

Create `src/app/components/ui/CrisisCard/index.module.css`, copied from `DeathCard`'s (same visual language) with one added class:

```css
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}
.target {
  color: var(--text-h);
}
.time {
  color: var(--text);
  font-size: var(--text-small-size);
  margin-left: var(--space-2);
}
.contextOnly {
  font-size: 12px;
  font-style: italic;
  color: var(--text);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2) var(--space-4);
}
.row {
  font-size: var(--text-small-size);
}
.label {
  color: var(--text);
}
.value {
  color: var(--text-h);
  font-weight: 500;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/app/components/ui/CrisisCard/index.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ui/CrisisCard
git commit -m "feat(crisis-response): add CrisisCard UI component"
```

---

### Task 7: `NearDeathResponseCard` — fetch, compute, render

**Files:**

- Create: `src/app/components/NearDeathResponseCard/index.tsx`
- Test: `src/app/components/NearDeathResponseCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeNearDeathResponse`/`getHealingAbilityIds` (Task 4), `MetricCard` (`src/app/components/ui/MetricCard`), `CrisisCard` (Task 6), `Alert` (`src/app/components/ui/Alert`), `buildFightTimeUrl` (`src/report/wclLinks.ts`), `formatDuration` (`src/report/fightRows.ts`), `parseTalentPoints`/`SWIFTMEND_MIN_RESTORATION`/`NATURES_SWIFTNESS_MIN_RESTORATION` (`src/report/archetypeDetection.ts`), `ResolvedAbility` (`src/abilities/resolveAbilities.ts`).
- Produces: `NearDeathResponseCardProps`, `NearDeathResponseCard(props): JSX.Element`, consumed by Task 8 (`NearDeathResponseContent`).

Mirrors `DeathForensicsCard` exactly in structure (fetch on mount via `Promise.all`, tag the result with `accessToken` to guard against stale renders on prop changes, same loading/error/populated branches), swapping in the new data type and compute function.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/NearDeathResponseCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NearDeathResponseCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aDamageEvent,
  aCombatantInfoEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(damageEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "DamageTaken") return Promise.resolve(damageEvents);
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

describe("NearDeathResponseCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the flagged count and a per-crisis card once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[999, "Random raider"]])}
        fetchEvents={makeFetchEvents(damageEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Near-death response" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculating…")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("1 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.getByText("Random raider")).toBeInTheDocument();
  });

  it("shows 'No crises' when there are none", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No crises")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/NearDeathResponseCard/index.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/components/NearDeathResponseCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeNearDeathResponse,
  type NearDeathResponseResult,
} from "../../../metrics/nearDeathResponse";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { CrisisCard } from "../ui/CrisisCard";
import { Alert } from "../ui/Alert";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";

export interface NearDeathResponseCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  healingAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  lifebloomAbilityIds: Set<number>;
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
  | { accessToken: string; result: NearDeathResponseResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_holy_layonhands.jpg";

const THRESHOLD =
  "A crisis is a raider's HP dropping to <=15% (provisional, story 1001) and surviving. The response window runs from that reading until HP recovers, the target dies (excluded — story 501's territory), or the fight ends. Green if you landed a new reactive healing cast in that window; otherwise red/orange/green from the same unspent-resource tally story 501 uses (Swiftmend ready / Nature's Swiftness ready / a GCD available). Crises on a target you're not maintaining are shown as context only when you have a clear 1-2 target tank assignment elsewhere.";

export function NearDeathResponseCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  healingAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: NearDeathResponseCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "DamageTaken", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(
        ([
          damageEvents,
          healingEvents,
          deathEvents,
          castEvents,
          buffEvents,
          combatantInfoEvents,
        ]) => {
          try {
            const talents = parseTalentPoints(combatantInfoEvents, druidId);
            const restoration = talents === null ? 0 : talents[2];
            const computed = computeNearDeathResponse(
              damageEvents,
              healingEvents,
              deathEvents,
              castEvents,
              buffEvents,
              druidId,
              healingAbilityIds,
              swiftmendAbilityIds,
              naturesSwiftnessAbilityIds,
              lifebloomAbilityIds,
              restoration >= SWIFTMEND_MIN_RESTORATION,
              restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
              fight.startTime,
              fight.endTime,
            );
            setResult({ accessToken, result: computed });
          } catch (err) {
            setResult({
              accessToken,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to calculate the near-death response audit.",
            });
          }
        },
      )
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else already escalated to the full-screen recovery
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
    healingAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard icon={ICON} title="Near-death response" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="Near-death response" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { crises, flaggedCount, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Near-death response"
      value={
        crises.length === 0
          ? "No crises"
          : `${flaggedCount} of ${crises.length} crises flagged`
      }
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {crises.length === 0 ? (
        <p>No crises this fight.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {crises.map((crisis) => (
            <CrisisCard
              key={`${crisis.targetId}-${crisis.timestampMs}`}
              target={
                targetNames.get(crisis.targetId) ?? `Target #${crisis.targetId}`
              }
              time={
                <a
                  href={buildFightTimeUrl(
                    host,
                    reportCode,
                    fight.id,
                    crisis.timestampMs,
                    crisis.timestampMs,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  {formatDuration(crisis.timestampMs - fight.startTime)}
                </a>
              }
              hitPointsPct={crisis.hitPointsPct}
              maintained={crisis.maintained}
              judged={crisis.judged}
              responded={crisis.responded}
              swiftmendReady={crisis.swiftmendReady}
              nsReady={crisis.nsReady}
              idlePreceding={crisis.idlePreceding}
              judgement={crisis.judgement}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="warning">
          A survived crisis is not automatically good or bad process by itself;
          this audits your readiness and reaction only — not assignments or
          positioning, and not whether anyone else&apos;s response was enough.
        </Alert>
      </div>
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/NearDeathResponseCard/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/app/components/NearDeathResponseCard
git commit -m "feat(crisis-response): add NearDeathResponseCard"
```

---

### Task 8: `NearDeathResponseContent` wrapper

**Files:**

- Create: `src/app/components/NearDeathResponseContent/index.tsx`
- Create: `src/app/components/NearDeathResponseContent/index.module.css`

**Interfaces:**

- Consumes: `NearDeathResponseCard` (Task 7).
- Produces: `NearDeathResponseContentProps`, `NearDeathResponseContent(props): JSX.Element`, consumed by Task 11 (`Scorecard`).

No test needed for this task — it's a pure prop-forwarding wrapper with no logic of its own, exactly matching `DeathForensicsContent`'s own (untested, by inspection above) precedent.

- [ ] **Step 1: Implement the wrapper**

Create `src/app/components/NearDeathResponseContent/index.tsx`:

```tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { Host } from "../../../report/parseReportInput";
import { NearDeathResponseCard } from "../NearDeathResponseCard";
import styles from "./index.module.css";

export interface NearDeathResponseContentProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  healingAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

export function NearDeathResponseContent({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  healingAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: NearDeathResponseContentProps) {
  return (
    <div className={styles.group}>
      <NearDeathResponseCard
        accessToken={accessToken}
        reportCode={reportCode}
        host={host}
        fight={fight}
        druidId={druidId}
        healingAbilityIds={healingAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/components/NearDeathResponseContent/index.module.css`:

```css
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/app/components/NearDeathResponseContent
git commit -m "feat(crisis-response): add NearDeathResponseContent wrapper"
```

---

### Task 9: `useNearDeathResponseSummary` hook

**Files:**

- Create: `src/app/components/Scorecard/useNearDeathResponseSummary.ts`
- Test: `src/app/components/Scorecard/useNearDeathResponseSummary.test.ts`

**Interfaces:**

- Consumes: `computeNearDeathResponse` (Task 4), `summarizeNearDeathResponse` (Task 5), `EpicSummaryStatus` (`src/app/components/Scorecard/epicSummaryStatus.ts`), `parseTalentPoints`/`SWIFTMEND_MIN_RESTORATION`/`NATURES_SWIFTNESS_MIN_RESTORATION` (`src/report/archetypeDetection.ts`).
- Produces: `useNearDeathResponseSummary(accessToken, reportCode, fight, druidId, healingAbilityIds, swiftmendAbilityIds, naturesSwiftnessAbilityIds, lifebloomAbilityIds, fetchEvents): EpicSummaryStatus`, consumed by Task 10 (`useFightEpicSummaries`).

Mirrors `useDeathForensicsSummary.ts` exactly, swapping in the new fetch set and compute/summarize functions.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/Scorecard/useNearDeathResponseSummary.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNearDeathResponseSummary } from "./useNearDeathResponseSummary";
import { aFight } from "../../../testUtils/factories";

describe("useNearDeathResponseSummary", () => {
  it("starts loading, then reports a ready status", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useNearDeathResponseSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        new Set([18562]),
        new Set([17116]),
        new Set([33763]),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      judgement: "green",
      stats: ["No crises"],
    });
  });

  it("reports an error status when a fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useNearDeathResponseSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        new Set([18562]),
        new Set([17116]),
        new Set([33763]),
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

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useNearDeathResponseSummary.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/components/Scorecard/useNearDeathResponseSummary.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeNearDeathResponse } from "../../../metrics/nearDeathResponse";
import { summarizeNearDeathResponse } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useNearDeathResponseSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  healingAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
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
      fetchEvents(accessToken, reportCode, fightArg, "DamageTaken", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(
        ([
          damageEvents,
          healingEvents,
          deathEvents,
          castEvents,
          buffEvents,
          combatantInfoEvents,
        ]) => {
          const talents = parseTalentPoints(combatantInfoEvents, druidId);
          const restoration = talents === null ? 0 : talents[2];
          const computed = computeNearDeathResponse(
            damageEvents,
            healingEvents,
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            healingAbilityIds,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            restoration >= SWIFTMEND_MIN_RESTORATION,
            restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
            fight.startTime,
            fight.endTime,
          );
          setState({
            accessToken,
            summary: {
              status: "ready",
              ...summarizeNearDeathResponse(computed),
            },
          });
        },
      )
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to summarize Near-death response.",
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
    healingAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useNearDeathResponseSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/useNearDeathResponseSummary.ts src/app/components/Scorecard/useNearDeathResponseSummary.test.ts
git commit -m "feat(crisis-response): add useNearDeathResponseSummary hook"
```

---

### Task 10: Wire "crisis" into `useFightEpicSummaries`

**Files:**

- Modify: `src/app/components/Scorecard/useFightEpicSummaries.ts`
- Modify: `src/app/components/Scorecard/useFightEpicSummaries.test.ts`

**Interfaces:**

- Consumes: `useNearDeathResponseSummary` (Task 9), `getHealingAbilityIds` (Task 4).
- Produces: `FightEpicSummaries` now has a `crisis: EpicSummaryStatus` field; `EpicId` (its `keyof`) now includes `"crisis"` — consumed by every later task.

- [ ] **Step 1: Update the existing test's exact-shape assertion first**

`src/app/components/Scorecard/useFightEpicSummaries.test.ts` currently asserts an exact object shape (six keys) that will fail once a seventh `crisis` key is added. Edit it now, before implementing:

```ts
expect(result.current).toEqual({
  gcd: { status: "loading" },
  lifebloom: { status: "loading" },
  spell: { status: "loading" },
  mana: { status: "loading" },
  death: { status: "loading" },
  crisis: { status: "loading" },
  prep: { status: "loading" },
});
```

(Same file's `it(...)` title says "resolves all six" — update it to "resolves all seven" too.)

- [ ] **Step 2: Run it to verify it fails against the current (six-field) hook**

Run: `npx vitest run src/app/components/Scorecard/useFightEpicSummaries.test.ts`
Expected: FAIL — actual result has no `crisis` key yet.

- [ ] **Step 3: Implement**

Edit `src/app/components/Scorecard/useFightEpicSummaries.ts`:

```ts
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
import { useNearDeathResponseSummary } from "./useNearDeathResponseSummary";
import { usePrepHygieneSummary } from "./usePrepHygieneSummary";
import { getHealingAbilityIds } from "../../../metrics/nearDeathResponse";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

export interface FightEpicSummaries {
  gcd: EpicSummaryStatus;
  lifebloom: EpicSummaryStatus;
  spell: EpicSummaryStatus;
  mana: EpicSummaryStatus;
  death: EpicSummaryStatus;
  crisis: EpicSummaryStatus;
  prep: EpicSummaryStatus;
}

export type EpicId = keyof FightEpicSummaries;

type FetchEvents = (
  accessToken: string,
  reportCode: string,
  fight: EventFetcherFight,
  dataType: WclEventDataType,
  includeResources?: boolean,
) => Promise<WclEvent[]>;

// Wraps the seven per-epic summary hooks Scorecard needs for its widget
// grid, so both Scorecard and ReportDashboard's per-fight rows can get all
// seven without each re-writing the same seven hook calls in the same
// order.
export function useFightEpicSummaries(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fetchEvents: FetchEvents,
): FightEpicSummaries {
  const gcd = useGcdEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const lifebloom = useLifebloomDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const spell = useSpellDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    resolvedAbilities,
    fetchEvents,
  );
  const mana = useManaEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
  );
  const death = useDeathForensicsSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const healingAbilityIds = getHealingAbilityIds(resolvedAbilities);
  const crisis = useNearDeathResponseSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    healingAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const prep = usePrepHygieneSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );

  return { gcd, lifebloom, spell, mana, death, crisis, prep };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: fails at this point in `Scorecard/index.tsx` and `ReportDashboard/index.tsx` (both destructure `FightEpicSummaries` and will now be missing `crisis` handling) — this is expected; Tasks 11-12 fix it. Confirm the _only_ new errors are in those two files (not an unrelated regression).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useFightEpicSummaries.ts src/app/components/Scorecard/useFightEpicSummaries.test.ts
git commit -m "feat(crisis-response): wire near-death response into useFightEpicSummaries"
```

(This commit intentionally leaves the build red between here and Task 12 — a normal, brief TDD-adjacent state for a wiring change that spans several files; the next two tasks resolve it before any test run outside this plan's own steps would see it.)

---

### Task 11: Wire "crisis" into `Scorecard`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`

**Interfaces:**

- Consumes: `NearDeathResponseContent` (Task 8), `getHealingAbilityIds` (Task 4), updated `useFightEpicSummaries` (Task 10).

- [ ] **Step 1: Add the import and icon constant**

In `src/app/components/Scorecard/index.tsx`, add near the other epic-content imports:

```ts
import { NearDeathResponseContent } from "../NearDeathResponseContent";
```

and near the other icon constants (after `DEATH_FORENSICS_ICON`):

```ts
const CRISIS_RESPONSE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_holy_layonhands.jpg";
```

- [ ] **Step 2: Destructure the new summary and derive `healingAbilityIds`**

Change:

```ts
  const {
    gcd: gcdSummary,
    lifebloom: lifebloomSummary,
    spell: spellSummary,
    mana: manaSummary,
    death: deathSummary,
    prep: prepSummary,
  } = useFightEpicSummaries(
```

to:

```ts
  const {
    gcd: gcdSummary,
    lifebloom: lifebloomSummary,
    spell: spellSummary,
    mana: manaSummary,
    death: deathSummary,
    crisis: crisisSummary,
    prep: prepSummary,
  } = useFightEpicSummaries(
```

and add, right after that `useFightEpicSummaries` call (needed by the new `activeEpic === "crisis"` block in Step 4 below):

```ts
const healingAbilityIds = getHealingAbilityIds(resolvedAbilities);
```

with the matching import added alongside the other metrics imports at the top of the file:

```ts
import { getHealingAbilityIds } from "../../../metrics/nearDeathResponse";
```

- [ ] **Step 3: Add the widget tile**

In the widget grid (`activeEpic === null` block), add a new `Widget` right after the "Death forensics" one and before "Prep hygiene":

```tsx
<Widget
  icon={CRISIS_RESPONSE_ICON}
  label="Crisis response"
  onOpen={() => onSelectEpic("crisis")}
  judgement={
    crisisSummary.status === "ready" ? crisisSummary.judgement : undefined
  }
  stats={crisisSummary.status === "ready" ? crisisSummary.stats : undefined}
  note={
    crisisSummary.status === "loading"
      ? "Calculating…"
      : crisisSummary.status === "error"
        ? crisisSummary.error
        : undefined
  }
/>
```

- [ ] **Step 4: Add the detail block**

Add a new `activeEpic === "crisis"` block right after the `activeEpic === "death"` block and before `activeEpic === "prep"`:

```tsx
{
  activeEpic === "crisis" && (
    <div className={styles.detail}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => onSelectEpic(null)}
      >
        ← All metrics
      </button>
      <div className={styles.epicHeader}>
        <SpellIcon src={CRISIS_RESPONSE_ICON} />
        <h2 className={styles.epicTitle}>Crisis response</h2>
        {crisisSummary.status === "ready" && (
          <JudgementChip judgement={crisisSummary.judgement} />
        )}
      </div>
      <NearDeathResponseContent
        accessToken={accessToken}
        reportCode={reportCode}
        host={host}
        fight={fight}
        druidId={druidId}
        healingAbilityIds={healingAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: `Scorecard/index.tsx`'s errors from Task 10 are now resolved; only `ReportDashboard/index.tsx` errors remain (fixed in Task 12).

- [ ] **Step 6: Run the existing Scorecard test suite**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS — existing tests don't assert an exhaustive widget list, so adding one doesn't break them (confirmed by inspection of the test file during this story's planning).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/Scorecard/index.tsx
git commit -m "feat(crisis-response): add Crisis response widget and detail view to Scorecard"
```

---

### Task 12: Wire "crisis" into `ReportDashboard`'s whole-report rollup

**Files:**

- Modify: `src/app/components/ReportDashboard/index.tsx:59-66`

**Interfaces:**

- Consumes: updated `FightEpicSummaries`/`useFightEpicSummaries` (Task 10).

`rollupEpicJudgement`/`combineFightEpicStatus` (`src/metrics/reportAggregation.ts`) and the chip-strip render loop are already generic over `EPIC_META` — no logic changes needed there, confirmed by inspection during planning.

- [ ] **Step 1: Add the epic to `EPIC_META`**

Change:

```ts
const EPIC_META: { id: keyof FightEpicSummaries; label: string }[] = [
  { id: "gcd", label: "GCD economy" },
  { id: "lifebloom", label: "Lifebloom discipline" },
  { id: "spell", label: "Spell discipline" },
  { id: "mana", label: "Mana economy" },
  { id: "death", label: "Death forensics" },
  { id: "prep", label: "Prep hygiene" },
];
```

to:

```ts
const EPIC_META: { id: keyof FightEpicSummaries; label: string }[] = [
  { id: "gcd", label: "GCD economy" },
  { id: "lifebloom", label: "Lifebloom discipline" },
  { id: "spell", label: "Spell discipline" },
  { id: "mana", label: "Mana economy" },
  { id: "death", label: "Death forensics" },
  { id: "crisis", label: "Crisis response" },
  { id: "prep", label: "Prep hygiene" },
];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes with zero errors project-wide — this resolves the last of Task 10's deferred errors.

- [ ] **Step 3: Run the existing ReportDashboard test suite**

Run: `npx vitest run src/app/components/ReportDashboard/index.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/ReportDashboard/index.tsx
git commit -m "feat(crisis-response): fold Crisis response into the whole-report rollup"
```

---

### Task 13: Wire "crisis" into the URL-hash router

**Files:**

- Modify: `src/app/routing/hashRoute.ts:29-36`
- Check: `src/app/routing/hashRoute.test.ts` (if it enumerates `EPIC_IDS` exhaustively, no change needed since adding a new valid id doesn't invalidate existing route-parsing assertions — confirm by reading it first)

**Interfaces:**

- Consumes: updated `EpicId` (Task 10, transitively via `FightEpicSummaries`).

Without this change, a URL like `#/r/.../d/.../f/6/e/crisis` would fail `isEpicId` and silently redirect to the input screen (story 703's existing fallback behavior for an unrecognized route segment) — the widget click in Task 11 calls `onSelectEpic("crisis")` which flows through `App.tsx`'s existing `handleSelectEpic` into this router, so this task is required for the crisis detail view to be reachable/shareable via URL, not just optional polish.

- [ ] **Step 1: Add "crisis" to `EPIC_IDS`**

Change:

```ts
const EPIC_IDS: readonly EpicId[] = [
  "gcd",
  "lifebloom",
  "spell",
  "mana",
  "death",
  "prep",
];
```

to:

```ts
const EPIC_IDS: readonly EpicId[] = [
  "gcd",
  "lifebloom",
  "spell",
  "mana",
  "death",
  "crisis",
  "prep",
];
```

- [ ] **Step 2: Typecheck and run the router's test suite**

Run: `npm run typecheck && npx vitest run src/app/routing/hashRoute.test.ts`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/routing/hashRoute.ts
git commit -m "feat(crisis-response): make the Crisis response epic reachable via the URL hash router"
```

---

### Task 14: Full-project verification, documentation, and closing out the story

**Files:**

- Modify: `docs/thresholds.md` (new "Crisis response (epic J)" section)
- Modify: `docs/testing.md` (extend the `4GYHZRdtL3bvhpc8` known-report row)
- Modify: `CLAUDE.md` (append story 1001 to the repo-state paragraph)
- Modify: `docs/backlog.md` (mark 1001 `✅ Done`)
- Delete: `docs/specs/near-death-response-design.md`
- Delete: `docs/plans/near-death-response-plan.md` (this file)

- [ ] **Step 1: Run the full test suite, typecheck, lint, and format check**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: everything passes. If `format:check` fails, run `npm run format` and re-stage.

- [ ] **Step 2: Add the `docs/thresholds.md` section**

Insert a new section after "## Prep hygiene (epic G)" (before its trailing content ends the file):

```markdown
## Crisis response (epic J)

| Metric           | Threshold                          | Current default                                                                                                                     | Source     | Code                                                                                    |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Crisis threshold | HP% at or below counts as a crisis | 15% (provisional — not yet calibrated against real exemplar data)                                                                   | story 1001 | `src/metrics/nearDeathResponse.ts` (`CRISIS_THRESHOLD_PCT`)                             |
| Crisis response  | green / orange / red               | responded (green, unconditional) / else 0 / 1 / >=2 unspent resources, judged only when maintained or with no clear tank assignment | story 1001 | `src/metrics/nearDeathResponse.ts` (reuses `deathForensics.ts`'s `judgeDeathReadiness`) |
```

- [ ] **Step 3: Extend the `docs/testing.md` known-reports row**

Find the `4GYHZRdtL3bvhpc8` row (the table's first data row) and append to the end of its long "Notable for" cell text (before the closing `|`):

```
 Also confirmed (story 1001, fight 6) that `DamageTaken` events carry the same `hitPoints`/`maxHitPoints` percentage fields as `Healing` events when fetched with `includeResources: true`, and that `resourceActor: 2` on a `DamageTaken` event (source != target) attaches the fields to the target being hit, not the attacker — the basis for near-death crisis detection needing no reconstruction of raw/absolute HP. Also confirmed (target 37, this fight) that a real death's `Deaths` event timestamp lands ~25-59ms after the fatal `DamageTaken` reading, and that a battle-rez can leave a ~90s gap between a death and that target's next real HP reading — the reason story 1001 models deaths as explicit timeline markers rather than inferring them from timestamp proximity.
```

- [ ] **Step 4: Update `CLAUDE.md`'s repo-state paragraph**

Append one sentence to the end of the long "Repo state" paragraph in `CLAUDE.md` (after the story 906 material):

```
Story 1001 (near-death response audit, epic J) is done too — a new "Crisis response" card audits raid-wide near-death moments (a target's HP dropping to <=15%, provisional, and surviving) the same way story 501 audits actual deaths, reusing its exact readiness machinery (Swiftmend/Nature's Swiftness/idle-GCD tally) for the unspent-resource judgement, with a scope exemption (crises outside a druid's clear 1-2 target tank assignment are shown as context only, not judged) that 501 itself doesn't need since it only ever judges maintained-target deaths.
```

- [ ] **Step 5: Mark story 1001 done in `docs/backlog.md`**

Change the heading:

```markdown
### 1001 — Near-death response audit 🔲 Todo
```

to:

```markdown
### 1001 — Near-death response audit ✅ Done
```

- [ ] **Step 6: Delete the retired spec and plan**

```bash
rm docs/specs/near-death-response-design.md
rm docs/plans/near-death-response-plan.md
```

First confirm nothing else references these paths:

Run: `grep -rn "near-death-response-design\|near-death-response-plan" docs/ src/ 2>/dev/null`
Expected: no output (nothing references them outside themselves).

- [ ] **Step 7: Final full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: everything passes.

- [ ] **Step 8: Commit**

```bash
git add docs/thresholds.md docs/testing.md CLAUDE.md docs/backlog.md
git add -u docs/specs docs/plans
git commit -m "docs(crisis-response): mark story 1001 done, retire its design spec and plan"
```
