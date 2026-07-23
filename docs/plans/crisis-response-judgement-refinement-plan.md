# Crisis response judgement refinement (story 1002) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharpen crisis response's judgement (`computeNearDeathResponse`, `src/metrics/nearDeathResponse.ts`) with a distinguishable "clear save" tier within "good", and a new "fair" tier for unmaintained-target crises where a resource was ready to help.

**Architecture:** All logic changes live in `src/metrics/nearDeathResponse.ts`, reusing existing helper functions from `naturesSwiftnessAudit.ts` and `swiftmendAudit.ts` (exported for this purpose) rather than re-deriving matching logic. New fields flow through the existing `CrisisEvent`/`NearDeathResponseResult` shapes with no breaking changes. UI threads the new fields down `Scorecard` -> `NearDeathResponseContent` -> `NearDeathResponseCard` -> `CrisisCard`. A parallel, additive change wires crisis response into `scripts/lib/calibrateReport.ts`/`rollup.ts` (currently missing entirely), used to pull real corpus examples for citation in docs/comments.

**Tech Stack:** TypeScript, Vitest, React Testing Library, existing WCL client/event-cache layer, `tsx` for calibration scripts.

## Global Constraints

- No hardcoded spell/ability IDs — resolve via `masterData.abilities` at runtime (story 007). All new ability-ID sets are threaded in as function parameters, resolved by callers.
- `Judgement` stays the closed `"good" | "fair" | "bad"` union — the new "clear save" distinction is a separate field alongside `judgement`, never a new judgement value (principle 3).
- No em dashes, no "epic"/"story"/backlog vocabulary in any user-facing string (labels, copy, threshold text) — principle 5/6.
- Every threshold/judgement rule must be documented with a comment pointing to its rationale in `docs/backlog.md`, and `docs/thresholds.md` must reflect it.
- Real crisis examples from the local calibration corpus must back each new distinction, cited by report/fight/target/timestamp, matching this repo's existing citation convention.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via pre-commit hook — never bypass it.
- Commits follow Conventional Commits (`type(scope): summary`).

---

## Task 1: Unmaintained-crisis "fair" tier

**Files:**

- Modify: `src/metrics/nearDeathResponse.ts`
- Test: `src/metrics/nearDeathResponse.test.ts`

**Interfaces:**

- Consumes: existing `computeNearDeathResponse` signature (no params added this task), existing `CrisisEvent.judged`/`.judgement` fields.
- Produces: `judged` is `true` for an unmaintained-target crisis whenever `swiftmendReady || nsReady` is true (in addition to the existing `maintained || !hasClearAssignment` conditions). In that new case alone, `judgement` is hardcoded `"fair"` (never run through `judgeDeathReadiness`). `CrisisEvent` also gains `judgedByReadyResource: boolean`, true only on a crisis judged via this exact new rule -- needed because a crisis can independently land on `judgement === "fair"` via the pre-existing `judgeDeathReadiness(1)` path (e.g. a target with no clear tank assignment at all, `unspentCount === 1` via `idlePreceding` alone with neither resource ready), and Task 5's calibration rollup needs to tell the two apart precisely rather than approximate by re-deriving the condition from `maintained`/`judgement` alone. No other behavior changes.

- [ ] **Step 1: Update the existing test that currently expects this scenario to stay context-only**

The existing test at `src/metrics/nearDeathResponse.test.ts:250` ("shows a crisis on a non-maintained target as context only...") has no cast events at all, so both `swiftmendReady` and `nsReady` resolve `true` (no prior cast means `isReady` defaults to ready) — under the new rule this crisis becomes judged `"fair"`, not context-only. Replace that test with two precise tests: one pinning the new fair tier (resource ready), one pinning the still-unjudged case (neither resource ready). Replace lines 250-294 with:

```ts
it("judges a non-maintained crisis as fair when a resource was ready, even without a reactive heal", () => {
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
  // maintained target (60) elsewhere, a clear tank assignment. No prior
  // Swiftmend/Nature's Swiftness casts exist, so both read "ready" by
  // default -- surfacing "you could have helped" even though this
  // wasn't your assigned target.
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
  expect(result.crises[0].judged).toBe(true);
  expect(result.crises[0].judgement).toBe("fair");
  expect(result.crises[0].judgedByReadyResource).toBe(true);
  expect(result.flaggedCount).toBe(0);
});

it("judges a non-maintained crisis as fair when only one of the two resources was ready", () => {
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
  // A Swiftmend cast 5s before the crisis leaves it on cooldown (15s
  // cooldown); Nature's Swiftness has no prior cast, so it's ready.
  const castEvents = [
    aCastEvent({
      timestamp: 85000,
      sourceID: DRUID_ID,
      targetID: 60,
      abilityGameID: 18562,
    }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
    aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
  ];

  const result = computeNearDeathResponse(
    damageEvents,
    [],
    [],
    castEvents,
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

  expect(result.crises[0].swiftmendReady).toBe(false);
  expect(result.crises[0].nsReady).toBe(true);
  expect(result.crises[0].judged).toBe(true);
  expect(result.crises[0].judgement).toBe("fair");
  expect(result.crises[0].judgedByReadyResource).toBe(true);
});

it("still shows a non-maintained crisis as context only when neither resource was ready", () => {
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
  // Both on cooldown: Swiftmend 5s prior (15s cooldown), Nature's
  // Swiftness 60s prior (180s cooldown).
  const castEvents = [
    aCastEvent({
      timestamp: 30000,
      sourceID: DRUID_ID,
      targetID: 60,
      abilityGameID: 17116,
    }),
    aCastEvent({
      timestamp: 85000,
      sourceID: DRUID_ID,
      targetID: 60,
      abilityGameID: 18562,
    }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
    aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
  ];

  const result = computeNearDeathResponse(
    damageEvents,
    [],
    [],
    castEvents,
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

  expect(result.crises[0].swiftmendReady).toBe(false);
  expect(result.crises[0].nsReady).toBe(false);
  expect(result.crises[0].judged).toBe(false);
  expect(result.crises[0].judgement).toBeNull();
  expect(result.crises[0].judgedByReadyResource).toBe(false);
  expect(result.flaggedCount).toBe(0);
});
```

- [ ] **Step 2: Run the updated tests to verify they fail**

Run: `npm test -- nearDeathResponse.test.ts`
Expected: the 3 new/updated tests FAIL (the first two currently get `judged: false`, the third currently passes coincidentally but keep it to pin behavior going forward).

- [ ] **Step 3: Implement the fair tier in `computeNearDeathResponse`**

In `src/metrics/nearDeathResponse.ts`, find the crisis-mapping block (currently around lines 279-325). Replace:

```ts
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
      ? "good"
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
```

with:

