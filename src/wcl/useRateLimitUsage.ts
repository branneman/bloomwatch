import { useEffect, useState } from "react";
import { subscribeRateLimitUsage, type RateLimitUsage } from "./rateLimitUsage";

export function useRateLimitUsageData(): RateLimitUsage | null {
  const [usage, setUsage] = useState<RateLimitUsage | null>(null);

  useEffect(() => subscribeRateLimitUsage(setUsage), []);

  return usage;
}

export function useRateLimitUsage(): number | null {
  const usage = useRateLimitUsageData();

  if (usage === null) return null;
  return (usage.pointsSpentThisHour / usage.limitPerHour) * 100;
}
