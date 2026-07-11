import type { ReactNode } from "react";
import styles from "./index.module.css";

export interface AlertProps {
  tone: "warning";
  children: ReactNode;
}

export function Alert({ tone, children }: AlertProps) {
  return (
    <div role="alert" className={`${styles.alert} ${styles[tone]}`}>
      {children}
    </div>
  );
}
