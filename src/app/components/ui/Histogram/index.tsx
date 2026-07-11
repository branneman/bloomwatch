import styles from "./index.module.css";

export interface HistogramBucket {
  label: string;
  pct: number;
  color: string;
}

export interface HistogramProps {
  buckets: HistogramBucket[];
}

export function Histogram({ buckets }: HistogramProps) {
  const max = Math.max(...buckets.map((bucket) => bucket.pct));
  return (
    <div className={styles.histogram}>
      {buckets.map((bucket) => (
        <div key={bucket.label} className={styles.column}>
          <div className={styles.pctLabel}>{bucket.pct}%</div>
          <div
            className={styles.bar}
            style={{
              height: `${Math.max(6, (bucket.pct / max) * 80)}px`,
              background: bucket.color,
            }}
          />
          <div className={styles.bucketLabel}>{bucket.label}</div>
        </div>
      ))}
    </div>
  );
}
