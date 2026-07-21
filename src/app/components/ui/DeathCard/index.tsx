import type { ReactNode } from "react";
import type { Judgement } from "../../../../metrics/judgement";
import { JudgementChip } from "../JudgementChip";
import styles from "./index.module.css";

export interface DeathCardProps {
  target: string;
  time: ReactNode;
  maintained: boolean;
  lb3: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  judgement: Judgement | null;
}

export function DeathCard({
  target,
  time,
  maintained,
  lb3,
  swiftmendReady,
  nsReady,
  idlePreceding,
  judgement,
}: DeathCardProps) {
  const rows: [string, string][] = [
    [
      "LB3 rolling on target",
      maintained ? (lb3 ? "Yes" : "No") : "n/a (not maintained)",
    ],
    ["Swiftmend available", swiftmendReady ? "Ready" : "On cooldown"],
    ["Nature's Swiftness available", nsReady ? "Ready" : "On cooldown"],
    ["Idle in preceding 5s", idlePreceding ? "Yes" : "No"],
  ];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <strong className={styles.target}>{target}</strong>
          <span className={styles.time}>{time}</span>
        </div>
        {judgement ? (
          <JudgementChip judgement={judgement} />
        ) : (
          <span className={styles.notJudged}>Not judged</span>
        )}
      </div>
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
