# Calibration tooling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/calibrate.ts` (report code → full JSON dump of every judged/informational metric, for every resto druid detected, per fight and rolled up across the whole report) and `scripts/wcl-query.ts` (a generic authenticated GraphQL query runner), per `docs/specs/calibration-tooling-design.md`.

**Architecture:** Both scripts run via `tsx` (new dev dependency) against real Node, calling the app's existing pure `compute*` functions (`src/metrics/*.ts`) and WCL fetch functions (`src/wcl/*.ts`) directly — no new business logic duplicates what's already tested at Tier 1; only the fetch-wiring glue (which `dataType`/`includeResources` each metric needs) is replicated, mirroring what `src/app/components/Scorecard/use*Summary.ts` hooks already do for the UI.

**Tech Stack:** TypeScript, `tsx` (new), Node's built-in `fetch`/`fs/promises`, `dotenv` (already a dependency).

## Global Constraints

- No new automated test tier for these scripts (per the design doc) — they sit alongside `test:contract`/`test:e2e`: real API only, on demand, no CI wiring, no vitest. Every task below is verified by **running the real script/module against the real WCL API** using the known fixture report `4GYHZRdtL3bvhpc8` (`docs/testing.md`'s canonical report — one resto druid, Dassz, among four druids), not by writing `.test.ts` files.
- **The worktree this plan executes in needs its own `.env.local`** with `WCL_TEST_ACCESS_TOKEN` set — it's gitignored (matches `*.local`) so a fresh worktree checkout won't have it automatically. Before Task 1, copy it from the main checkout: `cp /Users/bran/Source/bloomwatch/.env.local .env.local` (adjust the source path to wherever the main checkout actually lives — do not hardcode a worktree path here, per this repo's own memory note about worktree path reuse).
- Every relative import from `scripts/` into `src/` uses **no file extension** (`from "../src/metrics/gcdUtilization"`, not `.../gcdUtilization.ts`) — confirmed empirically (see Task 1) that `tsconfig.scripts.json` uses `moduleResolution: "bundler"` to match `src/`'s own style, specifically so nothing in `src/` needs touching.
- Never modify any file under `src/` as part of this plan — every task only adds files under `scripts/`, `calibration-data/`, and config/doc files explicitly named below.
- Commit after every task (small, working increments) using Conventional Commits (`feat(calibration): ...`, `docs: ...`).

---

### Task 1: Tooling setup — `tsx`, `tsconfig.scripts.json`, shared env loader

**Files:**

- Create: `tsconfig.scripts.json`
- Modify: `package.json`
- Create: `scripts/lib/env.ts`

**Interfaces:**

- Produces: `loadAccessToken(): string` — exported from `scripts/lib/env.ts`, throws-via-`process.exit(1)` with a clear message if `WCL_TEST_ACCESS_TOKEN` isn't set. Every later task imports this.

- [ ] **Step 1: Add `tsx` as a dev dependency**

```bash
npm install --save-dev tsx
```

- [ ] **Step 2: Create `tsconfig.scripts.json`**

This is deliberately a **separate** config from `tsconfig.node.json` — `tsconfig.node.json` uses `module: "nodenext"`, which requires every relative import (including ones _inside_ `src/`, e.g. `src/metrics/gcdUtilization.ts`'s own `import ... from "../wcl/events"`) to carry an explicit file extension. `src/` doesn't follow that convention (it uses `tsconfig.app.json`'s `moduleResolution: "bundler"`, which doesn't require extensions) — adding `scripts` to `tsconfig.node.json`'s `include` was tried and fails with `TS2835: Relative import paths need explicit file extensions` on every file `scripts/` transitively imports from `src/`. Fixing that would mean touching every import statement across `src/`, which this plan must not do. A dedicated config matching `tsconfig.app.json`'s resolution style (minus DOM/JSX, plus `types: ["node"]`) avoids the problem entirely.

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.scripts.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["scripts"]
}
```

- [ ] **Step 3: Wire it into `npm run typecheck` and add script entrypoints**

In `package.json`'s `"scripts"` block, change:

```json
    "typecheck": "tsc -b",
```

to:

```json
    "typecheck": "tsc -b && tsc --noEmit -p tsconfig.scripts.json",
```

and add two new entries (anywhere in the block, e.g. after `"typecheck"`):

```json
    "calibrate": "tsx scripts/calibrate.ts",
    "wcl:query": "tsx scripts/wcl-query.ts",
```

These reference files that don't exist yet (created in Tasks 2 and 6) — that's fine, `npm run typecheck`/`lint` don't fail over an npm script pointing at a not-yet-created file, only over files that exist and have errors.

- [ ] **Step 4: Create `scripts/lib/env.ts`**

```ts
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export function loadAccessToken(): string {
  const token = process.env.WCL_TEST_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "WCL_TEST_ACCESS_TOKEN is not set. Add it to .env.local — see docs/testing.md's " +
        '"Secrets & credentials" section for how to obtain one.',
    );
    process.exit(1);
  }
  return token;
}
```

- [ ] **Step 5: Verify**

```bash
npx tsx -e "import('./scripts/lib/env.ts').then(m => console.log(typeof m.loadAccessToken))"
```

Expected: `function`

```bash
npm run typecheck
```

Expected: exits 0, no errors (confirms `tsconfig.scripts.json` is wired in and clean with only `env.ts` present so far).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.scripts.json package.json package-lock.json scripts/lib/env.ts
git commit -m "chore(scripts): add tsx runner and shared WCL auth loader"
```

---

### Task 2: `scripts/wcl-query.ts` — generic GraphQL query runner

**Files:**

- Create: `scripts/wcl-query.ts`

**Interfaces:**

- Consumes: `loadAccessToken()` from `./lib/env` (Task 1).
- Produces: nothing importable — this is a CLI entrypoint only, invoked via `npm run wcl:query --`.

- [ ] **Step 1: Write `scripts/wcl-query.ts`**

