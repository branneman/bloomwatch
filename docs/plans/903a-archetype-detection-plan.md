# Story 903a — Per-fight talent-archetype detection: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute a druid's talent-archetype bucket (story 900's classifier) per fight inside the app itself, and surface it in the Scorecard UI, so later stories (903c, 903d) have real per-fight data to consume.

**Architecture:** Extract story 900's pure classification logic out of `scripts/tagArchetypes.ts` into a new shared module `src/report/archetypeDetection.ts`; add a Scorecard-colocated hook that fetches `CombatantInfo` through the existing cached `fetchEvents` and classifies it; render one line in `Scorecard`'s header.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (existing project stack — no new dependencies).

Full design rationale: `docs/specs/903a-archetype-detection-design.md`. Backlog acceptance criteria: `docs/backlog.md` story 903a.

## Global Constraints

- Commits follow Conventional Commits (`type(scope): summary`) — use scope `calibration` or `report`/`scorecard` as appropriate per task.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via a pre-commit hook — never bypass it (`--no-verify`).
- `TalentBucket`'s 8 string values must stay byte-identical to `scripts/tagArchetypes.ts`'s current `Bucket` type — `docs/calibration-archetypes.json` already has 75 records using this exact vocabulary.
- No spell/ability IDs are hardcoded anywhere in this story's scope (N/A here — this story reads talent point totals, not spell casts).
- No `host` parameter is needed anywhere in this story's new code (verified live during design — see the spec's "Host handling" section).
- A story isn't done until its paperwork is retired: the final task deletes this plan and `docs/specs/903a-archetype-detection-design.md`, and marks 903a done in `docs/backlog.md`, in the same commit.

---

### Task 1: Shared archetype classifier module

**Files:**

- Create: `src/report/archetypeDetection.ts`
- Test: `src/report/archetypeDetection.test.ts`

**Interfaces:**

- Produces: `TalentBucket` (union type), `BUCKET_DEFINITIONS: Record<TalentBucket, string>`, `classifyBucket(balance: number, feral: number, restoration: number): TalentBucket`, `parseTalentPoints(combatantInfoEvents: WclEvent[], druidId: number): [number, number, number] | null`. All four are used by Task 2 (script) and Task 3 (hook).

- [ ] **Step 1: Write the failing test**

Create `src/report/archetypeDetection.test.ts`:

```ts
// src/report/archetypeDetection.test.ts
import { describe, expect, it } from "vitest";
import { classifyBucket, parseTalentPoints } from "./archetypeDetection";
import { aCombatantInfoEvent } from "../testUtils/factories";

describe("classifyBucket", () => {
  it("classifies deep-resto at the 41-point Restoration boundary", () => {
    expect(classifyBucket(0, 0, 41)).toBe("deep-resto");
    expect(classifyBucket(0, 0, 40)).not.toBe("deep-resto");
  });

  it("classifies likely-dreamstate-full at the 33-point Balance boundary", () => {
    expect(classifyBucket(33, 0, 10)).toBe("likely-dreamstate-full");
  });

  it("classifies likely-dreamstate-partial between 31 and 32 Balance points", () => {
    expect(classifyBucket(31, 0, 10)).toBe("likely-dreamstate-partial");
    expect(classifyBucket(32, 0, 10)).toBe("likely-dreamstate-partial");
  });

  it("classifies a 21/0/40 split as mostly-resto, not mostly-balance, even though balance >= 20", () => {
    expect(classifyBucket(21, 0, 40)).toBe("mostly-resto");
  });

  it("classifies mostly-balance at the 20-point Balance boundary when Balance dominates", () => {
    expect(classifyBucket(20, 5, 10)).toBe("mostly-balance");
  });

  it("classifies a 0/46/15 Feral-dominant split as other-unclassified, not mostly-resto", () => {
    expect(classifyBucket(0, 46, 15)).toBe("other-unclassified");
  });

  it("classifies a low, roughly-even split as other-unclassified", () => {
    expect(classifyBucket(0, 10, 5)).toBe("other-unclassified");
  });
});

describe("parseTalentPoints", () => {
  it("reads balance/feral/restoration in tree order from the matching druid's CombatantInfo event", () => {
    const events = [
      aCombatantInfoEvent({
        sourceID: 2,
        talents: [{ id: 45 }, { id: 0 }, { id: 16 }],
      }),
    ];
    expect(parseTalentPoints(events, 2)).toEqual([45, 0, 16]);
  });

  it("returns null when no CombatantInfo event matches the druid's sourceID", () => {
    const events = [
      aCombatantInfoEvent({
        sourceID: 5,
        talents: [{ id: 45 }, { id: 0 }, { id: 16 }],
      }),
    ];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });

  it("returns null when talents has the wrong number of entries", () => {
    const events = [
      aCombatantInfoEvent({ sourceID: 2, talents: [{ id: 45 }, { id: 0 }] }),
    ];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });

  it("returns null when the event has no talents field at all", () => {
    const events = [aCombatantInfoEvent({ sourceID: 2 })];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/archetypeDetection.test.ts`