```ts
const crises: CrisisEvent[] = episodes.map((episode) => {
  const maintained = maintainedTargetIds.has(episode.targetId);

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

  // Story 1002: a crisis on a target outside the druid's maintained
  // assignment is judged in two cases -- the existing "no clear
  // assignment at all" case, and (new) whenever a real resource was
  // ready to help even though the target wasn't "yours". The second
  // case always reads "fair" -- it surfaces "you could have helped",
  // it doesn't grade the miss further via the maintained-target
  // severity tally.
  const judgedElsewhereReady = !maintained && (swiftmendReady || nsReady);
  const judged = maintained || !hasClearAssignment || judgedElsewhereReady;

  // Tracked separately from `judgement === "fair"` because a crisis can
  // also land on "fair" via the pre-existing no-clear-assignment path
  // (judgeDeathReadiness(1), e.g. idlePreceding alone with neither
  // resource ready) -- this flag is true only for the new rule above,
  // so downstream calibration pooling (story 1002, scripts/lib/rollup.ts)
  // can count real occurrences of the new tier precisely, not by
  // re-deriving an approximation from `maintained`/`judgement` alone.
  const judgedByReadyResource = judgedElsewhereReady && hasClearAssignment;

  const judgement = !judged
    ? null
    : responded
      ? "good"
      : maintained || !hasClearAssignment
        ? judgeDeathReadiness(unspentCount)
        : "fair";

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
    judgedByReadyResource,
  };
});
```

Update the `CrisisEvent` interface (near the top of the file) to add the new field:

```ts
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
  judgedByReadyResource: boolean;
}
```

