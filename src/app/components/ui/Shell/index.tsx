import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface ShellProps {
  width?: 760 | 800 | 820;
  children: ReactNode;
}

export function Shell({ width = 760, children }: ShellProps) {
  return (
    <div className={styles.shell} style={{ width }}>
      {children}
    </div>
  );
}
