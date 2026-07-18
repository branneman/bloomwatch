export type Judgement = "green" | "orange" | "red";

// Higher value is better (e.g. GCD utilization %, LB3 uptime %).
export function judgeThreshold(
  value: number,
  thresholds: { greenMin: number; orangeMin: number },
): Judgement {
  if (value >= thresholds.greenMin) return "green";
  if (value >= thresholds.orangeMin) return "orange";
  return "red";
}

// Lower value is better (e.g. idle dead-time %, overheal %).
export function judgeThresholdBelow(
  value: number,
  thresholds: { greenMax: number; orangeMax: number },
): Judgement {
  if (value < thresholds.greenMax) return "green";
  if (value <= thresholds.orangeMax) return "orange";
  return "red";
}

const JUDGEMENT_RANK: Record<Judgement, number> = {
  red: 2,
  orange: 1,
  green: 0,
};

export function worstJudgement(judgements: (Judgement | null)[]): Judgement {
  const present = judgements.filter((j): j is Judgement => j !== null);
  return present.reduce(
    (worst, current) =>
      JUDGEMENT_RANK[current] > JUDGEMENT_RANK[worst] ? current : worst,
    "green" as Judgement,
  );
}

// Duration-weighted median across a report's fights for one epic — story
// 904. Walks from the worst bucket down using >= comparisons, which is
// what encodes "round toward red on an exact 50% tie": the median is
// already the mechanism pulling the rollup toward leniency, so ties
// shouldn't add more of that. See docs/thresholds.md's compounding-factors
// section for the full rationale (also formerly docs/specs/
// rollup-policy-design.md, retired once this shipped).
export function weightedMedianJudgement(
  entries: { judgement: Judgement; weightMs: number }[],
): Judgement | null {
  const total = entries.reduce((acc, e) => acc + e.weightMs, 0);
  if (total === 0) return null;
  const half = total / 2;
  const redWeight = entries
    .filter((e) => e.judgement === "red")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (redWeight >= half) return "red";
  const orangeWeight = entries
    .filter((e) => e.judgement === "orange")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (redWeight + orangeWeight >= half) return "orange";
  return "green";
}

// How many fights landed in each judgement bucket — a fight-count (not
// duration-weighted) companion to weightedMedianJudgement above, so a
// rollup headline can still show what drove it (story 904's diagnostic-
// value requirement) without the raw worst-of dominating the headline
// itself.
export function judgementBreakdown(
  entries: { judgement: Judgement }[],
): Record<Judgement, number> {
  return {
    green: entries.filter((e) => e.judgement === "green").length,
    orange: entries.filter((e) => e.judgement === "orange").length,
    red: entries.filter((e) => e.judgement === "red").length,
  };
}
