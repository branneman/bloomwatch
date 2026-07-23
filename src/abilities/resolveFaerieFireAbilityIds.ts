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
// name match. It's excluded naturally by name-matching only the exact
// "Faerie Fire" string literal.
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
    // Fallback: match by name, naturally excluding "Faerie Fire (Feral)"
    // since it's a distinct string literal
    if (ability.name === FAERIE_FIRE_NAME) {
      ids.add(ability.gameID);
    }
  }
  return ids;
}
