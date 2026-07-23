# Anticipatory HoT Prep (Backlog Story 1003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit a HoT (Lifebloom at any stack count, Rejuvenation, or Regrowth) already active on a target _before_ a near-death crisis opens as anticipatory prep, closing the gap where a fully anticipated hit that needed no follow-up cast during the crisis window currently scores as if nothing had been done.

**Architecture:** `computeNearDeathResponse` (`src/metrics/nearDeathResponse.ts`) gains a `prepped` boolean per crisis episode, derived from data it already receives (the Lifebloom timelines it already reconstructs, plus the same buff events/duration constants `swiftmendAudit.ts` already uses for Rejuvenation/Regrowth expiry tracking). No new WCL query, no new function parameters. `prepped` feeds the existing `judged`/`judgement` derivation the same way story 1002's `judgedByReadyResource` already does for the "resource was ready" tier, and is surfaced on `NearDeathResponseCard`/`CrisisCard` next to the existing clear-save badge.

**Tech Stack:** TypeScript, Vitest, React, existing `src/metrics/*` pure-function conventions.

## Global Constraints

- No spell/ability IDs may be hardcoded; this story reuses ability-ID sets already threaded into `computeNearDeathResponse` (`lifebloomAbilityIds`, `rejuvenationAbilityIds`, `regrowthAbilityIds`) — no new resolution needed.
- No em dashes in user-facing text (card copy, threshold explainer). Code comments and this plan are unaffected.
- No internal vocabulary ("story", "epic", story numbers) in user-facing copy (card text, `docs/thresholds.md` is fine since it's a docs file, not user-facing).
- `npm run typecheck`, `npm run lint`, and `npm run format:check` must pass before every commit (pre-commit hook already enforces this).
- Every `compute*` signature change must be checked against both consumers per `CLAUDE.md` — not applicable here since this story adds no new parameters, only new fields on the existing return type, but every existing call site/test constructing a literal `CrisisEvent`-shaped object must still compile.

---

## Task 1: Core `prepped` signal in `computeNearDeathResponse`

**Files:**

- Modify: `src/metrics/nearDeathResponse.ts`
- Test: `src/metrics/nearDeathResponse.test.ts`
- Modify: `src/metrics/epicSummary.test.ts` (one literal `CrisisEvent` fixture needs the two new fields)

**Interfaces:**

- Produces: `CrisisEvent.prepped: boolean`, `CrisisEvent.judgedByPreppedElsewhere: boolean` — consumed by Task 2 (calibration pooling) and Task 3/4 (UI).

- [ ] **Step 1: Write the failing tests**

Add these five tests to `src/metrics/nearDeathResponse.test.ts`, inside the existing `describe("computeNearDeathResponse", ...)` block (after the last test, "produces two separate crisis episodes...", before that block's own closing `});` at line 620):

```ts
it("judges good when the target was already prepped, even with no reactive cast in the crisis window", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 8000, targetID: 50, abilityGameID: 33763 }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
    aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
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
    new Map(),
    new Set(),
    new Set(),
  );

  expect(result.crises[0].prepped).toBe(true);
  expect(result.crises[0].responded).toBe(false);
  expect(result.crises[0].judgement).toBe("good");
});

it("credits a Rejuvenation already ticking before the crisis as prepped", () => {
  const REJUVENATION_ID = 774;
  const buffEvents = [
    anApplyBuffEvent({
      timestamp: 9000,
      targetID: 50,
      abilityGameID: REJUVENATION_ID,
    }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
    aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
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
    new Map(),
    new Set([REJUVENATION_ID]),
    new Set(),
  );

  expect(result.crises[0].prepped).toBe(true);
  expect(result.crises[0].judgement).toBe("good");
});

it("does not credit a HoT applied only after the crisis opens as prepped", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 10500, targetID: 50, abilityGameID: 33763 }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
    aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
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
    new Map(),
    new Set(),
    new Set(),
  );

  expect(result.crises[0].prepped).toBe(false);
});

it("tracks prepped and responded independently when both occur for the same crisis", () => {
  const buffEvents = [
    anApplyBuffEvent({ timestamp: 8000, targetID: 50, abilityGameID: 33763 }),
  ];
  const damageEvents = [
    aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
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
    new Map(),
    new Set(),
    new Set(),
  );

  expect(result.crises[0].prepped).toBe(true);
  expect(result.crises[0].responded).toBe(true);
  expect(result.crises[0].judgement).toBe("good");
});

it("credits anticipatory prep on a target outside the clear tank assignment, unlocking judgement without a ready resource", () => {
  const buffEvents = [
    // Target 60 stays LB3 all fight -- the druid's one maintained
    // target, i.e. its clear tank assignment.
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
    // Target 999 (not maintained) gets a single anticipatory Lifebloom
    // stack shortly before its own crisis, then blooms.
    anApplyBuffEvent({ timestamp: 88000, targetID: 999, abilityGameID: 33763 }),
    aRemoveBuffEvent({ timestamp: 92000, targetID: 999, abilityGameID: 33763 }),
  ];
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
    false,
    false,
    0,
    100000,
    new Map(),
    new Set(),
    new Set(),
  );

  expect(result.crises[0].maintained).toBe(false);
  expect(result.crises[0].prepped).toBe(true);
  expect(result.crises[0].responded).toBe(false);
  expect(result.crises[0].judged).toBe(true);
  expect(result.crises[0].judgement).toBe("good");
  expect(result.crises[0].judgedByPreppedElsewhere).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/nearDeathResponse.test.ts`
Expected: FAIL — `prepped`/`judgedByPreppedElsewhere` are `undefined` on the returned crisis objects (property doesn't exist yet), so the new assertions fail. The "outside assignment" test also fails because `judged`/`judgement` don't yet account for prep.

- [ ] **Step 3: Implement the `prepped` signal**

In `src/metrics/nearDeathResponse.ts`:

1. Add a type-only import alongside the existing `lifebloomStacks` import:

```ts
import {
  reconstructLifebloomTimelines,
  deriveLifebloomTargetState,
  type LifebloomTimelineEvent,
} from "./lifebloomStacks";
```

2. Add a new import for the HoT duration constants (already exported by `hotClipDetection.ts`):

```ts
import {
  REJUVENATION_DURATION_MS,
  REGROWTH_DURATION_MS,
} from "./hotClipDetection";
```

3. Add two helper functions right after `findCrisisEpisodes` (before `export interface CrisisEvent`):

```ts
// Story 1003: was a HoT already active on this target when a crisis opened,
// as opposed to a new cast landing during the crisis window (the existing
// `responded` check). Any Lifebloom stack count counts -- a single stack
// placed ahead of an expected spike is real anticipation even on a target
// far from the existing 201/501 "maintained" 30%-uptime bar, so this is
// evaluated per-crisis, not per-fight.
function isLifebloomActiveAt(
  timeline: LifebloomTimelineEvent[],
  timestampMs: number,
): boolean {
  let isOpen = false;
  for (const event of timeline) {
    if (event.timestamp >= timestampMs) break;
    if (event.kind === "open") isOpen = true;
    else if (event.kind === "close") isOpen = false;
  }
  return isOpen;
}

// Same idea for Rejuvenation/Regrowth, which don't get a reconstructed
// open/close timeline like Lifebloom -- expiry is derived from each
// application's own known duration, the same approach swiftmendAudit.ts's
// trackHotRemovals already uses for these two spells.
function isHotActiveAt(
  buffEvents: WclEvent[],
  druidId: number,
  targetId: number,
  abilityIds: Set<number>,
  durationMs: number,
  timestampMs: number,
): boolean {
  const relevant = buffEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.targetID === targetId &&
        event.abilityGameID !== undefined &&
        abilityIds.has(event.abilityGameID) &&
        event.timestamp < timestampMs,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  let expiryMs: number | null = null;
  for (const event of relevant) {
    if (event.type === "applybuff" || event.type === "refreshbuff") {
      expiryMs = event.timestamp + durationMs;
    } else if (event.type === "removebuff") {
      expiryMs = null;
    }
  }
  return expiryMs !== null && expiryMs > timestampMs;
}
```

4. Add the two new fields to the `CrisisEvent` interface:

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
  prepped: boolean;
  judgedByPreppedElsewhere: boolean;
}
```

5. Inside the `crises.map((episode) => { ... })` callback in `computeNearDeathResponse`, right after the existing `const responded = ...` block and before `const swiftmendReady = ...`, add:

```ts
const lifebloomTimeline = lifebloomTimelines.get(episode.targetId) ?? [];
const prepped =
  isLifebloomActiveAt(lifebloomTimeline, episode.timestampMs) ||
  isHotActiveAt(
    buffEvents,
    druidId,
    episode.targetId,
    rejuvenationAbilityIds,
    REJUVENATION_DURATION_MS,
    episode.timestampMs,
  ) ||
  isHotActiveAt(
    buffEvents,
    druidId,
    episode.targetId,
    regrowthAbilityIds,
    REGROWTH_DURATION_MS,
    episode.timestampMs,
  );
```

6. Replace the existing `judgedElsewhereReady`/`judged`/`judgedByReadyResource`/`judgement` block with:

```ts
// Story 1002: a crisis on a target outside the druid's maintained
// assignment is judged when a real resource was ready to help.
// Story 1003: it's also judged when the druid had already prepped a
// HoT on that target ahead of the crisis -- prep is direct evidence
// of attention on that target, not just latent capacity to help.
const judgedElsewhereReady = !maintained && (swiftmendReady || nsReady);
const judgedElsewherePrepped = !maintained && prepped;
const judged =
  maintained ||
  !hasClearAssignment ||
  judgedElsewhereReady ||
  judgedElsewherePrepped;

// Tracked separately from `judgement === "fair"`/`"good"` because a
// crisis can also land there via the pre-existing no-clear-assignment
// path -- these flags are true only for their own new rule, so
// downstream calibration pooling (scripts/lib/rollup.ts) can count real
// occurrences of each new tier precisely.
const judgedByReadyResource = judgedElsewhereReady && hasClearAssignment;
const judgedByPreppedElsewhere = judgedElsewherePrepped && hasClearAssignment;

const judgement = !judged
  ? null
  : responded || prepped
    ? "good"
    : maintained || !hasClearAssignment
      ? judgeDeathReadiness(unspentCount)
      : "fair";
```

7. Add `prepped` and `judgedByPreppedElsewhere` to the returned crisis object at the end of the callback:

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
  prepped,
  judgedByPreppedElsewhere,
};
```

- [ ] **Step 4: Fix the now-broken `epicSummary.test.ts` literal**

In `src/metrics/epicSummary.test.ts`, the `CrisisEvent` literal inside `describe("summarizeNearDeathResponse", ...)` (the object with `judgedByReadyResource: false` around line 942) needs the two new required fields:

```ts
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
          judgement: "bad",
          judgedByReadyResource: false,
          clearSave: false,
          saveKind: null,
          prepped: false,
          judgedByPreppedElsewhere: false,
        },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/metrics/nearDeathResponse.test.ts src/metrics/epicSummary.test.ts`
Expected: PASS, all tests including the 5 new ones and the full existing suite (unchanged behavior for every pre-existing test).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. This also confirms no other file in the repo constructs a `CrisisEvent` literal missing the two new fields (Task 1's own grep already confirmed `epicSummary.test.ts` is the only such site besides `nearDeathResponse.ts`/`nearDeathResponse.test.ts` themselves).

- [ ] **Step 7: Commit**

```bash
git add src/metrics/nearDeathResponse.ts src/metrics/nearDeathResponse.test.ts src/metrics/epicSummary.test.ts
git commit -m "feat(crisis-response): credit anticipatory HoT prep ahead of a crisis"
```

---

## Task 2: Pool `prepped` in the calibration rollup

**Files:**

- Modify: `scripts/lib/types.ts`
- Modify: `scripts/lib/rollup.ts`
- Test: `scripts/lib/rollup.test.ts`

**Interfaces:**

- Consumes: `CrisisEvent.prepped` from Task 1.
- Produces: `CrisisResponseRollup.preppedTotal: number`.

- [ ] **Step 1: Write the failing test**

In `scripts/lib/rollup.test.ts`, add an assertion to the existing all-zero test:

```ts
it("rolls up crisis response with all-zero totals when no fights are ready", () => {
  const rollup = rollupDruid([]);
  expect(rollup.crisisResponse.judgement).toBeNull();
  expect(rollup.crisisResponse.crisesTotal).toBe(0);
  expect(rollup.crisisResponse.flaggedTotal).toBe(0);
  expect(rollup.crisisResponse.clearSaveTotal).toBe(0);
  expect(rollup.crisisResponse.fairUnmaintainedTotal).toBe(0);
  expect(rollup.crisisResponse.preppedTotal).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: FAIL — TypeScript error, `preppedTotal` doesn't exist on `CrisisResponseRollup` yet (this will surface as a type error rather than a runtime assertion failure; either way the test run doesn't pass).

- [ ] **Step 3: Add the field and populate it**

In `scripts/lib/types.ts`, add to `CrisisResponseRollup`:

```ts
export interface CrisisResponseRollup extends EpicRollupBase {
  crisesTotal: number;
  flaggedTotal: number;
  clearSaveTotal: number;
  fairUnmaintainedTotal: number;
  preppedTotal: number;
}
```

In `scripts/lib/rollup.ts`, update the crisis-response section:

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
let preppedTotal = 0;
for (const entry of crisisReady) {
  const { crises, flaggedCount } = entry.metrics.nearDeathResponse;
  crisesTotal += crises.length;
  crisisFlaggedTotal += flaggedCount;
  for (const crisis of crises) {
    if (crisis.clearSave) clearSaveTotal += 1;
    if (crisis.judgedByReadyResource) fairUnmaintainedTotal += 1;
    if (crisis.prepped) preppedTotal += 1;
  }
}
const crisisResponse: CrisisResponseRollup = {
  ...epicRollupBase(fights.length, crisisReady),
  crisesTotal,
  flaggedTotal: crisisFlaggedTotal,
  clearSaveTotal,
  fairUnmaintainedTotal,
  preppedTotal,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this covers `scripts/` via `tsconfig.scripts.json`).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/rollup.ts scripts/lib/rollup.test.ts
git commit -m "feat(crisis-response): pool prepped-crisis counts in the calibration rollup"
```

---

## Task 3: Surface a "prepped" badge on `CrisisCard`

**Files:**

- Modify: `src/app/components/ui/CrisisCard/index.tsx`
- Modify: `src/app/components/ui/CrisisCard/index.module.css`
- Test: `src/app/components/ui/CrisisCard/index.test.tsx`

**Interfaces:**

- Consumes: a new `prepped: boolean` prop (mirrors `CrisisEvent.prepped` from Task 1).

- [ ] **Step 1: Write the failing tests**

Add `prepped={false}` to every existing `<CrisisCard ... />` call in `src/app/components/ui/CrisisCard/index.test.tsx` (there are 6: "shows a judgement chip...", "shows 'Context only'...", "shows 'Responded'...", the two clear-save tests, and "shows no clear-save badge..."). Then add two new tests at the end of the `describe` block:

```ts
  it("shows an anticipated badge when the crisis was prepped", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={false}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
        prepped={true}
      />,
    );

    expect(screen.getByText(/Anticipated/)).toBeInTheDocument();
  });

  it("shows no anticipated badge when the crisis was not prepped", () => {
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
        prepped={false}
      />,
    );

    expect(screen.queryByText(/Anticipated/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/ui/CrisisCard/index.test.tsx`
Expected: FAIL — TypeScript error (`prepped` isn't a known prop yet on the 6 pre-existing calls once added, and the 2 new tests can't find the "Anticipated" text since nothing renders it).

- [ ] **Step 3: Implement the badge**

In `src/app/components/ui/CrisisCard/index.tsx`, add `prepped` to the props interface and destructure:

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
  prepped: boolean;
}
```

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
  prepped,
}: CrisisCardProps) {
```

Add the badge markup right after the existing clear-save block:

```tsx
{
  clearSave && saveKind !== null && (
    <div className={styles.clearSave}>{CLEAR_SAVE_LABELS[saveKind]}</div>
  );
}
{
  prepped && (
    <div className={styles.prepped}>
      Anticipated: a Lifebloom, Rejuvenation, or Regrowth was already active on
      this target before the crisis
    </div>
  );
}
```

In `src/app/components/ui/CrisisCard/index.module.css`, add:

```css
.clearSave,
.prepped {
  font-size: var(--text-small-size);
  font-weight: 600;
  color: var(--judgement-good);
  margin-top: var(--space-2);
}
```

(replacing the existing standalone `.clearSave` rule with this combined selector).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/ui/CrisisCard/index.test.tsx`
Expected: PASS, all 8 tests (6 existing + 2 new).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ui/CrisisCard/index.tsx src/app/components/ui/CrisisCard/index.module.css src/app/components/ui/CrisisCard/index.test.tsx
git commit -m "feat(crisis-response): show an anticipated badge on prepped crises"
```

---

## Task 4: Wire `prepped` through `NearDeathResponseCard` and update its explainer copy

**Files:**

- Modify: `src/app/components/NearDeathResponseCard/index.tsx`

**Interfaces:**

- Consumes: `CrisisEvent.prepped` (Task 1), `CrisisCardProps.prepped` (Task 3).

- [ ] **Step 1: Pass the new prop through**

In `src/app/components/NearDeathResponseCard/index.tsx`, add `prepped={crisis.prepped}` to the `<CrisisCard ... />` call:

```tsx
{
  crises.map((crisis) => (
    <CrisisCard
      key={`${crisis.targetId}-${crisis.timestampMs}`}
      target={targetNames.get(crisis.targetId) ?? `Target #${crisis.targetId}`}
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
      hasSwiftmend={hasSwiftmend}
      hasNaturesSwiftness={hasNaturesSwiftness}
      judgement={crisis.judgement}
      clearSave={crisis.clearSave}
      saveKind={crisis.saveKind}
      prepped={crisis.prepped}
    />
  ));
}
```

- [ ] **Step 2: Update the explainer copy**

Replace the `THRESHOLD` constant:

```ts
const THRESHOLD =
  "A crisis is a raider's HP dropping to <=15% (provisional) and surviving. The response window runs from that reading until HP recovers, the target dies (excluded; tracked separately under Death forensics), or the fight ends. Good if you landed a new reactive healing cast in that window, or if a Lifebloom, Rejuvenation, or Regrowth was already active on the target before the crisis opened (anticipated), with a distinct \"clear save\" callout for an unambiguous burst save (Nature's Swiftness into Healing Touch or Regrowth, or a Swiftmend that consumed a Rejuvenation). Otherwise, on a maintained target (or with no clear tank assignment) good/fair/bad comes from the same unspent-resource tally used in Death forensics (Swiftmend ready / Nature's Swiftness ready / a GCD available). A crisis on a target you're not maintaining reads good when it was anticipated, fair when a resource was ready to help even though it wasn't your assignment, and stays context only otherwise.";
