import { useEffect } from "react";
import Content from "./content.mdx";
import { MdxTable, MdxTh, MdxTd } from "./MdxTable";
import styles from "./index.module.css";

const MDX_COMPONENTS = { table: MdxTable, th: MdxTh, td: MdxTd };

export interface JudgementRationaleProps {
  slug?: string;
}

export function JudgementRationale({ slug }: JudgementRationaleProps) {
  useEffect(() => {
    if (!slug) return;
    document.getElementById(slug)?.scrollIntoView();
  }, [slug]);

  return (
    <div className={styles.page}>
      <Content components={MDX_COMPONENTS} />
    </div>
  );
}
