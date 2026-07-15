import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, children, className }: FieldProps) {
  const classes = [styles.field, className].filter(Boolean).join(" ");
  return (
    <label className={classes}>
      <div className={styles.labelText}>{label}</div>
      {children}
    </label>
  );
}
