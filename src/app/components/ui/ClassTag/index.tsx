import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ClassTagProps {
  tone: "efficient" | "emergency" | "wasteful" | "flagged";
  children: ReactNode;
}

export function ClassTag({ tone, children }: ClassTagProps) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}
