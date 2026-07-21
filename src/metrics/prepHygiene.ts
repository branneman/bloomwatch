import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { mixedJudgement } from "./judgement";

// Sourced from the restoration druid healer consumables guide (Wowhead/Icy
// Veins) plus live confirmation against real reports — a combatant-info
// aura's `name` is the buff's spell name, not always the item's flavor name
// (e.g. Elixir of Healing Power's aura is just "Healing Power"; Flask of
// Distilled Wisdom's is "Distilled Wisdom"). See docs/backlog.md story 601.
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

// ---------------------------------------------------------------------------
// Story 602 — enchant/gem coverage. Real ids below are sourced per
// docs/specs/602-enchant-gem-check-design.md's "ID compilation" method: two
// independent TBC Classic resto-druid prep guides, each candidate resolved
// to a numeric id via Wowhead's TBC-Classic vendor/enchant page, then
// cross-checked against a live `CombatantInfo` capture (report
// 4GYHZRdtL3bvhpc8, fight 6 — see docs/testing.md). A permanent-enchant id
// is a SpellItemEnchantment.dbc id, a *different* numbering space than
// Spell.dbc (Wowhead's ordinary spell= pages) — resolved via each enchant's
// vendor/formula "learn" spell page, whose Effect section discloses the
// real nested enchantment id.
// ---------------------------------------------------------------------------

export type EnchantableSlot =
  | "Head"
  | "Shoulder"
  | "Back"
  | "Chest"
  | "Wrist"
  | "Hands"
  | "Legs"
  | "Feet"
  | "MainHand";

export type GearTier = "bis" | "acceptable";

// WoW's fixed 19-slot equipment order — same convention MAIN_HAND_GEAR_INDEX
// already documents. Ring/Neck/Waist/Trinket/OffHand/Ranged/Tabard are never
// enchantable in TBC (or not relevant for a resto healer) and are excluded.
// See docs/backlog.md story 602.
export const ENCHANTABLE_SLOT_INDEXES: Record<EnchantableSlot, number> = {
  Head: 0,
  Shoulder: 2,
  Back: 14,
  Chest: 4,
  Wrist: 8,
  Hands: 9,
  Legs: 6,
  Feet: 7,
  MainHand: 15, // permanent enchant; distinct from the existing temporaryEnchant check above
};

// ---- Head ----
// Glyph of Renewal: +35 Healing, +12 Spell Damage, +7 MP5 — the one
// universal healer head enchant, live-confirmed identical across 5
// different healers (2 classes beyond Druid) in the cross-check capture.
// Sourced: Icy Veins + tbc.cavernoftime.com item page (both independently
// confirm the Thrallmar/Honor Hold Revered source), id cross-checked via
// Wowhead's vendor-spell page (tbc/spell=35445, Effect shows "(3001)").
export const GLYPH_OF_RENEWAL_ID = 3001; // bis
// No acceptable-tier head enchant found — no guide mentions a legitimate
// lesser alternative, and Head is a single reputation-vendor purchase with
// no Honored/Exalted split (unlike Shoulder/Legs below). A documented gap.

// ---- Shoulder ----
// Greater Inscription of Faith (Aldor, Exalted): +33 Healing, +11 Spell
// Damage, +4 MP5 — live-confirmed identical across all 5 sampled healers.
// Id cross-checked via Wowhead's vendor-spell page (tbc/spell=35404,
// Effect shows "(2980)").
export const GREATER_INSCRIPTION_OF_FAITH_ID = 2980; // bis
// Inscription of Faith (Aldor, Honored): +29 Healing, +10 Spell Damage —
// the exact "real-but-lesser" case that motivated this story's tiered
// design. Not observed live (all 5 sampled healers were already Exalted).
// Id cross-checked via Wowhead (tbc/spell=35403, "(2979)") and
// independently re-confirmed via tbc.cavernoftime.com/spell=35403.
export const INSCRIPTION_OF_FAITH_ID = 2979; // acceptable

