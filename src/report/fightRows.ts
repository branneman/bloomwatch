import type { Fight } from "../wcl/client";

// Karazhan's Chess Event (WCL encounterID 660) — a scripted minigame where
// the player controls chess pieces rather than healing, not a real boss
// fight. It carries a real nonzero encounterID (so isTrash's plain "0 means
// trash" rule doesn't catch it) but every combat metric reads as a false
// 0%/red against it, so it's excluded the same way trash pulls already are.
const NON_BOSS_ENCOUNTER_IDS = new Set([660]);

export interface FightRow {
  fight: Fight;
  isTrash: boolean;
  pullNumber: number | null;
}

export function buildFightRows(fights: Fight[]): FightRow[] {
  const counts = new Map<number, number>();
  return fights.map((fight) => {
    const isTrash =
      fight.encounterID === 0 || NON_BOSS_ENCOUNTER_IDS.has(fight.encounterID);
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
