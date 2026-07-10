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
