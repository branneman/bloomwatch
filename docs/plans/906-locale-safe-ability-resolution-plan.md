# 906 — Locale-safe ability resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make druid healing-cast detection and ability resolution locale-independent for every ability whose game ID is already known, and give the remaining name-matching fallback a real (if currently English-only) extension point for non-English translations.

**Architecture:** Thread WCL's already-returned `guid` field through the cast-table fetch layer so `detectDruids` can match abilities by game ID first (locale-independent) instead of English name only. Both `resolveAbilities.ts`'s existing ID-fallback and `detectDruids`'s new ID-first path share one small locale-data module (`localizedSpellNames.ts`) for the remaining unrecognized-ID case. Dark Rune and Demonic Rune move to ID-only matching (real IDs confirmed against a live fixture), eliminating their name-matching entirely.

**Tech Stack:** TypeScript, Vitest, existing `src/wcl/client.ts` / `src/abilities/resolveAbilities.ts` / `src/report/druidDetection.ts` modules.

## Global Constraints

- Spell/ability IDs must never be hardcoded without a comment justifying the source (per `CLAUDE.md`) — every new ID constant in this plan cites where it was confirmed.
- No behavior change for any currently-passing test unless the task explicitly says so.
- `npm run typecheck` and the full test suite must pass after every task (pre-commit hook already enforces this).
- This plan does **not** populate the 9 non-English translation arrays — see `docs/specs/906-locale-safe-ability-resolution-design.md`'s findings section on why (translations are being sourced by hand, separately). Task 4 ships the module with English-only entries and a documented extension point. Do not mark backlog story 906 done at the end of this plan — it isn't complete until the translations land as a follow-up.

---

## Task 1: Thread `guid` through `fetchCastsTable`

**Files:**

