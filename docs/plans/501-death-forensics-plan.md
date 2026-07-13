# Story 501 — Per-death resource audit — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: per this repo's `CLAUDE.md`, execute this plan
> with `superpowers:subagent-driven-development`, directly on `main` — no
> `superpowers:executing-plans` review-checkpoint session, no git worktree isolation. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship backlog story 501 (per-death resource audit) — for every friendly death, show
whether the druid's LB3 was rolling on the target and whether Swiftmend, Nature's Swiftness, and
a free GCD were available but unused, judged red/orange/green per maintained-target death and
rolled up per fight.

**Architecture:** One new pure metric module (`src/metrics/deathForensics.ts`) composed entirely
from building blocks 201/301/302/304 already exported (Lifebloom stack reconstruction, cast
intervals, cooldown constants) — no new event-parsing techniques. One new presentational UI
primitive (`ui/DeathCard`), one fetch+render card (`DeathForensicsCard`), one thin epic wrapper
(`DeathForensicsContent`), and the same `use*Summary` + `summarize*` + `Scorecard` wiring every
prior epic (B/C/D) already uses.

**Tech Stack:** TypeScript, React 18 (function components only), Vitest + React Testing Library,
existing `fetchEvents`/`eventCache` data layer — no new dependencies.

## Global Constraints

- Never hardcode spell/ability IDs — every ability ID used here (`swiftmendAbilityIds`,
  `naturesSwiftnessAbilityIds`, `lifebloomAbilityIds`) is already resolved upstream and threaded
  through as a prop; this story adds no new ID resolution.
- No backend, no secrets — this story only reads events through the existing client-side
  `fetchEvents`/`eventCache` layer.
- Every threshold must be documented with its rationale inline (principle 3) — see each card's
  `THRESHOLD` string and the code comments on `DEATH_IDLE_WINDOW_MS` / `judgeDeathReadiness`.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) must pass
  full-project before every commit — the pre-commit hook enforces this; don't bypass it.
- Tests are co-located (`*.test.ts` / `*.test.tsx` next to the file under test), Tier 1 unit
  tests use hand-built factories from `src/testUtils/factories.ts`, Tier 3 component tests use
  React Testing Library — per `docs/testing.md`.
- A story isn't done until its paperwork is retired: `docs/backlog.md`'s 501 heading gets
  `✅ Done`, and both `docs/specs/501-death-forensics-design.md` and this plan file are deleted
  in the same commit as the last code change (Task 8).

---

### Task 1: Shared constant plumbing + the `deathForensics` metric module

**Files:**

- Modify: `src/metrics/judgement.ts`
- Modify: `src/metrics/epicSummary.ts:1`, `:17-30`
- Modify: `src/metrics/lb3Uptime.ts:10`
- Modify: `src/metrics/naturesSwiftnessAudit.ts:8`
- Modify: `src/metrics/swiftmendAudit.ts:13-14`, `:221`
- Modify: `src/metrics/castIntervals.ts` (export the `CastInterval` interface)
- Modify: `src/testUtils/factories.ts` (append a new factory)
- Create: `src/metrics/deathForensics.ts`
- Test: `src/metrics/deathForensics.test.ts`

**Interfaces:**

- Consumes: `reconstructLifebloomTimelines`, `deriveLifebloomTargetState` (from
  `./lifebloomStacks`, both already exported); `computeCastIntervals` (from `./castIntervals`,
  already exported); `WclEvent` (from `../wcl/events`); `Judgement` (from `./judgement`).
- Produces (used by Tasks 4 and 6): `computeDeathForensics(deathEvents: WclEvent[], castEvents:
WclEvent[], buffEvents: WclEvent[], druidId: number, swiftmendAbilityIds: Set<number>,
naturesSwiftnessAbilityIds: Set<number>, lifebloomAbilityIds: Set<number>, fightStart: number,
fightEnd: number): DeathForensicsResult`; the `DeathAudit` and `DeathForensicsResult`
  interfaces below. Also produces: `worstJudgement` now importable from `./judgement` (Task 6
  imports it from there, not `./epicSummary`, though the old import path keeps working via a
  re-export).

- [ ] **Step 1: Move `worstJudgement` into `judgement.ts` so `deathForensics.ts` can use it
      without creating a circular import with `epicSummary.ts`**

  `metrics/epicSummary.ts` currently defines `worstJudgement` itself, and `deathForensics.ts`
  needs it for its own fight-level rollup. Importing it from `epicSummary.ts` would create a
  cycle once `epicSummary.ts` also imports `DeathForensicsResult` from `deathForensics.ts` in
  Task 6. Moving it to `judgement.ts` (the leaf module every metric file already imports
  `Judgement` from) avoids the cycle and duplication.

  Replace the full contents of `src/metrics/judgement.ts` with:

  ```ts
  export type Judgement = "green" | "orange" | "red";

  // Higher value is better (e.g. GCD utilization %, LB3 uptime %).
  export function judgeThreshold(
    value: number,
    thresholds: { greenMin: number; orangeMin: number },
  ): Judgement {
    if (value >= thresholds.greenMin) return "green";
    if (value >= thresholds.orangeMin) return "orange";
    return "red";
  }

  // Lower value is better (e.g. idle dead-time %, overheal %).
  export function judgeThresholdBelow(
    value: number,
    thresholds: { greenMax: number; orangeMax: number },
  ): Judgement {
    if (value < thresholds.greenMax) return "green";
    if (value <= thresholds.orangeMax) return "orange";
    return "red";
  }

  const JUDGEMENT_RANK: Record<Judgement, number> = {
    red: 2,
    orange: 1,
    green: 0,
  };

  export function worstJudgement(judgements: (Judgement | null)[]): Judgement {
    const present = judgements.filter((j): j is Judgement => j !== null);
    return present.reduce(
      (worst, current) =>
        JUDGEMENT_RANK[current] > JUDGEMENT_RANK[worst] ? current : worst,
      "green" as Judgement,
    );
  }
  ```

  In `src/metrics/epicSummary.ts`, delete lines 17-30 (the `JUDGEMENT_RANK` const and
  `worstJudgement` function) and replace line 1 with:

  ```ts
  import type { Judgement } from "./judgement";
  export { worstJudgement } from "./judgement";
  ```

  This keeps `epicSummary.test.ts`'s existing `import { worstJudgement, ... } from