```ts
import { readFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";

const HOSTS = {
  www: "https://www.warcraftlogs.com/api/v2/client",
  classic: "https://classic.warcraftlogs.com/api/v2/client",
  fresh: "https://fresh.warcraftlogs.com/api/v2/client",
} as const;
type HostKey = keyof typeof HOSTS;

function isHostKey(value: string): value is HostKey {
  return value === "www" || value === "classic" || value === "fresh";
}

interface ParsedArgs {
  host: HostKey;
  query: string | null;
  filePath: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let host: HostKey = "www";
  let query: string | null = null;
  let filePath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") {
      const value = argv[++i];
      if (value === undefined || !isHostKey(value)) {
        throw new Error(
          `--host must be one of www, classic, fresh (got "${value}")`,
        );
      }
      host = value;
    } else if (arg === "--file") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--file requires a path");
      filePath = value;
    } else {
      query = arg;
    }
  }

  return { host, query, filePath };
}

function printUsage(): void {
  console.error(
    "Usage: npm run wcl:query -- '<graphql query>' [--host www|classic|fresh]",
  );
  console.error(
    "       npm run wcl:query -- --file path/to/query.graphql [--host www|classic|fresh]",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const queryText = args.filePath
    ? await readFile(args.filePath, "utf8")
    : args.query;

  if (!queryText) {
    printUsage();
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  const response = await fetch(HOSTS[args.host], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: queryText }),
  });

  const body: unknown = await response.json();
  console.log(JSON.stringify(body, null, 2));

  // WCL's API returns HTTP 200 even for GraphQL-level errors (e.g. an
  // invalid field) — the error lives in the response body, not the status
  // code, so `response.ok` alone misses it.
  const hasGraphQLErrors =
    typeof body === "object" &&
    body !== null &&
    "errors" in body &&
    Array.isArray((body as { errors: unknown }).errors);

  if (!response.ok || hasGraphQLErrors) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Verify against the real API**

```bash
npm run wcl:query -- 'query { rateLimitData { limitPerHour pointsSpentThisHour } }'
```

Expected: prints formatted JSON containing `"rateLimitData"` with real numbers, exits 0.

```bash
npm run wcl:query -- 'query { worldData { zone(id: 1056) { name } } }' --host www
```

Expected: prints `"name": "SSC / TK"`.

```bash
npm run wcl:query -- 'query { nonsenseField }'
```

Expected: prints a JSON body containing an `"errors"` array, exits 1 (non-zero exit code — check via `echo $?`).

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
```

Expected: exits 0.

```bash
git add scripts/wcl-query.ts
git commit -m "feat(scripts): add generic WCL GraphQL query runner"
```

---

### Task 3: `scripts/lib/types.ts` and report-context building

**Files:**

- Create: `scripts/lib/types.ts`
- Create: `scripts/lib/calibrateReport.ts`

**Interfaces:**

- Consumes: `fetchReportFights`, `fetchCastsTable`, `fetchMasterDataAbilities` (`src/wcl/client`); `createEventFetcher` (`src/wcl/eventCache`); `detectDruids` (`src/report/druidDetection`); `buildFightRows` (`src/report/fightRows`); `resolveAbilities`, `resolveSpellAbilityIds` (`src/abilities/resolveAbilities`).
- Produces: `ReportContext` type and `buildReportContext(accessToken: string, reportCode: string): Promise<ReportContext>`, both exported from `scripts/lib/calibrateReport.ts`. Task 4 consumes both.

- [ ] **Step 1: Write `scripts/lib/types.ts`**

```ts
import type { Judgement } from "../../src/metrics/judgement";
import type { GcdUtilizationResult } from "../../src/metrics/gcdUtilization";
import type { IdleGapsResult } from "../../src/metrics/idleGaps";
import type { Lb3UptimeResult } from "../../src/metrics/lb3Uptime";
import type { RefreshCadenceResult } from "../../src/metrics/refreshCadence";
import type { AccidentalBloomsResult } from "../../src/metrics/accidentalBlooms";
import type { RestackTaxResult } from "../../src/metrics/restackTax";
import type { HotClipDetectionResult } from "../../src/metrics/hotClipDetection";
import type { SwiftmendAuditResult } from "../../src/metrics/swiftmendAudit";
import type { DownrankingDisciplineResult } from "../../src/metrics/downrankingDiscipline";
import type { ManaCurveResult } from "../../src/metrics/manaCurve";
import type { ConsumableThroughputResult } from "../../src/metrics/consumableThroughput";
import type { OverhealTableResult } from "../../src/metrics/overhealTable";
import type { InnervateAuditResult } from "../../src/metrics/innervateAudit";
import type { DeathForensicsResult } from "../../src/metrics/deathForensics";
import type { PrepHygieneResult } from "../../src/metrics/prepHygiene";
import type { ConcurrentLb3Result } from "../../src/metrics/concurrentLb3Targets";
import type { NaturesSwiftnessAuditResult } from "../../src/metrics/naturesSwiftnessAudit";

export interface GcdEconomyMetrics {
  gcdUtilization: GcdUtilizationResult;
  idleGaps: IdleGapsResult;
}
export interface LifebloomDisciplineMetrics {
  lb3Uptime: Lb3UptimeResult;
  refreshCadence: RefreshCadenceResult;
  accidentalBlooms: AccidentalBloomsResult;
  restackTax: RestackTaxResult;
}
export interface SpellDisciplineMetrics {
  hotClipDetection: HotClipDetectionResult;
  swiftmendAudit: SwiftmendAuditResult;
  downrankingDiscipline: DownrankingDisciplineResult;
}
export interface ManaEconomyMetrics {
  manaCurve: ManaCurveResult;
  consumableThroughput: ConsumableThroughputResult;
  overhealTable: OverhealTableResult;
  innervateAudit: InnervateAuditResult;
}
export interface DeathForensicsMetrics {
  deathForensics: DeathForensicsResult;
}
export interface PrepHygieneMetrics {
  prepHygiene: PrepHygieneResult;
}

export type EpicResult<M> =
  | { status: "ready"; judgement: Judgement; stats: string[]; metrics: M }
  | { status: "error"; error: string };

export interface FightResult {
  fightId: number;
  bossName: string;
  kill: boolean | null;
  bossPercentage: number | null;
  pullNumber: number | null;
  durationMs: number;
  epics: {
    gcdEconomy: EpicResult<GcdEconomyMetrics>;
    lifebloomDiscipline: EpicResult<LifebloomDisciplineMetrics>;
    spellDiscipline: EpicResult<SpellDisciplineMetrics>;
    manaEconomy: EpicResult<ManaEconomyMetrics>;
    deathForensics: EpicResult<DeathForensicsMetrics>;
    prepHygiene: EpicResult<PrepHygieneMetrics>;
  };
  informational: {
    concurrentLb3Targets: ConcurrentLb3Result;
    naturesSwiftnessAudit: NaturesSwiftnessAuditResult;
  };
}

export interface DruidFights {
  druidId: number;
  druidName: string;
  isRestoSpec: boolean;
  healingCastCount: number;
  fights: FightResult[];
}
```

- [ ] **Step 2: Write the context-building half of `scripts/lib/calibrateReport.ts`**

