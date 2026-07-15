export interface RateLimitUsage {
  limitPerHour: number;
  pointsSpentThisHour: number;
}

type Listener = (usage: RateLimitUsage) => void;

const listeners = new Set<Listener>();

export function subscribeRateLimitUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishRateLimitUsage(usage: RateLimitUsage): void {
  for (const listener of listeners) listener(usage);
}
