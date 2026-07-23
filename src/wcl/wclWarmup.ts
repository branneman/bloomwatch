// Tracks how many in-flight WCL requests are currently retrying because the
// backend's analysis cache isn't warm yet for a report (see client.ts's
// isBackendWarmupError) -- a ref count, not a boolean, since multiple
// concurrent queries (e.g. ReportDashboard's per-fight fetches) can each hit
// this independently; the "waiting on WCL" banner should stay up as long as
// at least one is still retrying.
type Listener = (activeCount: number) => void;

const listeners = new Set<Listener>();
let activeCount = 0;

function publish(): void {
  for (const listener of listeners) listener(activeCount);
}

export function subscribeWclWarmup(listener: Listener): () => void {
  listeners.add(listener);
  listener(activeCount);
  return () => listeners.delete(listener);
}

export function beginWclWarmupRetry(): void {
  activeCount += 1;
  publish();
}

export function endWclWarmupRetry(): void {
  activeCount = Math.max(0, activeCount - 1);
  publish();
}
