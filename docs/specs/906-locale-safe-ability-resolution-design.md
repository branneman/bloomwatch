# 906 — Locale-safe ability resolution: design

Backlog: story 906 (`docs/backlog.md`).

## Problem

Two spots in ability/druid resolution depend on English spell-name strings:

- `src/abilities/resolveAbilities.ts` resolves by game ID first (locale-safe), but falls back to matching `ability.name` against a hardcoded English `DRUID_HEALING_SPELLS`/`RUNE_ITEMS` list for any ID not already in its `SPELL_RANKS` table. This fallback is only reached for unranked/unrecognized IDs (e.g. Anniversary's "phantom" same-name-but-fake-rank IDs) — most real casts already resolve via ID regardless of client language, since game IDs never change across locales.
- `src/report/druidDetection.ts`'s `detectDruids` is **100% name-based with no ID fallback at all**. This is the severe case: a report logged by a non-English client would show zero healing casts for a real healer, since `HEALING_SPELL_NAMES.includes(ability.name)` would never match, silently breaking druid auto-detection (story 005) end to end.

## Investigation findings

- WCL's `Casts`-dataType `table` query already returns a `guid` (game ID) per ability entry — confirmed live — it's just not read into `CastTableEntry` today (`src/wcl/client.ts`'s `fetchCastsTable` drops it in its mapping). Adding it is a pure plumbing change.
- Real, locale-independent item IDs for Dark Rune (`27869`) and Demonic Rune (`16666`) were found in the existing `test/integration/fixtures/masterdata-abilities.json` fixture — the same treatment `Mana Potion` already gets via `MANA_POTION_GAME_IDS`. Both can move to ID-only matching, eliminating `RUNE_ITEMS`'s name-matching fallback entirely. This narrows the translation-table scope to just the 8 spell names.
- `SPELL_RANKS` was independently verified (against `warcraft.wiki.gg`'s per-expansion rank/spell-ID boundaries) to already have **complete TBC Classic rank coverage** for every multi-rank healing spell: Rejuvenation 1–13 (774→26982), Regrowth 1–10 (8936→26980), Healing Touch 1–13 (5185→26979), Tranquility 1–5 (740→26983). Lifebloom, Swiftmend, Nature's Swiftness, and Innervate are correctly single-rank in TBC. This means switching `detectDruids` to ID-first matching against `SPELL_RANKS` closes the severe bug for virtually every real cast, with zero translation risk — the localized-name fallback in that path only matters for unrecognized/future IDs, same narrow case as `resolveAbilities.ts`'s existing fallback.
- WCL's GraphQL schema exposes no report-level locale/language field (confirmed via introspection on `Report`), so there's no way to detect or branch on a report's client language directly — name-based fallback matching against a translation table is the only option for ability IDs not already in `SPELL_RANKS`.
- Automated scraping of localized wowhead pages to source translations was attempted and is unreliable from this environment (redirect loops on language-prefixed URLs, JS-rendered rank/name data not present in fetched HTML, DB mirrors returning 403s). Translations for the localized-name table are instead being sourced by hand (real WCL reports where available, reference material otherwise), each language's confidence documented in `docs/testing.md`.

## Design

### 1. `src/wcl/client.ts`

Add `guid?: number` to `CastTableAbility` and map it through in `fetchCastsTable`'s entry-mapping (currently only `name`/`total` are kept).

### 2. Consumables: ID-only, no translation needed

Add `DARK_RUNE_ID = 27869` and `DEMONIC_RUNE_ID = 16666` constants in `resolveAbilities.ts`, checked the same way `MANA_POTION_GAME_IDS` already is. Delete `RUNE_ITEMS` and its name-matching branch entirely.

### 3. New `src/abilities/localizedSpellNames.ts`

A small, self-contained data module:

```ts
export const LOCALIZED_SPELL_NAMES: Record<DruidHealingSpell, readonly string[]> = {
  Lifebloom: ["Lifebloom", /* deDE, frFR, esES, esMX, itIT, ptBR, ruRU, koKR, zhCN, zhTW */],
  Rejuvenation: [...],
  // ...all 8 spells
};

export function matchLocalizedSpellName(name: string): DruidHealingSpell | undefined { ... }
```

`matchLocalizedSpellName` builds a reverse lookup (`Map<string, DruidHealingSpell>`) once at module load and does an O(1) lookup. Kept as its own file since it's pure locale data, separate from the ID-rank logic in `resolveAbilities.ts` — easy to locate and extend later (new language, corrected string) without touching resolution logic.

Each language's array entry gets an inline comment recording its source (real report code, or reference material) — expanded into `docs/testing.md`'s permanent note once populated.

### 4. `src/abilities/resolveAbilities.ts`

Fallback path changes from:

```ts
if ((DRUID_HEALING_SPELLS as readonly string[]).includes(ability.name)) { ... }
```

to:

```ts
const spell = matchLocalizedSpellName(ability.name);
if (spell) {
  resolved.set(ability.gameID, { kind: "spell", spell, rank: null });
  continue;
}
```

### 5. `src/report/druidDetection.ts`

`detectDruids` currently computes `healingCastCount` via:

```ts
entry.abilities.filter((ability) => HEALING_SPELL_NAMES.includes(ability.name));
```

Changes to check each ability's `guid` against `SPELL_RANKS` first (imported from `resolveAbilities.ts`, exported for this purpose), falling back to `matchLocalizedSpellName(ability.name)` for unrecognized IDs — then testing membership in the existing 6-spell `HEALING_SPELLS` subset (unchanged: Rejuvenation, Regrowth, Lifebloom, Healing Touch, Swiftmend, Tranquility — still excludes Nature's Swiftness/Innervate, which aren't healing casts).

`detectHealingRoleThisFight` needs no change — it already consumes `resolveAbilities()`'s output map, so it inherits the fix transitively once `resolveAbilities.ts`'s fallback is locale-aware.

### 6. Tests

Existing tests building `CastTableEntry.abilities` as `{ name: "Lifebloom", total: N }` with no `guid` keep passing unchanged — English is trivially one of the matched strings in the fallback path, so omitting `guid` just exercises the fallback rather than the ID-first path. New tests are added to exercise the ID-first path explicitly (with `guid` set) and the localized-name fallback (a non-English name with no matching `guid`).

### 7. `docs/testing.md`

New note recording, per language, whether its translation was validated against a real non-English-logged WCL report (report code cited) or sourced from reference material only (unverified) — per story 906's acceptance criteria.

## Out of scope

- Any UI-visible locale/language switching — this is purely about internal ability-name matching robustness.
- Translating anything beyond the 8 `DruidHealingSpell` names (consumables are ID-only per above).