"./epicSummary"` working unchanged.

- [ ] **Step 2: Run the existing epicSummary tests to confirm the move didn't break anything**

  Run: `npx vitest run src/metrics/epicSummary.test.ts`
  Expected: PASS (all existing `worstJudgement` and `summarize*` tests still pass).

- [ ] **Step 3: Export the three cooldown/threshold constants this story reuses**

  In `src/metrics/lb3Uptime.ts` line 10, change:

  ```ts
  const MAINTAINED_MIN_UPTIME_PCT = 30;
  ```

  to:

  ```ts
  export const MAINTAINED_MIN_UPTIME_PCT = 30;
  ```

  In `src/metrics/naturesSwiftnessAudit.ts` line 8, change:

  ```ts
  const NATURES_SWIFTNESS_COOLDOWN_MS = 180_000;
  ```

  to:

  ```ts
  export const NATURES_SWIFTNESS_COOLDOWN_MS = 180_000;
  ```

  In `src/metrics/swiftmendAudit.ts`, add a named, exported constant next to the existing
  `SWIFTMEND_MATCH_TOLERANCE_MS` (currently lines 13-14):

  ```ts
  // Swiftmend's cooldown per docs/backlog.md story 302's "15s cooldown" note.
  export const SWIFTMEND_COOLDOWN_MS = 15_000;
  ```

  Then, in the same file at line 221 (inside `computeSwiftmendAudit`'s return statement),
  change:

  ```ts
    availableWindows: Math.floor(fightDurationMs / 15_000),
  ```

  to:

  ```ts
    availableWindows: Math.floor(fightDurationMs / SWIFTMEND_COOLDOWN_MS),
  ```

- [ ] **Step 4: Run the full test suite to confirm these three export-only changes are inert**

  Run: `npx vitest run src/metrics/lb3Uptime.test.ts src/metrics/naturesSwiftnessAudit.test.ts src/metrics/swiftmendAudit.test.ts`
  Expected: PASS (no behavior changed, only visibility).

- [ ] **Step 5: Add the `aDeathEvent` factory**

  Append to `src/testUtils/factories.ts` (after `aHealEvent`):

  ```ts
  export function aDeathEvent(overrides: Partial<WclEvent> = {}): WclEvent {
    return {
      timestamp: 1926404,
      type: "death",
      sourceID: -1,
      targetID: 37,
      abilityGameID: 0,
      fight: 6,
      killerID: 56,
      killingAbilityGameID: 1,
      ...overrides,
    };
  }
  ```

  This mirrors the real shape captured live from report `4GYHZRdtL3bvhpc8` fight 6 (see
  `docs/specs/501-death-forensics-design.md`'s "Live WCL validation" section, and Task 2's
  fixture).

- [ ] **Step 6: Write the failing test file `src/metrics/deathForensics.test.ts`**

  ```ts
  import { describe, expect, it } from "vitest";
  import { computeDeathForensics } from "./deathForensics";
  import {
    aDeathEvent,
    aCastEvent,
    aBegincastEvent,
    anApplyBuffEvent,
    anApplyBuffStackEvent,
    aRemoveBuffEvent,
  } from "../testUtils/factories";

  const DRUID_ID = 2;
  const SWIFTMEND_IDS = new Set([18562]);
  const NS_IDS = new Set([17116]);
  const LB_IDS = new Set([33763]);

  describe("computeDeathForensics", () => {
    it("judges red when a maintained target's death has no LB3, both cooldowns ready, and the druid was idle", () => {
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
        aRemoveBuffEvent({
          timestamp: 50000,
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
        0,
        100000,
      );

      expect(result.deaths[0]).toEqual({
        timestampMs: 90000,
        targetId: 50,
        maintained: true,
        lb3Rolling: false,
        swiftmendReady: true,
        nsReady: true,
        idlePreceding: true,
        unspentCount: 3,
        judgement: "red",
      });
    });

    it("judges orange when exactly one of the three resources is unspent", () => {
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
      const castEvents = [
        // Nature's Swiftness, long before the death -> still on cooldown.
        aCastEvent({
          timestamp: 1000,
          targetID: 50,
          abilityGameID: 17116,
          sourceID: DRUID_ID,
        }),
        // Swiftmend, 10s before the death -> still on its 15s cooldown.
        aCastEvent({
          timestamp: 80000,
          targetID: 50,
          abilityGameID: 18562,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        buffEvents,
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        100000,
      );

      expect(result.deaths[0].lb3Rolling).toBe(true);
      expect(result.deaths[0].swiftmendReady).toBe(false);
      expect(result.deaths[0].nsReady).toBe(false);
      expect(result.deaths[0].idlePreceding).toBe(true);
      expect(result.deaths[0].unspentCount).toBe(1);
      expect(result.deaths[0].judgement).toBe("orange");
    });

    it("judges green when zero resources are unspent", () => {
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
      const castEvents = [
        aCastEvent({
          timestamp: 1000,
          targetID: 50,
          abilityGameID: 17116,
          sourceID: DRUID_ID,
        }),
        aCastEvent({
          timestamp: 80000,
          targetID: 50,
          abilityGameID: 18562,
          sourceID: DRUID_ID,
        }),
        // A third cast right before the death keeps the druid mid-cast at
        // the moment of death (instant cast -> occupies [89000, 90500]).
        aCastEvent({
          timestamp: 89000,
          targetID: 50,
          abilityGameID: 26980,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        buffEvents,
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        100000,
      );

      expect(result.deaths[0].unspentCount).toBe(0);
      expect(result.deaths[0].judgement).toBe("green");
    });

    it("reports judgement as null for an unmaintained target's death, regardless of unspent count", () => {
      const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 999 })];
      // No Lifebloom, Swiftmend, or Nature's Swiftness casts at all, and no
      // other casts nearby -> every raw boolean looks "unspent", but the
      // target was never maintained, so it must not be judged.
      const result = computeDeathForensics(
        deathEvents,
        [],
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        100000,
      );

      expect(result.deaths[0].maintained).toBe(false);
      expect(result.deaths[0].lb3Rolling).toBe(false);
      expect(result.deaths[0].swiftmendReady).toBe(true);
      expect(result.deaths[0].nsReady).toBe(true);
      expect(result.deaths[0].idlePreceding).toBe(true);
      expect(result.deaths[0].judgement).toBeNull();
      expect(result.flaggedCount).toBe(0);
    });

    it("maintained matches story 201's >=30% fight-wide any-stack-uptime threshold exactly at the boundary", () => {
      const buffEvents = [
        anApplyBuffEvent({ timestamp: 0, targetID: 70, abilityGameID: 33763 }),
        // Exactly 30% of the 100000ms fight.
        aRemoveBuffEvent({
          timestamp: 30000,
          targetID: 70,
          abilityGameID: 33763,
        }),
        anApplyBuffEvent({ timestamp: 0, targetID: 71, abilityGameID: 33763 }),
        // Just under 30%.
        aRemoveBuffEvent({
          timestamp: 29999,
          targetID: 71,
          abilityGameID: 33763,
        }),
      ];
      const deathEvents = [
        aDeathEvent({ timestamp: 50000, targetID: 70 }),
        aDeathEvent({ timestamp: 50001, targetID: 71 }),
      ];

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

      expect(result.deaths[0].maintained).toBe(true);
      expect(result.deaths[1].maintained).toBe(false);
    });

    it.each([
      { gapMs: 15000, expected: true },
      { gapMs: 14999, expected: false },
    ])(
      "swiftmendReady is $expected when the last Swiftmend cast was $gapMs ms before the death",
      ({ gapMs, expected }) => {
        const castEvents = [
          aCastEvent({
            timestamp: 10000,
            targetID: 999,
            abilityGameID: 18562,
            sourceID: DRUID_ID,
          }),
        ];
        const deathEvents = [
          aDeathEvent({ timestamp: 10000 + gapMs, targetID: 999 }),
        ];

        const result = computeDeathForensics(
          deathEvents,
          castEvents,
          [],
          DRUID_ID,
          SWIFTMEND_IDS,
          NS_IDS,
          LB_IDS,
          0,
          200000,
        );

        expect(result.deaths[0].swiftmendReady).toBe(expected);
      },
    );

    it.each([
      { gapMs: 180000, expected: true },
      { gapMs: 179999, expected: false },
    ])(
      "nsReady is $expected when the last Nature's Swiftness cast was $gapMs ms before the death",
      ({ gapMs, expected }) => {
        const castEvents = [
          aCastEvent({
            timestamp: 10000,
            targetID: 999,
            abilityGameID: 17116,
            sourceID: DRUID_ID,
          }),
        ];
        const deathEvents = [
          aDeathEvent({ timestamp: 10000 + gapMs, targetID: 999 }),
        ];

        const result = computeDeathForensics(
          deathEvents,
          castEvents,
          [],
          DRUID_ID,
          SWIFTMEND_IDS,
          NS_IDS,
          LB_IDS,
          0,
          400000,
        );

        expect(result.deaths[0].nsReady).toBe(expected);
      },
    );

    it("idlePreceding is false when the druid is still mid-cast (a cast-time spell) at the death", () => {
      const castEvents = [
        aBegincastEvent({
          timestamp: 8500,
          abilityGameID: 26980,
          sourceID: DRUID_ID,
        }),
        // Regrowth's 2000ms cast time -> occupies [8500, 10500].
        aCastEvent({
          timestamp: 10500,
          abilityGameID: 26980,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [aDeathEvent({ timestamp: 9500, targetID: 999 })];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        200000,
      );

      expect(result.deaths[0].idlePreceding).toBe(false);
    });

    it.each([
      { deathTimestamp: 6000, expected: true },
      { deathTimestamp: 3000, expected: false },
    ])(
      "idlePreceding is $expected when the death at $deathTimestamp ms precedes the druid's first cast, measured from the fight's start",
      ({ deathTimestamp, expected }) => {
        const castEvents = [
          aCastEvent({
            timestamp: 20000,
            abilityGameID: 26980,
            sourceID: DRUID_ID,
          }),
        ];
        const deathEvents = [
          aDeathEvent({ timestamp: deathTimestamp, targetID: 999 }),
        ];

        const result = computeDeathForensics(
          deathEvents,
          castEvents,
          [],
          DRUID_ID,
          SWIFTMEND_IDS,
          NS_IDS,
          LB_IDS,
          0,
          200000,
        );

        expect(result.deaths[0].idlePreceding).toBe(expected);
      },
    );

    it("rolls up flaggedCount and the worst-of judgement across multiple deaths", () => {
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
      const castEvents = [
        aCastEvent({
          timestamp: 89000,
          abilityGameID: 18562,
          sourceID: DRUID_ID,
        }),
        aCastEvent({
          timestamp: 89000,
          abilityGameID: 17116,
          sourceID: DRUID_ID,
        }),
        aCastEvent({
          timestamp: 90500,
          abilityGameID: 26980,
          sourceID: DRUID_ID,
        }),
      ];
      const deathEvents = [
        // Early death, before any of the casts above -> everything unspent -> red.
        aDeathEvent({ timestamp: 10000, targetID: 50 }),
        // Late death, right after the cast cluster -> everything spent -> green.
        aDeathEvent({ timestamp: 91000, targetID: 60 }),
      ];

      const result = computeDeathForensics(
        deathEvents,
        castEvents,
        buffEvents,
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        100000,
      );

      expect(result.deaths[0].judgement).toBe("red");
      expect(result.deaths[1].judgement).toBe("green");
      expect(result.flaggedCount).toBe(1);
      expect(result.judgement).toBe("red");
    });

    it("resolves to a green judgement with zero flagged deaths when there are no friendly deaths", () => {
      const result = computeDeathForensics(
        [],
        [],
        [],
        DRUID_ID,
        SWIFTMEND_IDS,
        NS_IDS,
        LB_IDS,
        0,
        100000,
      );

      expect(result).toEqual({
        deaths: [],
        flaggedCount: 0,
        judgement: "green",
      });
    });
  });
  ```

- [ ] **Step 7: Run the test file to confirm it fails**

  Run: `npx vitest run src/metrics/deathForensics.test.ts`
  Expected: FAIL — `Cannot find module './deathForensics'` (the module doesn't exist yet).

- [ ] **Step 8: Implement `src/metrics/deathForensics.ts`**

  ```ts
  import type { WclEvent } from "../wcl/events";
  import type { Judgement } from "./judgement";
  import { worstJudgement } from "./judgement";
  import { computeCastIntervals, type CastInterval } from "./castIntervals";
  import {
    reconstructLifebloomTimelines,
    deriveLifebloomTargetState,
  } from "./lifebloomStacks";
  import { MAINTAINED_MIN_UPTIME_PCT } from "./lb3Uptime";
  import { SWIFTMEND_COOLDOWN_MS } from "./swiftmendAudit";
  import { NATURES_SWIFTNESS_COOLDOWN_MS } from "./naturesSwiftnessAudit";

  // Backlog story 501: a GCD is considered "available" if the druid had at
  // least this long, idle, in the moments before a death.
  const DEATH_IDLE_WINDOW_MS = 5000;

  export interface DeathAudit {
    timestampMs: number;
    targetId: number;
    maintained: boolean;
    lb3Rolling: boolean;
    swiftmendReady: boolean;
    nsReady: boolean;
    idlePreceding: boolean;
    unspentCount: number;
    judgement: Judgement | null;
  }

  export interface DeathForensicsResult {
    deaths: DeathAudit[];
    flaggedCount: number;
    judgement: Judgement;
  }

  // Only the red condition is spelled out in docs/backlog.md story 501 ("red
  // if >= 2 unspent resources on a maintained target's death"); 0 -> green,
  // 1 -> orange fill in the rest of the R/O/G scale every other judged
  // metric in the app uses.
  function judgeDeathReadiness(unspentCount: number): Judgement {
    if (unspentCount === 0) return "green";
    if (unspentCount === 1) return "orange";
    return "red";
  }

  function lastCastBefore(
    sortedCasts: WclEvent[],
    timestamp: number,
  ): WclEvent | undefined {
    let last: WclEvent | undefined;
    for (const cast of sortedCasts) {
      if (cast.timestamp >= timestamp) break;
      last = cast;
    }
    return last;
  }

  function isReady(
    sortedCasts: WclEvent[],
    deathTimestamp: number,
    cooldownMs: number,
  ): boolean {
    const last = lastCastBefore(sortedCasts, deathTimestamp);
    if (last === undefined) return true;
    return deathTimestamp - last.timestamp >= cooldownMs;
  }

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
    const deaths = deathEvents
      .filter((event) => event.type === "death" && event.targetID !== undefined)
      .sort((a, b) => a.timestamp - b.timestamp);

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
    const fightDurationMs = fightEnd - fightStart;

    const lifebloomTimelines = reconstructLifebloomTimelines(
      buffEvents,
      druidId,
      lifebloomAbilityIds,
    );
    const lifebloomStateByTarget = new Map(
      [...lifebloomTimelines.entries()].map(([targetId, timeline]) => [
        targetId,
        deriveLifebloomTargetState(timeline, fightEnd),
      ]),
    );

    const results: DeathAudit[] = deaths.map((death) => {
      const targetId = death.targetID as number;
      const timestampMs = death.timestamp;

      const lbState = lifebloomStateByTarget.get(targetId);
      const maintained =
        lbState !== undefined &&
        (lbState.totalAnyStackMs / fightDurationMs) * 100 >=
          MAINTAINED_MIN_UPTIME_PCT;
      const lb3Rolling =
        lbState !== undefined &&
        lbState.stack3Intervals.some(
          (interval) =>
            timestampMs >= interval.start && timestampMs <= interval.end,
        );

      const swiftmendReady = isReady(
        swiftmendCasts,
        timestampMs,
        SWIFTMEND_COOLDOWN_MS,
      );
      const nsReady = isReady(
        nsCasts,
        timestampMs,
        NATURES_SWIFTNESS_COOLDOWN_MS,
      );
      const idlePreceding = wasIdlePreceding(
        castIntervals,
        timestampMs,
        fightStart,
      );

      const unspentCount = [swiftmendReady, nsReady, idlePreceding].filter(
        Boolean,
      ).length;
      const judgement = maintained ? judgeDeathReadiness(unspentCount) : null;

      return {
        timestampMs,
        targetId,
        maintained,
        lb3Rolling,
        swiftmendReady,
        nsReady,
        idlePreceding,
        unspentCount,
        judgement,
      };
    });

    return {
      deaths: results,
      flaggedCount: results.filter((d) => d.judgement === "red").length,
      judgement: worstJudgement(results.map((d) => d.judgement)),
    };
  }
  ```

  Note: `CastInterval` isn't currently exported from `castIntervals.ts` — add `export` to its
  `interface CastInterval` declaration (currently `interface CastInterval {`) as part of this
  step.

- [ ] **Step 9: Run the test file to confirm it passes**

  Run: `npx vitest run src/metrics/deathForensics.test.ts`
  Expected: PASS — all 12 test cases green.

- [ ] **Step 10: Run static analysis and the full test suite**

  Run: `npm run typecheck && npm run lint && npx vitest run`
  Expected: all PASS — no regressions in the five files touched in this task.

- [ ] **Step 11: Commit**

  ```bash
  git add src/metrics/judgement.ts src/metrics/epicSummary.ts src/metrics/lb3Uptime.ts \
    src/metrics/naturesSwiftnessAudit.ts src/metrics/swiftmendAudit.ts \
    src/metrics/castIntervals.ts src/metrics/deathForensics.ts src/metrics/deathForensics.test.ts \
    src/testUtils/factories.ts
  git commit -m "feat(death-forensics): add per-death resource audit metric module"
  ```

---

### Task 2: Capture the real `Deaths` fixture and document it

**Files:**

- Create: `test/integration/fixtures/events-deaths.json`
- Modify: `docs/testing.md` (extend the `4GYHZRdtL3bvhpc8` row of the known reports table)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on — this is documentation/fixture only, per
  `docs/testing.md`'s Tier 2 charter ("the fixture exists primarily to keep a real payload in the
  repo for future regression checks").

- [ ] **Step 1: Write the fixture**

  Create `test/integration/fixtures/events-deaths.json` with the real payload already captured
  live against report `4GYHZRdtL3bvhpc8`, fight 6 (see `docs/specs/501-death-forensics-design.md`'s
  "Live WCL validation" section):

  ```json
  {
    "data": {
      "reportData": {
        "report": {
          "events": {
            "data": [
              {
                "timestamp": 1926404,
                "type": "death",
                "sourceID": -1,
                "targetID": 37,
                "abilityGameID": 0,
                "fight": 6,
                "killerID": 56,
                "killerInstance": 7,
                "killingAbilityGameID": 1
              },
              {
                "timestamp": 1985756,
                "type": "death",
                "sourceID": -1,
                "targetID": 4,
                "abilityGameID": 0,
                "fight": 6,
                "killerID": 92,
                "killerInstance": 3,
                "killingAbilityGameID": 28168
              },
              {
                "timestamp": 2021866,
                "type": "death",
                "sourceID": -1,
                "targetID": 37,
                "abilityGameID": 0,
                "fight": 6,
                "killerID": 96,
                "killerInstance": 25,
                "killingAbilityGameID": 1
              },
              {
                "timestamp": 2022205,
                "type": "death",
                "sourceID": -1,
                "targetID": 3,
                "abilityGameID": 0,
                "fight": 6,
                "killerID": 72,
                "killingAbilityGameID": 37433
              }
            ],
            "nextPageTimestamp": null
          }
        }
      }
    }
  }
  ```

- [ ] **Step 2: Document the validated shape in `docs/testing.md`**

  In `docs/testing.md`'s known reports table, find the `4GYHZRdtL3bvhpc8` row (its "Notable for"
  cell is one long paragraph ending in "...without needing per-spell ability-ID splits for
  ticks.") and append one more sentence to that same cell (don't add a new row — every other
  live-validated fact for this report is appended to the same cell):

  ```
  Also validated (fight 6) that the `Deaths` event type returns friendly-only deaths shaped as
  `{timestamp, type: "death", sourceID: -1, targetID, killerID, killingAbilityGameID}` — `targetID`
  is the player who died (confirmed against `masterData.actors`), `sourceID` is always `-1`
  (deaths have no "source" actor), and `includeResources: true` adds no extra fields to this event
  type (unlike `Healing` events) — the basis for story 501's per-death resource audit reading
  `targetID` directly with no hostility filtering of its own.
  ```

- [ ] **Step 3: Run Prettier on the changed files**

  Run: `npx prettier --write test/integration/fixtures/events-deaths.json docs/testing.md`
  Expected: both files reformatted in place (or reported unchanged if already compliant).

- [ ] **Step 4: Commit**

  ```bash
  git add test/integration/fixtures/events-deaths.json docs/testing.md
  git commit -m "test(death-forensics): capture real Deaths event fixture"
  ```

---

### Task 3: `ui/DeathCard` presentational component

**Files:**

- Create: `src/app/components/ui/DeathCard/index.tsx`
- Create: `src/app/components/ui/DeathCard/index.module.css`
- Test: `src/app/components/ui/DeathCard/index.test.tsx`

**Interfaces:**

- Consumes: `Judgement` (from `../../../../metrics/judgement`); `JudgementChip` (from
  `../JudgementChip`).
- Produces (used by Task 4): `DeathCard` component with props `{ target: string; time:
ReactNode; maintained: boolean; lb3: boolean; swiftmendReady: boolean; nsReady: boolean;
idlePreceding: boolean; judgement: Judgement | null }`.

- [ ] **Step 1: Write the failing test**

  ```tsx
  // src/app/components/ui/DeathCard/index.test.tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it } from "vitest";
  import { DeathCard } from "./index";

  describe("DeathCard", () => {
    it("renders a judged, maintained-target death with all fields", () => {
      render(
        <DeathCard
          target="Offtank"
          time="3:47"
          maintained={true}
          lb3={false}
          swiftmendReady={true}
          nsReady={true}
          idlePreceding={true}
          judgement="red"
        />,
      );

      expect(screen.getByText("Offtank")).toBeInTheDocument();
      expect(screen.getByText("3:47")).toBeInTheDocument();
      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
      expect(screen.getAllByText("Ready")).toHaveLength(2);
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    it("shows 'Not judged' and 'n/a — not maintained' for an unmaintained target", () => {
      render(
        <DeathCard
          target="Raid member (Warrior)"
          time="5:02"
          maintained={false}
          lb3={false}
          swiftmendReady={false}
          nsReady={true}
          idlePreceding={false}
          judgement={null}
        />,
      );

      expect(screen.getByText("Not judged")).toBeInTheDocument();
      expect(screen.getByText("n/a — not maintained")).toBeInTheDocument();
      expect(screen.getByText("On cooldown")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/app/components/ui/DeathCard/index.test.tsx`
  Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the component**

  ```tsx
  // src/app/components/ui/DeathCard/index.tsx
  import type { ReactNode } from "react";
  import type { Judgement } from "../../../../metrics/judgement";
  import { JudgementChip } from "../JudgementChip";
  import styles from "./index.module.css";

  export interface DeathCardProps {
    target: string;
    time: ReactNode;
    maintained: boolean;
    lb3: boolean;
    swiftmendReady: boolean;
    nsReady: boolean;
    idlePreceding: boolean;
    judgement: Judgement | null;
  }

  export function DeathCard({
    target,
    time,
    maintained,
    lb3,
    swiftmendReady,
    nsReady,
    idlePreceding,
    judgement,
  }: DeathCardProps) {
    const rows: [string, string][] = [
      [
        "LB3 rolling on target",
        maintained ? (lb3 ? "Yes" : "No") : "n/a — not maintained",
      ],
      ["Swiftmend available", swiftmendReady ? "Ready" : "On cooldown"],
      ["Nature's Swiftness available", nsReady ? "Ready" : "On cooldown"],
      ["Idle in preceding 5s", idlePreceding ? "Yes" : "No"],
    ];

    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <strong className={styles.target}>{target}</strong>
            <span className={styles.time}>{time}</span>
          </div>
          {judgement ? (
            <JudgementChip judgement={judgement} />
          ) : (
            <span className={styles.notJudged}>Not judged</span>
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

  ```css
  /* src/app/components/ui/DeathCard/index.module.css */
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
  .notJudged {
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

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/app/components/ui/DeathCard/index.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/components/ui/DeathCard
  git commit -m "feat(death-forensics): add DeathCard presentational component"
  ```

---

### Task 4: `DeathForensicsCard`

**Files:**

- Create: `src/app/components/DeathForensicsCard/index.tsx`
- Test: `src/app/components/DeathForensicsCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeDeathForensics`, `DeathForensicsResult` (Task 1); `DeathCard` (Task 3);
  `MetricCard` (`../ui/MetricCard`); `Alert` (`../ui/Alert`); `formatDuration`
  (`../../../report/fightRows`); `buildFightTimeUrl` (`../../../report/wclLinks`); `Fight`
  (`../../../wcl/client`); `WclEvent`, `WclEventDataType` (`../../../wcl/events`);
  `EventFetcherFight` (`../../../wcl/eventCache`).
- Produces (used by Task 5): `DeathForensicsCard` component with props `{ accessToken: string;
reportCode: string; fight: Fight; druidId: number; swiftmendAbilityIds: Set<number>;
naturesSwiftnessAbilityIds: Set<number>; lifebloomAbilityIds: Set<number>; targetNames:
Map<number, string>; fetchEvents: (...) => Promise<WclEvent[]> }`.

- [ ] **Step 1: Write the failing test**

  ```tsx
  // src/app/components/DeathForensicsCard/index.test.tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import { DeathForensicsCard } from "./index";
  import type { WclEvent, WclEventDataType } from "../../../wcl/events";
  import type { EventFetcherFight } from "../../../wcl/eventCache";
  import {
    aFight,
    aDeathEvent,
    anApplyBuffEvent,
    anApplyBuffStackEvent,
  } from "../../../testUtils/factories";

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

  describe("DeathForensicsCard", () => {
    it("shows the flagged count and a per-death card once loaded", async () => {
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

      render(
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
          lifebloomAbilityIds={new Set([33763])}
          targetNames={new Map([[50, "Offtank"]])}
          fetchEvents={makeFetchEvents(deathEvents, [], buffEvents)}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Per-death resource audit" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByText("1 of 1 deaths flagged")).toBeInTheDocument(),
      );
      expect(screen.getByText("Offtank")).toBeInTheDocument();
      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(
        screen.getByRole("alert", { name: "" }) ??
          screen.getByText(/not automatically the druid's fault/),
      ).toBeTruthy();
    });

    it("shows a message and green judgement when there are no friendly deaths", async () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });

      render(
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
          lifebloomAbilityIds={new Set([33763])}
          targetNames={new Map()}
          fetchEvents={makeFetchEvents([], [], [])}
        />,
      );

      await waitFor(() =>
        expect(screen.getByText("No friendly deaths")).toBeInTheDocument(),
      );
      expect(
        screen.getByText("No friendly deaths this fight."),
      ).toBeInTheDocument();
      expect(screen.getByText("Green")).toBeInTheDocument();
    });

    it("falls back to 'Target #<id>' when the death's target has no known name", async () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
      const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 999 })];

      render(
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
          lifebloomAbilityIds={new Set([33763])}
          targetNames={new Map()}
          fetchEvents={makeFetchEvents(deathEvents, [], [])}
        />,
      );

      await waitFor(() =>
        expect(screen.getByText("Target #999")).toBeInTheDocument(),
      );
    });

    it("shows a loading message before the fetch resolves", () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
      const fetchEvents = () => new Promise<never>(() => {});

      render(
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
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
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
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

    it("requests the Deaths, Casts, and Buffs event types", async () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
      const fetchEvents = vi.fn().mockResolvedValue([]);

      render(
        <DeathForensicsCard
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
          lifebloomAbilityIds={new Set([33763])}
          targetNames={new Map()}
          fetchEvents={fetchEvents}
        />,
      );

      await waitFor(() =>
        expect(screen.getByText("No friendly deaths")).toBeInTheDocument(),
      );

      const requestedTypes = fetchEvents.mock.calls.map((call) => call[3]);
      expect(requestedTypes).toEqual(
        expect.arrayContaining(["Deaths", "Casts", "Buffs"]),
      );
    });
  });
  ```

  (The first test's `screen.getByRole("alert", { name: "" }) ?? ...` line is defensive
  boilerplate copy-paste risk — simplify it in Step 3's implementation review to just:
  `expect(screen.getByText(/not automatically the druid's fault/)).toBeInTheDocument();`.)

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/app/components/DeathForensicsCard/index.test.tsx`
  Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the component**

  ```tsx
  // src/app/components/DeathForensicsCard/index.tsx
  import { useEffect, useState } from "react";
  import type { Fight } from "../../../wcl/client";
  import type { WclEvent, WclEventDataType } from "../../../wcl/events";
  import type { EventFetcherFight } from "../../../wcl/eventCache";
  import {
    computeDeathForensics,
    type DeathForensicsResult,
  } from "../../../metrics/deathForensics";
  import { formatDuration } from "../../../report/fightRows";
  import { buildFightTimeUrl } from "../../../report/wclLinks";
  import { MetricCard } from "../ui/MetricCard";
  import { DeathCard } from "../ui/DeathCard";
  import { Alert } from "../ui/Alert";

  export interface DeathForensicsCardProps {
    accessToken: string;
    reportCode: string;
    fight: Fight;
    druidId: number;
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
    | { accessToken: string; result: DeathForensicsResult }
    | { accessToken: string; error: string };

  const ICON =
    "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg";

  const THRESHOLD =
    "For each friendly death: target, time, LB3 status on that target, Swiftmend CD state, Nature's Swiftness CD state, and whether you were idle (a GCD available) in the preceding 5s. Only maintained targets (>=30% Lifebloom uptime, story 201's definition) are judged — green 0 unspent resources, orange 1, red >=2 of {Swiftmend ready, Nature's Swiftness ready, idle-with-a-GCD-available}. LB3 status is shown for context but doesn't count toward that tally. A death is not automatically the druid's fault — this audits your readiness only, not target selection, assignments, or positioning.";

  export function DeathForensicsCard({
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    targetNames,
    fetchEvents,
  }: DeathForensicsCardProps) {
    const [result, setResult] = useState<FetchResult | null>(null);

    useEffect(() => {
      const fightArg = {
        id: fight.id,
        startTime: fight.startTime,
        endTime: fight.endTime,
      };
      Promise.all([
        fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
        fetchEvents(accessToken, reportCode, fightArg, "Casts"),
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
          setResult({ accessToken, result: computed });
        })
        .catch((err: unknown) =>
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the per-death resource audit.",
          }),
        );
    }, [
      accessToken,
      reportCode,
      fight.id,
      fight.startTime,
      fight.endTime,
      druidId,
      swiftmendAbilityIds,
      naturesSwiftnessAbilityIds,
      lifebloomAbilityIds,
      fetchEvents,
    ]);

    const isCurrent = result !== null && result.accessToken === accessToken;

    if (!isCurrent) {
      return (
        <MetricCard
          icon={ICON}
          title="Per-death resource audit"
          threshold={THRESHOLD}
        >
          <p>Calculating…</p>
        </MetricCard>
      );
    }

    if ("error" in result) {
      return (
        <MetricCard
          icon={ICON}
          title="Per-death resource audit"
          threshold={THRESHOLD}
        >
          <p role="alert">{result.error}</p>
        </MetricCard>
      );
    }

    const { deaths, flaggedCount, judgement } = result.result;

    return (
      <MetricCard
        icon={ICON}
        title="Per-death resource audit"
        value={
          deaths.length === 0
            ? "No friendly deaths"
            : `${flaggedCount} of ${deaths.length} deaths flagged`
        }
        judgement={judgement}
        threshold={THRESHOLD}
      >
        {deaths.length === 0 ? (
          <p>No friendly deaths this fight.</p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {deaths.map((death) => (
              <DeathCard
                key={`${death.targetId}-${death.timestampMs}`}
                target={
                  targetNames.get(death.targetId) ?? `Target #${death.targetId}`
                }
                time={
                  <a
                    href={buildFightTimeUrl(
                      reportCode,
                      fight.id,
                      death.timestampMs,
                      death.timestampMs,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatDuration(death.timestampMs - fight.startTime)}
                  </a>
                }
                maintained={death.maintained}
                lb3={death.lb3Rolling}
                swiftmendReady={death.swiftmendReady}
                nsReady={death.nsReady}
                idlePreceding={death.idlePreceding}
                judgement={death.judgement}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="warning">
            A death is not automatically the druid&apos;s fault; this audits
            your readiness only — not target selection, assignments, or
            positioning.
          </Alert>
        </div>
      </MetricCard>
    );
  }
  ```

  Also simplify the first test's assertion per Step 1's note, replacing the defensive
  `getByRole("alert", ...) ?? ...` line with:

  ```tsx
  expect(
    screen.getByText(/not automatically the druid's fault/),
  ).toBeInTheDocument();
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/app/components/DeathForensicsCard/index.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/components/DeathForensicsCard
  git commit -m "feat(death-forensics): add DeathForensicsCard"
  ```

---

### Task 5: `DeathForensicsContent`

**Files:**

- Create: `src/app/components/DeathForensicsContent/index.tsx`
- Create: `src/app/components/DeathForensicsContent/index.module.css`
- Test: `src/app/components/DeathForensicsContent/index.test.tsx`

**Interfaces:**

- Consumes: `DeathForensicsCard` (Task 4).
- Produces (used by Task 7): `DeathForensicsContent` component, same prop shape as
  `DeathForensicsCardProps`.

- [ ] **Step 1: Write the failing test**

  ```tsx
  // src/app/components/DeathForensicsContent/index.test.tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it } from "vitest";
  import { DeathForensicsContent } from "./index";
  import { aFight } from "../../../testUtils/factories";

  describe("DeathForensicsContent", () => {
    it("renders the per-death resource audit card", () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
      const fetchEvents = () => Promise.resolve([]);

      render(
        <DeathForensicsContent
          accessToken="test-token"
          reportCode="4GYHZRdtL3bvhpc8"
          fight={fight}
          druidId={2}
          swiftmendAbilityIds={new Set([18562])}
          naturesSwiftnessAbilityIds={new Set([17116])}
          lifebloomAbilityIds={new Set([33763])}
          targetNames={new Map()}
          fetchEvents={fetchEvents}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Per-death resource audit" }),
      ).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/app/components/DeathForensicsContent/index.test.tsx`
  Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement**

  ```tsx
  // src/app/components/DeathForensicsContent/index.tsx
  import type { Fight } from "../../../wcl/client";
  import type { WclEvent, WclEventDataType } from "../../../wcl/events";
  import type { EventFetcherFight } from "../../../wcl/eventCache";
  import { DeathForensicsCard } from "../DeathForensicsCard";
  import styles from "./index.module.css";

  export interface DeathForensicsContentProps {
    accessToken: string;
    reportCode: string;
    fight: Fight;
    druidId: number;
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

  export function DeathForensicsContent({
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    targetNames,
    fetchEvents,
  }: DeathForensicsContentProps) {
    return (
      <div className={styles.group}>
        <DeathForensicsCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
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

  ```css
  /* src/app/components/DeathForensicsContent/index.module.css */
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/app/components/DeathForensicsContent/index.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/components/DeathForensicsContent
  git commit -m "feat(death-forensics): add DeathForensicsContent"
  ```

---

### Task 6: Dashboard summary — `useDeathForensicsSummary` + `summarizeDeathForensics`

**Files:**

- Modify: `src/metrics/epicSummary.ts` (append `summarizeDeathForensics`, add an import)
- Test: `src/metrics/epicSummary.test.ts` (append tests)
- Create: `src/app/components/Scorecard/useDeathForensicsSummary.ts`
- Test: `src/app/components/Scorecard/useDeathForensicsSummary.test.ts`

**Interfaces:**

- Consumes: `DeathForensicsResult` (Task 1); `EpicSummary` (already defined in
  `epicSummary.ts`); `EpicSummaryStatus` (`./epicSummaryStatus`, unchanged).
- Produces (used by Task 7): `summarizeDeathForensics(deathForensics:
DeathForensicsResult): EpicSummary`; `useDeathForensicsSummary(accessToken: string,
reportCode: string, fight: Fight, druidId: number, swiftmendAbilityIds: Set<number>,
naturesSwiftnessAbilityIds: Set<number>, lifebloomAbilityIds: Set<number>, fetchEvents:
(...) => Promise<WclEvent[]>): EpicSummaryStatus`.

- [ ] **Step 1: Add the failing `summarizeDeathForensics` tests**

  Append to `src/metrics/epicSummary.test.ts` (add `summarizeDeathForensics` to the existing
  import list at the top, and `import type { DeathForensicsResult } from "./deathForensics";`):

  ```ts
  describe("summarizeDeathForensics", () => {
    it("reports the deaths/flagged stat lines and the rollup judgement", () => {
      const deathForensics: DeathForensicsResult = {
        deaths: [
          {
            timestampMs: 90000,
            targetId: 50,
            maintained: true,
            lb3Rolling: false,
            swiftmendReady: true,
            nsReady: true,
            idlePreceding: true,
            unspentCount: 3,
            judgement: "red",
          },
          {
            timestampMs: 91000,
            targetId: 60,
            maintained: true,
            lb3Rolling: true,
            swiftmendReady: false,
            nsReady: false,
            idlePreceding: false,
            unspentCount: 0,
            judgement: "green",
          },
        ],
        flaggedCount: 1,
        judgement: "red",
      };

      expect(summarizeDeathForensics(deathForensics)).toEqual({
        judgement: "red",
        stats: ["Deaths: 2", "Flagged: 1"],
      });
    });

    it("reports a single 'No friendly deaths' stat and green judgement when there were none", () => {
      const deathForensics: DeathForensicsResult = {
        deaths: [],
        flaggedCount: 0,
        judgement: "green",
      };

      expect(summarizeDeathForensics(deathForensics)).toEqual({
        judgement: "green",
        stats: ["No friendly deaths"],
      });
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run src/metrics/epicSummary.test.ts`
  Expected: FAIL — `summarizeDeathForensics is not defined`.

- [ ] **Step 3: Implement `summarizeDeathForensics`**

  Add `import type { DeathForensicsResult } from "./deathForensics";` to the top of
  `src/metrics/epicSummary.ts`, and append this function at the end of the file:

  ```ts
  export function summarizeDeathForensics(
    deathForensics: DeathForensicsResult,
  ): EpicSummary {
    const { deaths, flaggedCount, judgement } = deathForensics;
    return {
      judgement,
      stats:
        deaths.length === 0
          ? ["No friendly deaths"]
          : [`Deaths: ${deaths.length}`, `Flagged: ${flaggedCount}`],
    };
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run src/metrics/epicSummary.test.ts`
  Expected: PASS.

- [ ] **Step 5: Write the failing hook test**

  ```ts
  // src/app/components/Scorecard/useDeathForensicsSummary.test.ts
  import { renderHook, waitFor } from "@testing-library/react";
  import { describe, expect, it } from "vitest";
  import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
  import { aFight } from "../../../testUtils/factories";

  describe("useDeathForensicsSummary", () => {
    it("starts loading, then reports a ready status", async () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
      const fetchEvents = () => Promise.resolve([]);

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

      expect(result.current).toEqual({ status: "loading" });

      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(result.current).toEqual({
        status: "ready",
        judgement: "green",
        stats: ["No friendly deaths"],
      });
    });

    it("reports an error status when a fetch rejects", async () => {
      const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
      const fetchEvents = () =>
        Promise.reject(new Error("WCL API responded 500: server error"));

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

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current).toEqual({
        status: "error",
        error: "WCL API responded 500: server error",
      });
    });
  });
  ```

- [ ] **Step 6: Run the test to verify it fails**

  Run: `npx vitest run src/app/components/Scorecard/useDeathForensicsSummary.test.ts`
  Expected: FAIL — `Cannot find module './useDeathForensicsSummary'`.

- [ ] **Step 7: Implement the hook**

  ```ts
  // src/app/components/Scorecard/useDeathForensicsSummary.ts
  import { useEffect, useState } from "react";
  import type { Fight } from "../../../wcl/client";
  import type { WclEvent, WclEventDataType } from "../../../wcl/events";
  import type { EventFetcherFight } from "../../../wcl/eventCache";
  import { computeDeathForensics } from "../../../metrics/deathForensics";
  import { summarizeDeathForensics } from "../../../metrics/epicSummary";
  import type { EpicSummaryStatus } from "./epicSummaryStatus";

  type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

  export function useDeathForensicsSummary(
    accessToken: string,
    reportCode: string,
    fight: Fight,
    druidId: number,
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
        fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
        fetchEvents(accessToken, reportCode, fightArg, "Casts"),
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
          setState({
            accessToken,
            summary: { status: "ready", ...summarizeDeathForensics(computed) },
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
                  : "Failed to summarize Death forensics.",
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

- [ ] **Step 8: Run both test files to verify they pass**

  Run: `npx vitest run src/metrics/epicSummary.test.ts src/app/components/Scorecard/useDeathForensicsSummary.test.ts`
  Expected: PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts \
    src/app/components/Scorecard/useDeathForensicsSummary.ts \
    src/app/components/Scorecard/useDeathForensicsSummary.test.ts
  git commit -m "feat(death-forensics): add dashboard summary for death forensics"
  ```

---

### Task 7: Wire Death forensics into `Scorecard`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `DeathForensicsContent` (Task 5), `useDeathForensicsSummary` (Task 6). Scorecard's
  props already include `naturesSwiftnessAbilityIds`, `lifebloomAbilityIds`,
  `swiftmendAbilityIds`, `targetNames` — no new props needed on `Scorecard` itself.
- Produces: nothing further downstream — this is the last integration point.

- [ ] **Step 1: Update `Scorecard/index.tsx`**

  Add two imports near the top, alongside the existing `SpellDisciplineContent` /
  `useSpellDisciplineSummary` imports:

  ```ts
  import { DeathForensicsContent } from "../DeathForensicsContent";
  import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
  ```

  Change the icon constants block (currently `GCD_ECONOMY_ICON` and `SPELL_DISCIPLINE_ICON`) to
  also define a death forensics icon, and shrink `DISABLED_EPICS` to drop `"death"`:

  ```ts
  const GCD_ECONOMY_ICON =
    "https://wow.zamimg.com/images/wow/icons/large/ability_druid_forceofnature.jpg";
  const SPELL_DISCIPLINE_ICON =
    "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg";
  const DEATH_FORENSICS_ICON =
    "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg";

  const DISABLED_EPICS: { id: EpicId; label: string; icon: string }[] = [
    {
      id: "mana",
      label: "Mana economy",
      icon: "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg",
    },
    {
      id: "prep",
      label: "Prep hygiene",
      icon: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg",
    },
  ];
  ```

  Inside the `Scorecard` function body, add the summary hook call right after
  `spellSummary`:

  ```ts
  const deathSummary = useDeathForensicsSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  ```

  In the dashboard grid (`activeEpic === null` block), add a `Widget` for death forensics right
  after the "Spell discipline" `Widget` and before the `DISABLED_EPICS.map(...)` line:

  ```tsx
  <Widget
    icon={DEATH_FORENSICS_ICON}
    label="Death forensics"
    onOpen={() => setActiveEpic("death")}
    judgement={
      deathSummary.status === "ready" ? deathSummary.judgement : undefined
    }
    stats={deathSummary.status === "ready" ? deathSummary.stats : undefined}
    note={
      deathSummary.status === "loading"
        ? "Calculating…"
        : deathSummary.status === "error"
          ? deathSummary.error
          : undefined
    }
  />
  ```

  After the `activeEpic === "spell"` detail block (right before the `<div
className={styles.footer}>` closing section), add the death forensics detail block:

  ```tsx
  {
    activeEpic === "death" && (
      <div className={styles.detail}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => setActiveEpic(null)}
        >
          ← All metrics
        </button>
        <div className={styles.epicHeader}>
          <SpellIcon src={DEATH_FORENSICS_ICON} />
          <h2 className={styles.epicTitle}>Death forensics</h2>
          {deathSummary.status === "ready" && (
            <JudgementChip judgement={deathSummary.judgement} />
          )}
        </div>
        <DeathForensicsContent
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
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

- [ ] **Step 2: Update `Scorecard/index.test.tsx`**

  In the first test ("renders the fight header, all 6 epic widgets, and the footer"), change:

  ```ts
  expect(
    screen.getByRole("button", { name: /Spell discipline/ }),
  ).toBeInTheDocument();
  for (const label of ["Mana economy", "Death forensics", "Prep hygiene"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getAllByText("Not yet available")).toHaveLength(3);
  ```

  to:

  ```ts
  expect(
    screen.getByRole("button", { name: /Spell discipline/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Death forensics/ }),
  ).toBeInTheDocument();
  for (const label of ["Mana economy", "Prep hygiene"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getAllByText("Not yet available")).toHaveLength(2);
  ```

- [ ] **Step 3: Run the Scorecard tests to verify they pass**

  Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
  Expected: PASS.

- [ ] **Step 4: Run the full suite and static analysis**

  Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.test.tsx
  git commit -m "feat(death-forensics): wire death forensics into the scorecard dashboard"
  ```

---

### Task 8: Retire the paperwork

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/501-death-forensics-design.md`
- Delete: `docs/plans/501-death-forensics-plan.md` (this file)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Mark 501 done in the backlog**

  In `docs/backlog.md`, change the heading:

  ```
  ### 501 — Per-death resource audit
  ```

  to:

  ```
  ### 501 — Per-death resource audit ✅ Done
  ```

- [ ] **Step 2: Update `CLAUDE.md`'s Repo state paragraph**

  Replace the sentence:

  ```
  Phase 2 work continues with epic D — stories 301, 302 (Swiftmend quality audit), and 304 (Nature's Swiftness audit) are done; story 303 (downranking discipline) remains outstanding, implemented out of its suggested order since it was requested directly.
  ```

  with (this also fixes a stale leftover from the 303 commit — `docs/backlog.md` already marks
  303 done, but this prose sentence was never updated to match):

  ```
  Phase 2 work continues — epic D (stories 301, 302, 303, and 304) is fully done. Epic E (mana economy, stories 401-404) hasn't been started yet; story 501 (per-death resource audit, epic F) is done, implemented out of its suggested order since it was requested directly.
  ```

- [ ] **Step 3: Confirm nothing else references the spec or plan files**

  Run: `grep -rn "501-death-forensics" /Users/bran/Source/bloomwatch --include="*.md" | grep -v "docs/specs/501-death-forensics-design.md\|docs/plans/501-death-forensics-plan.md"`
  Expected: no output (nothing else points to these files).

- [ ] **Step 4: Delete the spec and this plan**

  ```bash
  rm docs/specs/501-death-forensics-design.md docs/plans/501-death-forensics-plan.md
  ```

- [ ] **Step 5: Run static analysis one last time**

  Run: `npm run typecheck && npm run lint && npm run format:check`
  Expected: all PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add docs/backlog.md CLAUDE.md
  git add -u docs/specs/501-death-forensics-design.md docs/plans/501-death-forensics-plan.md
  git commit -m "docs: mark story 501 done, retire its design spec and plan"
  ```