(Task 2 replaces this interface again to add `clearSave`/`saveKind` -- its version keeps `judgedByReadyResource` from this task, it doesn't drop it.)

Also update the doc comment above the scope/exemption block (currently around line 241-243) to mention the new fair tier:

```ts
// Scope/exemption: "maintained targets" is exactly story 201/501's
// definition. A clear tank assignment (1-2 maintained targets) exempts
// crises on other raiders from judgement -- they're shown as context
// only -- UNLESS a real resource (Swiftmend or Nature's Swiftness) was
// ready at the time, which reads "fair" per story 1002: surfacing "you
// could have helped" without grading the miss further.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- nearDeathResponse.test.ts`
Expected: PASS, all tests including the 3 from Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/nearDeathResponse.ts src/metrics/nearDeathResponse.test.ts
git commit -m "feat(crisis-response): judge unmaintained crises fair when a resource was ready"
```

---

## Task 2: Nature's Swiftness "clear save" combo

**Files:**

- Modify: `src/metrics/naturesSwiftnessAudit.ts`
- Modify: `src/metrics/naturesSwiftnessAudit.test.ts`
- Modify: `src/metrics/nearDeathResponse.ts`
- Test: `src/metrics/nearDeathResponse.test.ts`

**Interfaces:**

- Consumes: `naturesSwiftnessAudit.ts`'s private `findFollowUp` function (exported this task), `NaturesSwiftnessFollowUp` (gains a `timestampMs` field).
- Produces: `CrisisEvent` gains `clearSave: boolean` and `saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null`. `computeNearDeathResponse` gains exactly one new trailing parameter this task, `resolvedAbilities: Map<number, ResolvedAbility>` (used immediately, to avoid an unused-parameter typecheck failure -- Task 3 appends its own two new params, `rejuvenationAbilityIds`/`regrowthAbilityIds`, after `resolvedAbilities`, since those are unused until that task). This task only ever sets `saveKind` to `"natures-swiftness-combo"` or leaves it `null`; Task 3 adds the other branch.

- [ ] **Step 1: Export `findFollowUp` and add `timestampMs` to its result, in `naturesSwiftnessAudit.ts`**

In `src/metrics/naturesSwiftnessAudit.ts`, change:

```ts
export interface NaturesSwiftnessFollowUp {
  spell: DruidHealingSpell;
  rank: number | null;
  targetId: number | undefined;
}
```

to:

```ts
export interface NaturesSwiftnessFollowUp {
  spell: DruidHealingSpell;
  rank: number | null;
  targetId: number | undefined;
  timestampMs: number;
}
```

Change:

```ts
function findFollowUp(
  sortedDruidCasts: WclEvent[],
  resolvedAbilities: Map<number, ResolvedAbility>,
  naturesSwiftnessAbilityIds: Set<number>,
  afterTimestamp: number,
): NaturesSwiftnessFollowUp | null {
```

to:

```ts
export function findFollowUp(
  sortedDruidCasts: WclEvent[],
  resolvedAbilities: Map<number, ResolvedAbility>,
  naturesSwiftnessAbilityIds: Set<number>,
  afterTimestamp: number,
): NaturesSwiftnessFollowUp | null {
```

And inside its body, change the return statement from:

```ts
return {
  spell: resolved.spell,
  rank: resolved.rank,
  targetId: event.targetID,
};
```

to:

```ts
return {
  spell: resolved.spell,
  rank: resolved.rank,
  targetId: event.targetID,
  timestampMs: event.timestamp,
};
```

- [ ] **Step 2: Update `naturesSwiftnessAudit.test.ts`'s existing exact-equality assertions for the new field**

In `src/metrics/naturesSwiftnessAudit.test.ts`, update each `toEqual` block that checks a `followUp` shape to include `timestampMs`:

Line ~51-53 (inside "matches a Nature's Swiftness cast to the next tracked healing spell cast"):

```ts
expect(result.casts).toEqual([
  {
    timestampMs: 1000,
    followUp: {
      spell: "Healing Touch",
      rank: 8,
      targetId: 50,
      timestampMs: 1500,
    },
  },
]);
```

Line ~73-77 (inside "skips a consumable cast between Nature's Swiftness and the real follow-up spell"):

```ts
expect(result.casts[0].followUp).toEqual({
  spell: "Healing Touch",
  rank: 8,
  targetId: 50,
  timestampMs: 1500,
});
```

Lines ~113-122 (inside "matches each of two Nature's Swiftness casts to its own nearest following heal"):

```ts
expect(result.casts[0].followUp).toEqual({
  spell: "Healing Touch",
  rank: 8,
  targetId: 50,
  timestampMs: 1500,
});
expect(result.casts[1].followUp).toEqual({
  spell: "Regrowth",
  rank: 10,
  targetId: 60,
  timestampMs: 100500,
});
```

- [ ] **Step 3: Run the updated tests to verify they still pass**

Run: `npm test -- naturesSwiftnessAudit.test.ts`
Expected: PASS (this step only adds a field to existing assertions, no behavior change).

- [ ] **Step 4: Write the failing test for the Nature's Swiftness clear-save combo**

Add to `src/metrics/nearDeathResponse.test.ts`, in a new `describe` block for the clear-save additions (add near the end of the file, before the final closing of the top-level `describe`):

```ts
describe("computeNearDeathResponse clear-save detection", () => {
  const RESOLVED_ABILITIES: Map<number, ResolvedAbility> = new Map([
    [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
    [HEALING_TOUCH_ID, { kind: "spell", spell: "Healing Touch", rank: 8 }],
    [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
  ]);

  it("flags a clear save when Nature's Swiftness is immediately followed by Healing Touch on the crisis target", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 12 }),
    ];
    const healingEvents = [
      aHealEvent({ timestamp: 11500, targetID: 50, hitPoints: 40 }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 11000,
        sourceID: DRUID_ID,
        targetID: -1,
        abilityGameID: 17116,
      }),
      aCastEvent({
        timestamp: 11500,
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
      RESOLVED_ABILITIES,
    );

    expect(result.crises[0].judgement).toBe("good");
    expect(result.crises[0].clearSave).toBe(true);
    expect(result.crises[0].saveKind).toBe("natures-swiftness-combo");
  });

  it("does not flag a clear save for a plain reactive heal with no preceding Nature's Swiftness", () => {
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
      RESOLVED_ABILITIES,
    );

    expect(result.crises[0].judgement).toBe("good");
    expect(result.crises[0].clearSave).toBe(false);
    expect(result.crises[0].saveKind).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- nearDeathResponse.test.ts`
Expected: FAIL with a TypeScript/argument-count error (new params don't exist yet) or `clearSave`/`saveKind` undefined.

- [ ] **Step 6: Implement Nature's Swiftness combo detection in `computeNearDeathResponse`**

In `src/metrics/nearDeathResponse.ts`, the existing import block already has `type ResolvedAbility` (it's already imported, unchanged -- no edit needed there). Add one new import line, right after the existing imports from `./deathForensics`:

```ts
import { findFollowUp } from "./naturesSwiftnessAudit";
```

Update the `CrisisEvent` interface (this replaces the version Task 1 left behind -- keep `judgedByReadyResource` from that task, don't drop it, and add the two new fields after `judgement`):

```ts
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
  judgedByReadyResource: boolean;
  clearSave: boolean;
  saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null;
}
```

Update the function signature (append exactly one new trailing parameter -- Task 3 will append two more after it, once they're used):

```ts
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
  resolvedAbilities: Map<number, ResolvedAbility> = new Map(),
): NearDeathResponseResult {
```

Give `resolvedAbilities` a default (`= new Map()`) rather than making it a plain required parameter. This is temporary scaffolding, not a permanent design choice: it's what lets the one pre-existing caller, `NearDeathResponseCard.tsx` (still passing the old 14-arg call until Task 4 rewires it), keep compiling across Tasks 2 and 3 without being touched early. `resolvedAbilities` is still used immediately below in this task -- the default only matters for callers that omit it, not for this task's own logic. Task 4 removes this default (and Task 3's, on its own two new params) once every call site passes real values explicitly.

Just before the `const crises: CrisisEvent[] = episodes.map(...)` line, add the Nature's Swiftness follow-up index (built once, reused per crisis):

```ts
const nsCastsWithFollowUp = nsCasts.map((nsCast) => ({
  timestampMs: nsCast.timestamp,
  followUp: findFollowUp(
    druidCasts,
    resolvedAbilities,
    naturesSwiftnessAbilityIds,
    nsCast.timestamp,
  ),
}));
```

Inside the `episodes.map` callback, after computing `responded` (from Task 1's version), add the combo detection and `saveKind`/`clearSave` fields. Replace:

```ts
    const judgement = !judged
      ? null
      : responded
        ? "good"
        : maintained || !hasClearAssignment
          ? judgeDeathReadiness(unspentCount)
          : "fair";

    return {
```

with:

```ts
    const judgement = !judged
      ? null
      : responded
        ? "good"
        : maintained || !hasClearAssignment
          ? judgeDeathReadiness(unspentCount)
          : "fair";

    // Story 1002: within an already-"good" (responded) crisis, distinguish
    // a clearly deliberate save from any other reactive heal landing. A
    // Nature's Swiftness cast makes the very next cast instant -- whatever
    // that next tracked healing spell is (per naturesSwiftnessAudit.ts's
    // own findFollowUp), if it's Healing Touch or Regrowth and it lands on
    // this crisis's target within this crisis's window, that's an
    // unambiguous burst save.
    let saveKind: CrisisEvent["saveKind"] = null;
    if (responded) {
      const nsComboMatch = nsCastsWithFollowUp.find(
        (entry) =>
          entry.followUp !== null &&
          entry.followUp.targetId === episode.targetId &&
          (entry.followUp.spell === "Healing Touch" ||
            entry.followUp.spell === "Regrowth") &&
          entry.followUp.timestampMs >= episode.timestampMs &&
          entry.followUp.timestampMs <= episode.windowEndMs,
      );
      if (nsComboMatch !== undefined) {
        saveKind = "natures-swiftness-combo";
      }
    }
    const clearSave = saveKind !== null;

    return {
```

And update the returned object to include the new fields (keep `judgedByReadyResource` from Task 1 -- only `clearSave`/`saveKind` are newly added here):

```ts
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
  judgedByReadyResource,
  clearSave,
  saveKind,
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- nearDeathResponse.test.ts && npm run typecheck`
Expected: both PASS. Because `resolvedAbilities` has a default value, `NearDeathResponseCard.tsx`'s existing 14-arg call to `computeNearDeathResponse` is still valid TypeScript (it simply omits the new optional trailing parameter) -- the whole project should typecheck cleanly at the end of this task, not just this one test file.

- [ ] **Step 8: Commit**

```bash
git add src/metrics/naturesSwiftnessAudit.ts src/metrics/naturesSwiftnessAudit.test.ts src/metrics/nearDeathResponse.ts src/metrics/nearDeathResponse.test.ts
git commit -m "feat(crisis-response): detect Nature's Swiftness clear-save combo"
```

---

## Task 3: Swiftmend "clear save" combo

**Files:**

- Modify: `src/metrics/swiftmendAudit.ts`
- Modify: `src/metrics/nearDeathResponse.ts`
- Test: `src/metrics/nearDeathResponse.test.ts`

**Interfaces:**

- Consumes: `swiftmendAudit.ts`'s private `trackHotRemovals`/`findConsumedHot` functions and `HotRemoval` interface (all exported this task).
- Produces: `saveKind` can now also be `"swiftmend-hot-consume"`. `computeNearDeathResponse` gains two more trailing parameters this task, `rejuvenationAbilityIds: Set<number> = new Set()` and `regrowthAbilityIds: Set<number> = new Set()` (appended after `resolvedAbilities`, both defaulted for the same reason `resolvedAbilities` was in Task 2 -- `NearDeathResponseCard.tsx` still hasn't been rewired yet).

- [ ] **Step 1: Export `HotRemoval`, `trackHotRemovals`, and `findConsumedHot` in `swiftmendAudit.ts`**

In `src/metrics/swiftmendAudit.ts`, change:

```ts
interface HotRemoval {
```

to:

```ts
export interface HotRemoval {
```

Change:

```ts
function trackHotRemovals(
```

to:

```ts
export function trackHotRemovals(
```

Change:

```ts
function findConsumedHot(
```

to:

```ts
export function findConsumedHot(
```

No other changes in this file -- these are pure visibility changes, no behavior change.

- [ ] **Step 2: Run swiftmendAudit tests to verify nothing broke**

Run: `npm test -- swiftmendAudit.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 3: Write the failing test for the Swiftmend clear-save combo**

Add to the `describe("computeNearDeathResponse clear-save detection", ...)` block added in Task 2, inside `src/metrics/nearDeathResponse.test.ts`:

```ts
it("flags a clear save when the reactive cast is a Swiftmend that consumed a Rejuvenation", () => {
  const REJUVENATION_ID = 774;
  const REGROWTH_ID = 26980;
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 12 }),
  ];
  const healingEvents = [
    aHealEvent({ timestamp: 10500, targetID: 50, hitPoints: 40 }),
  ];
  const buffEvents = [
    anApplyBuffEvent({
      timestamp: 5000,
      targetID: 50,
      abilityGameID: REJUVENATION_ID,
    }),
    aRemoveBuffEvent({
      timestamp: 10500,
      targetID: 50,
      abilityGameID: REJUVENATION_ID,
    }),
  ];
  const castEvents = [
    aCastEvent({
      timestamp: 10500,
      sourceID: DRUID_ID,
      targetID: 50,
      abilityGameID: 18562,
    }),
  ];

  const result = computeNearDeathResponse(
    damageEvents,
    healingEvents,
    [],
    castEvents,
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
    RESOLVED_ABILITIES,
    new Set([REJUVENATION_ID]),
    new Set([REGROWTH_ID]),
  );

  expect(result.crises[0].judgement).toBe("good");
  expect(result.crises[0].clearSave).toBe(true);
  expect(result.crises[0].saveKind).toBe("swiftmend-hot-consume");
});

it("does not flag a clear save when the reactive Swiftmend consumed a Regrowth instead of a Rejuvenation", () => {
  const REJUVENATION_ID = 774;
  const REGROWTH_ID = 26980;
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 12 }),
  ];
  const healingEvents = [
    aHealEvent({ timestamp: 10500, targetID: 50, hitPoints: 40 }),
  ];
  const buffEvents = [
    anApplyBuffEvent({
      timestamp: 5000,
      targetID: 50,
      abilityGameID: REGROWTH_ID,
    }),
    aRemoveBuffEvent({
      timestamp: 10500,
      targetID: 50,
      abilityGameID: REGROWTH_ID,
    }),
  ];
  const castEvents = [
    aCastEvent({
      timestamp: 10500,
      sourceID: DRUID_ID,
      targetID: 50,
      abilityGameID: 18562,
    }),
  ];

  const result = computeNearDeathResponse(
    damageEvents,
    healingEvents,
    [],
    castEvents,
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
    RESOLVED_ABILITIES,
    new Set([REJUVENATION_ID]),
    new Set([REGROWTH_ID]),
  );

  expect(result.crises[0].judgement).toBe("good");
  expect(result.crises[0].clearSave).toBe(false);
  expect(result.crises[0].saveKind).toBeNull();
});
```

Add `aRemoveBuffEvent` to the existing factory import at the top of the test file.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- nearDeathResponse.test.ts`
Expected: FAIL (`saveKind` stays `null`/`natures-swiftness-combo` logic doesn't cover Swiftmend yet).

- [ ] **Step 5: Implement Swiftmend combo detection in `computeNearDeathResponse`**

In `src/metrics/nearDeathResponse.ts`, add to the import from `./swiftmendAudit`:

```ts
import {
  SWIFTMEND_COOLDOWN_MS,
  trackHotRemovals,
  findConsumedHot,
} from "./swiftmendAudit";
```

Update the function signature to append the two new parameters after `resolvedAbilities`, each defaulted for the same reason `resolvedAbilities` was in Task 2:

```ts
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
  resolvedAbilities: Map<number, ResolvedAbility> = new Map(),
  rejuvenationAbilityIds: Set<number> = new Set(),
  regrowthAbilityIds: Set<number> = new Set(),
): NearDeathResponseResult {
```

Just after the `nsCastsWithFollowUp` block added in Task 2, add:

```ts
const hotRemovals = trackHotRemovals(
  buffEvents,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
);
```

Inside the `episodes.map` callback, extend the `saveKind` block (added in Task 2) with the Swiftmend branch. Replace:

```ts
let saveKind: CrisisEvent["saveKind"] = null;
if (responded) {
  const nsComboMatch = nsCastsWithFollowUp.find(
    (entry) =>
      entry.followUp !== null &&
      entry.followUp.targetId === episode.targetId &&
      (entry.followUp.spell === "Healing Touch" ||
        entry.followUp.spell === "Regrowth") &&
      entry.followUp.timestampMs >= episode.timestampMs &&
      entry.followUp.timestampMs <= episode.windowEndMs,
  );
  if (nsComboMatch !== undefined) {
    saveKind = "natures-swiftness-combo";
  }
}
const clearSave = saveKind !== null;
```

with:

```ts
let saveKind: CrisisEvent["saveKind"] = null;
if (responded) {
  const nsComboMatch = nsCastsWithFollowUp.find(
    (entry) =>
      entry.followUp !== null &&
      entry.followUp.targetId === episode.targetId &&
      (entry.followUp.spell === "Healing Touch" ||
        entry.followUp.spell === "Regrowth") &&
      entry.followUp.timestampMs >= episode.timestampMs &&
      entry.followUp.timestampMs <= episode.windowEndMs,
  );
  if (nsComboMatch !== undefined) {
    saveKind = "natures-swiftness-combo";
  } else {
    // The reactive cast is the earliest of the druid's own healing
    // casts that landed on this target inside the crisis window --
    // same cast `responded` above already confirmed exists.
    const respondingCast = druidCasts.find(
      (cast) =>
        cast.targetID === episode.targetId &&
        healingAbilityIds.has(cast.abilityGameID as number) &&
        cast.timestamp >= episode.timestampMs &&
        cast.timestamp <= episode.windowEndMs,
    );
    if (
      respondingCast !== undefined &&
      swiftmendAbilityIds.has(respondingCast.abilityGameID as number)
    ) {
      const consumed = findConsumedHot(
        hotRemovals,
        episode.targetId,
        respondingCast.timestamp,
      );
      if (consumed?.spell === "Rejuvenation") {
        saveKind = "swiftmend-hot-consume";
      }
    }
  }
}
const clearSave = saveKind !== null;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- nearDeathResponse.test.ts`
Expected: PASS, all tests in the file including both new Swiftmend combo tests.

- [ ] **Step 7: Run full unit suite and full-project typecheck**

Run: `npm test -- nearDeathResponse.test.ts naturesSwiftnessAudit.test.ts swiftmendAudit.test.ts && npm run typecheck`
Expected: both PASS. `NearDeathResponseCard.tsx`'s existing call still compiles unchanged, since all 3 new parameters are optional with defaults at this point.

- [ ] **Step 8: Commit**

```bash
git add src/metrics/swiftmendAudit.ts src/metrics/nearDeathResponse.ts src/metrics/nearDeathResponse.test.ts
git commit -m "feat(crisis-response): detect Swiftmend clear-save combo"
```

---

## Task 4: Thread new fields through the UI

**Files:**

- Modify: `src/app/components/NearDeathResponseCard/index.tsx`
- Modify: `src/app/components/NearDeathResponseCard/index.test.tsx`
- Modify: `src/app/components/NearDeathResponseContent/index.tsx`
- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/ui/CrisisCard/index.tsx`
- Modify: `src/app/components/ui/CrisisCard/index.test.tsx`
- Modify: `src/app/components/ui/CrisisCard/index.module.css`

**Interfaces:**

- Consumes: `computeNearDeathResponse`'s final signature from Task 3 (14 original params + `resolvedAbilities`, `rejuvenationAbilityIds`, `regrowthAbilityIds`, all still defaulted/optional at the start of this task).
- Produces: `CrisisCardProps` gains `clearSave: boolean` and `saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null`, rendering a distinct badge when `clearSave` is true. By the end of this task, `computeNearDeathResponse`'s three new parameters are tightened back to required (no more defaults), since every call site now passes them explicitly.

- [ ] **Step 1: Write the failing `CrisisCard` test for the clear-save badge**

`src/app/components/ui/CrisisCard/index.test.tsx` currently has exactly 3 tests, each inlining its own `<CrisisCard ... />` props (no shared factory). First, add `clearSave={false}` and `saveKind={null}` to each of the 3 existing render calls (after the `judgement={...}` prop in each), since these are now required props:

```tsx
        judgement="fair"
        clearSave={false}
        saveKind={null}
      />,
```

(apply the same two lines, in the same position, to all 3 existing `render(<CrisisCard ...>)` calls -- their `judgement` prop values are `"fair"`, `null`, and `"good"` respectively; only the two new lines are added underneath each).

Then add 3 new tests inside the same `describe("CrisisCard", ...)` block, after the existing 3:

```ts
  it("shows a distinct badge for a clear-save Nature's Swiftness combo", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={true}
        saveKind="natures-swiftness-combo"
      />,
    );

    expect(screen.getByText(/Clear save/)).toBeInTheDocument();
    expect(screen.getByText(/Nature's Swiftness/)).toBeInTheDocument();
  });

  it("shows a distinct badge for a clear-save Swiftmend combo", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={true}
        saveKind="swiftmend-hot-consume"
      />,
    );

    expect(screen.getByText(/Clear save/)).toBeInTheDocument();
    expect(screen.getByText(/Swiftmend/)).toBeInTheDocument();
  });

  it("shows no clear-save badge for a plain responded crisis", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
      />,
    );

    expect(screen.queryByText(/Clear save/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CrisisCard`
Expected: FAIL (props don't exist on `CrisisCardProps` yet; TypeScript error).

- [ ] **Step 3: Implement the badge in `CrisisCard`**

In `src/app/components/ui/CrisisCard/index.tsx`, update the props interface:

```ts
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
  hasSwiftmend: boolean;
  hasNaturesSwiftness: boolean;
  judgement: Judgement | null;
  clearSave: boolean;
  saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null;
}
```

Add a label lookup above the component:

```ts
const CLEAR_SAVE_LABELS: Record<
  "natures-swiftness-combo" | "swiftmend-hot-consume",
  string
> = {
  "natures-swiftness-combo": "Clear save: Nature's Swiftness into a heal",
  "swiftmend-hot-consume": "Clear save: Swiftmend consumed a Rejuvenation",
};
```

Update the function signature to destructure the new props:

```ts
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
  hasSwiftmend,
  hasNaturesSwiftness,
  judgement,
  clearSave,
  saveKind,
}: CrisisCardProps) {
```

In the JSX, add the badge right after the header `div` (before `<div className={styles.grid}>`):

```tsx
      {clearSave && saveKind !== null && (
        <div className={styles.clearSave}>{CLEAR_SAVE_LABELS[saveKind]}</div>
      )}
      <div className={styles.grid}>
```

Add a small style to `src/app/components/ui/CrisisCard/index.module.css` (append at the end of the file -- read it first for the existing token conventions, e.g. `--space-*`/`--color-*` vars used elsewhere in the file, and match them):

```css
.clearSave {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  color: var(--judgement-good);
  margin-top: var(--space-2, 0.5rem);
}
```

(If `--font-size-sm` isn't an existing token in this codebase, drop that line and match whichever small-text convention the rest of this CSS module already uses.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- CrisisCard`
Expected: PASS.

- [ ] **Step 5: Thread the fields through `NearDeathResponseCard`**

In `src/app/components/NearDeathResponseCard/index.tsx`:

Add imports:

```ts
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
```

Update `NearDeathResponseCardProps` to add three new required props:

```ts
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
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
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

Update the destructured props in the component signature to include `rejuvenationAbilityIds, regrowthAbilityIds, resolvedAbilities`, and update the `computeNearDeathResponse` call inside the `useEffect` to pass them as the 3 new trailing args:

```ts
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
  hasSwiftmend,
  hasNaturesSwiftness,
  fight.startTime,
  fight.endTime,
  resolvedAbilities,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
);
```

Add `resolvedAbilities, rejuvenationAbilityIds, regrowthAbilityIds` to the `useEffect`'s dependency array too.

Now that this is the one and only call site and it passes all three new arguments explicitly, tighten `computeNearDeathResponse`'s signature in `src/metrics/nearDeathResponse.ts` back to fully required parameters (remove the `= new Map()`/`= new Set()` defaults added in Tasks 2 and 3 as temporary scaffolding):

```ts
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
  resolvedAbilities: Map<number, ResolvedAbility>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): NearDeathResponseResult {
```

Every existing call site (the card, updated above; the test file, updated in Tasks 2/3, already passes all three explicitly) keeps compiling unchanged -- only callers relying on the now-removed defaults would break, and there are none.

In the JSX where `<CrisisCard ... />` is rendered, add the two new props:

```tsx
              hasSwiftmend={hasSwiftmend}
              hasNaturesSwiftness={hasNaturesSwiftness}
              judgement={crisis.judgement}
              clearSave={crisis.clearSave}
              saveKind={crisis.saveKind}
```

Update the `THRESHOLD` constant to describe the full refined matrix:

```ts
const THRESHOLD =
  "A crisis is a raider's HP dropping to <=15% (provisional) and surviving. The response window runs from that reading until HP recovers, the target dies (excluded; tracked separately under Death forensics), or the fight ends. Good if you landed a new reactive healing cast in that window, with a distinct \"clear save\" callout for an unambiguous burst save (Nature's Swiftness into Healing Touch or Regrowth, or a Swiftmend that consumed a Rejuvenation). Otherwise, on a maintained target (or with no clear tank assignment) good/fair/bad comes from the same unspent-resource tally used in Death forensics (Swiftmend ready / Nature's Swiftness ready / a GCD available). A crisis on a target you're not maintaining reads fair when a resource was ready to help even though it wasn't your assignment, and stays context only otherwise.";
```

- [ ] **Step 6: Update `NearDeathResponseCard`'s existing tests for the new required props**

In `src/app/components/NearDeathResponseCard/index.test.tsx`, add to every existing `<NearDeathResponseCard ... />` render call (all 5 of them):

```tsx
        rejuvenationAbilityIds={new Set([774])}
        regrowthAbilityIds={new Set([8936])}
        resolvedAbilities={new Map()}
```

(placed anywhere among the other props -- order doesn't matter for JSX props). An empty `resolvedAbilities` map means no NS-combo will ever match in these existing tests, which is correct -- they aren't testing that behavior.

- [ ] **Step 7: Run the card test to verify it passes**

Run: `npm test -- NearDeathResponseCard`
Expected: PASS.

- [ ] **Step 8: Thread the fields through `NearDeathResponseContent`**

In `src/app/components/NearDeathResponseContent/index.tsx`, add the same 3 props to `NearDeathResponseContentProps` and pass them through to `<NearDeathResponseCard />`:

```ts
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";

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
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
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

Update the destructuring and the `<NearDeathResponseCard ... />` call inside the component body to thread the 3 new props through, following the exact same pattern as the existing `swiftmendAbilityIds` prop.

- [ ] **Step 9: Wire it up from `Scorecard`**

In `src/app/components/Scorecard/index.tsx`, `rejuvenationAbilityIds`, `regrowthAbilityIds`, and `resolvedAbilities` are already available as props/destructured values (used by other cards). Update the `<NearDeathResponseContent ... />` call (around line 551-563) to add:

```tsx
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
  rejuvenationAbilityIds={rejuvenationAbilityIds}
  regrowthAbilityIds={regrowthAbilityIds}
  resolvedAbilities={resolvedAbilities}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 10: Run the full component test suite and full typecheck**

Run: `npm run typecheck && npm test -- NearDeathResponseCard NearDeathResponseContent Scorecard CrisisCard`
Expected: PASS, no type errors anywhere in `src/`.

- [ ] **Step 11: Commit**

```bash
git add src/app/components/NearDeathResponseCard src/app/components/NearDeathResponseContent src/app/components/Scorecard/index.tsx src/app/components/ui/CrisisCard
git commit -m "feat(crisis-response): show a distinct clear-save badge on the crisis card"
```

---

## Task 5: Wire crisis response into calibration tooling

**Files:**

- Modify: `scripts/lib/types.ts`
- Modify: `scripts/lib/calibrateReport.ts`
- Modify: `scripts/lib/rollup.ts`
- Modify: `scripts/lib/rollup.test.ts`

**Interfaces:**

- Consumes: `computeNearDeathResponse`'s final signature, `summarizeNearDeathResponse` (`src/metrics/epicSummary.ts`, already exists), `getHealingAbilityIds` (`src/metrics/nearDeathResponse.ts`, already exported).
- Produces: `FightResult.epics.crisisResponse: EpicResult<CrisisResponseMetrics>`, `DruidRollup.crisisResponse: CrisisResponseRollup`. Additive only -- no existing calibration field renamed or removed.

- [ ] **Step 1: Add the new types to `scripts/lib/types.ts`**

Add the import:

```ts
import type { NearDeathResponseResult } from "../../src/metrics/nearDeathResponse";
```

Add after `PrepHygieneMetrics`:

```ts
export interface CrisisResponseMetrics {
  nearDeathResponse: NearDeathResponseResult;
}
```

Add `crisisResponse` to `FightResult.epics`:

```ts
epics: {
  gcdEconomy: EpicResult<GcdEconomyMetrics>;
  lifebloomDiscipline: EpicResult<LifebloomDisciplineMetrics>;
  spellDiscipline: EpicResult<SpellDisciplineMetrics>;
  manaEconomy: EpicResult<ManaEconomyMetrics>;
  deathForensics: EpicResult<DeathForensicsMetrics>;
  crisisResponse: EpicResult<CrisisResponseMetrics>;
  prepHygiene: EpicResult<PrepHygieneMetrics>;
}
```

Add after `DeathForensicsRollup`:

```ts
export interface CrisisResponseRollup extends EpicRollupBase {
  crisesTotal: number;
  flaggedTotal: number;
  clearSaveTotal: number;
  fairUnmaintainedTotal: number;
}
```

Add `crisisResponse` to `DruidRollup`:

```ts
export interface DruidRollup {
  gcdEconomy: GcdEconomyRollup;
  lifebloomDiscipline: LifebloomDisciplineRollup;
  spellDiscipline: SpellDisciplineRollup;
  manaEconomy: ManaEconomyRollup;
  deathForensics: DeathForensicsRollup;
  crisisResponse: CrisisResponseRollup;
  prepHygiene: PrepHygieneRollup;
}
```

- [ ] **Step 2: Wire it into `scripts/lib/calibrateReport.ts`**

Add imports:

```ts
import {
  computeNearDeathResponse,
  getHealingAbilityIds,
} from "../../src/metrics/nearDeathResponse";
import { summarizeNearDeathResponse } from "../../src/metrics/epicSummary";
import type { CrisisResponseMetrics } from "./types";
```

In `ReportContext`, add a `healingAbilityIds` field:

```ts
export interface ReportContext {
  accessToken: string;
  reportCode: string;
  reportTitle: string;
  nonTrashFights: { fight: Fight; pullNumber: number | null }[];
  candidates: DruidCandidate[];
  resolvedAbilities: Map<number, ResolvedAbility>;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  healingAbilityIds: Set<number>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReturnType<typeof createEventFetcher>["fetchEvents"];
  fetchLookbackEvents: ReturnType<
    typeof createEventFetcher
  >["fetchLookbackEvents"];
}
```

In `buildReportContext`'s returned object, add:

```ts
    healingAbilityIds: getHealingAbilityIds(resolvedAbilities),
```

(placed right after `naturesSwiftnessAbilityIds: ...,`).

In `computeFightResult`, add `DamageTaken` to the `Promise.all` fetch (it's the one event type crisis response needs that isn't already fetched):

```ts
const [
  buffEvents,
  castEvents,
  healingEvents,
  deathEvents,
  combatantInfoEvents,
  damageEvents,
] = await Promise.all([
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "Buffs",
  ),
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "Casts",
    true,
  ),
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "Healing",
    true,
  ),
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "Deaths",
  ),
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "CombatantInfo",
  ),
  ctx.fetchEvents(
    ctx.accessToken,
    ctx.reportCode,
    { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
    "DamageTaken",
    true,
  ),
]);
```

Add the `crisisResponse` epic, right after the existing `deathForensics` block and before `prepHygiene`:

```ts
const crisisResponse = toEpicResult<CrisisResponseMetrics>(() => {
  const result = computeNearDeathResponse(
    damageEvents,
    healingEvents,
    deathEvents,
    castEvents,
    buffEvents,
    druidId,
    ctx.healingAbilityIds,
    ctx.swiftmendAbilityIds,
    ctx.naturesSwiftnessAbilityIds,
    ctx.lifebloomAbilityIds,
    hasSwiftmend,
    hasNaturesSwiftness,
    fight.startTime,
    fight.endTime,
    ctx.resolvedAbilities,
    ctx.rejuvenationAbilityIds,
    ctx.regrowthAbilityIds,
  );
  return {
    summary: summarizeNearDeathResponse(result),
    metrics: { nearDeathResponse: result },
  };
});
```

Add `crisisResponse` to the final returned `epics` object:

```ts
    epics: {
      gcdEconomy,
      lifebloomDiscipline,
      spellDiscipline,
      manaEconomy,
      deathForensics,
      crisisResponse,
      prepHygiene,
    },
```

- [ ] **Step 3: Wire it into `scripts/lib/rollup.ts`**

Add to the type import:

```ts
  CrisisResponseMetrics,
  CrisisResponseRollup,
```

After the "Death forensics" block and before "Prep hygiene", add:

```ts
// --- Crisis response ---
const crisisReady = readyEntries<CrisisResponseMetrics>(
  fights,
  (f) => f.epics.crisisResponse,
);
let crisesTotal = 0;
let crisisFlaggedTotal = 0;
let clearSaveTotal = 0;
let fairUnmaintainedTotal = 0;
for (const entry of crisisReady) {
  const { crises, flaggedCount } = entry.metrics.nearDeathResponse;
  crisesTotal += crises.length;
  crisisFlaggedTotal += flaggedCount;
  for (const crisis of crises) {
    if (crisis.clearSave) clearSaveTotal += 1;
    if (crisis.judgedByReadyResource) fairUnmaintainedTotal += 1;
  }
}
const crisisResponse: CrisisResponseRollup = {
  ...epicRollupBase(fights.length, crisisReady),
  crisesTotal,
  flaggedTotal: crisisFlaggedTotal,
  clearSaveTotal,
  fairUnmaintainedTotal,
};
```

Add `crisisResponse` to the final returned object at the end of `rollupDruid`:

```ts
return {
  gcdEconomy,
  lifebloomDiscipline,
  spellDiscipline,
  manaEconomy,
  deathForensics,
  crisisResponse,
  prepHygiene,
};
```

- [ ] **Step 4: Update `scripts/lib/rollup.test.ts`'s fixtures**

Add `crisisResponse: erroredEpic()` to both the `erroredEpic()`-based full-epics object inside `aFightResult` (around line 55) and anywhere else a full `FightResult.epics` object literal is constructed (there's only the one spot per the earlier file scan) -- add it right after `deathForensics: erroredEpic(),`:

```ts
    epics: {
      gcdEconomy: readyGcd(gcdJudgement, durationMs),
      lifebloomDiscipline: erroredEpic(),
      spellDiscipline: erroredEpic(),
      manaEconomy: erroredEpic(),
      deathForensics: erroredEpic(),
      crisisResponse: erroredEpic(),
      prepHygiene: erroredEpic(),
    },
```

Add a new test asserting the rollup's basic shape when no fights are ready (mirroring the existing "returns a null judgement..." test, but for the new epic):

```ts
it("rolls up crisis response with all-zero totals when no fights are ready", () => {
  const rollup = rollupDruid([]);
  expect(rollup.crisisResponse.judgement).toBeNull();
  expect(rollup.crisisResponse.crisesTotal).toBe(0);
  expect(rollup.crisisResponse.flaggedTotal).toBe(0);
  expect(rollup.crisisResponse.clearSaveTotal).toBe(0);
  expect(rollup.crisisResponse.fairUnmaintainedTotal).toBe(0);
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- rollup.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors anywhere in `src/` or `scripts/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts scripts/lib/rollup.ts scripts/lib/rollup.test.ts
git commit -m "feat(calibrate): wire crisis response into calibration output"
```

---

## Task 6: Real-corpus research pass and documentation

**Files:**

- Create (temporary, deleted at the end of this task): `scripts/_research-crisis-corpus.ts`
- Modify: `docs/thresholds.md`
- Modify: `src/metrics/nearDeathResponse.ts` (comments only)
- Modify: `docs/testing.md` (if a new report needs adding to the known-reports table -- unlikely, since the corpus is already-known reports, only add if a genuinely new distinguishing fact is confirmed)

**Interfaces:** None -- this task produces documentation and code comments backed by real data, no functional code changes.

- [ ] **Step 1: Write the temporary batch research script**

Create `scripts/_research-crisis-corpus.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadAccessToken } from "./lib/env";
import { calibrateReport } from "./lib/calibrateReport";
import { subscribeRateLimitUsage } from "../src/wcl/rateLimitUsage";
import type { Host } from "../src/wcl/client";

const BATCH_SIZE = 10;

async function main(): Promise<void> {
  const accessToken = loadAccessToken();
  const dir = path.resolve(process.cwd(), "calibration-data");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));

  const entries: { code: string; host: Host }[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    const code = file.replace(/\.json$/, "");
    const host: Host = raw.source ?? "fresh";
    entries.push({ code, host });
  }

  let unsub = subscribeRateLimitUsage((usage) => {
    const pct = (usage.pointsSpentThisHour / usage.limitPerHour) * 100;
    console.log(
      `  rate limit: ${usage.pointsSpentThisHour}/${usage.limitPerHour} (${pct.toFixed(1)}%)`,
    );
  });

  const findings: {
    code: string;
    fightId: number;
    targetId: number;
    timestampMs: number;
    kind: string;
  }[] = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    console.log(
      `Batch ${i / BATCH_SIZE + 1}: ${batch.map((e) => e.code).join(", ")}`,
    );
    for (const { code, host } of batch) {
      try {
        const output = await calibrateReport(accessToken, code, host);
        for (const druid of output.druids) {
          for (const fight of druid.fights) {
            const epic = fight.epics.crisisResponse;
            if (epic.status !== "ready") continue;
            for (const crisis of epic.metrics.nearDeathResponse.crises) {
              if (crisis.clearSave) {
                findings.push({
                  code,
                  fightId: fight.fightId,
                  targetId: crisis.targetId,
                  timestampMs: crisis.timestampMs,
                  kind: `clearSave:${crisis.saveKind}`,
                });
              }
              if (crisis.judgedByReadyResource) {
                findings.push({
                  code,
                  fightId: fight.fightId,
                  targetId: crisis.targetId,
                  timestampMs: crisis.timestampMs,
                  kind: "fairUnmaintained",
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`  ${code} failed:`, err);
      }
    }
  }

  unsub();
  console.log(JSON.stringify(findings, null, 2));
  console.log(`Total findings: ${findings.length}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script in the background, watching rate-limit output**

Run: `npx tsx scripts/_research-crisis-corpus.ts > /tmp/crisis-research-output.json 2>&1`

This re-fetches all ~123 reports in `calibration-data/` from WCL (batches of 10, per `BATCH_SIZE`), overwriting each report's `.json` file with the new `crisisResponse` epic included, and logs rate-limit usage after every report plus a final JSON array of every clear-save/fair-unmaintained crisis found, with its report code/fight/target/timestamp. Given the user's confirmed large WCL rate-limit budget, this should run to completion unattended; watch the tail of the log for any `rate limit` line approaching 90% and pause if so (there is no automatic pause built into the script -- if usage is trending high, stop the process with Ctrl-C and resume later by re-running it, since it's idempotent per-report).

- [ ] **Step 3: Inspect the findings**

Read the findings JSON at the end of the script's output. For each `saveKind`, confirm at least one real example exists; note its `code`/`fightId`/`targetId`/`timestampMs` for citation. Separately, grep the regenerated `calibration-data/*.json` files for `"clearSave": true` crises whose `saveKind` came back `null` under any hypothetical extra pattern -- there shouldn't be any, since `saveKind` is only ever set alongside `clearSave`; this is really about eyeballing whether `responded && !clearSave` crises (a plain heal landing, not a recognized combo) show any other extremely common single pattern worth a 3rd `saveKind`. If the two named combos already cover the overwhelming majority of "clear" cases found, no 3rd combo needs adding -- this is a judgment call, use the actual counts.

If a named combo (`natures-swiftness-combo` or `swiftmend-hot-consume`) turns up zero real hits anywhere in the corpus, stop and flag this to the user rather than fabricating a citation or silently proceeding -- it may mean the corpus is too narrow for that particular pattern, not that the logic is wrong.

- [ ] **Step 4: Delete the temporary script**

```bash
rm scripts/_research-crisis-corpus.ts
```

- [ ] **Step 5: Update code comments in `nearDeathResponse.ts` with real citations**

Using the real examples found in Step 3, update the comment above the `saveKind` detection block (added in Tasks 2/3) to cite one real example per combo, following this repo's existing citation style (see `CRISIS_THRESHOLD_PCT`'s own comment at the top of the file for the pattern). Example shape (fill in the actual report/fight/target/timestamp found):

```ts
// Story 1002: within an already-"good" (responded) crisis, distinguish
// a clearly deliberate save from any other reactive heal landing. A
// Nature's Swiftness cast makes the very next cast instant -- whatever
// that next tracked healing spell is (per naturesSwiftnessAudit.ts's
// own findFollowUp), if it's Healing Touch or Regrowth and it lands on
// this crisis's target within this crisis's window, that's an
// unambiguous burst save. Real example: report <CODE>, fight <ID>,
// target <TARGET_ID>, crisis at <TIMESTAMP>.
```

- [ ] **Step 6: Rewrite `docs/thresholds.md`'s Crisis response section**

Replace the existing table row(s) under `## Crisis response (epic J)` with the fuller matrix, and add a dated calibration-review paragraph citing the real findings from Step 3:

```markdown
## Crisis response (epic J)

| Metric                   | Threshold                                | Current default                                                                                                                                                                                                           | Source                         | Code                                                                                                                |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Crisis threshold         | HP% at or below counts as a crisis       | 15% (provisional, not yet calibrated against real exemplar data)                                                                                                                                                          | story 1001                     | `src/metrics/nearDeathResponse.ts` (`CRISIS_THRESHOLD_PCT`)                                                         |
| Crisis response          | good / fair / bad                        | responded (good) / else, on a maintained target or with no clear tank assignment: 0/1/>=2 unspent resources; on an unmaintained target with a clear assignment elsewhere: fair if a resource was ready, else context only | story 1001, revised story 1002 | `src/metrics/nearDeathResponse.ts` (`computeNearDeathResponse`, reuses `deathForensics.ts`'s `judgeDeathReadiness`) |
| Clear save (within good) | flagged, not a separate judgement bucket | Nature's Swiftness immediately followed by Healing Touch or Regrowth on the crisis target, or a reactive Swiftmend that consumed a Rejuvenation                                                                           | story 1002                     | `src/metrics/nearDeathResponse.ts` (`CrisisEvent.clearSave`/`.saveKind`)                                            |

**Calibration review, story 1002 (<DATE>):** confirmed against the local calibration corpus (~123 reports, re-run via `scripts/lib/calibrateReport.ts`'s new `crisisResponse` epic). <Fill in with the real counts found in Step 3: e.g. "N real Nature's Swiftness combo saves and M real Swiftmend-consumed-Rejuvenation saves found across the corpus, citing report <CODE> fight <ID> target <TARGET_ID> at <TIMESTAMP> as the representative example for each." Also state whether any additional recurring combo was considered and rejected, or state there wasn't one.> The new unmaintained-but-ready "fair" tier occurred in <COUNT> crises across the corpus, confirming it's a real, non-degenerate case worth surfacing rather than a hypothetical.
```

(Use today's actual date for `<DATE>`, matching every other dated calibration-review paragraph in this file.)

- [ ] **Step 7: Run full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/thresholds.md src/metrics/nearDeathResponse.ts calibration-data
git commit -m "docs(crisis-response): cite real corpus examples for the refined judgement matrix"
```

(`calibration-data/` is gitignored -- if `git add` reports nothing staged for it, that's expected; only `docs/thresholds.md` and `src/metrics/nearDeathResponse.ts` will actually be committed.)

---

## Task 7: Final verification and paperwork retirement

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/crisis-response-judgement-refinement-design.md`
- Delete: `docs/plans/crisis-response-judgement-refinement-plan.md`

**Interfaces:** None.

- [ ] **Step 1: Run the full test suite and static analysis one more time**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Grep for any remaining reference to the spec/plan file paths**

Run: `grep -rn "crisis-response-judgement-refinement" docs/ src/ scripts/ CLAUDE.md`
Expected: only the two doc files themselves (about to be deleted) and possibly this plan's own commit messages in git history (not a live reference). Fix any other dangling reference found before deleting.

- [ ] **Step 3: Mark story 1002 done in `docs/backlog.md`**

Find the `### 1002 — Refine crisis response's good/fair judgement criteria 🔲 Todo` heading and change it to:

```markdown
### 1002 — Refine crisis response's good/fair judgement criteria ✅ Done
```

- [ ] **Step 4: Delete the retired spec and plan**

```bash
rm docs/specs/crisis-response-judgement-refinement-design.md
rm docs/plans/crisis-response-judgement-refinement-plan.md
```

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md
git commit -m "docs(judgements): mark story 1002 done, retire its spec/plan"
```