```

- [ ] **Step 3: Typecheck, lint, run the full test suite**

Run: `npm run typecheck && npm run lint && npx vitest run src/app/components/NearDeathResponseCard`
Expected: no errors, existing tests pass unchanged (no test in this file asserts the literal `THRESHOLD` string).

- [ ] **Step 4: Commit**

```bash
git add src/app/components/NearDeathResponseCard/index.tsx
git commit -m "feat(crisis-response): surface anticipated prep on the near-death response card"
```

---

## Task 5: Document the mechanism in `docs/thresholds.md`

**Files:**

- Modify: `docs/thresholds.md`

- [ ] **Step 1: Update the Crisis response table**

In the "Crisis response (epic J)" section, update the "Crisis response" row's "Current default" cell and add a new row for the prepped credit:

```
| Crisis response          | good / fair / bad                        | responded, or already prepped with a HoT beforehand (good) / else, on a maintained target or with no clear tank assignment: 0/1/>=2 unspent resources; on an unmaintained target with a clear assignment elsewhere: good if prepped, fair if a resource was ready, else context only | story 1001, revised story 1002, 1003 | `src/metrics/nearDeathResponse.ts` (`computeNearDeathResponse`, reuses `deathForensics.ts`'s `judgeDeathReadiness`) |
| Clear save (within good) | flagged, not a separate judgement bucket | Nature's Swiftness immediately followed by Healing Touch or Regrowth on the crisis target, or a reactive Swiftmend that consumed a Rejuvenation                                                                           | story 1002                     | `src/metrics/nearDeathResponse.ts` (`CrisisEvent.clearSave`/`.saveKind`)                                            |
| Anticipated prep (within good) | flagged, not a separate judgement bucket | a Lifebloom (any stack count), Rejuvenation, or Regrowth from the druid was already active on the crisis target strictly before the crisis's onset timestamp | story 1003 | `src/metrics/nearDeathResponse.ts` (`CrisisEvent.prepped`) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/thresholds.md
git commit -m "docs(thresholds): document the anticipated-prep crisis-response credit"
```

---

## Task 6: Cite a real prepped-crisis example (requires local WCL credentials)

This task validates story 1003's acceptance criterion "real prepped-crisis examples from the local calibration corpus back the new signal." It requires `.env.local` with `WCL_TEST_ACCESS_TOKEN` configured (see `docs/wcl-auth.md`) — set up on the machine that holds the calibration corpus, not necessarily present in every worktree. If the agent executing this plan doesn't have that file, hand this task to whoever does (the same person who ran story 1002's own corpus check) rather than skipping the citation or inventing numbers.

**Files:**

- Modify: `docs/thresholds.md`

- [ ] **Step 1: Run calibration against a known report**

Run (substituting any report from `docs/testing.md`'s known-reports table, or any report from the local `calibration-data/` corpus):

```bash
npm run calibrate -- 4GYHZRdtL3bvhpc8
```

This writes `calibration-data/4GYHZRdtL3bvhpc8.json`.

- [ ] **Step 2: Find a real prepped crisis**

Inspect the written file for a fight where `epics.crisisResponse.metrics.nearDeathResponse.crises` contains an entry with `"prepped": true`. If none exists in this report, repeat Step 1 against another report from the corpus until a real example is found. Note the report code, fight ID, target ID, and `timestampMs`.

- [ ] **Step 3: Add the dated calibration-review paragraph**

Append to `docs/thresholds.md`'s Crisis response section, in the same style as story 1002's own paragraph:

```
**Calibration review, story 1003 (2026-07-23):** confirmed against the local calibration corpus via `scripts/lib/calibrateReport.ts`'s `crisisResponse` epic. [Fill in: N real prepped crises found across M reports, citing report <code> fight <id> target <id> at <timestampMs>ms as the representative example.]
```

Replace the bracketed sentence with the real counts and citation found in Step 2 — do not leave it as a placeholder in the committed version.

- [ ] **Step 4: Commit**

```bash
git add docs/thresholds.md
git commit -m "docs(thresholds): cite a real prepped-crisis example from the calibration corpus"
```

---

## Task 7: Retire the paperwork

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/plans/anticipatory-crisis-prep-plan.md` (this file)

- [ ] **Step 1: Mark story 1003 done**

In `docs/backlog.md`, change `### 1003 — Recognize anticipatory HoT prep ahead of crisis onset 🔲 Todo` to `### 1003 — Recognize anticipatory HoT prep ahead of crisis onset ✅ Done`.

- [ ] **Step 2: Delete this plan file**

```bash
git rm docs/plans/anticipatory-crisis-prep-plan.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/backlog.md
git commit -m "docs(backlog): mark story 1003 done, retire its plan"
```
