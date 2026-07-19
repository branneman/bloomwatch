import type { ReportAbility } from "../wcl/client";
import { matchLocalizedSpellName } from "./localizedSpellNames";

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

// Derived from SPELL_RANKS rather than a second hardcoded rank-ceiling
// list, so the two can't drift apart as ranks are added. See
// docs/backlog.md story 303.
export function getMaxRank(spell: DruidHealingSpell): number | null {
  let max: number | null = null;
  for (const entry of Object.values(SPELL_RANKS)) {
    if (entry.spell !== spell) continue;
    if (max === null || entry.rank > max) max = entry.rank;
  }
  return max;
}

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

// Dark Rune and Demonic Rune are matched by gameID only, like Mana Potion
// above — item IDs are locale-independent, so unlike the healing spells'
// fallback path (see resolveAbilities' loop below), no name-matching is
// needed for these two. Confirmed live against
// test/integration/fixtures/masterdata-abilities.json.
const DARK_RUNE_ID = 27869;
const DEMONIC_RUNE_ID = 16666;

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

    const spell = matchLocalizedSpellName(ability.name);
    if (spell) {
      resolved.set(ability.gameID, { kind: "spell", spell, rank: null });
      continue;
    }

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

    if (MANA_POTION_GAME_IDS.has(ability.gameID)) {
      resolved.set(ability.gameID, {
        kind: "consumable",
        item: "Mana Potion",
      });
    }
  }

  return resolved;
}

export function resolveSpellAbilityIds(
  resolved: Map<number, ResolvedAbility>,
  spell: DruidHealingSpell,
): Set<number> {
  const ids = new Set<number>();
  for (const [gameID, ability] of resolved) {
    if (ability.kind === "spell" && ability.spell === spell) {
      ids.add(gameID);
    }
  }
  return ids;
}
