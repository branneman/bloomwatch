import logo from "../../../../assets/logo/lifebloom.jpg";
import styles from "./index.module.css";

export interface AppHeaderProps {
  onClick: () => void;
}

export function AppHeader({ onClick }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button type="button" className={styles.logoButton} onClick={onClick}>
          <img
            src={logo}
            width={30}
            height={30}
            alt=""
            className={styles.logo}
          />
          <span className={styles.wordmark}>Bloomwatch</span>
        </button>
      </div>
    </header>
  );
}
