import styles from "./index.module.css";

export interface ChecklistRowProps {
  label: string;
  present: boolean;
}

export function ChecklistRow({ label, present }: ChecklistRowProps) {
  return (
    <div className={styles.row}>
      <span
        className={`${styles.glyph} ${present ? styles.present : styles.missing}`}
        aria-hidden="true"
      >
        {present ? "✓" : "✕"}
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.status}>{present ? "Present" : "Missing"}</span>
    </div>
  );
}
