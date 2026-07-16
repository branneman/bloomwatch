import styles from "./index.module.css";

export interface FooterProps {
  onReopenOnboarding: () => void;
}

export function Footer({ onReopenOnboarding }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.aboutLink}
          onClick={onReopenOnboarding}
        >
          About
        </button>
        <span className={styles.version}>{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}
