export type Judgement = "good" | "fair" | "bad";

// Higher value is better (e.g. GCD utilization %, LB3 uptime %).
export function judgeThreshold(
  value: number,
  thresholds: { goodMin: number; fairMin: number },
): Judgement {
  if (value >= thresholds.goodMin) return "good";
  if (value >= thresholds.fairMin) return "fair";
  return "bad";
}

// Lower value is better (e.g. idle dead-time %, overheal %).
export function judgeThresholdBelow(
  value: number,
  thresholds: { goodMax: number; fairMax: number },
): Judgement {
  if (value < thresholds.goodMax) return "good";
  if (value <= thresholds.fairMax) return "fair";
  return "bad";
}

const JUDGEMENT_RANK: Record<Judgement, number> = {
  bad: 2,
  fair: 1,
  good: 0,
};

export function worstJudgement(judgements: (Judgement | null)[]): Judgement {
  const present = judgements.filter((j): j is Judgement => j !== null);
  return present.reduce(
    (worst, current) =>
      JUDGEMENT_RANK[current] > JUDGEMENT_RANK[worst] ? current : worst,
    "good" as Judgement,
  );
}

// Duration-weighted median across a report's fights for one epic — story
// 904. Walks from the worst bucket down using >= comparisons, which is
// what encodes "round toward bad on an exact 50% tie": the median is
// already the mechanism pulling the rollup toward leniency, so ties
// shouldn't add more of that. See docs/thresholds.md's compounding-factors
// section for the full rationale (also formerly docs/specs/
// rollup-policy-design.md, retired once this shipped).
//
// Revised 2026-07-19: a mix of both good and bad fights (e.g. 1 good, 2
// fair, 8 bad) still read as a flat "bad" under the median above, which
// buries the fact that at least one fight actually went well — requested
// directly as still too harsh. When an epic has at least one good fight
// and at least one bad fight, the mixed result is reported as "fair"
// outright, ahead of the median calculation below. See docs/thresholds.md's
// compounding-factors section.
export function weightedMedianJudgement(
  entries: { judgement: Judgement; weightMs: number }[],
): Judgement | null {
  const total = entries.reduce((acc, e) => acc + e.weightMs, 0);
  if (total === 0) return null;
  const hasGood = entries.some((e) => e.judgement === "good");
  const hasBad = entries.some((e) => e.judgement === "bad");
  if (hasGood && hasBad) return "fair";
  const half = total / 2;
  const badWeight = entries
    .filter((e) => e.judgement === "bad")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (badWeight >= half) return "bad";
  const fairWeight = entries
    .filter((e) => e.judgement === "fair")
    .reduce((acc, e) => acc + e.weightMs, 0);
  if (badWeight + fairWeight >= half) return "fair";
  return "good";
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
    good: entries.filter((e) => e.judgement === "good").length,
    fair: entries.filter((e) => e.judgement === "fair").length,
    bad: entries.filter((e) => e.judgement === "bad").length,
  };
}

// Same mixed-good-bad-reads-fair shortcut as weightedMedianJudgement
// (story 904), applied to sibling metrics within one fight's epic verdict
// rather than several fights within a report's rollup — but falling back
// to strict worst-of otherwise, not a majority-by-count median. A full
// weighted-median fallback was considered and rejected: with only a
// handful of equal-weight sibling metrics, majority-by-count would also
// flip fair-only mixes with no bad present (e.g. 2 good + 1 fair) from
// "fair" to "good", a behavior change beyond the one actually requested.
export function mixedJudgement(judgements: (Judgement | null)[]): Judgement {
  const present = judgements.filter((j): j is Judgement => j !== null);
  if (present.includes("good") && present.includes("bad")) return "fair";
  return worstJudgement(judgements);
}
