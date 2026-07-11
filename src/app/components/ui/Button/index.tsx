import type { ButtonHTMLAttributes } from "react";
import styles from "./index.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
