import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return <div className={styles.shell}>{children}</div>;
}