// ---- Back / Cloak ----
// Enchant Cloak - Subtlety: threat reduction only, no stat bonus —
// live-confirmed on the druid in the capture. Sourced: guide fetch
// (offered as one of two legitimate choices) + wowsims/tbc's
// all_enchants.go (EffectID 2621, exact name match).
export const ENCHANT_CLOAK_SUBTLETY_ID = 2621; // bis
// Enchant Cloak - Greater Shadow Resistance: +15 Shadow Resistance — a
// real, guide-endorsed situational alternate (shadow-damage encounters).
// Not observed live. Sourced: guide fetch + wowsims (EffectID 1441) +
// Wowhead vendor-spell page (tbc/spell=34006, "(1441)").
export const ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID = 1441; // acceptable

// ---- Chest ----
// Enchant Chest - Major Spirit: +15 Spirit — live-confirmed on the druid
// in the capture. Sourced: Wowhead's healer enchant/gem guide summary
// ("top pick for the chest") + wowsims (EffectID 1144).
export const CHEST_MAJOR_SPIRIT_ID = 1144; // bis
// Enchant Chest - Exceptional Stats: +6 all stats — live-confirmed on 2 of
// the 5 sampled healers. Sourced: same guide aggregation (the alternative
// pick) + wowsims (EffectID 2661).
export const CHEST_EXCEPTIONAL_STATS_ID = 2661; // acceptable
// Enchant Chest - Restore Mana Prime: +6 MP5 — a third real option found
// via live data rather than any guide, chosen independently by 2 of the 5
// sampled healers. Sourced: wowsims (EffectID 3150) plus the live match —
// a real, repeated, intentional choice, not a one-off oddity.
export const CHEST_RESTORE_MANA_PRIME_ID = 3150; // acceptable

// ---- Wrist ----
// Enchant Bracer - Superior Healing: +30 Healing, +10 Spell Damage —
// live-confirmed identical across all 5 sampled healers. Sourced: guide
// fetch + Wowhead vendor-spell page (tbc/spell=27911, "(2617)").
export const ENCHANT_BRACER_SUPERIOR_HEALING_ID = 2617; // bis
// Enchant Bracer - Healing Power: +24 Healing, +8 Spell Damage — an older
// (pre-TBC) formula, a legitimate lesser choice for an un-upgraded bracer.
// Not observed live. Sourced: web search aggregation + Wowhead vendor-spell
// page (tbc/spell=23802, "(2566)").
export const ENCHANT_BRACER_HEALING_POWER_ID = 2566; // acceptable

// ---- Hands ----
// Enchant Gloves - Major Healing: +35 Healing, +12 Spell Damage —
// live-confirmed identical across all 5 sampled healers. Sourced: guide
// fetch + Wowhead vendor-spell page (tbc/spell=33999, "(2322)").
export const ENCHANT_GLOVES_MAJOR_HEALING_ID = 2322; // bis
// No acceptable-tier hands enchant included. A pre-TBC "Enchant Gloves -
// Healing Power" (spell 25079) was researched as the expected analogue to
// the Bracer pair above, but two independent fetches (Wowhead directly and
// tbc.cavernoftime.com) both resolved its nested id to 2617 — identical to
// the already-confirmed Wrist bis id, which can't be right (two distinct
// game objects can't share one id). Treated as an unreliable fetch result
// and excluded rather than trusted — a documented gap, not an oversight.

// ---- Legs ----
// Golden Spellthread (Aldor, Exalted): +66 Healing, +22 Spell Damage, +20
// Stamina — live-confirmed identical across all 5 sampled healers. Sourced:
// guide fetch + Wowhead vendor-spell page (tbc/spell=31370, "(2746)").
export const GOLDEN_SPELLTHREAD_ID = 2746; // bis
// Silver Spellthread (Aldor, Honored): +46 Healing, +16 Spell Damage, +15
// Stamina — the other half of the exact Honored/Exalted pattern this
// story's tiered design is built around. Not observed live (all 5 sampled
// healers were Exalted). Id cross-checked via Wowhead (tbc/spell=31369,
// "(2745)") and independently re-confirmed via tbc.cavernoftime.com.
export const SILVER_SPELLTHREAD_ID = 2745; // acceptable