Expected: FAIL — `Cannot find module './archetypeDetection'` (or equivalent resolution error), since the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/report/archetypeDetection.ts`:

```ts
// src/report/archetypeDetection.ts
import type { WclEvent } from "../wcl/events";

export type TalentBucket =
  | "deep-resto"
  | "likely-dreamstate-full"
  | "likely-dreamstate-partial"
  | "mostly-resto"
  | "mostly-balance"
  | "restokin-shaped"
  | "other-unclassified"
  | "unknown-no-talent-data";

// Order matters: deep-resto and the two dreamstate tiers are specific
// signatures checked first; "mostly-resto" vs "mostly-balance" is a
// same-priority fallback comparison between whichever tree actually has
// more points, not two independent thresholds — a 21/0/40 split has to land
// in "mostly-resto" (resto dominates) even though balance alone is >= 20.
// Feral is checked too: a 0/46/15 split isn't "mostly-resto" just because
// restoration > balance — Feral dominates both, so it falls through to
// "other-unclassified" (not a target archetype for this app at all) rather
// than being mislabeled as leaning Restoration.
export function classifyBucket(
  balance: number,
  feral: number,
  restoration: number,
): TalentBucket {
  if (restoration >= 41) return "deep-resto";
  if (balance >= 33) return "likely-dreamstate-full";
  if (balance >= 31) return "likely-dreamstate-partial";
  if (restoration > balance && restoration > feral) return "mostly-resto";
  if (balance >= 20 && balance > feral) return "mostly-balance";
  return "other-unclassified";
}

export const BUCKET_DEFINITIONS: Record<TalentBucket, string> = {
  "deep-resto": "Restoration >= 41 (Tree of Life-eligible)",
  "likely-dreamstate-full": "Balance >= 33 (full 3/3 Dreamstate-eligible)",
  "likely-dreamstate-partial": "Balance >= 31 (>=1 point Dreamstate-eligible)",
  "mostly-resto":
    "Restoration > Balance, but below deep-resto's 41-point cutoff and below Dreamstate's 31-point Balance threshold",
  "mostly-balance": "Balance >= Restoration and Balance >= 20",
  "restokin-shaped": "signature not yet determined — see story 900",
  "other-unclassified": "doesn't fit any bucket above",
  "unknown-no-talent-data": "talent read failed or unavailable",
};

interface CombatantTalentEntry {
  id: number;
}

