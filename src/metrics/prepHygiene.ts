import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";

// Sourced from the restoration druid healer consumables guide (Wowhead/Icy
// Veins) plus live confirmation against real reports — a combatant-info
// aura's `name` is the buff's spell name, not always the item's flavor name
// (e.g. Elixir of Healing Power's aura is just "Healing Power"; Flask of
// Distilled Wisdom's is "Distilled Wisdom"). See docs/backlog.md story 601
// and docs/specs/prep-hygiene-design.md.
export const BATTLE_ELIXIR_NAMES = ["Healing Power"]; // Elixir of Healing Power
export const GUARDIAN_ELIXIR_NAMES = ["Elixir of Draenic Wisdom"];
export const FLASK_NAMES = [
  "Flask of Mighty Restoration",
  "Mighty Restoration of Shattrath", // Shattrath Flask of Mighty Restoration
  "Distilled Wisdom", // Flask of Distilled Wisdom
];

// Superior Wizard Oil's temporary weapon-enchant id — cross-confirmed live
// on the same druid's main-hand weapon across three independent reports
// (see docs/testing.md). Mana oils aren't recognized: their enchant ids
// couldn't be confirmed the same way.
export const SUPERIOR_WIZARD_OIL_ENCHANT_ID = 2678;

// WoW's fixed equipment-slot order places MainHand at index 15 (Head, Neck,
// Shoulder, Shirt, Chest, Waist, Legs, Feet, Wrist, Hands, Finger1, Finger2,
// Trinket1, Trinket2, Back, MainHand, OffHand, Ranged, Tabard) — WCL's gear
// array carries no explicit slot label, so this is positional.
export const MAIN_HAND_GEAR_INDEX = 15;

interface CombatantAura {
  name?: string;
}

interface CombatantGearEntry {
  temporaryEnchant?: number;
}

export interface FlaskOrElixirResult {
  hasFlask: boolean;
  hasBattleElixir: boolean;
  hasGuardianElixir: boolean;
  judgement: Judgement;
}

export interface PrepHygieneResult {
  flaskOrElixir: FlaskOrElixirResult;
  foodBuffPresent: boolean;
  weaponOilPresent: boolean;
  judgement: Judgement;
}

const JUDGEMENT_SEVERITY: Record<Judgement, number> = {
  green: 0,
  orange: 1,
  red: 2,
};

function worstOf(judgements: Judgement[]): Judgement {
  return judgements.reduce((worst, current) =>
    JUDGEMENT_SEVERITY[current] > JUDGEMENT_SEVERITY[worst] ? current : worst,
  );
}

function judgeFlaskOrElixir(
  hasFlask: boolean,
  hasBattleElixir: boolean,
  hasGuardianElixir: boolean,
): Judgement {
  if (hasFlask || (hasBattleElixir && hasGuardianElixir)) return "green";
  if (hasBattleElixir || hasGuardianElixir) return "orange";
  return "red";
}

export function computePrepHygiene(
  combatantInfoEvents: WclEvent[],
  druidId: number,
): PrepHygieneResult {
  const combatant = combatantInfoEvents.find(
    (event) => event.sourceID === druidId,
  );

  const auras = Array.isArray(combatant?.auras)
    ? (combatant?.auras as CombatantAura[])
    : [];
  const auraNames = new Set(auras.map((aura) => aura.name));

  const hasFlask = FLASK_NAMES.some((name) => auraNames.has(name));
  const hasBattleElixir = BATTLE_ELIXIR_NAMES.some((name) =>
    auraNames.has(name),
  );
  const hasGuardianElixir = GUARDIAN_ELIXIR_NAMES.some((name) =>
    auraNames.has(name),
  );
  const foodBuffPresent = auraNames.has("Well Fed");

  const gear = Array.isArray(combatant?.gear)
    ? (combatant?.gear as CombatantGearEntry[])
    : [];
  const mainHand = gear[MAIN_HAND_GEAR_INDEX];
  const weaponOilPresent =
    mainHand?.temporaryEnchant === SUPERIOR_WIZARD_OIL_ENCHANT_ID;

  const flaskOrElixirJudgement = judgeFlaskOrElixir(
    hasFlask,
    hasBattleElixir,
    hasGuardianElixir,
  );

  const judgement = worstOf([
    flaskOrElixirJudgement,
    foodBuffPresent ? "green" : "red",
    weaponOilPresent ? "green" : "red",
  ]);

  return {
    flaskOrElixir: {
      hasFlask,
      hasBattleElixir,
      hasGuardianElixir,
      judgement: flaskOrElixirJudgement,
    },
    foodBuffPresent,
    weaponOilPresent,
    judgement,
  };
}