// ---- Feet ----
// Enchant Boots - Boar's Speed: minor speed increase, +9 Stamina —
// live-confirmed on 4 of the 5 sampled healers. Sourced: guide fetch +
// wowsims (EffectID 2940) + Wowhead vendor-spell page (tbc/spell=34008,
// "(2940)").
export const ENCHANT_BOOTS_BOARS_SPEED_ID = 2940; // bis
// No acceptable-tier feet enchant included. The 5th sampled healer actually
// used a different id (911, "Enchant Boots - Minor Speed", an
// older/cheaper pure-movement enchant with no stat) — a real live data
// point, but not mentioned by any of the guides fetched as a recognized
// healer choice, so per this story's bar it's deliberately left
// unclassified rather than promoted to "acceptable" on live-presence alone.

// ---- MainHand (permanent enchant — distinct from the existing temporary weapon-oil check) ----
// Enchant Weapon - Major Healing: +81 Healing, +27 Spell Damage —
// live-confirmed on 4 of the 5 sampled healers (the 5th wields a wand, not
// a meleeable weapon). Sourced: guide fetch + Wowhead vendor-spell page
// (tbc/spell=34010, "(2343)").
export const ENCHANT_WEAPON_MAJOR_HEALING_ID = 2343; // bis
// Enchant Weapon - Healing Power: +55 Healing, +19 Spell Damage — an older
// (Molten Core-era) legitimate lesser choice. Not observed live. Sourced:
// web search aggregation + Wowhead vendor-spell page (tbc/spell=22750,
// "(2505)"), independently re-confirmed via tbc.cavernoftime.com.
export const ENCHANT_WEAPON_HEALING_POWER_ID = 2505; // acceptable

// ---- Colored gem ----
// Teardrop Living Ruby (red): +18 Healing, +6 Spell Damage — by far the
// most heavily used gem in the full 25-combatant cross-check capture
// (nearly every socket, regardless of socket color). Sourced: a gem-stat
// table (tbc-bis-guide.com) + Wowhead item page (tbc/item=24029). Note:
// Icy Veins's auto-summarized fetch called this gem "Teardrop Crimson
// Spinel" — a corroborated error, caught because live data and the Wowhead
// item page both independently confirm the real name.
export const TEARDROP_LIVING_RUBY_ID = 24029; // bis
// No acceptable-tier colored gem included. "Purified Shadowsong Amethyst"
// (a hybrid Healing+Spirit gem sometimes used to satisfy a meta gem's blue
// requirement) was considered, but its item id couldn't be confidently
// resolved (search results gave a self-contradictory, wrong-expansion
// answer). Not observed live either. Left out rather than risk a wrong id.

// ---- Meta gem ----
// Both of these are "bis" (not one bis + one acceptable) per this story's
// own design guidance: an Insightful vs. Bracing Earthstorm Diamond may
// both be legitimate depending on mana-vs-throughput preference — recorded
// faithfully rather than forcing an artificial single winner.
// Bracing Earthstorm Diamond: +26 Healing, +9 Spell Damage, 2% reduced
// threat — live-confirmed on 2 of the 5 sampled healers. Sourced: 3
// independent guide fetches + Wowhead item page (tbc/item=25897).
export const BRACING_EARTHSTORM_DIAMOND_ID = 25897; // bis
// Insightful Earthstorm Diamond: +12 Intellect, chance to restore mana on
// spellcast — live-confirmed on 3 of the 5 sampled healers. Sourced: same
// 3 guide fetches + Wowhead item page (tbc/item=25901).
export const INSIGHTFUL_EARTHSTORM_DIAMOND_ID = 25901; // bis

// Tier tables built from the named constants above. Only ids confirmed via
// at least one guide and either a Wowhead item/enchant page or a live
// CombatantInfo capture appear here — see docs/specs/602-enchant-gem-check-design.md
// "ID compilation" for the sourcing method.
const SLOT_ENCHANT_IDS: Record<
  EnchantableSlot,
  Partial<Record<number, GearTier>>