```ts
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
} from "../../src/wcl/client";
import type { Fight } from "../../src/wcl/client";
import { createEventFetcher } from "../../src/wcl/eventCache";
import { detectDruids } from "../../src/report/druidDetection";
import type { DruidCandidate } from "../../src/report/druidDetection";
import { buildFightRows } from "../../src/report/fightRows";
import {
  resolveAbilities,
  resolveSpellAbilityIds,
} from "../../src/abilities/resolveAbilities";
import type { ResolvedAbility } from "../../src/abilities/resolveAbilities";
import type { ActorClass } from "../../src/metrics/innervateAudit";

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
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReturnType<typeof createEventFetcher>["fetchEvents"];
}

export async function buildReportContext(
  accessToken: string,
  reportCode: string,
): Promise<ReportContext> {
  const { title, fights } = await fetchReportFights(accessToken, reportCode);
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => ({ fight: row.fight, pullNumber: row.pullNumber }));

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((row) => row.fight.id),
  );
  const candidates = detectDruids(castTableEntries);
  const actorClasses = new Map(
    castTableEntries.map((entry) => [
      entry.id,
      { class: entry.type, specIcon: entry.icon },
    ]),
  );

  const reportAbilities = await fetchMasterDataAbilities(
    accessToken,
    reportCode,
  );
  const resolvedAbilities = resolveAbilities(reportAbilities);

  const { fetchEvents } = createEventFetcher();

  return {
    accessToken,
    reportCode,
    reportTitle: title,
    nonTrashFights,
    candidates,
    resolvedAbilities,
    lifebloomAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Lifebloom"),
    rejuvenationAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Rejuvenation",
    ),
    regrowthAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Regrowth"),
    swiftmendAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Swiftmend"),
    naturesSwiftnessAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Nature's Swiftness",
    ),
    actorClasses,
    fetchEvents,
  };
}
```

- [ ] **Step 3: Verify against the real fixture report**

```bash
npx tsx -e "
import('./scripts/lib/calibrateReport.ts').then(async (m) => {
  const { loadAccessToken } = await import('./scripts/lib/env.ts');
  const ctx = await m.buildReportContext(loadAccessToken(), '4GYHZRdtL3bvhpc8');
  console.log('title:', ctx.reportTitle);
  console.log('non-trash fights:', ctx.nonTrashFights.length);
  console.log('candidates:', ctx.candidates.map((c) => \`\${c.name} (resto=\${c.isRestoSpec}, casts=\${c.healingCastCount})\`));
})
"
```

