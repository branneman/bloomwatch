# Faerie Fire duty detection (story 917, phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Tasks 5 and 7 are operational (regenerate data, run analysis), not code-writing** — they produce no diff to review; execute them directly rather than dispatching a coding subagent, and just confirm their completion criteria instead of a code review.

**Goal:** Build Faerie Fire ability resolution, boss-tier NPC resolution, and a pure FF-duty detector; wire them into the calibration pipeline; regenerate the relevant local corpus; run an empirical check of whether genuine FF duty measurably drags LB3 refresh cadence (202), accidental blooms (203), re-stack tax (204), or mana curve/consumable throughput (401/402); and record the findings. No mitigation is implemented in this phase — that is a separate, later spec informed by these findings.

**Architecture:** Three small, independently-testable pure/fetch pieces (ability resolution, boss-actor fetch, FF-duty detector) get composed inside the existing `scripts/lib/calibrateReport.ts` calibration pipeline, which already caches per-fight metric data for the whole local corpus. A new analysis script cross-references the newly-cached FF-duty flag against already-cached metric data to answer the story's empirical question.

**Tech Stack:** TypeScript, Vitest (Tier 1 unit + Tier 2 MSW-mocked integration per `docs/testing.md`), the existing `scripts/lib/` calibration tooling, real WCL API calls via `WCL_TEST_ACCESS_TOKEN`.

## Global Constraints

