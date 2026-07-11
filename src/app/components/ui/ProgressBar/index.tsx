import type { Judgement } from "../../../../metrics/judgement";
import styles from "./index.module.css";

export interface ProgressBarProps {
  pct: number;
  judgement: Judgement | "neutral";
}

export function ProgressBar({ pct, judgement }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`${styles.fill} ${styles[judgement]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
