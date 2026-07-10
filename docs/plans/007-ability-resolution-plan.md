# Story 007 — Ability Resolution Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-report lookup that maps WCL ability `gameID`s to a logical druid spell/consumable name (and rank, for spells), so every later metric story reads `event.abilityGameID` through this table instead of hardcoding IDs itself.

**Architecture:** A thin I/O function (`fetchMasterDataAbilities`) fetches a report's `masterData.abilities` (WCL exposes `gameID`, `name`, `icon`, `type` — confirmed live, no rank field exists anywhere in the API). A pure function (`resolveAbilities`) cross-references that list against a static, hardcoded `gameID → rank` table (the one sanctioned place such IDs live, per CLAUDE.md) and returns a `Map<gameID, ResolvedAbility>`. Spells and runes resolve by `name` first (trustworthy — verified live) with ID lookup for rank; mana potions resolve by `gameID` only, since their WCL name (`Restore Mana`) is shared with unrelated effects.

**Tech Stack:** TypeScript, Vitest (Tier 1 unit + Tier 2 MSW-mocked integration), no new dependencies.

## Global Constraints

- No spell/ability IDs may be hardcoded outside this story's static table — every later metric module must resolve through `resolveAbilities`'s output (CLAUDE.md).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project via the pre-commit hook — never bypass it (CLAUDE.md, `docs/testing.md`).
- Commits follow Conventional Commits: `type(scope): summary` (CLAUDE.md). Use scope `abilities` for this story's commits.
- No secrets required to build/test/deploy (principle 2) — this story makes no live API calls at runtime or in its own test suite; all live verification already happened during design/planning and is captured in the fixture below.
- A story isn't done until `docs/backlog.md` marks it `✅ Done` and its spec/plan files are deleted in the same commit (CLAUDE.md).

## Research already done (context for the implementer)

This isn't something to redo — it's already been verified live against the real WCL API (report `4GYHZRdtL3bvhpc8` and others from `docs/testing.md`) and cross-referenced against wowhead's TBC Classic spell-family listings. The findings are baked into Task 2's static tables and code comments. Key points, so the rationale in the code makes sense:

- WCL's `masterData.abilities` has no rank field anywhere (`gameID`, `name`, `icon`, `type` only) — confirmed via GraphQL introspection on `ReportAbility` and `GameAbility`/`gameData.ability`.
- `name` is a reliable signal for spells and runes — live pulls show exact matches (`Lifebloom`, `Rejuvenation`, `Swiftmend`, `Dark Rune`, `Demonic Rune`, etc.), never an aliased or rank-suffixed name.
- Mana potions are the exception: their cast shows up as `Restore Mana`, a name shared with unrelated effects (other classes' mana-drain/return abilities, engineering items). Mana potions can only be resolved by a maintained `gameID` allow-list, never by name.
- TBC Anniversary realms have been observed emitting ability IDs that don't correspond to any real player-trainable spell rank, despite matching a target name exactly: a Rejuvenation-named `gameID` 38657 (0 mana, no rank label — almost certainly an item-proc duplicate) and a Healing-Touch-named `gameID` 29339 (180 mana, 3s cast — doesn't match any real Healing Touch rank's mana cost) were both found live. Neither is in the static table below; both correctly fall through to `rank: null`, which is why that fallback is load-bearing, not just defensive.
- The fixture at `test/integration/fixtures/masterdata-abilities.json` is a real, already-captured payload (930 abilities) from report `4GYHZRdtL3bvhpc8` — no live call is needed during implementation.

---

## Task 1: `fetchMasterDataAbilities` in the WCL client

**Files:**

- Modify: `src/wcl/client.ts`
- Test: `test/integration/client.test.ts`
- Fixture (already staged, real captured data): `test/integration/fixtures/masterdata-abilities.json`

**Interfaces:**

- Produces: `ReportAbility` type (`{ gameID: number; name: string; icon: string; type: string }`) and `fetchMasterDataAbilities(accessToken: string, reportCode: string): Promise<ReportAbility[]>`, exported from `src/wcl/client.ts`. Task 2 imports `ReportAbility` from here.

- [ ] **Step 1: Write the failing test**

Add to `test/integration/client.test.ts` (new imports alongside the existing ones at the top of the file, new `describe` block at the end):

```ts
// add to the existing import block:
import {
  exchangeCodeForToken,
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
  TOKEN_URL,
  USER_API_URL,
} from "../../src/wcl/client";
import masterDataAbilitiesFixture from "./fixtures/masterdata-abilities.json";
```

```ts
describe("fetchMasterDataAbilities", () => {
  it("parses the abilities list from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json(masterDataAbilitiesFixture),
      ),
    );
    const result = await fetchMasterDataAbilities(
      "test-token",
      "4GYHZRdtL3bvhpc8",
    );
    expect(result).toHaveLength(930);
    expect(result).toContainEqual({
      gameID: 26982,
      name: "Rejuvenation",
      icon: "spell_nature_rejuvenation.jpg",
      type: "8",
    });
  });

  it("requests the masterData abilities query for the given report", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(masterDataAbilitiesFixture);
      }),
    );

    await fetchMasterDataAbilities("test-token", "4GYHZRdtL3bvhpc8");

    expect(requestBody?.query).toContain("masterData");
    expect(requestBody?.query).toContain("4GYHZRdtL3bvhpc8");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/integration/client.test.ts`
Expected: FAIL — `fetchMasterDataAbilities is not a function` (or a TypeScript error if run through `npm test`, since it doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Add to `src/wcl/client.ts`, after `fetchCastsTable`:

```ts
export interface ReportAbility {
  gameID: number;
  name: string;
  icon: string;
  type: string;
}

export async function fetchMasterDataAbilities(
  accessToken: string,
  reportCode: string,
): Promise<ReportAbility[]> {
  const resp = await fetch(USER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      masterData { abilities { gameID name icon type } }
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report.masterData.abilities;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS (all `fetchMasterDataAbilities`, `fetchReportFights`, `fetchCastsTable`, `exchangeCodeForToken` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/wcl/client.ts test/integration/client.test.ts test/integration/fixtures/masterdata-abilities.json
git commit -m "feat(abilities): fetch report masterData abilities from WCL"
```

---

## Task 2: `resolveAbilities` — the static table and resolution logic

**Files:**

- Create: `src/abilities/resolveAbilities.ts`
- Test: `src/abilities/resolveAbilities.test.ts`
- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Consumes: `ReportAbility` type from `src/wcl/client.ts` (Task 1).
- Produces: `DruidHealingSpell`, `DruidConsumable`, `ResolvedAbility` types and `resolveAbilities(reportAbilities: ReportAbility[]): Map<number, ResolvedAbility>`, all exported from `src/abilities/resolveAbilities.ts`. Every later metric story imports these.

- [ ] **Step 1: Add the `aReportAbility` factory**

Add to `src/testUtils/factories.ts` (new import and new function; existing content unchanged):

```ts
import type {
  Fight,
  ReportFights,
  CastTableEntry,
  ReportAbility,
} from "../wcl/client";
```

```ts
export function aReportAbility(
  overrides: Partial<ReportAbility> = {},
): ReportAbility {
  return {
    gameID: 26982,
    name: "Rejuvenation",
    icon: "spell_nature_rejuvenation.jpg",
    type: "8",
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/abilities/resolveAbilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAbilities } from "./resolveAbilities";
import { aReportAbility } from "../testUtils/factories";

describe("resolveAbilities", () => {
  it("resolves a known spell rank by gameID", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(result.get(26982)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 13,
    });
  });

  it("collapses multiple ranks of one spell to the same logical spell name", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 3627, name: "Rejuvenation" }),
      aReportAbility({ gameID: 9839, name: "Rejuvenation" }),
      aReportAbility({ gameID: 26982, name: "Rejuvenation" }),
    ]);
    expect(result.get(3627)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 6,
    });
    expect(result.get(9839)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 8,
    });
    expect(result.get(26982)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: 13,
    });
  });

  it("resolves a target spell name whose gameID has no known rank to rank: null", () => {
    const result = resolveAbilities([
      aReportAbility({ gameID: 38657, name: "Rejuvenation" }),
    ]);
    expect(result.get(38657)).toEqual({
      kind: "spell",
      spell: "Rejuvenation",
      rank: null,
    });
  });

  it("resolves a rune by name and gameID", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 27869,
        name: "Dark Rune",
        icon: "inv_misc_rune_04.jpg",
        type: "32",
      }),
    ]);
    expect(result.get(27869)).toEqual({
      kind: "consumable",
      item: "Dark Rune",
    });
  });

  it("resolves a known mana potion gameID as a consumable despite its generic WCL name", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 28499,
        name: "Restore Mana",
        icon: "inv_potion_137.jpg",
        type: "1",
      }),
    ]);
    expect(result.get(28499)).toEqual({
      kind: "consumable",
      item: "Mana Potion",
    });
  });

  it("does not resolve an unlisted gameID sharing the generic 'Restore Mana' name", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 99999,
        name: "Restore Mana",
        icon: "some_other_icon.jpg",
        type: "1",
      }),
    ]);
    expect(result.has(99999)).toBe(false);
  });

  it("does not resolve an ability irrelevant to druid healing", () => {
    const result = resolveAbilities([
      aReportAbility({
        gameID: 12345,
        name: "Mortal Strike",
        icon: "ability_warrior_savageblow.jpg",
        type: "1",
      }),
    ]);
    expect(result.has(12345)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: FAIL — `Cannot find module './resolveAbilities'`.

- [ ] **Step 4: Write the implementation**

Create `src/abilities/resolveAbilities.ts`:

```ts
import type { ReportAbility } from "../wcl/client";

export type DruidHealingSpell =
  | "Lifebloom"
  | "Rejuvenation"
  | "Regrowth"
  | "Healing Touch"
  | "Swiftmend"
  | "Nature's Swiftness"
  | "Tranquility"
  | "Innervate";

export type DruidConsumable = "Mana Potion" | "Dark Rune" | "Demonic Rune";

export type ResolvedAbility =
  | { kind: "spell"; spell: DruidHealingSpell; rank: number }
  | { kind: "spell"; spell: DruidHealingSpell; rank: null }
  | { kind: "consumable"; item: DruidConsumable };

const DRUID_HEALING_SPELLS: readonly DruidHealingSpell[] = [
  "Lifebloom",
  "Rejuvenation",
  "Regrowth",
  "Healing Touch",
  "Swiftmend",
  "Nature's Swiftness",
  "Tranquility",
  "Innervate",
];

const RUNE_ITEMS: readonly DruidConsumable[] = ["Dark Rune", "Demonic Rune"];

// gameID -> rank for every ID confidently attributable to a real player-trainable
// spell rank, sourced from wowhead's TBC Classic spell-family listings and
// cross-checked against live masterData.abilities pulls (docs/testing.md's known
// test reports). Anniversary realms have been observed emitting ability IDs that
// match a target name but aren't real player ranks (e.g. Rejuvenation gameID 38657,
// Healing Touch gameID 29339) — those are deliberately NOT listed here, so they
// fall through to `rank: null` in resolveAbilities rather than being guessed at.
const SPELL_RANKS: Record<number, { spell: DruidHealingSpell; rank: number }> =
  {
    // Lifebloom — single rank in TBC; two gameIDs observed live (application + bloom).
    33763: { spell: "Lifebloom", rank: 1 },
    33778: { spell: "Lifebloom", rank: 1 },

    // Rejuvenation ranks 1-13 (live-confirmed: 3627 R6, 9839 R8, 26982 R13).
    774: { spell: "Rejuvenation", rank: 1 },
    1058: { spell: "Rejuvenation", rank: 2 },
    1430: { spell: "Rejuvenation", rank: 3 },
    2090: { spell: "Rejuvenation", rank: 4 },
    2091: { spell: "Rejuvenation", rank: 5 },
    3627: { spell: "Rejuvenation", rank: 6 },
    8910: { spell: "Rejuvenation", rank: 7 },
    9839: { spell: "Rejuvenation", rank: 8 },
    9840: { spell: "Rejuvenation", rank: 9 },
    9841: { spell: "Rejuvenation", rank: 10 },
    25299: { spell: "Rejuvenation", rank: 11 },
    26981: { spell: "Rejuvenation", rank: 12 },
    26982: { spell: "Rejuvenation", rank: 13 },

    // Regrowth ranks 1-10 (live-confirmed: 9750 R6, 26980 R10).
    8936: { spell: "Regrowth", rank: 1 },
    8938: { spell: "Regrowth", rank: 2 },
    8939: { spell: "Regrowth", rank: 3 },
    8940: { spell: "Regrowth", rank: 4 },
    8941: { spell: "Regrowth", rank: 5 },
    9750: { spell: "Regrowth", rank: 6 },
    9856: { spell: "Regrowth", rank: 7 },
    9857: { spell: "Regrowth", rank: 8 },
    9858: { spell: "Regrowth", rank: 9 },
    26980: { spell: "Regrowth", rank: 10 },

    // Healing Touch ranks 1-13. Not yet live-confirmed at max rank; gameID 29339
    // (observed live under this name) doesn't match any real rank's mana cost and
    // is deliberately excluded — see the module comment above.
    5185: { spell: "Healing Touch", rank: 1 },
    5186: { spell: "Healing Touch", rank: 2 },
    5187: { spell: "Healing Touch", rank: 3 },
    5188: { spell: "Healing Touch", rank: 4 },
    5189: { spell: "Healing Touch", rank: 5 },
    6778: { spell: "Healing Touch", rank: 6 },
    8903: { spell: "Healing Touch", rank: 7 },
    9758: { spell: "Healing Touch", rank: 8 },
    9888: { spell: "Healing Touch", rank: 9 },
    9889: { spell: "Healing Touch", rank: 10 },
    25297: { spell: "Healing Touch", rank: 11 },
    26978: { spell: "Healing Touch", rank: 12 },
    26979: { spell: "Healing Touch", rank: 13 },

    // Swiftmend, Nature's Swiftness, Innervate — single rank each in TBC, all
    // live-confirmed.
    18562: { spell: "Swiftmend", rank: 1 },
    17116: { spell: "Nature's Swiftness", rank: 1 },
    29166: { spell: "Innervate", rank: 1 },

    // Tranquility ranks 1-5 (live-confirmed: 9863 R4).
    740: { spell: "Tranquility", rank: 1 },
    8918: { spell: "Tranquility", rank: 2 },
    9862: { spell: "Tranquility", rank: 3 },
    9863: { spell: "Tranquility", rank: 4 },
    26983: { spell: "Tranquility", rank: 5 },
  };

// Mana potions resolve by gameID only: WCL logs their cast under the ability name
// "Restore Mana", which is shared with unrelated effects (other classes'
// mana-drain/return abilities, engineering items), so name-matching would produce
// false positives. Covers the mana potion tiers realistic for a level-70 raider
// (Major, Super, Fel, Superior) — live-confirmed: 28499 (Super Mana Potion).
const MANA_POTION_GAME_IDS: ReadonlySet<number> = new Set([
  17531, // Major Mana Potion
  17530, // Superior Mana Potion
  28499, // Super Mana Potion
  38929, // Fel Mana Potion
]);

export function resolveAbilities(
  reportAbilities: ReportAbility[],
): Map<number, ResolvedAbility> {
  const resolved = new Map<number, ResolvedAbility>();

  for (const ability of reportAbilities) {
    const knownRank = SPELL_RANKS[ability.gameID];
    if (knownRank) {
      resolved.set(ability.gameID, { kind: "spell", ...knownRank });
      continue;
    }

    if ((DRUID_HEALING_SPELLS as readonly string[]).includes(ability.name)) {
      resolved.set(ability.gameID, {
        kind: "spell",
        spell: ability.name as DruidHealingSpell,
        rank: null,
      });
      continue;
    }

    if ((RUNE_ITEMS as readonly string[]).includes(ability.name)) {
      resolved.set(ability.gameID, {
        kind: "consumable",
        item: ability.name as DruidConsumable,
      });
      continue;
    }

    if (MANA_POTION_GAME_IDS.has(ability.gameID)) {
      resolved.set(ability.gameID, {
        kind: "consumable",
        item: "Mana Potion",
      });
    }
  }

  return resolved;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: PASS (all 7 cases green).

- [ ] **Step 6: Run the full test suite and static analysis**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green — this also re-confirms Task 1's tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/abilities/resolveAbilities.ts src/abilities/resolveAbilities.test.ts src/testUtils/factories.ts
git commit -m "feat(abilities): add ability resolution table (story 007)"
```

---

## Task 3: Retire the story's paperwork

**Files:**

- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/007-ability-resolution-design.md`
- Delete: `docs/plans/007-ability-resolution-plan.md` (this file)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Confirm nothing else references the spec/plan files**

Run: `grep -rn "007-ability-resolution" --include="*.md" --include="*.ts" --include="*.tsx" .`
Expected: only `docs/backlog.md` (if it's been updated to point elsewhere) and the two files themselves. If anything else references them, resolve that reference before deleting.

- [ ] **Step 2: Mark story 007 done in the backlog**

In `docs/backlog.md`, change the heading:

```markdown
### 007 — Ability resolution table
```

to:

```markdown
### 007 — Ability resolution table ✅ Done
```

- [ ] **Step 3: Update CLAUDE.md's repo-state line**

In `CLAUDE.md`'s "Repo state" section, replace this exact sentence:

```
Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), and story 006 (event fetching & caching layer) are complete and live. Phase 1 MVP work continues with backlog story 007 (ability resolution table) next.
```

with:

```
Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), story 006 (event fetching & caching layer), and story 007 (ability resolution table) are complete and live. Phase 1 MVP work continues with backlog story 101 (active time & GCD utilization) next.
```

(Story 101 is next per `docs/backlog.md`'s "Suggested path from the current state" line: `... → 007 → 101 → ...`.)

- [ ] **Step 4: Delete the spec and plan files**

```bash
git rm docs/specs/007-ability-resolution-design.md docs/plans/007-ability-resolution-plan.md
```

- [ ] **Step 5: Verify static analysis still passes**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 007 done, delete its spec/plan, point at story 101"
```