- No change to `src/metrics/deathForensics.ts`, `refreshCadence.ts`, `accidentalBlooms.ts`, `restackTax.ts`, `manaCurve.ts`, or `consumableThroughput.ts` — this phase only _reads_ their cached output, never changes their computation or thresholds.
- No UI changes anywhere in this phase — no new card, no change to any existing card's rendering.
- `fetchMasterDataAbilities`'s existing signature and return type in `src/wcl/client.ts` must not change (it's a live production UI dependency via `AbilityResolver`/`App.tsx`) — boss-actor resolution is a new, separate function.
- No em dashes in any new user-facing string (there are none planned in this phase, but the constraint carries forward if any doc/copy is touched).
- No internal/planning vocabulary ("story 917", epic letters, etc.) in any user-facing string — not a concern this phase (no UI strings), but applies to any future phase reusing this code.
- Spell/ability IDs are never hardcoded outside a resolved-at-runtime lookup table — Faerie Fire's gameIDs follow the same `masterData.abilities`-resolved convention as every other spell in this codebase.
- Run `npm run typecheck && npm run lint && npm run format:check` before every commit (pre-commit hook enforces this; don't bypass it).
- Story 917 stays `🔲 Todo` in `docs/backlog.md` after this plan completes — only phase 2 (mitigation) marks it `✅ Done`. Do not mark it Done as part of this plan.

---

### Task 1: Faerie Fire ability resolution

**Files:**

- Create: `src/abilities/resolveFaerieFireAbilityIds.ts`
- Test: `src/abilities/resolveFaerieFireAbilityIds.test.ts`

**Interfaces:**

- Consumes: `ReportAbility` (already exported from `src/wcl/client.ts`, shape `{ gameID: number; name: string }`).
- Produces: `resolveFaerieFireAbilityIds(reportAbilities: ReportAbility[]): Set<number>` — consumed by Task 4 (`scripts/lib/calibrateReport.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/abilities/resolveFaerieFireAbilityIds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveFaerieFireAbilityIds } from "./resolveFaerieFireAbilityIds";
import type { ReportAbility } from "../wcl/client";

describe("resolveFaerieFireAbilityIds", () => {
  it("resolves the live-confirmed gameID 26993", () => {
    const abilities: ReportAbility[] = [{ gameID: 26993, name: "Faerie Fire" }];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([26993]));
  });

  it("never includes Faerie Fire (Feral), even though it's a distinct real ability", () => {
    const abilities: ReportAbility[] = [
      { gameID: 26993, name: "Faerie Fire" },
      { gameID: 27011, name: "Faerie Fire (Feral)" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([26993]));
  });

  it("resolves an unrecognized gameID via exact name match, still excluding the Feral variant", () => {
    const abilities: ReportAbility[] = [
      { gameID: 99999, name: "Faerie Fire" },
      { gameID: 88888, name: "Faerie Fire (Feral)" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([99999]));
  });

  it("ignores unrelated abilities entirely", () => {
    const abilities: ReportAbility[] = [
      { gameID: 33763, name: "Lifebloom" },
      { gameID: 18562, name: "Swiftmend" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/abilities/resolveFaerieFireAbilityIds.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/abilities/resolveFaerieFireAbilityIds.ts`:

```ts
import type { ReportAbility } from "../wcl/client";

// gameID -> confirmed real "Faerie Fire" (not "Faerie Fire (Feral)") rank.
// 26993 is live-confirmed (cross-checked against two different reports'
// masterData.abilities) as the rank a level-70 raider shows. Faerie Fire
// is a debuff, not a heal, so it deliberately does not belong in
// resolveAbilities.ts's DruidHealingSpell union and gets its own
// resolution path here. Lower ranks are not yet enumerated -- add them
// here as they're confirmed, following this table's own precedent (each
// entry either live-confirmed or sourced from wowhead's TBC Classic spell
// listing, per story 906's convention).
const FAERIE_FIRE_GAME_IDS: ReadonlySet<number> = new Set([26993]);

// "Faerie Fire (Feral)" (gameID 27011, live-confirmed) is a separate,
// lesser ability Feral druids get for free in shapeshifted form -- not the
// spell Improved Faerie Fire modifies. Never counted, even as a fallback
// name match.
const FAERIE_FIRE_FERAL_NAME = "Faerie Fire (Feral)";
const FAERIE_FIRE_NAME = "Faerie Fire";

export function resolveFaerieFireAbilityIds(
  reportAbilities: ReportAbility[],
): Set<number> {
  const ids = new Set<number>();
  for (const ability of reportAbilities) {
    if (FAERIE_FIRE_GAME_IDS.has(ability.gameID)) {
      ids.add(ability.gameID);
      continue;
    }
    if (
      ability.name === FAERIE_FIRE_NAME &&
      ability.name !== FAERIE_FIRE_FERAL_NAME
    ) {
      ids.add(ability.gameID);
    }
  }
  return ids;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/abilities/resolveFaerieFireAbilityIds.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/abilities/resolveFaerieFireAbilityIds.ts src/abilities/resolveFaerieFireAbilityIds.test.ts
git commit -m "feat(abilities): resolve Faerie Fire ability IDs, excluding the Feral variant"
```

---

### Task 2: Boss-tier NPC actor resolution

**Files:**

- Modify: `src/wcl/client.ts`
- Test: `test/integration/client.test.ts`
- Create: `test/integration/fixtures/masterdata-actors.json`

**Interfaces:**

- Produces: `fetchBossActorIds(accessToken: string, reportCode: string, signal?: AbortSignal, host?: Host): Promise<Set<number>>` — consumed by Task 4 (`scripts/lib/calibrateReport.ts`).

- [ ] **Step 1: Write the failing test**

First inspect the existing `fetchMasterDataAbilities` tests in `test/integration/client.test.ts` to match its exact style (MSW `server.use`, `USER_API_URL`, existing fixture-loading pattern) — read the file before writing, since this step's code must match that file's real imports and helpers exactly.

Create `test/integration/fixtures/masterdata-actors.json`:

```json
{
  "data": {
    "reportData": {
      "report": {
        "masterData": {
          "actors": [
            { "id": 1, "name": "Dassz", "subType": "Unknown" },
            { "id": 149, "name": "Fathom-Lord Karathress", "subType": "Boss" },
            { "id": 146, "name": "Fathom-Guard Caribdis", "subType": "Boss" },
            { "id": 92, "name": "Coilfang Guardian", "subType": "NPC" }
          ]
        }
      }
    }
  }
}
```

Add this test to `test/integration/client.test.ts`, in the same `describe` block as the existing `fetchMasterDataAbilities` tests (import `fetchBossActorIds` alongside the other named imports at the top of the file, and import the new fixture alongside `masterDataAbilitiesFixture`):

```ts
describe("fetchBossActorIds", () => {
  it("resolves only actors tagged subType: Boss", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(masterDataActorsFixture)),
    );

    const ids = await fetchBossActorIds("test-token", "4GYHZRdtL3bvhpc8");

    expect(ids).toEqual(new Set([149, 146]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/client.test.ts -t "fetchBossActorIds"`
Expected: FAIL — `fetchBossActorIds` is not exported yet.

- [ ] **Step 3: Write the implementation**

In `src/wcl/client.ts`, add this new exported function (place it near `fetchReportFights`/`fetchCastsTable` — it uses the same retrying `postGraphQL` wrapper those two use, not the raw `postGraphQLOnce` `fetchMasterDataAbilities` calls directly; `fetchMasterDataAbilities` only bypasses the wrapper because it layers its own extra retry logic on top for a specific "not yet analyzed" null-data quirk that doesn't apply to actor data):

```ts
export async function fetchBossActorIds(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<Set<number>> {
  const query = `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      masterData { actors(type: "NPC") { id subType } }
    }
  }
}`;

  const data = await postGraphQL(accessToken, query, signal, host);
  const actors = data.reportData.report.masterData.actors as Array<{
    id: number;
    subType: string;
  }>;

  const bossIds = new Set<number>();
  for (const actor of actors) {
    if (actor.subType === "Boss") {
      bossIds.add(actor.id);
    }
  }
  return bossIds;
}
```

