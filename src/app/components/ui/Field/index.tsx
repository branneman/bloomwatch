import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <div className={styles.labelText}>{label}</div>
      {children}
    </label>
  );
}
