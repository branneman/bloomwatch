import type { DruidHealingSpell } from "./resolveAbilities";

// One entry per spell per supported WoW client language. Locale codes per
// Blizzard's GetLocale API (enGB clients report as enUS, so there's no
// separate British English entry): deDE, frFR, esES, esMX, itIT, ptBR,
// ruRU, koKR, zhCN, zhTW. Each spell's array is ordered
// [en, de, fr, es, it, pt, ru, ko, zhCN, zhTW] — esES and esMX share one
// string (no confirmed per-spell difference found; see docs/testing.md).
//
// Only reached when an ability's gameID isn't already in
// resolveAbilities.ts's SPELL_RANKS table (an unranked/unrecognized ID) —
// game IDs are locale-independent, so most real casts never need this path
// at all. See docs/backlog.md story 906 and
// docs/specs/906-locale-safe-ability-resolution-design.md.
//
// Sourcing and per-language validation status: see docs/testing.md's
// "Locale coverage" section. Summary: German/French/Spanish/Portuguese/
// Russian/Korean/Chinese sourced from a hand-compiled reference table
// cross-checked against wowhead; Italian was independently corrected
// during this story after the initial reference data turned out to be a
// wowhead classic-page gap (confirmed via Blizzard's own official Italian
// patch notes and wowhead's retail Italian pages) — except Nature's
// Swiftness, whose Druid-specific ID appears to have been reworked away in
// modern retail, so its Italian entry is community-guide-sourced only.
export const LOCALIZED_SPELL_NAMES: Record<
  DruidHealingSpell,
  readonly string[]
> = {
  Lifebloom: [
    "Lifebloom",
    "Blühendes Leben",
    "Fleur de vie",
    "Flor de vida",
    "Bocciolo di Vita",
    "Brotar da Vida",
    "Жизнецвет",
    "피어나는 생명",
    "生命绽放",
    "生命之花",
  ],
  Rejuvenation: [
    "Rejuvenation",
    "Verjüngung",
    "Récupération",
    "Rejuvenecimiento",
    "Rinvigorimento",
    "Rejuvenescer",
    "Омоложение",
    "회복",
    "回春术",
    "回春術",
  ],
  Regrowth: [
    "Regrowth",
    "Nachwachsen",
    "Rétablissement",
    "Recrecimiento",
    "Ricrescita",
    "Recrescimento",
    "Восстановление",
    "재생",
    "愈合",
    "癒合",
  ],
  "Healing Touch": [
    "Healing Touch",
    "Heilende Berührung",
    "Toucher guérisseur",
    "Toque de sanación",
    "Tocco Curativo",
    "Toque de Cura",
    "Целительное прикосновение",
    "치유의 손길",
    "治疗之触",
    "治療之觸",
  ],
  Swiftmend: [
    "Swiftmend",
    "Rasche Heilung",
    "Prompte guérison",
    "Alivio presto",
    "Guarigione Immediata",
    "Recomposição Rápida",
    "Быстрое восстановление",
    "신속한 치유",
    "迅捷治愈",
    "迅癒",
  ],
  "Nature's Swiftness": [
    "Nature's Swiftness",
    "Schnelligkeit der Natur",
    "Rapidité de la nature",
    "Presteza de la Naturaleza",
    "Velocità della Natura",
    "Rapidez da Natureza",
    "Природная стремительность",
    "자연의 신속함",
    "自然迅捷",
    "自然迅捷",
  ],
  Tranquility: [
    "Tranquility",
    "Gelassenheit",
    "Tranquillité",
    "Tranquilidad",
    "Tranquillità",
    "Tranquilidade",
    "Спокойствие",
    "평온",
    "宁静",
    "寧靜",
  ],
  Innervate: [
    "Innervate",
    "Anregen",
    "Innervation",
    "Estimular",
    "Innervazione",
    "Avivar",
    "Озарение",
    "정신 자극",
    "激活",
    "啟動",
  ],
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
