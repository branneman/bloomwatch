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
