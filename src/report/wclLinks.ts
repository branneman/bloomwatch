// Deep-links into a specific moment of a fight's timeline on the WCL web UI.
// start/end are report-relative milliseconds — the same convention used by
// event.timestamp and fight.startTime/endTime throughout this codebase.
export function buildFightTimeUrl(
  reportCode: string,
  fightId: number,
  startMs: number,
  endMs: number,
): string {
  return `https://fresh.warcraftlogs.com/reports/${reportCode}#fight=${fightId}&type=summary&start=${startMs}&end=${endMs}`;
}
