import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ClassTagProps {
  tone: "efficient" | "emergency" | "wasteful";
  children: ReactNode;
}

export function ClassTag({ tone, children }: ClassTagProps) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}
