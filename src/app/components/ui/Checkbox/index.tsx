import type { InputHTMLAttributes } from "react";
import styles from "./index.module.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: string;
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}
