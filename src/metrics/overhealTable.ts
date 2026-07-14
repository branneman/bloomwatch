import type { WclEvent } from "../wcl/events";
import type { Judgement } from "./judgement";
import { judgeThresholdBelow, worstJudgement } from "./judgement";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

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

// Bloom overheal per docs/backlog.md story 404: green < 40%, orange 40-70%, red > 70%.
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 40, orangeMax: 70 });
}

// Direct heal overheal per docs/backlog.md story 404: green < 30%, orange 30-50%, red > 50%.
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 });
}

// Fixed row identity: which category a spell/portion belongs to, its display label, and
// (for Bloom/Direct) its judging function. HoT-tick rows have no judging function -- they're
// informational only, since high overheal is inherent to a HoT ticking on already-topped
// targets. Order here is also the table's fixed row order (HoT tick, then Bloom, then Direct),
// matching docs/design_v2/source/epic-e.jsx's reference layout.
interface RowSpec {
  category: OverhealCategory;
  spell: string;
  judge: ((overhealPct: number) => Judgement) | null;
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
  judge: judgeDirectOverheal,
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
      judgement: rowSpec.judge === null ? null : rowSpec.judge(overhealPct),
    });
  }

  return {
    rows,
    judgement: worstJudgement(rows.map((row) => row.judgement)),
  };
}
