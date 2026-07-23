import type { ReactNode } from "react";
import type { Judgement } from "../../../../metrics/judgement";
import { JudgementChip } from "../JudgementChip";
import styles from "./index.module.css";

export interface CrisisCardProps {
  target: string;
  time: ReactNode;
  hitPointsPct: number;
  maintained: boolean;
  judged: boolean;
  responded: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  hasSwiftmend: boolean;
  hasNaturesSwiftness: boolean;
  judgement: Judgement | null;
  clearSave: boolean;
  saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null;
  prepped: boolean;
}

const CLEAR_SAVE_LABELS: Record<
  "natures-swiftness-combo" | "swiftmend-hot-consume",
  string
> = {
  "natures-swiftness-combo": "Clear save: Nature's Swiftness into a heal",
  "swiftmend-hot-consume": "Clear save: Swiftmend consumed a Rejuvenation",
};

export function CrisisCard({
  target,
  time,
  hitPointsPct,
  maintained,
  judged,
  responded,
  swiftmendReady,
  nsReady,
  idlePreceding,
  hasSwiftmend,
  hasNaturesSwiftness,
  judgement,
  clearSave,
  saveKind,
  prepped,
}: CrisisCardProps) {
  const rows: [string, string][] = [
    ["HP at crisis", `${Math.round(hitPointsPct)}%`],
    ["Maintained target", maintained ? "Yes" : "No"],
    ["Reactive heal landed", responded ? "Responded" : "No"],
  ];
  if (!responded) {
    if (hasSwiftmend) {
      rows.push([
        "Swiftmend available",
        swiftmendReady ? "Ready" : "On cooldown",
      ]);
    }
    if (hasNaturesSwiftness) {
      rows.push([
        "Nature's Swiftness available",
        nsReady ? "Ready" : "On cooldown",
      ]);
    }
    rows.push(["Idle in preceding 5s", idlePreceding ? "Yes" : "No"]);
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <strong className={styles.target}>{target}</strong>
          <span className={styles.time}>{time}</span>
        </div>
        {judged ? (
          judgement ? (
            <JudgementChip judgement={judgement} />
          ) : null
        ) : (
          <span className={styles.contextOnly}>Context only</span>
        )}
      </div>
      {clearSave && saveKind !== null && (
        <div className={styles.clearSave}>{CLEAR_SAVE_LABELS[saveKind]}</div>
      )}
      {prepped && (
        <div className={styles.prepped}>
          Anticipated: a Lifebloom, Rejuvenation, or Regrowth was already active
          on this target before the crisis
        </div>
      )}
      <div className={styles.grid}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <span className={styles.label}>{label}: </span>
            <span className={styles.value}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
