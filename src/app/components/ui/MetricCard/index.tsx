import type { ReactNode } from "react";
import type { Judgement } from "../../../../metrics/judgement";
import { Card } from "../Card";
import { SpellIcon } from "../SpellIcon";
import { JudgementChip } from "../JudgementChip";
import { ProgressBar } from "../ProgressBar";
import { Disclosure } from "../Disclosure";
import styles from "./index.module.css";

export interface MetricCardProps {
  icon?: string;
  title: string;
  value?: string;
  pct?: number;
  judgement?: Judgement | null;
  note?: string;
  threshold: string;
  rationaleSlug?: string;
  children?: ReactNode;
}

export function MetricCard({
  icon,
  title,
  value,
  pct,
  judgement,
  note,
  threshold,
  rationaleSlug,
  children,
}: MetricCardProps) {
  return (
    <Card>
      <div className={styles.header}>
        {icon && <SpellIcon src={icon} />}
        <h3 className={styles.title}>{title}</h3>
        {judgement ? (
          <JudgementChip judgement={judgement} />
        ) : note ? (
          <span className={styles.note}>{note}</span>
        ) : null}
      </div>
      {value !== undefined && <div className={styles.value}>{value}</div>}
      {pct !== undefined && (
        <div className={styles.progress}>
          <ProgressBar pct={pct} judgement={judgement ?? "neutral"} />
        </div>
      )}
      {children}
      <div className={styles.disclosure}>
        <Disclosure summary="Why this threshold?">
          {threshold}
          {rationaleSlug && (
            <>
              {" "}
              <a
                href={`#/judgements/${rationaleSlug}`}
                className={styles.rationaleLink}
              >
                Read the full rationale →
              </a>
            </>
          )}
        </Disclosure>
      </div>
    </Card>
  );
}
