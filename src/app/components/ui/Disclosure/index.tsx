import { useState, type ReactNode } from "react";
import styles from "./index.module.css";

export interface DisclosureProps {
  summary: string;
  children: ReactNode;
}

export function Disclosure({ summary, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className={`${styles.chevron} ${open ? styles.open : ""}`}>
          ▶
        </span>
        {summary}
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </div>
  );
}
