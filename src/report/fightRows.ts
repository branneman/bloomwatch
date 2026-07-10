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

export interface ZoneGroup {
  zoneId: number;
  zoneName: string;
  fightIds: number[];
}

export function groupFightsByZone(fights: Fight[]): ZoneGroup[] {
  const groups: ZoneGroup[] = [];
  const indexByZoneId = new Map<number, number>();

  for (const fight of fights) {
    if (fight.encounterID === 0 || fight.gameZone === null) continue;
    const { id: zoneId, name: zoneName } = fight.gameZone;
    const existingIndex = indexByZoneId.get(zoneId);
    if (existingIndex === undefined) {
      indexByZoneId.set(zoneId, groups.length);
      groups.push({ zoneId, zoneName, fightIds: [fight.id] });
    } else {
      groups[existingIndex].fightIds.push(fight.id);
    }
  }

  return groups;
}
