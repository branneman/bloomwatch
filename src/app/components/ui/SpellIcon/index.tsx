import styles from "./index.module.css";

export interface SpellIconProps {
  src: string;
  size?: number;
}

export function SpellIcon({ src, size = 28 }: SpellIconProps) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      role="img"
      className={styles.icon}
    />
  );
}
