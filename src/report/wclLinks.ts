import type { Host } from "./parseReportInput";

// Deep-links into a specific moment of a fight's timeline on the WCL web UI.
// start/end are report-relative milliseconds — the same convention used by
// event.timestamp and fight.startTime/endTime throughout this codebase.
export function buildFightTimeUrl(
  host: Host,
  reportCode: string,
  fightId: number,
  startMs: number,
  endMs: number,
): string {
  return `https://${host}.warcraftlogs.com/reports/${reportCode}#fight=${fightId}&type=summary&start=${startMs}&end=${endMs}`;
}
