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
