import { Disclosure } from "../Disclosure";
import { OwnClientIdField } from "../../OwnClientIdField";
import styles from "./index.module.css";

// Threshold per docs/backlog.md story 009's acceptance criteria: the banner
// appears once the shared default client crosses 75% of its hourly request
// budget, and disappears again once usage falls back below it.
export const RATE_LIMIT_BANNER_THRESHOLD_PCT = 75;

export interface RateLimitBannerProps {
  usagePct: number;
  onConnect: (clientId: string) => void;
}

export function RateLimitBanner({ usagePct, onConnect }: RateLimitBannerProps) {
  const clamped = Math.max(0, Math.min(100, usagePct));
  const rounded = Math.round(clamped);

  return (
    <div role="status" aria-live="polite" className={styles.banner}>
      <div className={styles.meter}>
        <div className={styles.meterHeader}>
          <span className={styles.pct}>{rounded}%</span>
          <span className={styles.pctLabel}>used this hour</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${clamped}%` }} />
          <div
            className={styles.thresholdTick}
            style={{ left: `${RATE_LIMIT_BANNER_THRESHOLD_PCT}%` }}
          />
        </div>
      </div>
      <div className={styles.message}>
        <p className={styles.headline}>Shared connection is running low</p>
        <p>
          Everyone shares one connection to Warcraft Logs, and it&apos;s nearly
          used up for this hour — you could soon be blocked out. Your own free
          WCL API key is used only by you and never runs into this.
        </p>
        <Disclosure summary="Use your own Client ID">
          <OwnClientIdField onConnect={onConnect} />
        </Disclosure>
      </div>
    </div>
  );
}
