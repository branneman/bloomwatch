import type { RateLimitUsage } from "../../../../wcl/rateLimitUsage";
import styles from "./index.module.css";

export interface FooterProps {
  onReopenOnboarding: () => void;
  rateLimitUsage: RateLimitUsage | null;
}

export function Footer({ onReopenOnboarding, rateLimitUsage }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.links}>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={onReopenOnboarding}
          >
            About
          </button>
          <a href="#/judgements" className={styles.aboutLink}>
            How judgements work
          </a>
        </div>
        <div className={styles.meta}>
          {rateLimitUsage && (
            <span className={styles.rateLimit}>
              WCL rate limit budget:{" "}
              {Math.round(rateLimitUsage.pointsSpentThisHour)}/
              {rateLimitUsage.limitPerHour}.
            </span>
          )}
          <span className={styles.version}>Version: {__APP_VERSION__}.</span>
        </div>
      </div>
    </footer>
  );
}