Check `postGraphQLOnce`'s exact signature/import in this file before writing (it's already used by `fetchMasterDataAbilities` above this function) to make sure the call matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/client.test.ts -t "fetchBossActorIds"`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full integration test file and static analysis**

Run: `npx vitest run test/integration/client.test.ts && npm run typecheck && npm run lint`
Expected: all PASS — confirms the new function didn't break any existing test in this file.

- [ ] **Step 6: Commit**

```bash
git add src/wcl/client.ts test/integration/client.test.ts test/integration/fixtures/masterdata-actors.json
git commit -m "feat(wcl-client): add fetchBossActorIds, resolving subType: Boss NPCs"
```

---

### Task 3: The FF-duty detector

**Files:**

- Create: `src/metrics/faerieFireDuty.ts`
- Test: `src/metrics/faerieFireDuty.test.ts`

**Interfaces:**

- Consumes: `WclEvent` (`src/wcl/events.ts`, existing type).
- Produces: `FaerieFireDutyResult { onDuty: boolean; bossCastCount: number; castSpanMs: number }` and `computeFaerieFireDuty(castEvents, druidId, faerieFireAbilityIds, bossActorIds, fightDurationMs): FaerieFireDutyResult` — consumed by Task 4 (`scripts/lib/calibrateReport.ts`).

- [ ] **Step 1: Write the failing tests**

First check `src/testUtils/factories.ts` for an existing cast-event factory (e.g. `aCastEvent`) and its exact override shape — read it before writing, to use real factory conventions rather than hand-rolling event objects.

Create `src/metrics/faerieFireDuty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeFaerieFireDuty } from "./faerieFireDuty";
import { aCastEvent } from "../testUtils/factories";

const FF_ID = 26993;
const BOSS_A = 149;
const BOSS_B = 146;
const NON_BOSS = 92;

