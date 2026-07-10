import { useEffect } from "react";
import type { DruidCandidate } from "../../../report/druidDetection";

export interface DruidPickerProps {
  candidates: DruidCandidate[];
  onSelect: (druidId: number) => void;
}

export function DruidPicker({ candidates, onSelect }: DruidPickerProps) {
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
    <ul>
      {candidates.map((candidate) => {
        const label = candidate.isRestoSpec
          ? `${candidate.name} — Restoration (${candidate.healingCastCount} heal casts)`
          : `${candidate.name} (${candidate.healingCastCount} heal casts)`;
        return (
          <li key={candidate.id}>
            <label>
              <input
                type="radio"
                name="druid"
                onChange={() => onSelect(candidate.id)}
              />
              {label}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
