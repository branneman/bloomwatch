import type { Fight } from "../wcl/client";

export interface FightRow {
  fight: Fight;
  isTrash: boolean;
  pullNumber: number | null;
}

export function buildFightRows(fights: Fight[]): FightRow[] {
  const counts = new Map<number, number>();
  return fights.map((fight) => {
    const isTrash = fight.encounterID === 0;
    if (isTrash) {
      return { fight, isTrash, pullNumber: null };
    }
    const next = (counts.get(fight.encounterID) ?? 0) + 1;
    counts.set(fight.encounterID, next);
    return { fight, isTrash, pullNumber: next };
  });
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
