import type { Fight } from "../wcl/client";

// Karazhan's Chess Event (WCL encounterID 660) — a scripted minigame where
// the player controls chess pieces rather than healing, not a real boss
// fight. It carries a real nonzero encounterID (so isTrash's plain "0 means
// trash" rule doesn't catch it) but every combat metric reads as a false
// 0%/bad against it, so it's excluded the same way trash pulls already are.
const NON_BOSS_ENCOUNTER_IDS = new Set([660]);

// TBC's fixed, never-growing set of 9 raid instances (story 013). A fight
// whose gameZone.name isn't in this list is a 5-man dungeon, an open-world
// zone, or another expansion's raid bundled into the same report — none of
// them real TBC raid-boss encounters, even if they carry a real nonzero
// encounterID (e.g. WCL's synthetic per-zone "untracked combat time" bucket
// ids, or a genuine vanilla boss kill). Names live-confirmed via `wcl:query`
// against real reports (see docs/backlog.md story 013 and docs/testing.md's
// `y3kamxfc9N7H2Yb4` entry) — note "Hyjal Summit" and "The Eye", not the
// "Mount Hyjal"/"Tempest Keep" names commonly used in casual conversation.
const TBC_RAID_ZONE_NAMES = new Set([
  "Karazhan",
  "Gruul's Lair",
  "Magtheridon's Lair",
  "Serpentshrine Cavern",
  "The Eye",
  "Hyjal Summit",
  "Black Temple",
  "Sunwell Plateau",
  "Zul'Aman",
]);

export interface FightRow {
  fight: Fight;
  isTrash: boolean;
  pullNumber: number | null;
}

export function buildFightRows(fights: Fight[]): FightRow[] {
  const counts = new Map<number, number>();
  return fights.map((fight) => {
    const isTrash =
      fight.encounterID === 0 ||
      NON_BOSS_ENCOUNTER_IDS.has(fight.encounterID) ||
      !TBC_RAID_ZONE_NAMES.has(fight.gameZone?.name ?? "");
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

export function formatFightLabel(
  fight: Fight,
  pullNumber: number | null,
): string {
  return pullNumber === null
    ? fight.name
    : `Pull ${pullNumber} · ${fight.name}`;
}
