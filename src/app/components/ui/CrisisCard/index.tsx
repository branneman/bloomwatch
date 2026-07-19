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
  judgement: Judgement | null;
}

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
  judgement,
}: CrisisCardProps) {
  const rows: [string, string][] = [
    ["HP at crisis", `${Math.round(hitPointsPct)}%`],
    ["Maintained target", maintained ? "Yes" : "No"],
    ["Reactive heal landed", responded ? "Responded" : "No"],
  ];
  if (!responded) {
    rows.push(
      ["Swiftmend available", swiftmendReady ? "Ready" : "On cooldown"],
      ["Nature's Swiftness available", nsReady ? "Ready" : "On cooldown"],
      ["Idle in preceding 5s", idlePreceding ? "Yes" : "No"],
    );
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
