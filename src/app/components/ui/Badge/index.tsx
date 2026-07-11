import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface BadgeProps {
  tone: "kill" | "wipe" | "trash";
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
