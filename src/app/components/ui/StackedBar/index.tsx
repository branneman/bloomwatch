import styles from "./index.module.css";

export interface StackedBarSegment {
  label: string;
  pct: number;
  color: string;
}

export interface StackedBarProps {
  segments: StackedBarSegment[];
}

export function StackedBar({ segments }: StackedBarProps) {
  return (
    <div>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${segment.pct}%`, background: segment.color }}
            title={`${segment.label}: ${segment.pct}%`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {segments.map((segment) => (
          <div key={segment.label} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: segment.color }}
            />
            {segment.label} · {segment.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}
