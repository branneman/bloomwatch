import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import {
  buildFightRows,
  formatDuration,
  groupFightsByZone,
} from "../../../report/fightRows";

export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectionChange: (fightIds: number[]) => void;
}

function isInitialFightTrash(
  fights: Fight[],
  initialFightId: number | null,
): boolean {
  if (initialFightId === null) return false;
  const fight = fights.find((f) => f.id === initialFightId);
  return fight !== undefined && fight.encounterID === 0;
}

export function FightPicker({
  fights,
  initialFightId,
  onSelectionChange,
}: FightPickerProps) {
  const [showTrash, setShowTrash] = useState(() =>
    isInitialFightTrash(fights, initialFightId),
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(initialFightId === null ? [] : [initialFightId]),
  );

  const rows = buildFightRows(fights).filter(
    (row) => !row.isTrash || showTrash,
  );
  const zones = groupFightsByZone(fights);

  function commitSelection(next: Set<number>) {
    setSelectedIds(next);
    onSelectionChange(fights.map((f) => f.id).filter((id) => next.has(id)));
  }

  function toggleFight(fightId: number) {
    const next = new Set(selectedIds);
    if (next.has(fightId)) {
      next.delete(fightId);
    } else {
      next.add(fightId);
    }
    commitSelection(next);
  }

  function selectZone(fightIds: number[]) {
    commitSelection(new Set(fightIds));
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={showTrash}
          onChange={(event) => setShowTrash(event.target.checked)}
        />
        Show trash fights
      </label>
      {zones.length > 0 && (
        <ul>
          {zones.map((zone) => (
            <li key={zone.zoneId}>
              <button type="button" onClick={() => selectZone(zone.fightIds)}>
                {zone.zoneName} ({zone.fightIds.length})
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul>
        {rows.map(({ fight, isTrash, pullNumber }) => {
          const label = isTrash
            ? fight.name
            : `Pull ${pullNumber} — ${fight.name}`;
          const status =
            fight.kill === true
              ? "Kill"
              : fight.kill === false
                ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
                : null;
          const duration = formatDuration(fight.endTime - fight.startTime);
          const text = [label, status, duration].filter(Boolean).join(" — ");

          return (
            <li key={fight.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.has(fight.id)}
                  onChange={() => toggleFight(fight.id)}
                />
                {text}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
