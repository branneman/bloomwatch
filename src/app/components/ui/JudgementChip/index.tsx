import type { Judgement } from "../../../../metrics/judgement";
import styles from "./index.module.css";

export interface JudgementChipProps {
  judgement: Judgement;
}

const LABEL: Record<Judgement, string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function JudgementChip({ judgement }: JudgementChipProps) {
  return (
    <span className={`${styles.chip} ${styles[judgement]}`}>
      {LABEL[judgement]}
    </span>
  );
}
