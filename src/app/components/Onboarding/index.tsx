import { Button } from "../ui/Button";
import logo from "../../../assets/logo/lifebloom.jpg";
import styles from "./index.module.css";

export interface OnboardingProps {
  onContinue: () => void;
}

export function Onboarding({ onContinue }: OnboardingProps) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={logo} width={40} height={40} alt="" />
          <h1>Bloomwatch</h1>
        </div>
        <button type="button" className={styles.skipLink} onClick={onContinue}>
          Skip intro →
        </button>
      </div>

      <p className={styles.tagline}>
        Keep your Lifeblooms rolling. Bloomwatch is a process-quality analyzer
        for TBC resto druid healers, built on Warcraft Logs.
      </p>

      <h2>What this is</h2>
      <p className={styles.section}>
        You paste a Warcraft Logs report link, pick a fight, and get a
        scorecard: every metric turned into a number with a red/orange/green
        judgement, so you can answer &quot;did I play well?&quot; independent of
        the healing meter.
      </p>

      <h2>Who it&apos;s for</h2>
      <ul className={styles.audienceList}>
        <li>
          <strong>Primary</strong> — a raiding resto druid on TBC Anniversary
          realms who wants objective, per-fight feedback on their own play.
        </li>
        <li>
          <strong>Secondary</strong> — healing officers and raid leads
          evaluating druids without falling into the parse trap.
        </li>
        <li>
          <strong>Tertiary</strong> — the broader Classic community, if this
          metric framework proves out for other HoT-centric specs.
        </li>
      </ul>

      <h2>Why not just look at the healing meter?</h2>
      <p className={styles.section}>
        Healing is zero-sum — every point of overheal on your target is a point
        your co-healer didn&apos;t need to spend. Effective-healing rankings
        measure your co-healers&apos; behavior as much as your own. This tool
        measures process instead of output: your GCD utilization, your Lifebloom
        refresh cadence, your mana-potion cooldown usage. Nobody can steal those
        from you, so they&apos;re a fair measure of how you actually played.
      </p>

      <div className={styles.actions}>
        <Button onClick={onContinue}>Continue</Button>
        <a
          href="https://branneman.github.io/tbc-resto-druid-rotation-game/"
          target="_blank"
          rel="noreferrer"
        >
          TBC Resto Druid Rotation Game ↗
        </a>
      </div>
      <p className={styles.caption}>
        Shown once on your first visit — reachable anytime after that from an
        &quot;About&quot; link in the footer.
      </p>
    </>
  );
}
