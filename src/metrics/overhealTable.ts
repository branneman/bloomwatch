import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow, worstJudgement } from "./judgement";
import type { ResolvedAbility } from "../abilities/resolveAbilities";
import type { TalentBucket } from "../report/archetypeDetection";

export type OverhealCategory = "hot-tick" | "bloom" | "direct";

export interface OverhealRow {
  category: OverhealCategory;
  spell: string;
  amount: number;
  overheal: number;
  overhealPct: number;
  judgement: Judgement | null;
}

export interface OverhealTableResult {
  rows: OverhealRow[];
  judgement: Judgement;
}

// Bloom overheal per docs/backlog.md story 905 (recalibrated from story 404's original
// 40/70 against real exemplar data -- see docs/thresholds.md): green < 80%, orange
// 80-90%, red > 90%. Archetype-invariant: deep-resto and dreamstate exemplars showed
// nearly identical Bloom overheal distributions, so this threshold isn't split by
// bucket, unlike Regrowth-direct below.
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 80, orangeMax: 90 });
}

// Direct heal overheal for Healing Touch and Swiftmend, per docs/backlog.md story 404:
// green < 30%, orange 30-50%, red > 50%. Story 905's exemplar review found both spells
// already fit this threshold well in every archetype bucket, so it's unchanged.
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 });
}

// Regrowth-direct overheal per docs/backlog.md story 905 (split from the shared
// "direct" threshold above because real exemplar data showed a genuine archetype
// divergence -- see docs/thresholds.md): deep-resto green < 38%, orange 38-60%, red
// > 60%; dreamstate (full or partial) green < 60%, orange 60-85%, red > 85%. Every
// other bucket (mostly-resto, mostly-balance, restokin-shaped, other-unclassified,
// unknown-no-talent-data) falls back to deep-resto's band -- those builds aren't
// well-supported by this tool yet (story 903d), so this story doesn't manufacture a
// new precision claim about them.
function judgeRegrowthDirectOverheal(
  overhealPct: number,
  bucket: TalentBucket,
): Judgement {
  if (
    bucket === "likely-dreamstate-full" ||
    bucket === "likely-dreamstate-partial"
  ) {
    return judgeThresholdBelow(overhealPct, { greenMax: 60, orangeMax: 85 });
  }
  return judgeThresholdBelow(overhealPct, { greenMax: 38, orangeMax: 60 });
}

// Fixed row identity: which category a spell/portion belongs to, its display label, and
// (for Bloom/Direct) its judging function. HoT-tick rows have no judging function -- they're
// informational only, since high overheal is inherent to a HoT ticking on already-topped
// targets. Order here is also the table's fixed row order (HoT tick, then Bloom, then Direct),
// matching docs/design_v2/source/epic-e.jsx's reference layout.
interface RowSpec {
  category: OverhealCategory;
  spell: string;
  judge: ((overhealPct: number, bucket: TalentBucket) => Judgement) | null;
}

const REJUVENATION_TICK: RowSpec = {
  category: "hot-tick",
  spell: "Rejuvenation",
  judge: null,
};
const REGROWTH_TICK: RowSpec = {
  category: "hot-tick",
  spell: "Regrowth (HoT portion)",
  judge: null,
};
const LIFEBLOOM_BLOOM: RowSpec = {
  category: "bloom",
  spell: "Lifebloom",
  judge: judgeBloomOverheal,
};
const REGROWTH_DIRECT: RowSpec = {
  category: "direct",
  spell: "Regrowth (direct)",
  judge: judgeRegrowthDirectOverheal,
};
const HEALING_TOUCH: RowSpec = {
  category: "direct",
  spell: "Healing Touch",
  judge: judgeDirectOverheal,
};
const SWIFTMEND: RowSpec = {
  category: "direct",
  spell: "Swiftmend",
  judge: judgeDirectOverheal,
};

const ROW_ORDER: RowSpec[] = [
  REJUVENATION_TICK,
  REGROWTH_TICK,
  LIFEBLOOM_BLOOM,
  REGROWTH_DIRECT,
  HEALING_TOUCH,
  SWIFTMEND,
];

// Classifies one heal event into its RowSpec, or null if it's out of scope for this table
// (Nature's Swiftness/Innervate/Tranquility heals, or a Lifebloom periodic tick -- which isn't
// reported as its own row per the design reference).
function classify(
  spell: ResolvedAbility & { kind: "spell" },
  tick: boolean,
): RowSpec | null {
  switch (spell.spell) {
    case "Rejuvenation":
      // Rejuvenation is a pure HoT -- in practice every one of its heal events carries
      // tick: true, but filter explicitly rather than assuming, for consistency with
      // every other spell's classification below.
      return tick ? REJUVENATION_TICK : null;
    case "Regrowth":
      return tick ? REGROWTH_TICK : REGROWTH_DIRECT;
    case "Lifebloom":
      return tick ? null : LIFEBLOOM_BLOOM;
    case "Healing Touch":
      return HEALING_TOUCH;
    case "Swiftmend":
      return SWIFTMEND;
    default:
      return null;
  }
}

interface Accumulator {
  amount: number;
  overheal: number;
}

export function computeOverhealTable(
  healingEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  archetypeBucket: TalentBucket = "deep-resto",
): OverhealTableResult {
  const totals = new Map<RowSpec, Accumulator>();

  for (const event of healingEvents) {
    if (event.type !== "heal") continue;
    if (event.sourceID !== druidId) continue;
    if (event.targetID === undefined) continue;
    if (event.abilityGameID === undefined) continue;

    const resolved = resolvedAbilities.get(event.abilityGameID);
    if (resolved === undefined || resolved.kind !== "spell") continue;

    const rowSpec = classify(resolved, event.tick === true);
    if (rowSpec === null) continue;

    const existing = totals.get(rowSpec) ?? { amount: 0, overheal: 0 };
    existing.amount += typeof event.amount === "number" ? event.amount : 0;
    existing.overheal +=
      typeof event.overheal === "number" ? event.overheal : 0;
    totals.set(rowSpec, existing);
  }

  const rows: OverhealRow[] = [];
  for (const rowSpec of ROW_ORDER) {
    const totalsForRow = totals.get(rowSpec);
    if (totalsForRow === undefined) continue;

    const total = totalsForRow.amount + totalsForRow.overheal;
    const overhealPct =
      total === 0 ? 0 : Math.round((totalsForRow.overheal / total) * 100);

    rows.push({
      category: rowSpec.category,
      spell: rowSpec.spell,
      amount: totalsForRow.amount,
      overheal: totalsForRow.overheal,
      overhealPct,
      judgement:
        rowSpec.judge === null
          ? null
          : rowSpec.judge(overhealPct, archetypeBucket),
    });
  }

  return {
    rows,
    judgement: worstJudgement(rows.map((row) => row.judgement)),
  };
}