> = {
  Head: { [GLYPH_OF_RENEWAL_ID]: "bis" },
  Shoulder: {
    [GREATER_INSCRIPTION_OF_FAITH_ID]: "bis",
    [INSCRIPTION_OF_FAITH_ID]: "acceptable",
  },
  Back: {
    [ENCHANT_CLOAK_SUBTLETY_ID]: "bis",
    [ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID]: "acceptable",
  },
  Chest: {
    [CHEST_MAJOR_SPIRIT_ID]: "bis",
    [CHEST_EXCEPTIONAL_STATS_ID]: "acceptable",
    [CHEST_RESTORE_MANA_PRIME_ID]: "acceptable",
  },
  Wrist: {
    [ENCHANT_BRACER_SUPERIOR_HEALING_ID]: "bis",
    [ENCHANT_BRACER_HEALING_POWER_ID]: "acceptable",
  },
  Hands: { [ENCHANT_GLOVES_MAJOR_HEALING_ID]: "bis" },
  Legs: {
    [GOLDEN_SPELLTHREAD_ID]: "bis",
    [SILVER_SPELLTHREAD_ID]: "acceptable",
  },
  Feet: { [ENCHANT_BOOTS_BOARS_SPEED_ID]: "bis" },
  MainHand: {
    [ENCHANT_WEAPON_MAJOR_HEALING_ID]: "bis",
    [ENCHANT_WEAPON_HEALING_POWER_ID]: "acceptable",
  },
};

const COLOR_GEM_IDS: Partial<Record<number, GearTier>> = {
  [TEARDROP_LIVING_RUBY_ID]: "bis",
};

const META_GEM_IDS: Partial<Record<number, GearTier>> = {
  [BRACING_EARTHSTORM_DIAMOND_ID]: "bis",
  [INSIGHTFUL_EARTHSTORM_DIAMOND_ID]: "bis",
};

interface CombatantAura {
  name?: string;
}

interface CombatantGearEntry {
  temporaryEnchant?: number;
  permanentEnchant?: number;
  gems?: { id: number }[];
}

export interface FlaskOrElixirResult {
  hasFlask: boolean;
  hasBattleElixir: boolean;
  hasGuardianElixir: boolean;
  judgement: Judgement;
}

export interface EnchantCoverageResult {
  missingSlots: EnchantableSlot[]; // slots with no recognized (bis or acceptable) enchant
  acceptableSlots: EnchantableSlot[]; // slots on the acceptable tier — informational only, doesn't affect judgement
  judgement: Judgement;
}

export interface GemCoverageResult {
  missingOrWrongCount: number; // unrecognized colored gems + (1 if meta not recognized, else 0)
  acceptableCount: number; // gems present on the acceptable tier — informational only
  metaGemRecognized: boolean; // false covers both "wrong/unrecognized meta" and "no gem in Head's meta slot"
  metaGemTier: GearTier | null; // null when metaGemRecognized is false
  judgement: Judgement;
}

export interface PrepHygieneResult {
  flaskOrElixir: FlaskOrElixirResult;
  foodBuffPresent: boolean;
  weaponOilPresent: boolean;
  enchantCoverage: EnchantCoverageResult;
  gemCoverage: GemCoverageResult;
  judgement: Judgement;
}

function judgeFlaskOrElixir(
  hasFlask: boolean,
  hasBattleElixir: boolean,
  hasGuardianElixir: boolean,
): Judgement {
  if (hasFlask || (hasBattleElixir && hasGuardianElixir)) return "good";
  if (hasBattleElixir || hasGuardianElixir) return "fair";
  return "bad";
}

// Deliberately wide — the tiered bis/acceptable model already absorbs every
// legitimate lesser choice, so only real gaps count here. See
// docs/backlog.md story 602 and docs/specs/602-enchant-gem-check-design.md
// judgement call 3. Provisional pending a future calibration pass (no
// exemplar data exists yet for this metric).
function judgeEnchantCoverage(missingCount: number): Judgement {
  if (missingCount === 0) return "good";
  if (missingCount <= 3) return "fair";
  return "bad";
}

