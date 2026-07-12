import type { Judgement } from "../../../../metrics/judgement";
import { SpellIcon } from "../SpellIcon";
import { JudgementChip } from "../JudgementChip";
import styles from "./index.module.css";

export interface WidgetProps {
  icon: string;
  label: string;
  onOpen?: () => void;
  judgement?: Judgement;
  stats?: string[];
  note?: string;
}

export function Widget({
  icon,
  label,
  onOpen,
  judgement,
  stats,
  note,
}: WidgetProps) {
  const hasSummary = judgement !== undefined && stats !== undefined;

  const content = (
    <>
      <div className={styles.header}>
        <SpellIcon src={icon} size={20} />
        <span className={styles.label}>{label}</span>
        {hasSummary && <JudgementChip judgement={judgement} />}
      </div>
      {hasSummary ? (
        <div className={styles.stats}>
          {stats.map((stat) => (
            <span key={stat} className={styles.stat}>
              {stat}
            </span>
          ))}
        </div>
      ) : (
        note && <p className={styles.note}>{note}</p>
      )}
      {onOpen && <span className={styles.viewDetails}>View details →</span>}
    </>
  );

  if (onOpen) {
    return (
      <button type="button" className={styles.widget} onClick={onOpen}>
        {content}
      </button>
    );
  }

  return <div className={`${styles.widget} ${styles.disabled}`}>{content}</div>;
}
