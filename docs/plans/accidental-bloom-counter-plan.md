# Accidental Bloom Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 203 — count Lifebloom blooms that were immediately followed by a re-application on the same target ("accidental blooms"), and surface them with R/O/G judgement on the scorecard.

**Architecture:** A new pure metric function `computeAccidentalBlooms` in `src/metrics/accidentalBlooms.ts` takes raw `Buffs` and `Healing` WCL events for one fight and returns the accidental-bloom list, count, and judgement. `AccidentalBloomsCard` (currently a static placeholder wired into `Scorecard`) is rewired to fetch both event streams via the existing `fetchEvents` cache and render the real result, following the exact pattern already used by `RefreshCadenceCard` (story 202).

**Tech Stack:** TypeScript, React, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Spell/ability IDs are never hardcoded as "this ID means X" — bloom detection must work off `lifebloomAbilityIds` (resolved at runtime) plus the event's own `tick` field, not a hardcoded gameID.
- Every R/O/G threshold must have a comment pointing at its rationale in `docs/backlog.md` story 203.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via the pre-commit hook — do not bypass it.
- A story isn't done until `docs/backlog.md` marks it `✅ Done` and its spec/plan files are deleted in the same commit as the last code change.

---

### Task 1: `computeAccidentalBlooms` metric + `aHealEvent` test factory

**Files:**

- Create: `src/metrics/accidentalBlooms.ts`
- Create: `src/metrics/accidentalBlooms.test.ts`
- Modify: `src/testUtils/factories.ts` (add `aHealEvent`)

**Interfaces:**

- Consumes: `WclEvent` from `../wcl/events`; `judgeThresholdBelow`, `Judgement` from `./judgement` (existing — see `src/metrics/judgement.ts`, signature `judgeThresholdBelow(value: number, thresholds: { greenMax: number; orangeMax: number }): Judgement`).
- Produces: `computeAccidentalBlooms(buffEvents: WclEvent[], healEvents: WclEvent[], druidId: number, lifebloomAbilityIds: Set<number>): AccidentalBloomsResult`, where:

  ```ts
  export interface AccidentalBloom {
    timestampMs: number;
    targetId: number;
  }
  export interface AccidentalBloomsResult {
    accidentalBlooms: AccidentalBloom[];
    count: number;
    judgement: Judgement;
  }
  ```

  Later tasks (the card) import `computeAccidentalBlooms` and both interfaces from `../../../metrics/accidentalBlooms`.

- [ ] **Step 1: Add the `aHealEvent` factory**

Open `src/testUtils/factories.ts` and add this function after `aRemoveBuffEvent` (it follows the exact same shape as the other event factories in this file):

```ts
export function aHealEvent(overrides: Partial<WclEvent> = {}): WclEvent {
  return {
    timestamp: 1903349,
    type: "heal",
    sourceID: 2,
    targetID: 42,
    abilityGameID: 33763,
    fight: 6,
    ...overrides,
  };
}
```

No `tick` field by default — that makes the default instance a non-periodic ("bloom") heal. Pass `{ tick: true }` in overrides to represent a periodic tick heal instead.

- [ ] **Step 2: Write the failing tests**

