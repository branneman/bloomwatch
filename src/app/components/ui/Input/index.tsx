import type { InputHTMLAttributes } from "react";
import styles from "./index.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  const classes = [styles.input, className].filter(Boolean).join(" ");
  return <input className={classes} {...rest} />;
}
