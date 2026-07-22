# Hide talent-ineligible cooldown rows in Death forensics / Crisis response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `DeathCard`/`CrisisCard` from rendering "On cooldown" for Swiftmend/Nature's Swiftness when a druid's talent build can never reach that ability at all — hide the row entirely per-resource and add a one-line explanatory note, so a talent-ineligible resource is never confused with a genuinely-on-cooldown one.

**Architecture:** Both `DeathForensicsCard` and `NearDeathResponseCard` already compute per-fight `hasSwiftmend`/`hasNaturesSwiftness` booleans from real talent data (story 903c) before calling their `compute*` function. This plan threads those two booleans into the display layer only: a new shared pure helper decides the explanatory note text, `DeathCard`/`CrisisCard` gain two new boolean props that conditionally omit a row, and the two Card components pass their already-computed booleans straight through. No `src/metrics/*.ts` file changes.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library (Tier 1 unit + Tier 3 component tests per `docs/testing.md`), existing `src/testUtils/factories.ts` factory helpers.

## Global Constraints

- No change to `src/metrics/deathForensics.ts` / `src/metrics/nearDeathResponse.ts` — `unspentCount`/`judgeDeathReadiness` and all threshold values stay exactly as-is.
- No change to `scripts/lib/calibrateReport.ts` or any other calibration-script consumer.
- No change to `docs/thresholds.md` — no threshold changed, nothing to record.
- No em dashes in any new user-facing string (CLAUDE.md principle 6) — use a semicolon/comma/separate sentence instead.
- No internal/planning vocabulary ("story", "903c", epic letters, etc.) in any user-facing string (CLAUDE.md principle 5).
- Run `npm run typecheck && npm run lint && npm run format:check` before every commit (the pre-commit hook already enforces this; don't bypass it).

---

### Task 1: Shared "ineligible cooldown" note helper

**Files:**

- Create: `src/app/components/ui/cooldownEligibilityNote.ts`
- Test: `src/app/components/ui/cooldownEligibilityNote.test.ts`

**Interfaces:**

- Produces: `describeIneligibleCooldowns(hasSwiftmend: boolean, hasNaturesSwiftness: boolean): string | null` — used by Task 2 (`DeathForensicsCard`) and Task 3 (`NearDeathResponseCard`).

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ui/cooldownEligibilityNote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeIneligibleCooldowns } from "./cooldownEligibilityNote";

