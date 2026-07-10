import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import { buildFightRows, formatDuration } from "../../../report/fightRows";

export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectFight: (fightId: number) => void;
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
  onSelectFight,
}: FightPickerProps) {
  const [showTrash, setShowTrash] = useState(() =>
    isInitialFightTrash(fights, initialFightId),
  );
  const [selectedFightId, setSelectedFightId] = useState<number | null>(
    initialFightId,
  );

  const rows = buildFightRows(fights).filter(
    (row) => !row.isTrash || showTrash,
  );

  function handleSelect(fightId: number) {
    setSelectedFightId(fightId);
    onSelectFight(fightId);
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
              <button
                type="button"
                aria-current={fight.id === selectedFightId}
                onClick={() => handleSelect(fight.id)}
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
