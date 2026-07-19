import type { Judgement } from "../../../../metrics/judgement";
import styles from "./index.module.css";

export interface JudgementChipProps {
  judgement: Judgement;
}

const LABEL: Record<Judgement, string> = {
  good: "Good",
  fair: "Fair",
  bad: "Bad",
};

export function JudgementChip({ judgement }: JudgementChipProps) {
  return (
    <span className={`${styles.chip} ${styles[judgement]}`}>
      {LABEL[judgement]}
    </span>
  );
}