Create `src/metrics/accidentalBlooms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAccidentalBlooms } from "./accidentalBlooms";
import { aHealEvent, anApplyBuffEvent } from "../testUtils/factories";

const DRUID_ID = 2;
const LIFEBLOOM_IDS = new Set([33763]);

describe("computeAccidentalBlooms", () => {
  it("returns zero accidental blooms and green judgement with no events", () => {
    const result = computeAccidentalBlooms([], [], DRUID_ID, LIFEBLOOM_IDS);
    expect(result).toEqual({
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    });
  });

  it("ignores periodic tick heals entirely", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, tick: true })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 101000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("does not count a bloom with no later re-application", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      [],
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("does not count a re-application on a different target", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 101000, targetID: 99 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("counts a re-application exactly at the 3s boundary as accidental", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 103000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(1);
    expect(result.accidentalBlooms).toEqual([
      { timestampMs: 100000, targetId: 42 },
    ]);
    expect(result.judgement).toBe("orange");
  });

  it("does not count a re-application 1ms past the 3s boundary", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 103001, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("judges 1-2 accidental blooms orange and 3+ red", () => {
    const healEvents = [
      aHealEvent({ timestamp: 100000, targetID: 1 }),
      aHealEvent({ timestamp: 200000, targetID: 2 }),
      aHealEvent({ timestamp: 300000, targetID: 3 }),
    ];
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 101000, targetID: 1 }),
      anApplyBuffEvent({ timestamp: 201000, targetID: 2 }),
      anApplyBuffEvent({ timestamp: 301000, targetID: 3 }),
    ];

    const twoBlooms = computeAccidentalBlooms(
      buffEvents.slice(0, 2),
      healEvents.slice(0, 2),
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(twoBlooms.count).toBe(2);
    expect(twoBlooms.judgement).toBe("orange");

    const threeBlooms = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(threeBlooms.count).toBe(3);
    expect(threeBlooms.judgement).toBe("red");
  });

  it("ignores heals and re-applications from a different source", () => {
    const healEvents = [
      aHealEvent({ timestamp: 100000, targetID: 42, sourceID: 5 }),
    ];
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 101000, targetID: 42, sourceID: 5 }),
    ];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/accidentalBlooms.test.ts`
