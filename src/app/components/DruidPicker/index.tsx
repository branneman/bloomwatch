import { useEffect } from "react";
import type { DruidCandidate } from "../../../report/druidDetection";
import styles from "./index.module.css";

export interface DruidPickerProps {
  candidates: DruidCandidate[];
  selectedDruidId: number | null;
  onSelect: (druidId: number) => void;
}

export function DruidPicker({
  candidates,
  selectedDruidId,
  onSelect,
}: DruidPickerProps) {
  const soleCandidateId = candidates.length === 1 ? candidates[0].id : null;

  useEffect(() => {
    if (soleCandidateId !== null) onSelect(soleCandidateId);
  }, [soleCandidateId, onSelect]);

  if (candidates.length === 0) {
    return <p>No resto druids detected in this report.</p>;
  }

  if (candidates.length === 1) {
    return null;
  }

  return (
    <div className={styles.row}>
      {candidates.map((candidate) => {
        const active = candidate.id === selectedDruidId;
        const label = candidate.isRestoSpec
          ? `${candidate.name} — Restoration (${candidate.healingCastCount} heals)`
          : `${candidate.name} (${candidate.healingCastCount} heal casts)`;
        return (
          <label
            key={candidate.id}
            className={`${styles.chip} ${active ? styles.active : ""}`}
          >
            <input
              type="radio"
              name="druid"
              checked={active}
              onChange={() => onSelect(candidate.id)}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
