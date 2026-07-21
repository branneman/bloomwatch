import type { ReactNode } from "react";
import styles from "../ui/DataTable/index.module.css";

// Reuses DataTable's own CSS module (not the DataTable component itself,
// which takes columns/rows props rather than children) so markdown tables
// in content.mdx get the same overflow-x: auto scroll wrapper every other
// wide table in the app already has (story 706).
export function MdxTable({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>{children}</table>
    </div>
  );
}

export function MdxTh({ children }: { children?: ReactNode }) {
  return <th className={styles.headerCell}>{children}</th>;
}

export function MdxTd({ children }: { children?: ReactNode }) {
  return <td className={styles.cell}>{children}</td>;
}
