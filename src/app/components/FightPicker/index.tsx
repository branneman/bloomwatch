import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import {
  buildFightRows,
  formatDuration,
  groupFightsByZone,
} from "../../../report/fightRows";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import styles from "./index.module.css";

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
      <Checkbox
        checked={showTrash}
        onChange={(event) => setShowTrash(event.target.checked)}
        label="Show trash fights"
      />
      {zones.length > 0 && (
        <div className={styles.zoneRow}>
          {zones.map((zone) => (
            <Button
              key={zone.zoneId}
              variant="secondary"
              size="sm"
              onClick={() => selectZone(zone.fightIds)}
            >
              {zone.zoneName} ({zone.fightIds.length})
            </Button>
          ))}
        </div>
      )}
      <div className={styles.rows}>
        {rows.map(({ fight, isTrash, pullNumber }) => {
          const label = isTrash
            ? fight.name
            : `Pull ${pullNumber} — ${fight.name}`;
          const duration = formatDuration(fight.endTime - fight.startTime);
          const status =
            fight.kill === true
              ? "Kill"
              : fight.kill === false
                ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
                : null;
          // aria-label preserves the pre-retrofit accessible name exactly
          // (label — status — duration), independent of how the visible
          // Badge/duration chips are laid out, so existing accessible-name
          // assertions keep passing unchanged.
          const accessibleName = [label, status, duration]
            .filter(Boolean)
            .join(" — ");

          return (
            <label key={fight.id} className={styles.row}>
              <input
                type="checkbox"
                checked={selectedIds.has(fight.id)}
                onChange={() => toggleFight(fight.id)}
                aria-label={accessibleName}
              />
              <span className={styles.label}>{label}</span>
              {fight.kill === true ? (
                <Badge tone="kill">Kill</Badge>
              ) : fight.kill === false ? (
                <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
              ) : null}
              <span className={styles.duration}>{duration}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