// Mirrors computePrepHygiene's (src/metrics/prepHygiene.ts) established
// pattern for reading an untyped CombatantInfo field off WclEvent: find the
// matching druid by sourceID, then narrow the field with Array.isArray
// before casting, rather than trusting the index signature blindly.
export function parseTalentPoints(
  combatantInfoEvents: WclEvent[],
  druidId: number,
): [number, number, number] | null {
  const combatant = combatantInfoEvents.find(
    (event) => event.sourceID === druidId,
  );
  const rawTalents = combatant?.talents;
  const talents = Array.isArray(rawTalents)
    ? (rawTalents as CombatantTalentEntry[])
    : [];
  if (talents.length !== 3) return null;
  const [balance, feral, restoration] = talents.map((t) => t.id);
  return [balance, feral, restoration];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/archetypeDetection.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/report/archetypeDetection.ts src/report/archetypeDetection.test.ts
git commit -m "feat(report): add shared talent-archetype classifier module"
```

---

### Task 2: Point `scripts/tagArchetypes.ts` at the shared module

**Files:**

- Modify: `scripts/tagArchetypes.ts`

**Interfaces:**

- Consumes: `TalentBucket`, `BUCKET_DEFINITIONS`, `classifyBucket`, `parseTalentPoints` from `../src/report/archetypeDetection` (Task 1).
- Produces: no new exports — this is a pure refactor. `scripts/tagArchetypes.ts`'s CLI behavior (`npm run tag-archetype -- <reportCode> [--host fresh|classic]`) and output shape are unchanged.

This task removes the script's own copies of `Bucket`, `classifyBucket`, and `BUCKET_DEFINITIONS` (now duplicated with Task 1's module) and its local `TalentEntry`/`CombatantInfoEvent` interfaces (superseded by `parseTalentPoints`'s use of the real `WclEvent` type), and renames every local usage of `Bucket` to `TalentBucket`.

- [ ] **Step 1: Update imports**

In `scripts/tagArchetypes.ts`, replace:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";
import { detectDruids } from "../src/report/druidDetection";
import { buildFightRows } from "../src/report/fightRows";
import type { Fight, CastTableEntry } from "../src/wcl/client";
```

with:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";
import { detectDruids } from "../src/report/druidDetection";
import { buildFightRows } from "../src/report/fightRows";
import type { Fight, CastTableEntry } from "../src/wcl/client";
import type { WclEvent } from "../src/wcl/events";
import {
  classifyBucket,
  BUCKET_DEFINITIONS,
  parseTalentPoints,
  type TalentBucket,
} from "../src/report/archetypeDetection";
```

- [ ] **Step 2: Remove the local talent-event interfaces and rewrite `fetchTalents` to use `parseTalentPoints`**

Replace (the `interface TalentEntry` / `interface CombatantInfoEvent` / `fetchTalents` block):

```ts
interface TalentEntry {
  id: number;
}
interface CombatantInfoEvent {
  sourceID?: number;
  talents?: TalentEntry[];
}

async function fetchTalents(
  accessToken: string,
  host: HostKey,
  reportCode: string,
  fight: { id: number; startTime: number; endTime: number },
  druidId: number,
): Promise<[number, number, number] | null> {
  const data = (await graphql(
    accessToken,
    host,
    `query { reportData { report(code: "${reportCode}") { events(fightIDs: [${fight.id}], startTime: ${fight.startTime}, endTime: ${fight.endTime}, dataType: CombatantInfo) { data } } } }`,
  )) as {
    reportData: { report: { events: { data: CombatantInfoEvent[] } } };
  };
  const events = data.reportData.report.events.data;
  const ci = events.find((e) => e.sourceID === druidId && e.talents);
  if (!ci?.talents || ci.talents.length !== 3) return null;
  const [balance, feral, restoration] = ci.talents.map((t) => t.id);
  return [balance, feral, restoration];
}
```

with:

```ts
async function fetchTalents(
  accessToken: string,
  host: HostKey,
  reportCode: string,
  fight: { id: number; startTime: number; endTime: number },
  druidId: number,
): Promise<[number, number, number] | null> {
  const data = (await graphql(
    accessToken,
    host,
    `query { reportData { report(code: "${reportCode}") { events(fightIDs: [${fight.id}], startTime: ${fight.startTime}, endTime: ${fight.endTime}, dataType: CombatantInfo) { data } } } }`,
  )) as {
    reportData: { report: { events: { data: WclEvent[] } } };
  };
  return parseTalentPoints(data.reportData.report.events.data, druidId);
}
```

- [ ] **Step 3: Remove the local `Bucket` type, `classifyBucket`, and `BUCKET_DEFINITIONS`**

Delete this entire block (now provided by Task 1's module):

```ts
type Bucket =
  | "deep-resto"
  | "likely-dreamstate-full"
  | "likely-dreamstate-partial"
  | "mostly-resto"
  | "mostly-balance"
  | "restokin-shaped"
  | "other-unclassified"
  | "unknown-no-talent-data";

// Order matters: deep-resto and the two dreamstate tiers are specific
// signatures checked first; "mostly-resto" vs "mostly-balance" is a
// same-priority fallback comparison between whichever tree actually has
// more points, not two independent thresholds — a 21/0/40 split has to land
// in "mostly-resto" (resto dominates) even though balance alone is >= 20.
// Feral is checked too: a 0/46/15 split isn't "mostly-resto" just because
// restoration > balance — Feral dominates both, so it falls through to
// "other-unclassified" (not a target archetype for this app at all) rather
// than being mislabeled as leaning Restoration.
function classifyBucket(
  balance: number,
  feral: number,
  restoration: number,
): Bucket {
  if (restoration >= 41) return "deep-resto";
  if (balance >= 33) return "likely-dreamstate-full";
  if (balance >= 31) return "likely-dreamstate-partial";
  if (restoration > balance && restoration > feral) return "mostly-resto";
  if (balance >= 20 && balance > feral) return "mostly-balance";
  return "other-unclassified";
}

const BUCKET_DEFINITIONS: Record<Bucket, string> = {
  "deep-resto": "Restoration >= 41 (Tree of Life-eligible)",
  "likely-dreamstate-full": "Balance >= 33 (full 3/3 Dreamstate-eligible)",
  "likely-dreamstate-partial": "Balance >= 31 (>=1 point Dreamstate-eligible)",
  "mostly-resto":
    "Restoration > Balance, but below deep-resto's 41-point cutoff and below Dreamstate's 31-point Balance threshold",
  "mostly-balance": "Balance >= Restoration and Balance >= 20",
  "restokin-shaped": "signature not yet determined — see story 900",
  "other-unclassified": "doesn't fit any bucket above",
  "unknown-no-talent-data": "talent read failed or unavailable",
};
```

- [ ] **Step 4: Rename remaining local `Bucket` references to `TalentBucket`**

In `interface ArchetypeEntry`, replace:

```ts
bucket: Bucket;
```

with:

```ts
bucket: TalentBucket;
```

In `interface ArchetypeFile`, replace:

```ts
bucketDefinitions: Record<Bucket, string>;
```

with:

```ts
bucketDefinitions: Record<TalentBucket, string>;
```

In `main()`, replace:

```ts
const bucket: Bucket =
  talents === null
    ? "unknown-no-talent-data"
    : classifyBucket(balance as number, feral as number, restoration as number);
```

with:

```ts
const bucket: TalentBucket =
  talents === null
    ? "unknown-no-talent-data"
    : classifyBucket(balance as number, feral as number, restoration as number);
```

- [ ] **Step 5: Verify the script still typechecks and behaves identically**

Run: `npm run typecheck`
Expected: PASS — `tsc -b && tsc --noEmit -p tsconfig.scripts.json` both clean. There is no automated test for this script (unchanged from before this task); typecheck plus Task 5's real-data spot-check are how correctness is confirmed, per `docs/testing.md`'s conventions for this tool.

- [ ] **Step 6: Commit**

```bash
git add scripts/tagArchetypes.ts
git commit -m "refactor(calibration): point tagArchetypes.ts at the shared archetypeDetection module"
```

---

### Task 3: `useArchetypeBucket` hook

**Files:**

- Create: `src/app/components/Scorecard/useArchetypeBucket.ts`
- Test: `src/app/components/Scorecard/useArchetypeBucket.test.ts`

**Interfaces:**

- Consumes: `classifyBucket`, `parseTalentPoints`, `TalentBucket` from `../../../report/archetypeDetection` (Task 1); `Fight` from `../../../wcl/client`; `WclEvent`, `WclEventDataType` from `../../../wcl/events`; `EventFetcherFight` from `../../../wcl/eventCache`.
- Produces: `ArchetypeBucketStatus` (`{status: "loading"} | {status: "error"; error: string} | {status: "ready"; bucket: TalentBucket}`) and `useArchetypeBucket(accessToken, reportCode, fight, druidId, fetchEvents): ArchetypeBucketStatus`, consumed by Task 4.

This hook mirrors `usePrepHygieneSummary.ts`'s exact structure, including that hook's real behavior of catching _any_ rejection from `fetchEvents` (not just compute-stage errors) into a local `error` status — confirmed by reading `usePrepHygieneSummary.test.ts`, which asserts a rejected `fetchEvents` call produces `{status: "error", error: "..."}`. A genuine WCL fetch failure is still separately escalated to the app's full-screen overlay by the already-wrapped `fetchEvents` passed in from `App.tsx` (per story 708) — this hook's local `error` status is a same redundant, immediate local display, not the sole handling path.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/Scorecard/useArchetypeBucket.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useArchetypeBucket } from "./useArchetypeBucket";
import { aCombatantInfoEvent, aFight } from "../../../testUtils/factories";

describe("useArchetypeBucket", () => {
  it("starts loading, then reports the classified bucket", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "CombatantInfo"
          ? [
              aCombatantInfoEvent({
                sourceID: 2,
                talents: [{ id: 45 }, { id: 0 }, { id: 16 }],
              }),
            ]
          : [],
      );

    const { result } = renderHook(() =>
      useArchetypeBucket(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({ status: "ready", bucket: "deep-resto" });
  });

  it("reports unknown-no-talent-data as a ready bucket, not an error, when talents can't be read", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useArchetypeBucket(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      bucket: "unknown-no-talent-data",
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useArchetypeBucket(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
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

Run: `npx vitest run src/app/components/Scorecard/useArchetypeBucket.test.ts`
Expected: FAIL — `Cannot find module './useArchetypeBucket'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/components/Scorecard/useArchetypeBucket.ts`:

```ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  classifyBucket,
  parseTalentPoints,
  type TalentBucket,
} from "../../../report/archetypeDetection";