- Modify: `src/wcl/client.ts:252-308` (`CastTableAbility` interface, `fetchCastsTable`'s entry-mapping)
- Modify: `src/testUtils/factories.ts:35-51` (`aCastTableEntry`'s default abilities)
- Test: `test/integration/client.test.ts:178-199`

**Interfaces:**

- Produces: `CastTableAbility.guid?: number` — a new optional field later tasks read to do ID-first ability matching.

- [ ] **Step 1: Write the failing test**

Update the existing test in `test/integration/client.test.ts` (the one that currently asserts `dassz`'s exact shape) to expect `guid` on each ability, using the real values already present in `test/integration/fixtures/casts-table.json`:

```ts
it("parses actor cast breakdowns from a real captured response shape", async () => {
  server.use(
    http.post(USER_API_URL, () => HttpResponse.json(castsTableFixture)),
  );
  const result = await fetchCastsTable("test-token", "4GYHZRdtL3bvhpc8", [6]);
  expect(result).toHaveLength(5);
  const dassz = result.find((e) => e.name === "Dassz");
  expect(dassz).toEqual({
    id: 2,
    name: "Dassz",
    type: "Druid",
    icon: "Druid-Restoration",
    abilities: [
      { name: "Lifebloom", total: 33, guid: 33763 },
      { name: "Rejuvenation", total: 16, guid: 26982 },
      { name: "Regrowth", total: 6, guid: 26980 },
      { name: "Rejuvenation", total: 3, guid: 9839 },
      { name: "Swiftmend", total: 2, guid: 18562 },
    ],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/client.test.ts -t "parses actor cast breakdowns"`
Expected: FAIL — actual abilities lack the `guid` field.

- [ ] **Step 3: Write minimal implementation**

In `src/wcl/client.ts`, update the `CastTableAbility` interface (around line 252):

```ts
export interface CastTableAbility {
  name: string;
  total: number;
  guid?: number;
}
```

Update the inline raw-entry type and mapping inside `fetchCastsTable` (around lines 290-306):

```ts
    (entry: {
      id: number;
      name: string;
      type: string;
      icon: string;
      abilities: Array<{
        name: string;
        total: number;
        guid?: number;
        type?: unknown;
        icon?: unknown;
      }>;
    }): CastTableEntry => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      icon: entry.icon,
      abilities: entry.abilities.map((ability) => ({
        name: ability.name,
        total: ability.total,
        guid: ability.guid,
      })),
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS (all tests in the file, not just the one edited).

- [ ] **Step 5: Update the factory's default abilities to include real gameIDs**

In `src/testUtils/factories.ts`, update `aCastTableEntry`'s default `abilities` (lines 43-48):

```ts
    abilities: [
      { name: "Lifebloom", total: 33, guid: 33763 },
      { name: "Rejuvenation", total: 16, guid: 774 },
      { name: "Regrowth", total: 6, guid: 8936 },
      { name: "Swiftmend", total: 2, guid: 18562 },
    ],
```

(These are the same rank-1 gameIDs already used throughout `resolveAbilities.ts` — see `src/abilities/resolveAbilities.ts`'s `SPELL_RANKS` table.)

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS. (No other test asserts an exact `abilities` shape from this factory's default — call sites in `druidDetection.test.ts` either use the default or override `abilities` entirely.)

- [ ] **Step 7: Commit**

```bash
git add src/wcl/client.ts src/testUtils/factories.ts test/integration/client.test.ts
git commit -m "feat(wcl-client): thread ability gameID through fetchCastsTable"
```

---

## Task 2: `resolveAbilities.ts` — ID-only Dark Rune / Demonic Rune

**Files:**

- Modify: `src/abilities/resolveAbilities.ts:31, 149-155` (remove `RUNE_ITEMS` name-matching, add ID-only matching)
- Test: `src/abilities/resolveAbilities.test.ts:55-66`

**Interfaces:**

- Consumes: nothing new.
- Produces: no interface change — `resolveAbilities`'s return type and behavior for real Dark Rune / Demonic Rune IDs are unchanged, only _how_ they're matched changes (ID instead of name).

- [ ] **Step 1: Write the failing test**

Replace the existing rune test in `src/abilities/resolveAbilities.test.ts` (lines 55-66) with two tests proving ID-only matching (name is now irrelevant):

```ts
it("resolves Dark Rune by gameID regardless of ability name", () => {
  const result = resolveAbilities([
    aReportAbility({ gameID: 27869, name: "Rune Sombre" }), // name irrelevant now — real gameID confirmed live
  ]);
  expect(result.get(27869)).toEqual({
    kind: "consumable",
    item: "Dark Rune",
  });
});

it("resolves Demonic Rune by gameID regardless of ability name", () => {
  const result = resolveAbilities([
    aReportAbility({ gameID: 16666, name: "Rune Démoniaque" }),
  ]);
  expect(result.get(16666)).toEqual({
    kind: "consumable",
    item: "Demonic Rune",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts -t "Rune"`
Expected: The Demonic Rune test FAILs (gameID 16666 isn't recognized at all yet — no `MANA_POTION_GAME_IDS`-style set exists for it). The Dark Rune test may pass already by coincidence (name-fallback still active) — that's fine, Step 3 changes the underlying mechanism regardless.

- [ ] **Step 3: Write minimal implementation**

In `src/abilities/resolveAbilities.ts`, delete the `RUNE_ITEMS` constant (line 31) and its matching branch (lines 149-155). Add two ID constants near `MANA_POTION_GAME_IDS` (after line 126):

```ts
// Dark Rune and Demonic Rune are matched by gameID only, like Mana Potion
// above — item IDs are locale-independent, so unlike the healing spells'
// fallback path (see resolveAbilities' loop below), no name-matching is
// needed for these two. Confirmed live against
// test/integration/fixtures/masterdata-abilities.json.
const DARK_RUNE_ID = 27869;
const DEMONIC_RUNE_ID = 16666;
```

Replace the deleted `RUNE_ITEMS` branch inside `resolveAbilities`'s loop with:

```ts
if (ability.gameID === DARK_RUNE_ID) {
  resolved.set(ability.gameID, { kind: "consumable", item: "Dark Rune" });
  continue;
}

if (ability.gameID === DEMONIC_RUNE_ID) {
  resolved.set(ability.gameID, {
    kind: "consumable",
    item: "Demonic Rune",
  });
  continue;
}
```

(Keep this ordered before the existing `MANA_POTION_GAME_IDS.has(...)` check — order between these three doesn't matter functionally since the ID sets are disjoint, but keeping runes together above potions matches the module's existing grouping.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add src/abilities/resolveAbilities.ts src/abilities/resolveAbilities.test.ts
git commit -m "fix(abilities): resolve Dark Rune and Demonic Rune by gameID only"
```

---

## Task 3: `localizedSpellNames.ts` module (English-only scaffold)

**Files:**

- Create: `src/abilities/localizedSpellNames.ts`
- Test: `src/abilities/localizedSpellNames.test.ts`

**Interfaces:**

- Consumes: `DruidHealingSpell` type from `./resolveAbilities`.
- Produces: `matchLocalizedSpellName(name: string): DruidHealingSpell | undefined` — used by Task 4 (`resolveAbilities.ts`) and Task 5 (`druidDetection.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/abilities/localizedSpellNames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchLocalizedSpellName } from "./localizedSpellNames";

describe("matchLocalizedSpellName", () => {
  it("matches every spell's English name", () => {
    expect(matchLocalizedSpellName("Lifebloom")).toBe("Lifebloom");
    expect(matchLocalizedSpellName("Rejuvenation")).toBe("Rejuvenation");
    expect(matchLocalizedSpellName("Regrowth")).toBe("Regrowth");
    expect(matchLocalizedSpellName("Healing Touch")).toBe("Healing Touch");
    expect(matchLocalizedSpellName("Swiftmend")).toBe("Swiftmend");
    expect(matchLocalizedSpellName("Nature's Swiftness")).toBe(
      "Nature's Swiftness",
    );
    expect(matchLocalizedSpellName("Tranquility")).toBe("Tranquility");
    expect(matchLocalizedSpellName("Innervate")).toBe("Innervate");
  });

  it("returns undefined for a name matching no known spell in any language", () => {
    expect(matchLocalizedSpellName("Mortal Strike")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/abilities/localizedSpellNames.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/abilities/localizedSpellNames.ts`:

```ts
import type { DruidHealingSpell } from "./resolveAbilities";

// One entry per spell per supported WoW client language. Locale codes per
// Blizzard's GetLocale API (enGB clients report as enUS, so there's no
// separate British English entry): deDE, frFR, esES, esMX, itIT, ptBR,
// ruRU, koKR, zhCN, zhTW.
//
// Only reached when an ability's gameID isn't already in
// resolveAbilities.ts's SPELL_RANKS table (an unranked/unrecognized ID) —
// game IDs are locale-independent, so most real casts never need this path
// at all. See docs/backlog.md story 906 and
// docs/specs/906-locale-safe-ability-resolution-design.md.
//
// Non-English entries are being sourced by hand (real WCL reports where
// possible, reference material otherwise) and are not yet populated — see
// docs/testing.md for per-language validation status once they land.
export const LOCALIZED_SPELL_NAMES: Record<
  DruidHealingSpell,
  readonly string[]
> = {
  Lifebloom: ["Lifebloom"],
  Rejuvenation: ["Rejuvenation"],
  Regrowth: ["Regrowth"],
  "Healing Touch": ["Healing Touch"],
  Swiftmend: ["Swiftmend"],
  "Nature's Swiftness": ["Nature's Swiftness"],
  Tranquility: ["Tranquility"],
  Innervate: ["Innervate"],
};

const NAME_TO_SPELL = new Map<string, DruidHealingSpell>();
for (const [spell, names] of Object.entries(LOCALIZED_SPELL_NAMES) as Array<
  [DruidHealingSpell, readonly string[]]
>) {
  for (const name of names) {
    NAME_TO_SPELL.set(name, spell);
  }
}

export function matchLocalizedSpellName(
  name: string,
): DruidHealingSpell | undefined {
  return NAME_TO_SPELL.get(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/abilities/localizedSpellNames.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/abilities/localizedSpellNames.ts src/abilities/localizedSpellNames.test.ts
git commit -m "feat(abilities): add localized spell name lookup module"
```

---

## Task 4: `resolveAbilities.ts` — use the shared localized-name lookup

**Files:**

- Modify: `src/abilities/resolveAbilities.ts:20-29, 140-147` (remove `DRUID_HEALING_SPELLS`, use `matchLocalizedSpellName`)
- Modify: `src/abilities/resolveAbilities.test.ts` (no new tests needed — existing fallback test already covers this path)

**Interfaces:**

- Consumes: `matchLocalizedSpellName` from `./localizedSpellNames` (Task 3).
- Produces: no external interface change.

- [ ] **Step 1: Confirm existing coverage**

`src/abilities/resolveAbilities.test.ts`'s `"resolves a target spell name whose gameID has no known rank to rank: null"` test (gameID `38657`, name `"Rejuvenation"`) already exercises the fallback path this task changes. No new test is needed — Step 4 re-runs it to confirm the refactor preserves behavior.

- [ ] **Step 2: Write the implementation**

In `src/abilities/resolveAbilities.ts`:

1. Delete the `DRUID_HEALING_SPELLS` constant (lines 20-29).
2. Add the import at the top of the file:

```ts
import { matchLocalizedSpellName } from "./localizedSpellNames";
```

3. Replace the name-matching branch inside `resolveAbilities`'s loop (currently lines 140-147):

```ts
if ((DRUID_HEALING_SPELLS as readonly string[]).includes(ability.name)) {
  resolved.set(ability.gameID, {
    kind: "spell",
    spell: ability.name as DruidHealingSpell,
    rank: null,
  });
  continue;
}
```

with:

```ts
const spell = matchLocalizedSpellName(ability.name);
if (spell) {
  resolved.set(ability.gameID, { kind: "spell", spell, rank: null });
  continue;
}
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `npx vitest run src/abilities/resolveAbilities.test.ts`
Expected: PASS (full file, including the `rank: null` fallback test, which now goes through `matchLocalizedSpellName` and still matches on the English name).

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/abilities/resolveAbilities.ts
git commit -m "refactor(abilities): resolveAbilities fallback uses shared localized-name lookup"
```

---

## Task 5: `druidDetection.ts` — ID-first healing-spell detection

**Files:**

- Modify: `src/report/druidDetection.ts` (whole file — see below)
- Test: `src/report/druidDetection.test.ts`

**Interfaces:**

- Consumes: `getSpellForGameId(gameID: number): DruidHealingSpell | undefined` (new export from `resolveAbilities.ts`, added in this task), `matchLocalizedSpellName` from `./localizedSpellNames` (Task 3).
- Produces: no change to `detectDruids`/`detectHealingRoleThisFight`'s exported signatures.

- [ ] **Step 1: Add `getSpellForGameId` to `resolveAbilities.ts`**

In `src/abilities/resolveAbilities.ts`, add this export directly after `getMaxRank` (which already iterates `SPELL_RANKS`, so it's the natural neighbor):

```ts
export function getSpellForGameId(
  gameID: number,
): DruidHealingSpell | undefined {
  return SPELL_RANKS[gameID]?.spell;
}
```

Run: `npx vitest run src/abilities/resolveAbilities.test.ts` — Expected: still PASS (pure addition, no behavior change to existing exports).

- [ ] **Step 2: Write the failing test**

In `src/report/druidDetection.test.ts`, add this test inside the `describe("detectDruids", ...)` block (after the existing "sorts a Restoration-labeled candidate..." test, before its closing `});`):

```ts
it("counts a healing cast by gameID even when the ability name is untranslated (e.g. a German client's log)", () => {
  // "Verjüngung" is the real German client name for Rejuvenation rank 1
  // (gameID 774) — confirmed against wowhead's German localization. The
  // gameID resolves via resolveAbilities.ts's SPELL_RANKS table
  // regardless of what language the name string is in.
  const germanClient = aCastTableEntry({
    id: 9,
    name: "Emrakul",
    icon: "Druid",
    abilities: [{ name: "Verjüngung", total: 50, guid: 774 }],
  });
  expect(detectDruids([germanClient])).toEqual([
    { id: 9, name: "Emrakul", healingCastCount: 50, isRestoSpec: false },
  ]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/report/druidDetection.test.ts -t "untranslated"`
Expected: FAIL — `detectDruids` currently matches `HEALING_SPELL_NAMES.includes(ability.name)`, and `"Verjüngung"` isn't in that English-only list, so `healingCastCount` comes out `0` and the candidate is filtered out entirely (below `MIN_HEALING_CASTS_FOR_DETECTION`).

- [ ] **Step 4: Write the implementation**

Replace the full contents of `src/report/druidDetection.ts`:

```ts
import type { CastTableAbility, CastTableEntry } from "../wcl/client";
import type { WclEvent } from "../wcl/events";
import type {
  DruidHealingSpell,
  ResolvedAbility,
} from "../abilities/resolveAbilities";
import { getSpellForGameId } from "../abilities/resolveAbilities";
import { matchLocalizedSpellName } from "../abilities/localizedSpellNames";

const HEALING_SPELLS: ReadonlySet<DruidHealingSpell> = new Set([
  "Rejuvenation",
  "Regrowth",
  "Lifebloom",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
]);

// A stray opportunistic cross-heal from an off-spec druid is 1-2 casts; a real
// healer casts in the hundreds even in a single fight. Validated live against
// 7 real reports — every genuine resto druid cleared this by two orders of
// magnitude, every non-healer sat at exactly 0.
export const MIN_HEALING_CASTS_FOR_DETECTION = 3;

export interface DruidCandidate {
  id: number;
  name: string;
  healingCastCount: number;
  isRestoSpec: boolean;
}

// Resolves an ability to a DruidHealingSpell the same way resolveAbilities.ts
// does: gameID first (locale-independent — covers virtually every real cast
// regardless of client language, since SPELL_RANKS has full TBC rank
// coverage for every multi-rank healing spell), falling back to matching the
// localized name only for unranked/unrecognized IDs. See docs/backlog.md
// story 906.
function identifyHealingSpell(
  ability: CastTableAbility,
): DruidHealingSpell | undefined {
  const spell =
    (ability.guid !== undefined
      ? getSpellForGameId(ability.guid)
      : undefined) ?? matchLocalizedSpellName(ability.name);
  return spell !== undefined && HEALING_SPELLS.has(spell) ? spell : undefined;
}

export function detectDruids(entries: CastTableEntry[]): DruidCandidate[] {
  return entries
    .filter((entry) => entry.type === "Druid")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      healingCastCount: entry.abilities
        .filter((ability) => identifyHealingSpell(ability) !== undefined)
        .reduce((sum, ability) => sum + ability.total, 0),
      isRestoSpec: entry.icon === "Druid-Restoration",
    }))
    .filter(
      (candidate) =>
        candidate.healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
    )
    .sort((a, b) => {
      if (a.isRestoSpec !== b.isRestoSpec) return a.isRestoSpec ? -1 : 1;
      return b.healingCastCount - a.healingCastCount;
    });
}

export interface HealingRoleThisFight {
  healingCastCount: number;
  isHealingThisFight: boolean;
}

export function detectHealingRoleThisFight(
  events: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
): HealingRoleThisFight {
  const healingCastCount = events.filter((event) => {
    if (event.sourceID !== druidId) return false;
    if (event.type !== "cast") return false;
    if (event.abilityGameID === undefined) return false;
    const resolved = resolvedAbilities.get(event.abilityGameID);
    return resolved?.kind === "spell" && HEALING_SPELLS.has(resolved.spell);
  }).length;
  return {
    healingCastCount,
    isHealingThisFight: healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/report/druidDetection.test.ts`
Expected: PASS (full file — every pre-existing test still passes since none of them set `guid`, so they all exercise the `matchLocalizedSpellName` fallback with English names, same as before).

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/report/druidDetection.ts src/report/druidDetection.test.ts src/abilities/resolveAbilities.ts
git commit -m "fix(report): detect druid healing casts by gameID, not English name only"
```

---

## Task 6: Docs

**Files:**

- Modify: `docs/testing.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add a locale-coverage note**

Add a new section to `docs/testing.md`, after the "Known real test reports" section (after line 116, before "## Known real 2021-2022 TBC Classic reports"):

```markdown
## Locale coverage (story 906)

`src/abilities/localizedSpellNames.ts` holds the per-language name table used
as a fallback when an ability's gameID isn't already in
`resolveAbilities.ts`'s `SPELL_RANKS` table (an unranked/unrecognized ID —
real game IDs are locale-independent, so this path is a narrow edge case, not
the primary resolution mechanism). `src/report/druidDetection.ts`'s
`detectDruids` uses the same gameID-first, name-fallback mechanism.

As of this note, only English is populated — non-English entries are being
sourced by hand and validated against real non-English-logged WCL reports
where possible (a report reflects the _uploader's_ client language, not each
player's own — see the `F7aL6x13zVq8kTRt` row above for a report that was
suspected German but turned out to log in English). This section will list,
per language, which are validated against a real report (with its report
code) versus sourced from reference material only (unverified) once
populated.
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "docs: note locale-coverage status for story 906"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Design's items 1 (client.ts guid), 2 (ID-only consumables), 3 (localizedSpellNames.ts module), 4 (resolveAbilities.ts fallback), 5 (druidDetection.ts ID-first), 6 (tests), 7 (docs note) are each covered by Tasks 1-6. Translation-table population is explicitly deferred (see Global Constraints) per the user's own instruction to commit this infrastructure now and slot in real translations once sourced.
- **Type consistency:** `getSpellForGameId`, `matchLocalizedSpellName`, `identifyHealingSpell`, `HEALING_SPELLS`, `CastTableAbility.guid` are named consistently across Tasks 1, 3, 4, 5.
- **No placeholders:** every step has complete, runnable code. The one deliberately-incomplete piece (non-English translation strings) is called out explicitly in Global Constraints and Task 3's module comment, not hidden as a TODO inside a task step.