Expected: `title: SSC+TK 2026-07-07`, a non-zero fight count, and a candidates list including `Dassz (resto=true, casts=...)` with a large cast count — per `docs/testing.md`'s description of this report (one resto druid, Dassz, among four druids).

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/types.ts scripts/lib/calibrateReport.ts
git commit -m "feat(scripts): build report context (fights, druid detection, abilities)"
```

---

### Task 4: Per-fight epic computation

**Files:**

- Modify: `scripts/lib/calibrateReport.ts`

**Interfaces:**

- Consumes: `ReportContext` (Task 3), every `compute*` function from `src/metrics/*.ts`, every `summarize*` function from `src/metrics/epicSummary.ts`.
- Produces: `computeFightResult(ctx: ReportContext, candidate: DruidCandidate, fight: Fight, pullNumber: number | null): Promise<FightResult>`, exported from `scripts/lib/calibrateReport.ts`. Task 5 consumes this.

- [ ] **Step 1: Add the per-fight computation to `scripts/lib/calibrateReport.ts`**

Add these imports at the top (alongside the existing ones from Step 2 of Task 3):

```ts
import { computeGcdUtilization } from "../../src/metrics/gcdUtilization";
import { computeIdleGaps } from "../../src/metrics/idleGaps";
import { computeLb3Uptime } from "../../src/metrics/lb3Uptime";
import { computeRefreshCadence } from "../../src/metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../src/metrics/accidentalBlooms";
import { computeRestackTax } from "../../src/metrics/restackTax";
import { computeConcurrentLb3Targets } from "../../src/metrics/concurrentLb3Targets";
import { computeHotClipDetection } from "../../src/metrics/hotClipDetection";
import { computeSwiftmendAudit } from "../../src/metrics/swiftmendAudit";
import { computeDownrankingDiscipline } from "../../src/metrics/downrankingDiscipline";
import { computeNaturesSwiftnessAudit } from "../../src/metrics/naturesSwiftnessAudit";
import { computeManaCurve } from "../../src/metrics/manaCurve";
import { computeConsumableThroughput } from "../../src/metrics/consumableThroughput";
import { computeOverhealTable } from "../../src/metrics/overhealTable";
import { computeInnervateAudit } from "../../src/metrics/innervateAudit";
import { computeDeathForensics } from "../../src/metrics/deathForensics";
import { computePrepHygiene } from "../../src/metrics/prepHygiene";
import {
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
  summarizeSpellDiscipline,
  summarizeManaEconomy,
  summarizeDeathForensics,
  summarizePrepHygiene,
} from "../../src/metrics/epicSummary";
import type { EpicSummary } from "../../src/metrics/epicSummary";
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
  SpellDisciplineMetrics,
  ManaEconomyMetrics,
  DeathForensicsMetrics,
  PrepHygieneMetrics,
} from "./types";
```

Add this helper and the main function to the same file:

```ts
function toEpicResult<M>(
  compute: () => { summary: EpicSummary; metrics: M },
): EpicResult<M> {
  try {
    const { summary, metrics } = compute();
    return {
      status: "ready",
      judgement: summary.judgement,
      stats: summary.stats,
      metrics,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function computeFightResult(
  ctx: ReportContext,
  candidate: DruidCandidate,
  fight: Fight,
  pullNumber: number | null,
): Promise<FightResult> {
  const druidId = candidate.id;
  const durationMs = fight.endTime - fight.startTime;

  const [
    buffEvents,
    castEvents,
    healingEvents,
    deathEvents,
    combatantInfoEvents,
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
  ]);

  const gcdEconomy = toEpicResult<GcdEconomyMetrics>(() => {
    const gcdUtilization = computeGcdUtilization(
      castEvents,
      druidId,
      fight.startTime,
      fight.endTime,
    );
    const idleGaps = computeIdleGaps(
      castEvents,
      druidId,
      fight.startTime,
      fight.endTime,
    );
    return {
      summary: summarizeGcdEconomy(gcdUtilization, idleGaps),
      metrics: { gcdUtilization, idleGaps },
    };
  });

  const lifebloomDiscipline = toEpicResult<LifebloomDisciplineMetrics>(() => {
    const lb3Uptime = computeLb3Uptime(
      buffEvents,
      druidId,
      ctx.lifebloomAbilityIds,
      fight.startTime,
      fight.endTime,
    );
    const refreshCadence = computeRefreshCadence(
      buffEvents,
      druidId,
      ctx.lifebloomAbilityIds,
    );
    const accidentalBlooms = computeAccidentalBlooms(
      buffEvents,
      healingEvents,
      druidId,
      ctx.lifebloomAbilityIds,
    );
    const restackTax = computeRestackTax(
      buffEvents,
      castEvents,
      druidId,
      ctx.lifebloomAbilityIds,
      durationMs,
    );
    return {
      summary: summarizeLifebloomDiscipline(
        lb3Uptime,
        refreshCadence,
        accidentalBlooms,
        restackTax,
      ),
      metrics: { lb3Uptime, refreshCadence, accidentalBlooms, restackTax },
    };
  });

  const spellDiscipline = toEpicResult<SpellDisciplineMetrics>(() => {
    const hotClipDetection = computeHotClipDetection(
      buffEvents,
      castEvents,
      druidId,
      ctx.rejuvenationAbilityIds,
      ctx.regrowthAbilityIds,
    );
    const swiftmendAudit = computeSwiftmendAudit(
      buffEvents,
      castEvents,
      healingEvents,
      druidId,
      ctx.swiftmendAbilityIds,
      ctx.rejuvenationAbilityIds,
      ctx.regrowthAbilityIds,
      durationMs,
    );
    const downrankingDiscipline = computeDownrankingDiscipline(
      castEvents,
      healingEvents,
      druidId,
      ctx.resolvedAbilities,
    );
    return {
      summary: summarizeSpellDiscipline(
        hotClipDetection,
        swiftmendAudit,
        downrankingDiscipline,
      ),
      metrics: { hotClipDetection, swiftmendAudit, downrankingDiscipline },
    };
  });

  const manaEconomy = toEpicResult<ManaEconomyMetrics>(() => {
    const manaCurve = computeManaCurve(
      castEvents,
      druidId,
      fight.kill === true,
      durationMs,
    );
    const consumableThroughput = computeConsumableThroughput(
      castEvents,
      druidId,
      ctx.resolvedAbilities,
      durationMs,
    );
    const overhealTable = computeOverhealTable(
      healingEvents,
      druidId,
      ctx.resolvedAbilities,
    );
    const innervateAudit = computeInnervateAudit(
      castEvents,
      druidId,
      ctx.resolvedAbilities,
      ctx.actorClasses,
      durationMs,
      fight.startTime,
    );
    return {
      summary: summarizeManaEconomy(
        manaCurve,
        consumableThroughput,
        overhealTable,
        innervateAudit,
      ),
      metrics: {
        manaCurve,
        consumableThroughput,
        overhealTable,
        innervateAudit,
      },
    };
  });

  const deathForensics = toEpicResult<DeathForensicsMetrics>(() => {
    const result = computeDeathForensics(
      deathEvents,
      castEvents,
      buffEvents,
      druidId,
      ctx.swiftmendAbilityIds,
      ctx.naturesSwiftnessAbilityIds,
      ctx.lifebloomAbilityIds,
      fight.startTime,
      fight.endTime,
    );
    return {
      summary: summarizeDeathForensics(result),
      metrics: { deathForensics: result },
    };
  });

  const prepHygiene = toEpicResult<PrepHygieneMetrics>(() => {
    const result = computePrepHygiene(combatantInfoEvents, druidId);
    return {
      summary: summarizePrepHygiene(result),
      metrics: { prepHygiene: result },
    };
  });

  return {
    fightId: fight.id,
    bossName: fight.name,
    kill: fight.kill,
    bossPercentage: fight.bossPercentage,
    pullNumber,
    durationMs,
    epics: {
      gcdEconomy,
      lifebloomDiscipline,
      spellDiscipline,
      manaEconomy,
      deathForensics,
      prepHygiene,
    },
    informational: {
      concurrentLb3Targets: computeConcurrentLb3Targets(
        buffEvents,
        druidId,
        ctx.lifebloomAbilityIds,
        fight.startTime,
        fight.endTime,
      ),
      naturesSwiftnessAudit: computeNaturesSwiftnessAudit(
        castEvents,
        druidId,
        ctx.naturesSwiftnessAbilityIds,
        ctx.resolvedAbilities,
        durationMs,
      ),
    },
  };
}
```

- [ ] **Step 2: Verify against the real fixture report, fight 6 (Dassz's LB3 fight per `docs/testing.md`)**

```bash
npx tsx -e "
import('./scripts/lib/calibrateReport.ts').then(async (m) => {
  const { loadAccessToken } = await import('./scripts/lib/env.ts');
  const token = loadAccessToken();
  const ctx = await m.buildReportContext(token, '4GYHZRdtL3bvhpc8');
  const dassz = ctx.candidates.find((c) => c.name === 'Dassz');
  const fight6 = ctx.nonTrashFights.find((f) => f.fight.id === 6);
  const result = await m.computeFightResult(ctx, dassz, fight6.fight, fight6.pullNumber);
  console.log(JSON.stringify({
    boss: result.bossName,
    gcd: result.epics.gcdEconomy.status === 'ready' ? result.epics.gcdEconomy.judgement : result.epics.gcdEconomy.error,
    lifebloom: result.epics.lifebloomDiscipline.status === 'ready' ? result.epics.lifebloomDiscipline.judgement : result.epics.lifebloomDiscipline.error,
  }, null, 2));
})
"
```

Expected: prints a real boss name and two judgement values (`green`/`orange`/`red`), no thrown errors.

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/calibrateReport.ts
git commit -m "feat(scripts): compute all six epics for one fight"
```

---

### Task 5: Full orchestration loop and numeric rollup

**Files:**

- Modify: `scripts/lib/calibrateReport.ts`
- Create: `scripts/lib/rollup.ts`
- Modify: `scripts/lib/types.ts`

**Interfaces:**

- Consumes: `buildReportContext`, `computeFightResult` (Task 3/4).
- Produces: `calibrateReport(accessToken: string, reportCode: string): Promise<CalibrationOutput>` from `scripts/lib/calibrateReport.ts`; `rollupDruid(fights: FightResult[]): DruidRollup` from `scripts/lib/rollup.ts`. Task 6 consumes `calibrateReport`.

- [ ] **Step 1: Add rollup types to `scripts/lib/types.ts`**

Append:

```ts
export interface EpicRollupBase {
  judgement: Judgement | null;
  fightsReady: number;
  fightsErrored: number;
}
export interface GcdEconomyRollup extends EpicRollupBase {
  gcdUtilizationPct: number | null;
  idleGapsDeadTimePct: number | null;
}
export interface LifebloomTargetRollup {
  targetId: number;
  lb3UptimePctPooled: number | null;
  totalWindowMs: number;
}
export interface RefreshCadenceBucketRollup {
  label: "early" | "ideal" | "late";
  count: number;
  pct: number;
}
export interface LifebloomDisciplineRollup extends EpicRollupBase {
  lb3UptimeByTarget: LifebloomTargetRollup[];
  refreshCadenceMedianMsPooled: number | null;
  refreshCadenceBuckets: RefreshCadenceBucketRollup[];
  accidentalBloomsTotal: number;
  restackTaxCastsTotal: number;
  restackTaxEstimatedManaTotal: number;
}
export interface SpellDisciplineRollup extends EpicRollupBase {
  rejuvenationClipPctPooled: number | null;
  regrowthClipPctPooled: number | null;
  swiftmendWastefulPctPooled: number | null;
  downrankingFlaggedTotal: number;
}
export interface OverhealRollupRow {
  category: string;
  spell: string;
  amount: number;
  overheal: number;
  overhealPct: number;
}
export interface ManaEconomyRollup extends EpicRollupBase {
  manaCurveEndingPctAvg: number | null;
  potionsUsedTotal: number;
  potionsFloorTotal: number;
  runesUsedTotal: number;
  runesFloorTotal: number;
  overhealPooled: OverhealRollupRow[];
}
export interface DeathForensicsRollup extends EpicRollupBase {
  deathsTotal: number;
  flaggedTotal: number;
}
export interface PrepHygieneRollup extends EpicRollupBase {
  totalFights: number;
  fightsWithFlaskOrElixir: number;
  fightsWithFood: number;
  fightsWithOil: number;
}
export interface InformationalRollup {
  concurrentLb3AvgPooled: number | null;
  concurrentLb3PeakMax: number;
  naturesSwiftnessCastsTotal: number;
  naturesSwiftnessAvailableWindowsTotal: number;
}
export interface DruidRollup {
  gcdEconomy: GcdEconomyRollup;
  lifebloomDiscipline: LifebloomDisciplineRollup;
  spellDiscipline: SpellDisciplineRollup;
  manaEconomy: ManaEconomyRollup;
  deathForensics: DeathForensicsRollup;
  prepHygiene: PrepHygieneRollup;
  informational: InformationalRollup;
}
export interface DruidResult extends DruidFights {
  rollup: DruidRollup;
}
export interface CalibrationOutput {
  reportCode: string;
  reportTitle: string;
  generatedAt: string;
  druids: DruidResult[];
}
```

- [ ] **Step 2: Write `scripts/lib/rollup.ts`**

**Important type-safety note:** `EpicResult<M>` is a discriminated union (`{status:"ready",...} | {status:"error",...}`). `Array.prototype.filter` does **not** narrow a nested property's type through the array — `fights.filter((f) => f.epics.gcdEconomy.status === "ready")` still leaves `f.epics.gcdEconomy` typed as the full union afterward, and casting it directly to `{judgement: Judgement}` via `as` is a compile error (TS2352: the two types don't sufficiently overlap). The code below avoids this with a real type-predicate helper (`isReady`) applied inside a dedicated extraction function, never a raw `as` cast on the union.

```ts
import { worstJudgement, type Judgement } from "../../src/metrics/judgement";
import type {
  EpicResult,
  FightResult,
  GcdEconomyMetrics,
  LifebloomDisciplineMetrics,
  SpellDisciplineMetrics,
  ManaEconomyMetrics,
  DeathForensicsMetrics,
  PrepHygieneMetrics,
  EpicRollupBase,
  GcdEconomyRollup,
  LifebloomDisciplineRollup,
  LifebloomTargetRollup,
  RefreshCadenceBucketRollup,
  SpellDisciplineRollup,
  ManaEconomyRollup,
  OverhealRollupRow,
  DeathForensicsRollup,
  PrepHygieneRollup,
  InformationalRollup,
  DruidRollup,
} from "./types";

function rollupJudgement(judgements: Judgement[]): Judgement | null {
  // worstJudgement([]) defaults to "green" (its reduce's seed value) — wrong
  // here, since "no fights ready" must not read as a clean pass.
  if (judgements.length === 0) return null;
  return worstJudgement(judgements);
}

function isReady<M>(
  epic: EpicResult<M>,
): epic is Extract<EpicResult<M>, { status: "ready" }> {
  return epic.status === "ready";
}

interface ReadyEntry<M> {
  metrics: M;
  judgement: Judgement;
  durationMs: number;
}

// Pairs each fight's chosen epic with that fight's duration, keeping only
// fights where the epic actually resolved — the one place `isReady`'s type
// predicate applies, so every caller below works with plain, fully-typed
// `M` metrics rather than the raw union.
function readyEntries<M>(
  fights: FightResult[],
  select: (f: FightResult) => EpicResult<M>,
): ReadyEntry<M>[] {
  const result: ReadyEntry<M>[] = [];
  for (const fight of fights) {
    const epic = select(fight);
    if (isReady(epic)) {
      result.push({
        metrics: epic.metrics,
        judgement: epic.judgement,
        durationMs: fight.durationMs,
      });
    }
  }
  return result;
}

function epicRollupBase<M>(
  totalCount: number,
  ready: ReadyEntry<M>[],
): EpicRollupBase {
  return {
    judgement: rollupJudgement(ready.map((r) => r.judgement)),
    fightsReady: ready.length,
    fightsErrored: totalCount - ready.length,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function durationWeightedAverage(
  entries: { value: number; weightMs: number }[],
): number | null {
  const totalWeight = sum(entries.map((e) => e.weightMs));
  if (totalWeight === 0) return null;
  return sum(entries.map((e) => e.value * e.weightMs)) / totalWeight;
}

function countWeightedAverage(
  entries: { value: number; weight: number }[],
): number | null {
  const totalWeight = sum(entries.map((e) => e.weight));
  if (totalWeight === 0) return null;
  return sum(entries.map((e) => e.value * e.weight)) / totalWeight;
}

export function rollupDruid(fights: FightResult[]): DruidRollup {
  // --- GCD economy ---
  const gcdReady = readyEntries<GcdEconomyMetrics>(
    fights,
    (f) => f.epics.gcdEconomy,
  );
  const gcdEconomy: GcdEconomyRollup = {
    ...epicRollupBase(fights.length, gcdReady),
    gcdUtilizationPct: durationWeightedAverage(
      gcdReady.map((r) => ({
        value: r.metrics.gcdUtilization.utilizationPct,
        weightMs: r.durationMs,
      })),
    ),
    idleGapsDeadTimePct: durationWeightedAverage(
      gcdReady.map((r) => ({
        value: r.metrics.idleGaps.deadTimePct,
        weightMs: r.durationMs,
      })),
    ),
  };

  // --- Lifebloom discipline ---
  const lbReady = readyEntries<LifebloomDisciplineMetrics>(
    fights,
    (f) => f.epics.lifebloomDiscipline,
  );
  const targetWindows = new Map<
    number,
    { value: number; weightMs: number }[]
  >();
  const refreshMedians: { value: number; weight: number }[] = [];
  const bucketTotals: Record<"early" | "ideal" | "late", number> = {
    early: 0,
    ideal: 0,
    late: 0,
  };
  let accidentalBloomsTotal = 0;
  let restackTaxCastsTotal = 0;
  let restackTaxEstimatedManaTotal = 0;
  for (const entry of lbReady) {
    for (const target of entry.metrics.lb3Uptime.targets) {
      const list = targetWindows.get(target.targetId) ?? [];
      list.push({ value: target.lb3UptimePct, weightMs: target.windowMs });
      targetWindows.set(target.targetId, list);
    }
    if (entry.metrics.refreshCadence.medianMs !== null) {
      refreshMedians.push({
        value: entry.metrics.refreshCadence.medianMs,
        weight: entry.metrics.refreshCadence.intervalCount,
      });
    }
    for (const bucket of entry.metrics.refreshCadence.buckets) {
      bucketTotals[bucket.label] += bucket.count;
    }
    accidentalBloomsTotal += entry.metrics.accidentalBlooms.count;
    restackTaxCastsTotal += entry.metrics.restackTax.castCount;
    restackTaxEstimatedManaTotal += entry.metrics.restackTax.estimatedMana;
  }
  const bucketCountTotal =
    bucketTotals.early + bucketTotals.ideal + bucketTotals.late;
  const refreshCadenceBuckets: RefreshCadenceBucketRollup[] = (
    ["early", "ideal", "late"] as const
  ).map((label) => ({
    label,
    count: bucketTotals[label],
    pct:
      bucketCountTotal === 0
        ? 0
        : Math.round((bucketTotals[label] / bucketCountTotal) * 100),
  }));
  const lb3UptimeByTarget: LifebloomTargetRollup[] = [
    ...targetWindows.entries(),
  ]
    .map(([targetId, entries]) => ({
      targetId,
      lb3UptimePctPooled: durationWeightedAverage(entries),
      totalWindowMs: sum(entries.map((e) => e.weightMs)),
    }))
    .sort((a, b) => a.targetId - b.targetId);
  const lifebloomDiscipline: LifebloomDisciplineRollup = {
    ...epicRollupBase(fights.length, lbReady),
    lb3UptimeByTarget,
    refreshCadenceMedianMsPooled: countWeightedAverage(refreshMedians),
    refreshCadenceBuckets,
    accidentalBloomsTotal,
    restackTaxCastsTotal,
    restackTaxEstimatedManaTotal,
  };

  // --- Spell discipline ---
  const spellReady = readyEntries<SpellDisciplineMetrics>(
    fights,
    (f) => f.epics.spellDiscipline,
  );
  const rejuvEntries: { value: number; weight: number }[] = [];
  const regrowthEntries: { value: number; weight: number }[] = [];
  const swiftmendEntries: { value: number; weight: number }[] = [];
  let downrankingFlaggedTotal = 0;
  for (const entry of spellReady) {
    rejuvEntries.push({
      value: entry.metrics.hotClipDetection.rejuvenation.clipPct,
      weight: entry.metrics.hotClipDetection.rejuvenation.castCount,
    });
    regrowthEntries.push({
      value: entry.metrics.hotClipDetection.regrowth.clipPct,
      weight: entry.metrics.hotClipDetection.regrowth.castCount,
    });
    swiftmendEntries.push({
      value: entry.metrics.swiftmendAudit.wastefulPct,
      weight: entry.metrics.swiftmendAudit.casts.length,
    });
    downrankingFlaggedTotal += entry.metrics.downrankingDiscipline.flaggedCount;
  }
  const spellDiscipline: SpellDisciplineRollup = {
    ...epicRollupBase(fights.length, spellReady),
    rejuvenationClipPctPooled: countWeightedAverage(rejuvEntries),
    regrowthClipPctPooled: countWeightedAverage(regrowthEntries),
    swiftmendWastefulPctPooled: countWeightedAverage(swiftmendEntries),
    downrankingFlaggedTotal,
  };

  // --- Mana economy ---
  const manaReady = readyEntries<ManaEconomyMetrics>(
    fights,
    (f) => f.epics.manaEconomy,
  );
  const endingPcts: number[] = [];
  let potionsUsedTotal = 0;
  let potionsFloorTotal = 0;
  let runesUsedTotal = 0;
  let runesFloorTotal = 0;
  const overhealTotals = new Map<
    string,
    { category: string; spell: string; amount: number; overheal: number }
  >();
  for (const entry of manaReady) {
    if (
      entry.metrics.manaCurve.judgement !== null &&
      entry.metrics.manaCurve.endingPct !== null
    ) {
      endingPcts.push(entry.metrics.manaCurve.endingPct);
    }
    if (!entry.metrics.consumableThroughput.exempt) {
      for (const row of entry.metrics.consumableThroughput.rows) {
        if (row.label === "Mana Potion") {
          potionsUsedTotal += row.used;
          potionsFloorTotal += row.expectedFloor;
        } else {
          runesUsedTotal += row.used;
          runesFloorTotal += row.expectedFloor;
        }
      }
    }
    for (const row of entry.metrics.overhealTable.rows) {
      const key = `${row.category}:${row.spell}`;
      const existing = overhealTotals.get(key) ?? {
        category: row.category,
        spell: row.spell,
        amount: 0,
        overheal: 0,
      };
      existing.amount += row.amount;
      existing.overheal += row.overheal;
      overhealTotals.set(key, existing);
    }
  }
  const overhealPooled: OverhealRollupRow[] = [...overhealTotals.values()].map(
    (row) => {
      const total = row.amount + row.overheal;
      return {
        ...row,
        overhealPct: total === 0 ? 0 : Math.round((row.overheal / total) * 100),
      };
    },
  );
  const manaEconomy: ManaEconomyRollup = {
    ...epicRollupBase(fights.length, manaReady),
    manaCurveEndingPctAvg: average(endingPcts),
    potionsUsedTotal,
    potionsFloorTotal,
    runesUsedTotal,
    runesFloorTotal,
    overhealPooled,
  };

  // --- Death forensics ---
  const deathReady = readyEntries<DeathForensicsMetrics>(
    fights,
    (f) => f.epics.deathForensics,
  );
  let deathsTotal = 0;
  let flaggedTotal = 0;
  for (const entry of deathReady) {
    deathsTotal += entry.metrics.deathForensics.deaths.length;
    flaggedTotal += entry.metrics.deathForensics.flaggedCount;
  }
  const deathForensics: DeathForensicsRollup = {
    ...epicRollupBase(fights.length, deathReady),
    deathsTotal,
    flaggedTotal,
  };

  // --- Prep hygiene ---
  const prepReady = readyEntries<PrepHygieneMetrics>(
    fights,
    (f) => f.epics.prepHygiene,
  );
  let fightsWithFlaskOrElixir = 0;
  let fightsWithFood = 0;
  let fightsWithOil = 0;
  for (const entry of prepReady) {
    if (entry.metrics.prepHygiene.flaskOrElixir.judgement === "green")
      fightsWithFlaskOrElixir += 1;
    if (entry.metrics.prepHygiene.foodBuffPresent) fightsWithFood += 1;
    if (entry.metrics.prepHygiene.weaponOilPresent) fightsWithOil += 1;
  }
  const prepHygiene: PrepHygieneRollup = {
    ...epicRollupBase(fights.length, prepReady),
    totalFights: prepReady.length,
    fightsWithFlaskOrElixir,
    fightsWithFood,
    fightsWithOil,
  };

  // --- Informational (no epic judgement) ---
  const concurrentEntries = fights.map((f) => ({
    value: f.informational.concurrentLb3Targets.avgConcurrent,
    weightMs: f.durationMs,
  }));
  const informational: InformationalRollup = {
    concurrentLb3AvgPooled: durationWeightedAverage(concurrentEntries),
    concurrentLb3PeakMax:
      fights.length === 0
        ? 0
        : Math.max(
            ...fights.map(
              (f) => f.informational.concurrentLb3Targets.peakConcurrent,
            ),
          ),
    naturesSwiftnessCastsTotal: sum(
      fights.map((f) => f.informational.naturesSwiftnessAudit.castCount),
    ),
    naturesSwiftnessAvailableWindowsTotal: sum(
      fights.map((f) => f.informational.naturesSwiftnessAudit.availableWindows),
    ),
  };

  return {
    gcdEconomy,
    lifebloomDiscipline,
    spellDiscipline,
    manaEconomy,
    deathForensics,
    prepHygiene,
    informational,
  };
}
```

- [ ] **Step 3: Add the full orchestration loop to `scripts/lib/calibrateReport.ts`**

Add these imports:

```ts
import { rollupDruid } from "./rollup";
import type { CalibrationOutput, DruidResult } from "./types";
```

Add this function:

```ts
export async function calibrateReport(
  accessToken: string,
  reportCode: string,
): Promise<CalibrationOutput> {
  const ctx = await buildReportContext(accessToken, reportCode);

  const druids: DruidResult[] = [];
  for (const candidate of ctx.candidates) {
    const fights = [];
    for (const { fight, pullNumber } of ctx.nonTrashFights) {
      fights.push(await computeFightResult(ctx, candidate, fight, pullNumber));
    }
    druids.push({
      druidId: candidate.id,
      druidName: candidate.name,
      isRestoSpec: candidate.isRestoSpec,
      healingCastCount: candidate.healingCastCount,
      fights,
      rollup: rollupDruid(fights),
    });
  }

  return {
    reportCode: ctx.reportCode,
    reportTitle: ctx.reportTitle,
    generatedAt: new Date().toISOString(),
    druids,
  };
}
```

- [ ] **Step 4: Verify against the real fixture report**

```bash
npx tsx -e "
import('./scripts/lib/calibrateReport.ts').then(async (m) => {
  const { loadAccessToken } = await import('./scripts/lib/env.ts');
  const output = await m.calibrateReport(loadAccessToken(), '4GYHZRdtL3bvhpc8');
  console.log('druids:', output.druids.map((d) => d.druidName));
  const dassz = output.druids.find((d) => d.druidName === 'Dassz');
  console.log('Dassz fights:', dassz.fights.length);
  console.log('Dassz GCD rollup:', dassz.rollup.gcdEconomy);
  console.log('Dassz LB3 by target:', dassz.rollup.lifebloomDiscipline.lb3UptimeByTarget);
})
"
```

Expected: a druid list including `Dassz`, a non-zero fight count, a `gcdUtilizationPct` between 0-100 with a real judgement, and at least one entry in `lb3UptimeByTarget`.

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/calibrateReport.ts scripts/lib/rollup.ts scripts/lib/types.ts
git commit -m "feat(scripts): whole-report orchestration and numeric rollup"
```

---

### Task 6: `scripts/calibrate.ts` CLI entrypoint

**Files:**

- Create: `scripts/calibrate.ts`
- Create: `calibration-data/` (directory created by the script at runtime, not pre-created by hand)

**Interfaces:**

- Consumes: `calibrateReport` (Task 5), `loadAccessToken` (Task 1).

- [ ] **Step 1: Write `scripts/calibrate.ts`**

```ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAccessToken } from "./lib/env";
import { calibrateReport } from "./lib/calibrateReport";
import { WclApiError } from "../src/wcl/client";
import { WclRateLimitError } from "../src/wcl/events";

async function writeCalibrationOutput(
  reportCode: string,
  output: unknown,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "calibration-data");
  await mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `${reportCode}.json`);
  const tempPath = `${finalPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(tempPath, finalPath);
  return finalPath;
}

async function main(): Promise<void> {
  const reportCode = process.argv[2];
  if (!reportCode) {
    console.error("Usage: npm run calibrate -- <reportCode>");
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  const output = await calibrateReport(accessToken, reportCode);

  if (output.druids.length === 0) {
    console.log(
      `No resto druid candidates detected in report ${reportCode}. Nothing written.`,
    );
    return;
  }

  const filePath = await writeCalibrationOutput(reportCode, output);
  console.log(
    `Wrote ${filePath} — ${output.druids.length} druid(s), ` +
      `${output.druids[0].fights.length} fight(s) each.`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof WclRateLimitError) {
    console.error("Rate limited by WCL. Wait a bit and try again.");
  } else if (err instanceof WclApiError) {
    console.error(`WCL API error: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`Failed: ${err.message}`);
  } else {
    console.error("Failed with an unknown error.", err);
  }
  process.exit(1);
});
```

- [ ] **Step 2: Verify end-to-end against the real fixture report**

```bash
npm run calibrate -- 4GYHZRdtL3bvhpc8
```

Expected: prints `Wrote .../calibration-data/4GYHZRdtL3bvhpc8.json — 1 druid(s), N fight(s) each.` (one druid, since Dassz is the only one clearing the 3-healing-cast threshold on this report per `docs/testing.md`).

```bash
cat calibration-data/4GYHZRdtL3bvhpc8.json | python3 -m json.tool | head -50
```

Expected: valid JSON, `reportCode`/`reportTitle`/`generatedAt`/`druids` at the top level, first druid is `Dassz`.

```bash
npm run calibrate -- notarealcode
```

Expected: exits non-zero with a clear WCL API error message (report not found), no file written for `notarealcode`.

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: all three exit 0 — this is the first point every new file in this plan gets checked by the full static-analysis suite together.

- [ ] **Step 3: Commit**

```bash
git add scripts/calibrate.ts calibration-data/4GYHZRdtL3bvhpc8.json
git commit -m "feat(scripts): add calibrate.ts CLI entrypoint"
```

---

### Task 7: Documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/testing.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Replace the "Running live WCL queries yourself" section's opening (keep the existing curl example as a fallback further down, introduced with "If you don't have Node available" or similar) with:

```markdown
## Running live WCL queries yourself

Prefer `scripts/wcl-query.ts` over raw curl — it handles auth and host selection for you:

​`bash
npm run wcl:query -- 'query { reportData { report(code: "4GYHZRdtL3bvhpc8") { title fights { id name startTime endTime } } } }'
​`

Pass `--host classic` or `--host fresh` to hit `classic.warcraftlogs.com`/`fresh.warcraftlogs.com` instead of the default `www.warcraftlogs.com` — useful since these three hosts don't always serve the same data for the same zone/report (e.g. `classic.warcraftlogs.com`'s SSC/TK zone conflates the 2021 TBC Classic launch with Anniversary data; `www.warcraftlogs.com` has a separate, Anniversary-only zone for the same content). See `scripts/wcl-query.ts` for the full `--host`/`--file` options.

For calibrating the app's actual judgement output against a real report (every metric, every fight, with numeric pooling across the whole report), use `npm run calibrate -- <reportCode>` instead — see `docs/testing.md` for what it produces.

**Fallback (no Node available):** raw curl still works the same way it always did:

​`bash
set -a; source .env.local; set +a
curl -s -X POST https://www.warcraftlogs.com/api/v2/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WCL_TEST_ACCESS_TOKEN" \
  -d '{"query":"query { reportData { report(code: \"4GYHZRdtL3bvhpc8\") { title fights { id name startTime endTime } } } }"}' \
  -o /path/to/scratch/response.json
​`

Use this to capture real Tier 2 fixtures (`test/integration/fixtures/*.json`) or spot-check a field's real shape/scale before writing code against an assumption. `docs/testing.md`'s "Known real test reports" table lists report codes already validated against for this purpose (with what each is notable for) — check there before reaching for a new report, and add to it when a new one earns its place. Keep the token out of logs and chat output:

- Reference it only as `$WCL_TEST_ACCESS_TOKEN` in commands (never inline the literal value).
- Never `cat`/`echo`/print `.env.local` or the token itself.
- Redirect responses to a file (`-o`) rather than letting curl dump to stdout, especially if a header-echo flag (`-v`, `-i`) is ever added.
- `.env.local` is gitignored — never `git add` it.
```

Also add one bullet to the "Working conventions" list (after the "Spell/ability IDs" bullet):

```markdown
- `src/metrics/*.ts`'s `compute*` functions have two independent consumers: the UI's metric cards/`Scorecard/use*Summary.ts` hooks, and `scripts/calibrate.ts`. When changing a `compute*` function's signature, check both — the script isn't covered by any component test, so a mismatched call site there only surfaces as a runtime error when someone next runs `npm run calibrate`.
```

- [ ] **Step 2: Update `README.md`**

Read the current `README.md` first to match its existing heading style, then add a section (placement: after whatever section covers running the app locally, before/alongside any existing "Testing" section) titled `## Developer scripts` containing:

```markdown
## Developer scripts

Two scripts under `scripts/` talk to the real Warcraft Logs API directly (not through the app's UI) — both need `WCL_TEST_ACCESS_TOKEN` in `.env.local`, see `docs/testing.md`.

- `npm run wcl:query -- '<graphql query>'` — run any GraphQL query against WCL's API. See `docs/testing.md`.
- `npm run calibrate -- <reportCode>` — compute every metric this app judges, for every resto druid detected in a report, per fight and rolled up across the whole report; writes `calibration-data/<reportCode>.json`. See `docs/testing.md`.
```

- [ ] **Step 3: Update `docs/testing.md`**

In the "Running everything locally" code block, add two lines:

```
npm run wcl:query -- '<query>'   # ad-hoc WCL GraphQL query, real API
npm run calibrate -- <reportCode> # full judgement dump for a real report, real API
```

Add a new subsection right after "Known real test reports" (before "## CI triggers summary"):

```markdown
## Calibration tooling

`scripts/calibrate.ts` (`npm run calibrate -- <reportCode>`) runs the app's real `compute*`/`summarize*` functions against a real report and writes `calibration-data/<reportCode>.json` — every metric's full numeric result plus judgement, per fight, plus a whole-report numeric rollup (duration/count-weighted pooling — see `scripts/lib/rollup.ts` for the exact rule per metric). It exists to support story 802 (threshold calibration) and any future recalibration pass (`docs/thresholds.md`), and to avoid re-deriving WCL API quirks (like the `www`/`classic`/`fresh` host distinction — see `scripts/wcl-query.ts`) from scratch each time. Output is committed with real player/guild names intact, matching this table's existing convention.
```

- [ ] **Step 4: Verify and commit**

```bash
npm run format:check
```

Expected: exits 0 (if not, run `npm run format` and re-check).

```bash
git add CLAUDE.md README.md docs/testing.md
git commit -m "docs: document calibration tooling and wcl-query script"
```

---

## Self-Review Notes

- **Spec coverage**: every design-doc section (architecture, `calibrate.ts` data flow incl. numeric pooling, `wcl-query.ts`, shared env loader, docs updates, testing approach) maps to a task above. The design doc's "out of scope" note (the `F7aL6x13zVq8kTRt` off-role-fight bug) is deliberately not a task here.
- **Placeholder scan**: no TBD/TODO.
- **Type consistency**: `EpicResult<M>`, `FightResult`, `DruidFights`/`DruidResult`, and every rollup type are defined once in `scripts/lib/types.ts` and imported everywhere else — no re-declared shapes. `ReportContext.accessToken` is threaded through from `buildReportContext` to `computeFightResult` from the start (an earlier draft of this plan passed `""` and patched it in a separate step — fixed before finalizing, no such gap remains).
- **Union-narrowing risk**: an earlier draft of `rollup.ts` cast `EpicResult<M>` union members directly to `{judgement: Judgement}` after a plain `.filter()`, which doesn't narrow the type and would fail `tsc` with TS2352 (insufficient overlap). Fixed by verifying the actual TS behavior and rewriting around a real type-predicate (`isReady`) plus a `readyEntries` extraction helper — every rollup section now works with plain, narrowed `M` metrics, not the raw union.
- **tsconfig risk**: verified empirically (not assumed) that `scripts/` importing from `src/` requires its own `moduleResolution: "bundler"` config rather than reusing `tsconfig.node.json`'s `nodenext` — see Task 1.