describe("describeIneligibleCooldowns", () => {
  it("returns null when both resources are talent-eligible", () => {
    expect(describeIneligibleCooldowns(true, true)).toBeNull();
  });

  it("names only Swiftmend when only Swiftmend is talent-ineligible", () => {
    expect(describeIneligibleCooldowns(false, true)).toBe(
      "This build's talents can't reach Swiftmend; that row isn't shown.",
    );
  });

  it("names only Nature's Swiftness when only Nature's Swiftness is talent-ineligible", () => {
    expect(describeIneligibleCooldowns(true, false)).toBe(
      "This build's talents can't reach Nature's Swiftness; that row isn't shown.",
    );
  });

  it("names both when neither resource is talent-eligible", () => {
    expect(describeIneligibleCooldowns(false, false)).toBe(
      "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/cooldownEligibilityNote.test.ts`
Expected: FAIL — `cooldownEligibilityNote.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/app/components/ui/cooldownEligibilityNote.ts`:

```ts
// Death forensics / Crisis response both show a per-death or per-crisis row
// for Swiftmend/Nature's Swiftness readiness. That row is meaningless (and
// misleading, read as a missed opportunity) when a build's talents can
// never reach the ability at all -- the two resources gate independently
// (Nature's Swiftness needs 20 Restoration, Swiftmend needs 30), so a build
// can lack either one, both, or neither. This composes the one-line note
// shown once per fight to explain which row(s), if any, were omitted.
export function describeIneligibleCooldowns(
  hasSwiftmend: boolean,
  hasNaturesSwiftness: boolean,
): string | null {
  if (!hasSwiftmend && !hasNaturesSwiftness) {
    return "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.";
  }
  if (!hasSwiftmend) {
    return "This build's talents can't reach Swiftmend; that row isn't shown.";
  }
  if (!hasNaturesSwiftness) {
    return "This build's talents can't reach Nature's Swiftness; that row isn't shown.";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/cooldownEligibilityNote.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/cooldownEligibilityNote.ts src/app/components/ui/cooldownEligibilityNote.test.ts
git commit -m "feat(ui): add shared note helper for talent-ineligible cooldowns"
```

---

### Task 2: Death forensics — hide ineligible rows, add the note

**Files:**

- Modify: `src/app/components/ui/DeathCard/index.tsx`
- Modify: `src/app/components/DeathForensicsCard/index.tsx`
- Test: `src/app/components/DeathForensicsCard/index.test.tsx`

**Interfaces:**

- Consumes: `describeIneligibleCooldowns` from Task 1 (`../ui/cooldownEligibilityNote`).
- Produces: `DeathCardProps` gains `hasSwiftmend: boolean`, `hasNaturesSwiftness: boolean` (used only within this task; `DeathForensicsCard` is `DeathCard`'s sole caller).

- [ ] **Step 1: Write the failing tests**

In `src/app/components/DeathForensicsCard/index.test.tsx`, entirely replace the existing test named `"doesn't flag a maintained target's death as bad purely from a talent-unreachable resource"` (lines ~258-329) with the version below, which is identical except for 3 new assertions appended after the existing `await waitFor(...)` call. Then add the 2 new tests below immediately after it (still inside the same `describe("DeathForensicsCard", ...)` block, before its closing `});`):

```tsx
it("doesn't flag a maintained target's death as bad purely from a talent-unreachable resource", async () => {
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
  // 2 -> still bad, but for the right reason (2, not 3). This test's
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
  // Swiftmend is talent-unreachable at 26 Restoration -> its row is
  // omitted entirely, not shown as a misleading "On cooldown".
  expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
  // Nature's Swiftness is talent-reachable at 26 Restoration -> its row
  // still renders normally.
  expect(screen.getByText(/Nature's Swiftness available/)).toBeInTheDocument();
  expect(
    screen.getByText(
      "This build's talents can't reach Swiftmend; that row isn't shown.",
    ),
  ).toBeInTheDocument();
});

it("hides both cooldown rows and shows the combined note when neither talent threshold is reached", async () => {
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
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 0 }],
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

  await waitFor(() =>
    expect(screen.getByText("1 of 1 deaths flagged")).toBeInTheDocument(),
  );
  expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Nature's Swiftness available/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.",
    ),
  ).toBeInTheDocument();
});

it("shows both cooldown rows and no note when both talent thresholds are reached", async () => {
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
      host="fresh"
      fight={fight}
      druidId={2}
      swiftmendAbilityIds={new Set([18562])}
      naturesSwiftnessAbilityIds={new Set([17116])}
      lifebloomAbilityIds={new Set([33763])}
      targetNames={new Map([[50, "Offtank"]])}
      fetchEvents={makeFetchEvents(deathEvents, [], buffEvents)}
    />,
  );

  await waitFor(() =>
    expect(screen.getByText("1 of 1 deaths flagged")).toBeInTheDocument(),
  );
  expect(screen.getByText(/Swiftmend available/)).toBeInTheDocument();
  expect(screen.getByText(/Nature's Swiftness available/)).toBeInTheDocument();
  expect(screen.queryByText(/can't reach/)).not.toBeInTheDocument();
});
```

(`makeFetchEvents` already defaults `CombatantInfo` to 45 Restoration, i.e. full eligibility — see the top of this test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/DeathForensicsCard/index.test.tsx`
Expected: FAIL — the two new tests fail because `DeathCard`/`DeathForensicsCard` don't yet omit rows or render a note; the updated existing test fails on the new `queryByText`/`getByText` assertions.

- [ ] **Step 3: Update `DeathCard` to accept eligibility props and conditionally render rows**

Replace the full contents of `src/app/components/ui/DeathCard/index.tsx`:

```tsx
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
  hasSwiftmend: boolean;
  hasNaturesSwiftness: boolean;
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
  hasSwiftmend,
  hasNaturesSwiftness,
  judgement,
}: DeathCardProps) {
  const rows: [string, string][] = [
    [
      "LB3 rolling on target",
      maintained ? (lb3 ? "Yes" : "No") : "n/a (not maintained)",
    ],
  ];
  if (hasSwiftmend) {
    rows.push([
      "Swiftmend available",
      swiftmendReady ? "Ready" : "On cooldown",
    ]);
  }
  if (hasNaturesSwiftness) {
    rows.push([
      "Nature's Swiftness available",
      nsReady ? "Ready" : "On cooldown",
    ]);
  }
  rows.push(["Idle in preceding 5s", idlePreceding ? "Yes" : "No"]);

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

- [ ] **Step 4: Thread eligibility through `DeathForensicsCard` and render the note**

In `src/app/components/DeathForensicsCard/index.tsx`:

Add the import (alongside the existing imports):

```tsx
import { describeIneligibleCooldowns } from "../ui/cooldownEligibilityNote";
```

Change the `FetchResult` type:

```tsx
type FetchResult =
  | {
      accessToken: string;
      result: DeathForensicsResult;
      hasSwiftmend: boolean;
      hasNaturesSwiftness: boolean;
    }
  | { accessToken: string; error: string };
```

In the `useEffect`'s `.then()` callback, name the two booleans and pass them into `setResult` (replacing the inline `restoration >= ...` expressions in the `computeDeathForensics` call with the named consts, and adding both to the success branch's `setResult` call):

```tsx
        try {
          const talents = parseTalentPoints(combatantInfoEvents, druidId);
          const restoration = talents === null ? 0 : talents[2];
          const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
          const hasNaturesSwiftness =
            restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
          const computed = computeDeathForensics(
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            hasSwiftmend,
            hasNaturesSwiftness,
            fight.startTime,
            fight.endTime,
          );
          setResult({
            accessToken,
            result: computed,
            hasSwiftmend,
            hasNaturesSwiftness,
          });
        } catch (err) {
```

Update the render section (replacing the current `const { deaths, flaggedCount, judgement } = result.result;` line onward through the end of the component):

```tsx
  const { deaths, flaggedCount, judgement } = result.result;
  const { hasSwiftmend, hasNaturesSwiftness } = result;
  const ineligibleNote = describeIneligibleCooldowns(
    hasSwiftmend,
    hasNaturesSwiftness,
  );

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
      rationaleSlug="death-forensics"
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
                    host,
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
              hasSwiftmend={hasSwiftmend}
              hasNaturesSwiftness={hasNaturesSwiftness}
              judgement={death.judgement}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="warning">
          A death is not automatically the druid&apos;s fault; this audits your
          readiness only; not target selection, assignments, or positioning.
        </Alert>
      </div>
      {ineligibleNote && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="warning">{ineligibleNote}</Alert>
        </div>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/DeathForensicsCard/index.test.tsx`
Expected: PASS (all tests, including the 2 new ones and the updated one)

- [ ] **Step 6: Run the full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS — confirms no other test (e.g. any other consumer of `DeathCard`) broke from the new required props.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ui/DeathCard/index.tsx src/app/components/DeathForensicsCard/index.tsx src/app/components/DeathForensicsCard/index.test.tsx
git commit -m "fix(ui): hide talent-ineligible cooldown rows in death forensics"
```

---

### Task 3: Crisis response — hide ineligible rows, add the note

**Files:**

- Modify: `src/app/components/ui/CrisisCard/index.tsx`
- Modify: `src/app/components/NearDeathResponseCard/index.tsx`
- Test: `src/app/components/NearDeathResponseCard/index.test.tsx`

**Interfaces:**

- Consumes: `describeIneligibleCooldowns` from Task 1 (`../ui/cooldownEligibilityNote`).
- Produces: `CrisisCardProps` gains `hasSwiftmend: boolean`, `hasNaturesSwiftness: boolean` (used only within this task; `NearDeathResponseCard` is `CrisisCard`'s sole caller).

- [ ] **Step 1: Write the failing tests**

In `src/app/components/NearDeathResponseCard/index.test.tsx`, extend the existing `"shows the flagged count and a per-crisis card once loaded"` test's assertions and add two new tests. Replace the full test file contents with:

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

function makeFetchEventsWithTalents(
  damageEvents: WclEvent[],
  restoration: number,
) {
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
          talents: [{ id: 0 }, { id: 0 }, { id: restoration }],
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
    // Full eligibility (45 Restoration): both rows render, no ineligible note.
    expect(screen.getByText(/Swiftmend available/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nature's Swiftness available/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can't reach/)).not.toBeInTheDocument();
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

  it("hides the Swiftmend row and shows its note for a talent-unreachable build", async () => {
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
        // 26 Restoration: below Swiftmend's 30-point threshold, at/above
        // Nature's Swiftness's 20-point threshold -- the real Dreamstate-
        // build shape confirmed in docs/testing.md's bKRZ68XqgwYkxtzm entry.
        fetchEvents={makeFetchEventsWithTalents(damageEvents, 26)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("1 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nature's Swiftness available/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This build's talents can't reach Swiftmend; that row isn't shown.",
      ),
    ).toBeInTheDocument();
  });

  it("hides both cooldown rows and shows the combined note when neither talent threshold is reached", async () => {
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
        fetchEvents={makeFetchEventsWithTalents(damageEvents, 0)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("1 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nature's Swiftness available/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/NearDeathResponseCard/index.test.tsx`
Expected: FAIL — the 2 new tests fail (no row omission/note yet); the extended first test fails on its 3 new assertions.

- [ ] **Step 3: Update `CrisisCard` to accept eligibility props and conditionally render rows**

Replace the full contents of `src/app/components/ui/CrisisCard/index.tsx`:

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
  hasSwiftmend: boolean;
  hasNaturesSwiftness: boolean;
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
  hasSwiftmend,
  hasNaturesSwiftness,
  judgement,
}: CrisisCardProps) {
  const rows: [string, string][] = [
    ["HP at crisis", `${Math.round(hitPointsPct)}%`],
    ["Maintained target", maintained ? "Yes" : "No"],
    ["Reactive heal landed", responded ? "Responded" : "No"],
  ];
  if (!responded) {
    if (hasSwiftmend) {
      rows.push([
        "Swiftmend available",
        swiftmendReady ? "Ready" : "On cooldown",
      ]);
    }
    if (hasNaturesSwiftness) {
      rows.push([
        "Nature's Swiftness available",
        nsReady ? "Ready" : "On cooldown",
      ]);
    }
    rows.push(["Idle in preceding 5s", idlePreceding ? "Yes" : "No"]);
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

- [ ] **Step 4: Thread eligibility through `NearDeathResponseCard` and render the note**

In `src/app/components/NearDeathResponseCard/index.tsx`:

Add the import:

```tsx
import { describeIneligibleCooldowns } from "../ui/cooldownEligibilityNote";
```

Change the `FetchResult` type:

```tsx
type FetchResult =
  | {
      accessToken: string;
      result: NearDeathResponseResult;
      hasSwiftmend: boolean;
      hasNaturesSwiftness: boolean;
    }
  | { accessToken: string; error: string };
```

In the `useEffect`'s `.then()` callback, name the two booleans and pass them into `setResult`:

```tsx
          try {
            const talents = parseTalentPoints(combatantInfoEvents, druidId);
            const restoration = talents === null ? 0 : talents[2];
            const hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION;
            const hasNaturesSwiftness =
              restoration >= NATURES_SWIFTNESS_MIN_RESTORATION;
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
            );
            setResult({
              accessToken,
              result: computed,
              hasSwiftmend,
              hasNaturesSwiftness,
            });
          } catch (err) {
```

Update the render section (replacing the current `const { crises, flaggedCount, judgement } = result.result;` line onward through the end of the component):

```tsx
  const { crises, flaggedCount, judgement } = result.result;
  const { hasSwiftmend, hasNaturesSwiftness } = result;
  const ineligibleNote = describeIneligibleCooldowns(
    hasSwiftmend,
    hasNaturesSwiftness,
  );

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
      rationaleSlug="crisis-response"
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
              hasSwiftmend={hasSwiftmend}
              hasNaturesSwiftness={hasNaturesSwiftness}
              judgement={crisis.judgement}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="warning">
          A survived crisis is not automatically good or bad process by itself;
          this audits your readiness and reaction only; not assignments or
          positioning, and not whether anyone else&apos;s response was enough.
        </Alert>
      </div>
      {ineligibleNote && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="warning">{ineligibleNote}</Alert>
        </div>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/NearDeathResponseCard/index.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Run the full test suite and static analysis**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ui/CrisisCard/index.tsx src/app/components/NearDeathResponseCard/index.tsx src/app/components/NearDeathResponseCard/index.test.tsx
git commit -m "fix(ui): hide talent-ineligible cooldown rows in crisis response"
```

---

### Task 4: Retire the inbox entry and this plan's own paperwork

**Files:**

- Modify: `docs/inbox.md`
- Delete: `docs/specs/cooldown-eligibility-display-design.md`
- Delete: `docs/plans/cooldown-eligibility-display-plan.md`

**Interfaces:** none (docs-only).

- [ ] **Step 1: Remove the shipped item from `docs/inbox.md`**

Delete this entire section from `docs/inbox.md` (including its heading):

```
## Death forensics / Crisis response: hide Swiftmend "on cooldown" for builds that can't reach it

For a Dreamstate/Restokin/balance-heavy build (Restoration < 30, can't
talent into Swiftmend at all), both Death forensics (`DeathForensicsCard`)
and Crisis response (`NearDeathResponseCard`) should stop
displaying/judging Swiftmend readiness as if it's a real cooldown state
("on cooldown") — it should disappear from the UI and from the
unspent-resource judgement entirely for those archetypes, the same way
story 903c already gates *judgement* on talent eligibility.

This looks like the UI-copy half of a gap already flagged (but explicitly
not fixed) by stories 011/501/302's notes on `isReady()` treating "never
cast" and "talent unreachable" identically — 903c fixed the judgement math
(`swiftmendReady`/`hasSwiftmend` gating), but the copy/display layer in
these two cards apparently still needs a look to confirm it's not
independently showing stale "on cooldown" wording for an ineligible
build.
```

Confirm the file's remaining structure is intact (its header and the two other inbox entries untouched) by reading it back after the edit.

- [ ] **Step 2: Delete the spec and plan docs now that the fix has shipped**

```bash
rm docs/specs/cooldown-eligibility-display-design.md
rm docs/plans/cooldown-eligibility-display-plan.md
```

Grep first to confirm nothing else references either path:

```bash
grep -rn "cooldown-eligibility-display" docs src scripts 2>/dev/null
```

Expected: no output (besides the two files just deleted, which no longer exist to match).

- [ ] **Step 3: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all PASS (docs-only change, but the pre-commit hook runs full-project static analysis regardless)

- [ ] **Step 4: Commit**

```bash
git add docs/inbox.md
git rm docs/specs/cooldown-eligibility-display-design.md docs/plans/cooldown-eligibility-display-plan.md
git commit -m "docs: retire inbox item and design/plan docs for cooldown eligibility display"
```