// Same rationale as judgeEnchantCoverage, narrower in absolute terms only
// because a geared druid has fewer typical gem sockets than judged enchant
// slots. See docs/specs/602-enchant-gem-check-design.md judgement call 4.
function judgeGemCoverage(missingOrWrongCount: number): Judgement {
  if (missingOrWrongCount === 0) return "good";
  if (missingOrWrongCount <= 2) return "fair";
  return "bad";
}

export function computeEnchantCoverage(
  gear: CombatantGearEntry[],
): EnchantCoverageResult {
  const missingSlots: EnchantableSlot[] = [];
  const acceptableSlots: EnchantableSlot[] = [];

  for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES) as [
    EnchantableSlot,
    number,
  ][]) {
    const enchantId = gear[index]?.permanentEnchant;
    const tier =
      enchantId !== undefined ? SLOT_ENCHANT_IDS[slot]?.[enchantId] : undefined;
    if (tier === undefined) missingSlots.push(slot);
    else if (tier === "acceptable") acceptableSlots.push(slot);
  }

  return {
    missingSlots,
    acceptableSlots,
    judgement: judgeEnchantCoverage(missingSlots.length),
  };
}

export function computeGemCoverage(
  gear: CombatantGearEntry[],
): GemCoverageResult {
  let wrongColorGemCount = 0;
  let acceptableCount = 0;

  for (const entry of gear) {
    for (const gem of entry.gems ?? []) {
      // A recognized meta gem is judged separately below (it's checked
      // against META_GEM_IDS, not COLOR_GEM_IDS) — skip it here so it isn't
      // also counted as an unrecognized color gem in the same slot.
      if (META_GEM_IDS[gem.id] !== undefined) continue;
      const tier = COLOR_GEM_IDS[gem.id];
      if (tier === undefined) wrongColorGemCount++;
      else if (tier === "acceptable") acceptableCount++;
    }
  }

  const headGems = gear[ENCHANTABLE_SLOT_INDEXES.Head]?.gems ?? [];
  let metaGemTier: GearTier | null = null;
  for (const gem of headGems) {
    const tier = META_GEM_IDS[gem.id];
    if (tier !== undefined) {
      metaGemTier = tier;
      if (tier === "acceptable") acceptableCount++;
      break;
    }
  }
  const metaGemRecognized = metaGemTier !== null;

  const missingOrWrongCount = wrongColorGemCount + (metaGemRecognized ? 0 : 1);

  return {
    missingOrWrongCount,
    acceptableCount,
    metaGemRecognized,
    metaGemTier,
    judgement: judgeGemCoverage(missingOrWrongCount),
  };
}

export function computePrepHygiene(
  combatantInfoEvents: WclEvent[],
  druidId: number,
): PrepHygieneResult {
  const combatant = combatantInfoEvents.find(
    (event) => event.sourceID === druidId,
  );

  const combatantAuras = combatant?.auras;
  const auras = Array.isArray(combatantAuras)
    ? (combatantAuras as CombatantAura[])
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

  const combatantGear = combatant?.gear;
  const gear = Array.isArray(combatantGear)
    ? (combatantGear as CombatantGearEntry[])
    : [];
  const mainHand = gear[MAIN_HAND_GEAR_INDEX];
  const weaponOilPresent =
    mainHand?.temporaryEnchant === SUPERIOR_WIZARD_OIL_ENCHANT_ID;

  const flaskOrElixirJudgement = judgeFlaskOrElixir(
    hasFlask,
    hasBattleElixir,
    hasGuardianElixir,
  );

  const enchantCoverage = computeEnchantCoverage(gear);
  const gemCoverage = computeGemCoverage(gear);

  const judgement = mixedJudgement([
    flaskOrElixirJudgement,
    foodBuffPresent ? "good" : "bad",
    weaponOilPresent ? "good" : "bad",
    enchantCoverage.judgement,
    gemCoverage.judgement,
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
    enchantCoverage,
    gemCoverage,
    judgement,
  };
}
