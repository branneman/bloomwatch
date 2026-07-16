import logo from "../../../../assets/logo/lifebloom.jpg";
import styles from "./index.module.css";

export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <img src={logo} width={30} height={30} alt="" className={styles.logo} />
        <span className={styles.wordmark}>Bloomwatch</span>
      </div>
    </header>
  );
}