Expected: FAIL — `Cannot find module './accidentalBlooms'` (the module doesn't exist yet).

- [ ] **Step 4: Implement `computeAccidentalBlooms`**

Create `src/metrics/accidentalBlooms.ts`:

```ts
import type { WclEvent } from "../wcl/events";
import { judgeThresholdBelow, type Judgement } from "./judgement";

// R/O/G thresholds per docs/backlog.md story 203: green 0, orange 1-2, red >= 3.
const GREEN_MAX_COUNT = 1;
const ORANGE_MAX_COUNT = 2;

// Heuristic per docs/backlog.md story 203: a bloom counts as accidental when
// Lifebloom is re-applied to the same target within this window of blooming.
const ACCIDENTAL_WINDOW_MS = 3000;

export interface AccidentalBloom {
  timestampMs: number;
  targetId: number;
}

export interface AccidentalBloomsResult {
  accidentalBlooms: AccidentalBloom[];
  count: number;
  judgement: Judgement;
}

export function computeAccidentalBlooms(
  buffEvents: WclEvent[],
  healEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): AccidentalBloomsResult {
  // Bloom detection per docs/backlog.md story 203: the non-periodic (non-tick)
  // Lifebloom heal event. Any Lifebloom-family ability qualifies rather than
  // a hardcoded gameID, since ability IDs must be resolved at runtime.
  const blooms = healEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.targetID !== undefined &&
        event.abilityGameID !== undefined &&
        lifebloomAbilityIds.has(event.abilityGameID) &&
        event.tick !== true,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const reapplications = buffEvents.filter(
    (event) =>
      event.type === "applybuff" &&
      event.sourceID === druidId &&
      event.targetID !== undefined &&
      event.abilityGameID !== undefined &&
      lifebloomAbilityIds.has(event.abilityGameID),
  );

  const accidentalBlooms: AccidentalBloom[] = [];

  for (const bloom of blooms) {
    const targetId = bloom.targetID as number;
    const isAccidental = reapplications.some((reapply) => {
      if (reapply.targetID !== targetId) return false;
      const delta = reapply.timestamp - bloom.timestamp;
      return delta > 0 && delta <= ACCIDENTAL_WINDOW_MS;
    });
    if (isAccidental) {
      accidentalBlooms.push({ timestampMs: bloom.timestamp, targetId });
    }
  }

  const count = accidentalBlooms.length;

  return {
    accidentalBlooms,
    count,
    judgement: judgeThresholdBelow(count, {
      greenMax: GREEN_MAX_COUNT,
      orangeMax: ORANGE_MAX_COUNT,
    }),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/accidentalBlooms.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

```bash
git add src/metrics/accidentalBlooms.ts src/metrics/accidentalBlooms.test.ts src/testUtils/factories.ts
git commit -m "feat(lifebloom): add accidental-bloom counter metric"
```

---

### Task 2: Wire `AccidentalBloomsCard` to real data

**Files:**

- Modify: `src/app/components/AccidentalBloomsCard/index.tsx`
- Modify: `src/app/components/AccidentalBloomsCard/index.test.tsx`

**Interfaces:**

- Consumes: `computeAccidentalBlooms`, `AccidentalBloomsResult` from `../../../metrics/accidentalBlooms` (Task 1); `Fight` from `../../../wcl/client`; `WclEvent`, `WclEventDataType` from `../../../wcl/events`; `EventFetcherFight` from `../../../wcl/eventCache`; `formatDuration` from `../../../report/fightRows`; `buildFightTimeUrl` from `../../../report/wclLinks`; `MetricCard` from `../ui/MetricCard`.
- Produces: `AccidentalBloomsCard` now requires props `{ accessToken, reportCode, fight, druidId, lifebloomAbilityIds, targetNames, fetchEvents }` — Task 3 (Scorecard) passes these.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/app/components/AccidentalBloomsCard/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccidentalBloomsCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aHealEvent,
  anApplyBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[], healEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> =>
    Promise.resolve(dataType === "Healing" ? healEvents : buffEvents);
}

describe("AccidentalBloomsCard", () => {
  it("lists accidental blooms with count and judgement once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });
    const healEvents = [aHealEvent({ timestamp: 173000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 174500, targetID: 42 })];

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, healEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Accidental blooms" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("2:53 — Offtank")).toBeInTheDocument();
  });

  it("shows a message when there are no accidental blooms", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });
    const healEvents = [aHealEvent({ timestamp: 173000, targetID: 42 })];

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], healEvents)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No accidental blooms this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <AccidentalBloomsCard
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
      <AccidentalBloomsCard
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

Run: `npx vitest run src/app/components/AccidentalBloomsCard/index.test.tsx`
Expected: FAIL — `AccidentalBloomsCard` doesn't accept props yet (TS error) and the old mock-content assertions no longer apply.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/app/components/AccidentalBloomsCard/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeAccidentalBlooms,
  type AccidentalBloomsResult,
} from "../../../metrics/accidentalBlooms";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface AccidentalBloomsCardProps {
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
  | { accessToken: string; result: AccidentalBloomsResult }
  | { accessToken: string; error: string };

const THRESHOLD =
  "Green 0, orange 1–2, red ≥ 3 per fight. An accidental bloom is a re-application of Lifebloom on the same target within 3s of it blooming — the stack was rebuilt, not deliberately reset.";

export function AccidentalBloomsCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: AccidentalBloomsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing"),
    ])
      .then(([buffEvents, healEvents]) => {
        const computed = computeAccidentalBlooms(
          buffEvents,
          healEvents,
          druidId,
          lifebloomAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate accidental blooms.",
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
        title="Accidental blooms"
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
        title="Accidental blooms"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { accidentalBlooms, count, judgement } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Accidental blooms"
      value={`${count}`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {accidentalBlooms.length === 0 ? (
        <p>No accidental blooms this fight.</p>
      ) : (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {accidentalBlooms.map((bloom) => (
            <li key={`${bloom.timestampMs}-${bloom.targetId}`}>
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  bloom.timestampMs,
                  bloom.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(bloom.timestampMs - fight.startTime)} —{" "}
                {targetNames.get(bloom.targetId) ?? `Target #${bloom.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/AccidentalBloomsCard/index.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/AccidentalBloomsCard/index.tsx src/app/components/AccidentalBloomsCard/index.test.tsx
git commit -m "feat(lifebloom): wire AccidentalBloomsCard to real accidental-bloom data"
```

---

### Task 3: Wire `Scorecard` to pass real props to `AccidentalBloomsCard`

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx:116`

**Interfaces:**

- Consumes: `AccidentalBloomsCard` props from Task 2. `Scorecard` already holds `lifebloomAbilityIds`, `targetNames`, `fetchEvents`, `fight`, `druidId` in scope (used identically by `LB3UptimeCard` a few lines above).

- [ ] **Step 1: Update the `AccidentalBloomsCard` usage**

In `src/app/components/Scorecard/index.tsx`, replace:

```tsx
<AccidentalBloomsCard />
```

with:

```tsx
<AccidentalBloomsCard
  accessToken={accessToken}
  reportCode={reportCode}
  fight={fight}
  druidId={druidId}
  lifebloomAbilityIds={lifebloomAbilityIds}
  targetNames={targetNames}
  fetchEvents={fetchEvents}
/>
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing suites plus the new ones from Tasks 1–2.

- [ ] **Step 3: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

```bash
git add src/app/components/Scorecard/index.tsx
git commit -m "feat(app): wire AccidentalBloomsCard to real accidental-bloom data"
```

---

### Task 4: Close out story 203's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Modify: `docs/testing.md`
- Delete: `docs/specs/accidental-bloom-counter-design.md`
- Delete: `docs/plans/accidental-bloom-counter-plan.md` (this file)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Mark story 203 done in the backlog**

In `docs/backlog.md`, change:

```md
### 203 — Accidental bloom counter
```

to:

```md
### 203 — Accidental bloom counter ✅ Done
```

- [ ] **Step 2: Update the repo-state line in `CLAUDE.md`**

In `CLAUDE.md`, in the `## Repo state` section, change the sentence ending `story 202 (refresh cadence histogram) are complete and live. Phase 1 MVP work continues with backlog story 203 (accidental bloom counter) next.` to:

```md
Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), story 006 (event fetching & caching layer), story 007 (ability resolution table), story 101 (active time & GCD utilization), story 102 (idle-gap detection), story 201 (LB3 uptime per target), story 202 (refresh cadence histogram), and story 203 (accidental bloom counter) are complete and live. Phase 1 MVP work continues with backlog story 204 (re-stack tax) next.
```

- [ ] **Step 3: Record the live-data finding in `docs/testing.md`**

In `docs/testing.md`'s "Known real test reports" table, append this sentence to the end of the `4GYHZRdtL3bvhpc8` row's "Notable for" cell (after the existing story-202 sentence, inside the same cell): "Also validated that Lifebloom's bloom finisher and periodic tick arrive as `heal` events on different `abilityGameID`s (periodic ticks carry `tick: true`; the bloom finisher never does), and that the bloom always co-fires with `removebuff` at the same timestamp — the detection story 203's accidental-bloom counter depends on."

- [ ] **Step 4: Grep for dangling references, then delete the spec and plan**

Run: `grep -rn "accidental-bloom-counter" docs/ src/ --include="*.md" --include="*.ts" --include="*.tsx"`
Expected: no output other than the two files themselves (they self-reference their own filenames nowhere else in the repo).

```bash
rm docs/specs/accidental-bloom-counter-design.md docs/plans/accidental-bloom-counter-plan.md
```

- [ ] **Step 5: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: all pass.

```bash
git add docs/backlog.md CLAUDE.md docs/testing.md
git add -u docs/specs/accidental-bloom-counter-design.md docs/plans/accidental-bloom-counter-plan.md
git commit -m "docs: close out story 203 (accidental bloom counter)"
```

---

## Self-Review Notes

- **Spec coverage:** bloom detection (Task 1, non-tick heal filter) — covered; 3s re-application heuristic (Task 1) — covered; per-bloom timestamp+target listing (Task 2) — covered; R/O/G green 0 / orange 1-2 / red ≥3 (Task 1, tested at all four boundary counts) — covered; card wiring into the live scorecard (Tasks 2-3) — covered; paperwork retirement (Task 4) — covered.
- **Type consistency:** `AccidentalBloom { timestampMs, targetId }` and `AccidentalBloomsResult { accidentalBlooms, count, judgement }` are defined once in Task 1 and used with identical field names in Task 2 — no drift.
- **Out of scope confirmed:** stories 204/205 cards are untouched by this plan.
