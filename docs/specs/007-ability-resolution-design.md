# Story 007 — Ability resolution table — design

## Problem

Every metric module from epic B onward needs to know, for a given `abilityGameID` on an event, "which logical spell is this, and which rank?" WCL's `masterData.abilities` gives `gameID`, `name`, `icon`, `type` for every ability observed in a report — **but no rank field**, confirmed live against report `4GYHZRdtL3bvhpc8`:

```
query { reportData { report(code: "...") { masterData { abilities { gameID name icon type } } } } }
```

Rank is a fact about static TBC game data, not something WCL derives for us — it has to come from a table we maintain. This is exactly the case CLAUDE.md's "spell IDs must never be hardcoded... resolve them from masterData.abilities at runtime" is guarding against for _metric_ stories: this story is the one sanctioned place a gameID→rank table is allowed to live, and every later story resolves through it instead of hardcoding IDs itself.

The live check also surfaced an asymmetry that shapes the resolution algorithm: `name` is a reliable signal for spells and runes (exact matches observed: `Lifebloom`, `Rejuvenation`, `Regrowth`, `Swiftmend`, `Nature's Swiftness`, `Tranquility`, `Innervate`, `Dark Rune`, `Demonic Rune`), but a mana potion's cast shows up under the ability name `Restore Mana` — shared with unrelated effects (engineering items, other classes' mana-drain/return effects). Mana potions therefore cannot use a name-based safety net; they can only be resolved via a maintained ID allow-list.

## Data flow

```
fetchMasterDataAbilities(token, reportCode)   // src/wcl/client.ts — thin I/O
        ↓ ReportAbility[] { gameID, name, icon, type }
resolveAbilities(reportAbilities)             // src/abilities/resolveAbilities.ts — pure
        ↓ Map<abilityGameID, ResolvedAbility>
```

`fetchMasterDataAbilities` mirrors the existing `fetchReportFights`/`fetchCastsTable` in `src/wcl/client.ts`: single non-paginated GraphQL query, no dedicated cache module (cheap, called once per report load — same as fights).

`resolveAbilities` is pure and report-scoped: called once per loaded report with that report's `masterData.abilities`, producing a lookup table every metric module reads `event.abilityGameID` against for the rest of that report's analysis.

## Types

```ts
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
  | { kind: "spell"; spell: DruidHealingSpell; rank: null } // known spell, gap in our rank table
  | { kind: "consumable"; item: DruidConsumable };

export interface ReportAbility {
  gameID: number;
  name: string;
  icon: string;
  type: string;
}
```

## Resolution algorithm

Two paths, per the asymmetry found above:

**Spells & runes** — match on `name` against a fixed target-name list (the `DruidHealingSpell` and rune members of `DruidConsumable`) first.

- Name matches AND `gameID` is in our static rank table → `{ kind: "spell", spell, rank: <number> }`.
- Name matches but `gameID` is _not_ in our rank table (a rank we didn't account for) → `{ kind: "spell", spell, rank: null }`. Non-fatal by design (confirmed with user) — one gap in the table doesn't take down every metric that reads through it; downstream modules decide whether to skip a `rank: null` entry or treat it as "some rank, unspecified."
- Runes have no rank concept — name+ID match alone resolves them straight to `{ kind: "consumable", item }`.
- Name doesn't match any target → not in the output map (irrelevant ability, e.g. another class's cooldown).

**Mana potions** — resolved purely by checking `gameID` against a maintained allow-list of known TBC mana-potion effect IDs (populated during implementation, verified live — see below). No name fallback is possible, so an unlisted potion ID is simply absent from the result map. This is the one category where a table gap is silently invisible rather than surfaced as `rank: null` — there's no reliable signal in the report to hang an "unknown potion" marker on, since `Restore Mana` isn't unique to potions.

## Static table sourcing & verification

The gameID→rank table and the mana-potion ID allow-list are hardcoded in `src/abilities/resolveAbilities.ts`, seeded from known TBC spell data. Content is verified during implementation by spot-checking live `masterData.abilities` queries against the real report codes already catalogued in `docs/testing.md`, the same way this design verified the schema — not trusted from memory alone, especially the mana-potion list, since none of the currently-catalogued reports happen to show a potion cast yet (may need a fresh report or an events-table cross-check to find one).

## File layout

- `src/wcl/client.ts` — add `fetchMasterDataAbilities(accessToken, reportCode): Promise<ReportAbility[]>`.
- `src/abilities/resolveAbilities.ts` — static tables + `resolveAbilities()`. New top-level directory: this is cross-cutting logic every future metric module depends on, not report-selection UI logic like `src/report/`.
- `src/abilities/resolveAbilities.test.ts` — Tier 1 unit tests (per `docs/testing.md`, already slated to cover "ability-ID resolution (007)" at this tier). Cases: known spell+rank resolves; multiple ranks of one spell collapse to the same logical name; unranked-gap spell resolves to `rank: null`; rune resolves as consumable; mana-potion ID resolves as consumable; unlisted mana-potion ID is silently absent; an irrelevant ability (e.g. a warrior cooldown) is silently absent.
- `src/testUtils/factories.ts` — add `aReportAbility({ gameID, name, icon, type }, overrides)` factory.
- `test/integration/fixtures/masterdata-abilities.json` — captured live from report `4GYHZRdtL3bvhpc8` during implementation, for a thin Tier 2 test (MSW-mocked) of `fetchMasterDataAbilities`, matching the existing fixture pattern.

No Tier 3 (component) work — this story is pure data-layer plumbing with no UI; later stories (101+) are the first consumers.

## Non-goals

- Resolving abilities for non-druid-relevant spells (anything outside the target lists is simply excluded from the output map).
- Handling gameID collisions across game-version content patches (not a concern — TBC Anniversary is a fixed game version).
- Any UI surface for unresolved/`rank: null` entries — that's a later story's concern if it becomes necessary.