describe("computeFaerieFireDuty", () => {
  it("is not on duty for a single incidental cast (the confirmed real one-off case)", () => {
    // Mirrors t3qNHgVKd46YDaj9 fight 12: 1 cast, 46s fight.
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 36000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      46000,
    );
    expect(result.onDuty).toBe(false);
    expect(result.bossCastCount).toBe(1);
  });

  it("is on duty for sustained single-target casting meeting both thresholds", () => {
    // Mirrors gNYhK1ZAP7RQz2pa fight 18 shape: refreshed roughly every
    // ~35-39s across most of a ~199s fight.
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 2000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 39000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 78000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 116000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 150000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 184000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      199000,
    );
    expect(result.onDuty).toBe(true);
    expect(result.bossCastCount).toBe(6);
    expect(result.castSpanMs).toBe(182000);
  });

  it("ignores casts on a non-boss target entirely, regardless of count", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: NON_BOSS,
        timestamp: i * 20000,
      }),
    );
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      200000,
    );
    expect(result.onDuty).toBe(false);
    expect(result.bossCastCount).toBe(0);
  });

  it("combines casts across multiple simultaneous boss-tagged targets (council-fight shape)", () => {
    const events = [
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 5000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_B,
        timestamp: 8000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 45000,
      }),
      aCastEvent({
        sourceID: 2,
        abilityGameID: FF_ID,
        targetID: BOSS_B,
        timestamp: 90000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A, BOSS_B]),
      100000,
    );
    expect(result.bossCastCount).toBe(4);
    expect(result.castSpanMs).toBe(85000);
    expect(result.onDuty).toBe(true);
  });

  it("ignores casts from a different source (not this druid)", () => {
    const events = [
      aCastEvent({
        sourceID: 99,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 5000,
      }),
      aCastEvent({
        sourceID: 99,
        abilityGameID: FF_ID,
        targetID: BOSS_A,
        timestamp: 45000,
      }),
    ];
    const result = computeFaerieFireDuty(
      events,
      2,
      new Set([FF_ID]),
      new Set([BOSS_A]),
      100000,
    );
    expect(result.bossCastCount).toBe(0);
    expect(result.onDuty).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/metrics/faerieFireDuty.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/metrics/faerieFireDuty.ts`:

```ts
import type { WclEvent } from "../wcl/events";

export interface FaerieFireDutyResult {
  onDuty: boolean;
  bossCastCount: number;
  castSpanMs: number;
}

// Provisional thresholds, sourced from real corpus sampling during this
// story's scoping (docs/specs/faerie-fire-duty-detection-design.md):
// single-boss fights showed real refresh cadence clustering 20-37s with
// cast-span coverage typically 60-96% of fight duration. Council fights
// break a combined median-interval measurement entirely (casts interleave
// across simultaneous targets), so this detector deliberately checks only
// cast count and span, not cadence -- a boolean "on duty" signal, not a
// quality measurement (that's story 918's job). Both constants are
// provisional pending the empirical study this same story runs.
const MIN_CAST_COUNT_FLOOR = 2;
const CAST_COUNT_PER_MS = 1 / 80_000;
const MIN_SPAN_SHARE = 0.5;

export function computeFaerieFireDuty(
  castEvents: WclEvent[],
  druidId: number,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
  fightDurationMs: number,
): FaerieFireDutyResult {
  const timestamps = castEvents
    .filter(
      (event) =>
        event.sourceID === druidId &&
        event.type === "cast" &&
        event.abilityGameID !== undefined &&
        faerieFireAbilityIds.has(event.abilityGameID) &&
        event.targetID !== undefined &&
        bossActorIds.has(event.targetID),
    )
    .map((event) => event.timestamp)
    .sort((a, b) => a - b);

  const bossCastCount = timestamps.length;
  const castSpanMs =
    bossCastCount > 1 ? timestamps[bossCastCount - 1] - timestamps[0] : 0;

  const requiredCount = Math.max(
    MIN_CAST_COUNT_FLOOR,
    Math.ceil(fightDurationMs * CAST_COUNT_PER_MS),
  );
  const requiredSpanMs = fightDurationMs * MIN_SPAN_SHARE;

  const onDuty = bossCastCount >= requiredCount && castSpanMs >= requiredSpanMs;

  return { onDuty, bossCastCount, castSpanMs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/metrics/faerieFireDuty.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/faerieFireDuty.ts src/metrics/faerieFireDuty.test.ts
git commit -m "feat(metrics): add computeFaerieFireDuty boolean detector"
```

---

### Task 4: Wire FF-duty computation into the calibration pipeline

**Files:**

- Modify: `scripts/lib/calibrateReport.ts`
- Modify: `scripts/lib/types.ts`

**Interfaces:**

- Consumes: `resolveFaerieFireAbilityIds` (Task 1), `fetchBossActorIds` (Task 2), `computeFaerieFireDuty`/`FaerieFireDutyResult` (Task 3).
- Produces: `FightResult.faerieFireDuty: FaerieFireDutyResult` — consumed by Task 6 (analysis script).

- [ ] **Step 1: Read the current files fully**

Read `scripts/lib/calibrateReport.ts` and `scripts/lib/types.ts` in full before editing — this task threads a new field through an existing pipeline, and the exact surrounding code (import block, `ReportContext` interface, `buildReportContext`'s return object, `computeFightResult`'s existing `Promise.all` fetch block and its final returned `FightResult` object) must match what's actually there, not what's paraphrased below.

- [ ] **Step 2: Add the new field to `FightResult` in `scripts/lib/types.ts`**

Add an import at the top of `scripts/lib/types.ts`:

```ts
import type { FaerieFireDutyResult } from "../../src/metrics/faerieFireDuty";
```

Add a new field to the `FightResult` interface, alongside the existing `epics` field:

```ts
export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  hasNaturesSwiftness: boolean;
  faerieFireDuty: FaerieFireDutyResult;
  epics: {
    // ...unchanged...
  };
}
```

- [ ] **Step 3: Fetch Faerie Fire ability IDs and boss actor IDs once per report in `buildReportContext`**

In `scripts/lib/calibrateReport.ts`, add imports:

```ts
import { resolveFaerieFireAbilityIds } from "../../src/abilities/resolveFaerieFireAbilityIds";
import { fetchBossActorIds } from "../../src/wcl/client";
```

(`fetchBossActorIds` joins the existing `fetchReportFights, fetchCastsTable, fetchMasterDataAbilities` import from `"../../src/wcl/client"` — add it to that same import statement rather than a new one.)

In `buildReportContext`, after the existing `const reportAbilities = await fetchMasterDataAbilities(...)` call, add:

```ts
const faerieFireAbilityIds = resolveFaerieFireAbilityIds(reportAbilities);
const bossActorIds = await fetchBossActorIds(
  accessToken,
  reportCode,
  undefined,
  host,
);
```

Add both to the `ReportContext` interface (alongside the other `*AbilityIds` fields) and to the object `buildReportContext` returns:

```ts
export interface ReportContext {
  // ...existing fields...
  faerieFireAbilityIds: Set<number>;
  bossActorIds: Set<number>;
}
```

```ts
return {
  // ...existing fields...
  faerieFireAbilityIds,
  bossActorIds,
};
```

- [ ] **Step 4: Compute FF-duty per fight in `computeFightResult`**

In `computeFightResult`, after the existing `const [buffEvents, castEvents, healingEvents, deathEvents, combatantInfoEvents] = await Promise.all([...])` block (`castEvents` is already fetched there for other metrics — no new fetch needed), add:

```ts
import { computeFaerieFireDuty } from "../../src/metrics/faerieFireDuty";
```

(add this import alongside the other `src/metrics/*` imports at the top of the file)

```ts
const faerieFireDuty = computeFaerieFireDuty(
  castEvents,
  druidId,
  ctx.faerieFireAbilityIds,
  ctx.bossActorIds,
  durationMs,
);
```

Add `faerieFireDuty` to the object `computeFightResult` returns, alongside the existing `epics` field (read the function's current return statement first to match its exact shape).

- [ ] **Step 5: Run static analysis**

Run: `npm run typecheck && npm run lint`
Expected: PASS — confirms the new field is threaded through correctly with no type errors in either `calibrateReport.ts` or any file that constructs/consumes `FightResult` (e.g. `scripts/lib/rollup.ts`, if it pattern-matches the full shape — check it compiles; if `rollup.ts` doesn't touch `faerieFireDuty` at all, that's expected and fine, it only rolls up `epics`).

- [ ] **Step 6: Smoke-test against one real report**

Run: `npm run calibrate -- 4GYHZRdtL3bvhpc8`
Expected: succeeds, writes `calibration-data/4GYHZRdtL3bvhpc8.json`. Inspect the output file's first fight entry and confirm it now has a `faerieFireDuty: { onDuty, bossCastCount, castSpanMs }` field alongside `epics`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/calibrateReport.ts scripts/lib/types.ts
git commit -m "feat(calibrate): compute and cache FF-duty per fight"
```

---

### Task 5: Regenerate calibration data for the Balance-leaning-bucket corpus

**This task is operational — no code changes, nothing to review as a diff.** Execute it directly (not via a coding subagent); its only deliverable is refreshed `calibration-data/*.json` files (gitignored, not committed) carrying the new `faerieFireDuty` field.

- [ ] **Step 1: Build the report list**

Extract every report code tagged `likely-dreamstate-full`, `likely-dreamstate-partial`, or `mostly-balance` in `docs/calibration-archetypes.json`:

```bash
node -e "
const d = require('./docs/calibration-archetypes.json');
const codes = new Set();
for (const [key, entry] of Object.entries(d.reports)) {
  if (['likely-dreamstate-full','likely-dreamstate-partial','mostly-balance'].includes(entry.bucket)) {
    codes.add(key.split(':')[0]);
  }
}
console.log([...codes].join('\n'));
" > /tmp/ff-corpus-reports.txt
wc -l /tmp/ff-corpus-reports.txt
```

- [ ] **Step 2: Regenerate each report**

```bash
while read -r code; do
  echo "=== $code ==="
  npm run calibrate -- "$code" || echo "FAILED: $code"
done < /tmp/ff-corpus-reports.txt
```

Expected: each line prints a success message (`Wrote calibration-data/<code>.json — N druid(s), M fight(s) each.`) or, for the one known archived-report case (`mtRh3kJ9YMLazyvQ`, `source: "classic"`), it should still succeed (unlike the raw `wcl:query` tool, `calibrate.ts` uses the same `/api/v2/user`-backed fetch functions the live app uses, which do reach archived reports per this project's own account access — confirm this rather than assume it). Note any real failures (rate limiting, a report that genuinely 404s) and retry those individually after a pause.

- [ ] **Step 3: Spot-check the refreshed data**

```bash
python3 -c "
import json
d = json.load(open('calibration-data/1d7zP2nJqvhVW3Qa.json'))
fight = d['druids'][0]['fights'][0]
print('faerieFireDuty' in fight, fight.get('faerieFireDuty'))
"
```

Expected: `True` and a real `{onDuty, bossCastCount, castSpanMs}` object, confirming the regenerated cache actually carries the new field (not stale data from before Task 4 landed).

---

### Task 6: The FF-duty-drag analysis script

**Files:**

- Create: `scripts/analyzeFaerieFireDrag.ts`
- Modify: `package.json` (add an npm script alias)

**Interfaces:**

- Consumes: `calibration-data/*.json` (via `fs`), `docs/calibration-archetypes.json` (via `fs`).
- Produces: a findings report printed to stdout — consumed by Task 7 (run it) and Task 8 (transcribe its output into `docs/backlog.md`/`docs/thresholds.md`).

- [ ] **Step 1: Confirm the cached shape matches what this plan assumes**

Before writing, read one real file (e.g. `calibration-data/1d7zP2nJqvhVW3Qa.json`) and confirm its shape matches what Step 2 below assumes: each druid entry has `healingCastCount`; each fight has `epics.lifebloomDiscipline.metrics.refreshCadence.medianMs`, `.accidentalBlooms.count`, `.restackTax.castCount`, and `epics.manaEconomy.metrics.manaCurve.endingPct` (a number, `null` when the fight is exempt per story 401's own duration rule) plus `epics.manaEconomy.metrics.consumableThroughput.rows` (an array of `{ label: string; used: number; expectedFloor: number; judgement: string | null }`, confirmed live this session to contain a `"Mana Potion"` row and a `"Rune"` row). If real data disagrees with this, stop and adjust Step 2 to match reality rather than guessing further.

- [ ] **Step 2: Write the analysis script**

Create `scripts/analyzeFaerieFireDrag.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

const BALANCE_LEANING_BUCKETS = new Set([
  "likely-dreamstate-full",
  "likely-dreamstate-partial",
  "mostly-balance",
]);

// A druid averaging fewer than this many healing casts per fight isn't
// really healing at all -- the same real-participation gap found live
// this story's scoping session (Serpentx: 26 total healing casts across
// 12 fights; Toxickn: 11 across 12 -- both pure Boomkin alts mistagged by
// docs/calibration-archetypes.json's talent-points-only bucketing).
const MIN_HEALING_CASTS_PER_FIGHT = 20;

interface ArchetypeEntry {
  druidId: number;
  druidName: string;
  bucket: string;
}
interface ArchetypeFile {
  reports: Record<string, ArchetypeEntry>;
}

interface MetricSample {
  ffDuty: number[];
  nonFfDuty: number[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function report(name: string, sample: MetricSample): void {
  console.log(`\n=== ${name} ===`);
  console.log(
    `FF-duty fights:     n=${sample.ffDuty.length}, median=${median(sample.ffDuty)}`,
  );
  console.log(
    `non-FF-duty fights: n=${sample.nonFfDuty.length}, median=${median(sample.nonFfDuty)}`,
  );
}

async function main(): Promise<void> {
  const archetypeRaw = await readFile(
    "docs/calibration-archetypes.json",
    "utf8",
  );
  const archetypeFile = JSON.parse(archetypeRaw) as ArchetypeFile;

  const refreshCadence: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const accidentalBlooms: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const restackTax: MetricSample = { ffDuty: [], nonFfDuty: [] };
  const endingManaPct: MetricSample = { ffDuty: [], nonFfDuty: [] };
  // Summed across both consumable rows (Mana Potion + Rune): used minus
  // its own expected floor. A more negative number means further under
  // the expected floor -- the thing story 917 is asking whether FF duty
  // drags down (mana spent on FF, none left over for consumables).
  const consumableFloorDelta: MetricSample = { ffDuty: [], nonFfDuty: [] };

  for (const [key, entry] of Object.entries(archetypeFile.reports)) {
    if (!BALANCE_LEANING_BUCKETS.has(entry.bucket)) continue;
    const reportCode = key.split(":")[0];

    let cacheRaw: string;
    try {
      cacheRaw = await readFile(
        path.join("calibration-data", `${reportCode}.json`),
        "utf8",
      );
    } catch {
      continue; // not (yet) regenerated -- Task 5 should have covered this
    }
    const cache = JSON.parse(cacheRaw);
    const druid = cache.druids.find(
      (d: { druidId: number }) => d.druidId === entry.druidId,
    );
    if (!druid) continue;

    const fights = druid.fights as Array<{
      durationMs: number;
      faerieFireDuty: { onDuty: boolean };
      epics: {
        lifebloomDiscipline: {
          status: string;
          metrics?: {
            refreshCadence?: { medianMs: number };
            accidentalBlooms?: { count: number };
            restackTax?: { castCount: number };
          };
        };
        manaEconomy: {
          status: string;
          metrics?: {
            manaCurve?: { endingPct: number | null };
            consumableThroughput?: {
              rows: Array<{ used: number; expectedFloor: number }>;
            };
          };
        };
      };
    }>;

    const healingCastsPerFight =
      druid.healingCastCount / Math.max(fights.length, 1);
    if (healingCastsPerFight < MIN_HEALING_CASTS_PER_FIGHT) continue;

    for (const fight of fights) {
      const bucket = fight.faerieFireDuty.onDuty ? "ffDuty" : "nonFfDuty";

      if (fight.epics.lifebloomDiscipline.status === "ready") {
        const metrics = fight.epics.lifebloomDiscipline.metrics;
        if (metrics?.refreshCadence) {
          refreshCadence[bucket].push(metrics.refreshCadence.medianMs);
        }
        if (metrics?.accidentalBlooms) {
          accidentalBlooms[bucket].push(metrics.accidentalBlooms.count);
        }
        if (metrics?.restackTax) {
          restackTax[bucket].push(metrics.restackTax.castCount);
        }
      }

      if (fight.epics.manaEconomy.status === "ready") {
        const metrics = fight.epics.manaEconomy.metrics;
        if (
          metrics?.manaCurve?.endingPct !== null &&
          metrics?.manaCurve?.endingPct !== undefined
        ) {
          endingManaPct[bucket].push(metrics.manaCurve.endingPct);
        }
        if (metrics?.consumableThroughput) {
          const delta = metrics.consumableThroughput.rows.reduce(
            (sum, row) => sum + (row.used - row.expectedFloor),
            0,
          );
          consumableFloorDelta[bucket].push(delta);
        }
      }
    }
  }

  report("LB3 refresh cadence (median ms)", refreshCadence);
  report("Accidental blooms (count)", accidentalBlooms);
  report("Re-stack tax (cast count)", restackTax);
  report("Ending mana %", endingManaPct);
  report("Consumable used-minus-floor delta (summed)", consumableFloorDelta);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script alias**

In `package.json`'s `"scripts"` block, add (alphabetically or near `"calibrate"` — match the file's existing ordering convention):

```json
"analyze:ff-drag": "tsx scripts/analyzeFaerieFireDrag.ts"
```

- [ ] **Step 4: Run static analysis**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/analyzeFaerieFireDrag.ts package.json
git commit -m "feat(scripts): add Faerie Fire duty vs. non-duty metric-drag analysis"
```

---

### Task 7: Run the analysis and capture findings

**This task is operational — no code changes.** Execute directly.

- [ ] **Step 1: Run the analysis script**

```bash
npm run analyze:ff-drag
```

- [ ] **Step 2: Record the raw output**

Save the full stdout output somewhere durable for Task 8 to transcribe from (e.g. redirect to a scratch file: `npm run analyze:ff-drag > /tmp/ff-drag-findings.txt 2>&1`, then read it). Note the sample sizes (`n=`) for each metric's FF-duty and non-FF-duty groups — if any group's `n` is very small (single digits), say so explicitly in Task 8's write-up rather than treating a thin sample as a confident finding, matching this repo's existing calibration-write-up honesty convention (e.g. story 910's own note about widening its sample when deaths were rare).

---

### Task 8: Write up the findings

**Files:**

- Modify: `docs/backlog.md`
- Modify: `docs/thresholds.md`

**Interfaces:** none (docs-only, transcribing Task 7's real output).

- [ ] **Step 1: Add a "Findings so far" paragraph to story 917's backlog entry**

In `docs/backlog.md`, under story 917's existing acceptance criteria (before the `---` that separates it from story 918), add a paragraph following this repo's established calibration-finding format (see stories 909-911 for the exact tone/structure: state the sample, state the real numbers, state the conclusion per metric). For each of the 4 candidate metrics, state whether Task 7's real numbers show a measurable difference between FF-duty and non-FF-duty fights, or "checked, no mitigation needed" if not — using Task 7's actual output, not a guess. Note explicitly that phase 2 (mitigation design/implementation, informed by these findings) is a separate future spec, and that story 917 remains `🔲 Todo` until phase 2 lands.

- [ ] **Step 2: Add a dated section to `docs/thresholds.md`**

Add a dated paragraph (today's date) to each relevant existing epic section — "Lifebloom discipline (epic C)" for refresh cadence/accidental blooms/re-stack tax findings, "Mana economy (epic E)" for the mana curve/consumable throughput finding — matching the existing convention (see story 909-911's own dated paragraphs in those same sections for exact tone/format). Do not add a new top-level "Epic I" section; every existing Epic I finding in this file lives under the epic section of the metric it's about, not its own heading.

- [ ] **Step 3: Run static analysis**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: PASS (docs-only change, but the pre-commit hook runs full-project static analysis regardless)

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/thresholds.md
git commit -m "docs: record Faerie Fire duty metric-drag findings (story 917 phase 1)"
```