export type ArchetypeBucketStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; bucket: TalentBucket };

type TaggedState = { accessToken: string; summary: ArchetypeBucketStatus };

export function useArchetypeBucket(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>,
): ArchetypeBucketStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo")
      .then((combatantInfoEvents) => {
        const talents = parseTalentPoints(combatantInfoEvents, druidId);
        const bucket: TalentBucket =
          talents === null
            ? "unknown-no-talent-data"
            : classifyBucket(talents[0], talents[1], talents[2]);
        setState({ accessToken, summary: { status: "ready", bucket } });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to detect talent archetype.",
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
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useArchetypeBucket.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useArchetypeBucket.ts src/app/components/Scorecard/useArchetypeBucket.test.ts
git commit -m "feat(scorecard): add useArchetypeBucket hook"
```

---

### Task 4: Wire the hook into `Scorecard` and render the archetype line

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.module.css`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `useArchetypeBucket` and `ArchetypeBucketStatus` from `./useArchetypeBucket` (Task 3); `BUCKET_DEFINITIONS`, `TalentBucket` from `../../../report/archetypeDetection` (Task 1).
- Produces: nothing new for later tasks — this is the terminal display for 903a. 903c/903d (separate stories) will read `useArchetypeBucket`'s output themselves when they're implemented.

- [ ] **Step 1: Add the hook call, label map, and rendered line to `Scorecard/index.tsx`**

Add this import alongside the existing ones in `src/app/components/Scorecard/index.tsx` (near the other same-directory imports):

```ts
import { useArchetypeBucket } from "./useArchetypeBucket";
import {
  BUCKET_DEFINITIONS,
  type TalentBucket,
} from "../../../report/archetypeDetection";
```

Add this constant below the existing `*_ICON` constants (before `export function Scorecard`):

```ts
const ARCHETYPE_LABELS: Record<TalentBucket, string> = {
  "deep-resto": "Deep resto",
  "likely-dreamstate-full": "Likely Dreamstate (full)",
  "likely-dreamstate-partial": "Likely Dreamstate (partial)",
  "mostly-resto": "Mostly Restoration",
  "mostly-balance": "Mostly Balance",
  "restokin-shaped": "Restokin-shaped",
  "other-unclassified": "Other/unclassified",
  "unknown-no-talent-data": "Unknown (talent read unavailable)",
};
```

Inside the `Scorecard` function body, add the hook call directly below the existing `useFightEpicSummaries(...)` call:

```ts
const archetypeStatus = useArchetypeBucket(
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
);
```

In the JSX, replace:

```tsx
      <p className={styles.druidLine}>{druidLabel}</p>
      <p className={styles.reportLine}>
```

with:

```tsx
      <p className={styles.druidLine}>{druidLabel}</p>
      <p className={styles.archetypeLine}>
        Talent archetype:{" "}
        {archetypeStatus.status === "loading" && "Calculating…"}
        {archetypeStatus.status === "error" && "unavailable"}
        {archetypeStatus.status === "ready" && (
          <span title={BUCKET_DEFINITIONS[archetypeStatus.bucket]}>
            {ARCHETYPE_LABELS[archetypeStatus.bucket]}
          </span>
        )}
      </p>
      <p className={styles.reportLine}>
```

- [ ] **Step 2: Add the CSS class**

In `src/app/components/Scorecard/index.module.css`, add directly below `.druidLine`:

```css
.archetypeLine {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-bottom: var(--space-1);
}
```

- [ ] **Step 3: Extend the existing Scorecard test to assert the archetype line**

In `src/app/components/Scorecard/index.test.tsx`, in the first test (`"renders the fight header, all 6 epic widgets, and the footer"`), the existing `fetchEvents = () => Promise.resolve([]);` returns `[]` for every dataType including `"CombatantInfo"`, which resolves to `bucket: "unknown-no-talent-data"`. Add this assertion directly after the existing `expect(screen.getByText("Fernwhisper — Restoration")).toBeInTheDocument();` line:

```ts
await waitFor(() =>
  expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
    "Talent archetype: Unknown (talent read unavailable)",
  ),
);
```

(`waitFor` is already imported in this file's first line — no import change needed.)

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS, all existing tests plus the new assertion.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/Scorecard/index.tsx src/app/components/Scorecard/index.module.css src/app/components/Scorecard/index.test.tsx
git commit -m "feat(scorecard): surface per-fight talent-archetype detection"
```

---

### Task 5: Real-data spot-check and story close-out

**Files:**

- Modify: `docs/backlog.md`
- Delete: `docs/specs/903a-archetype-detection-design.md`
- Delete: `docs/plans/903a-archetype-detection-plan.md` (this file)

**Interfaces:** None — this task is verification and documentation only, no code.

- [ ] **Step 1: Real-data spot-check against a known report**

This step requires `WCL_TEST_ACCESS_TOKEN` (see `docs/testing.md`) and is a manual verification, not an automated test. Run the app locally (`npm run dev`), load report `4GYHZRdtL3bvhpc8` (the project's canonical fixture report — see `docs/testing.md`'s known-reports table; also the report `aCombatantInfoEvent`'s test factory default is captured from), select the druid Dassz (WCL-confirmed the sole real resto druid in this report), open fight 6, and confirm the Scorecard header now shows `Talent archetype: Deep resto`. `docs/calibration-archetypes.json`'s existing `"4GYHZRdtL3bvhpc8:Dassz"` entry records `balance: 12, feral: 0, restoration: 49` for this exact druid — `classifyBucket(12, 0, 49)` returns `"deep-resto"` since `49 >= 41`, so this is the expected, cross-checkable result.

If it doesn't match, stop and debug before proceeding — do not mark the story done with a known real-data mismatch.

- [ ] **Step 2: Mark story 903a done in `docs/backlog.md`**

In `docs/backlog.md`, change the story 903a heading from:

```
### 903a — Per-fight talent-archetype detection 🔲 Todo
```

to:

```
### 903a — Per-fight talent-archetype detection ✅ Done
```

- [ ] **Step 3: Delete the spec and plan docs**

First, grep the repo to confirm nothing references either file path:

```bash
grep -rn "903a-archetype-detection" --include="*.md" --include="*.ts" --include="*.tsx" .
```

Expected: no references outside `docs/backlog.md`'s own prose about the story (which references the story number, not the file path).

Then delete both files:

```bash
git rm docs/specs/903a-archetype-detection-design.md docs/plans/903a-archetype-detection-plan.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md
git commit -m "$(cat <<'EOF'
docs: close out story 903a, retire its design spec and plan

Real-data spot-check against bKRZ68XqgwYkxtzm confirmed the in-app
detection matches docs/calibration-archetypes.json's existing offline
classification for the same druid.
EOF
)"
```
