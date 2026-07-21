import { Button } from "../ui/Button";
import logo from "../../../assets/logo/lifebloom.jpg";
import styles from "./index.module.css";

export interface OnboardingProps {
  onContinue: () => void;
}

export function Onboarding({ onContinue }: OnboardingProps) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={logo} width={40} height={40} alt="" />
          <h1>Bloomwatch</h1>
        </div>
        <button type="button" className={styles.skipLink} onClick={onContinue}>
          Skip intro →
        </button>
      </div>

      <p className={styles.section}>
        Keep your Lifeblooms rolling. Bloomwatch is a process-quality analyzer
        for TBC resto druid healers, built on Warcraft Logs.
      </p>

      <p className={styles.section}>
        <strong>Skip the parse.</strong> A WCL ranking percentile can&apos;t
        tell you whether you played well, only whether you out-healed everyone
        else on that pull. Bloomwatch gives you a verdict that&apos;s actually
        about your own play, not a number built to rank you against your raid.
      </p>

      <h2>What this is</h2>
      <p className={styles.section}>
        You paste a Warcraft Logs report link, pick a fight, and get a
        scorecard: every metric turned into a number with a Good/Fair/Bad
        judgement, so you can answer &quot;did I play well?&quot; independent of
        the healing meter.
      </p>

      <h2>Who it&apos;s for</h2>
      <ul className={styles.audienceList}>
        <li>
          <strong>Primary:</strong> a raiding resto druid on TBC Anniversary
          realms who wants objective, per-fight feedback on their own play.
        </li>
        <li>
          <strong>Secondary:</strong> healing officers and raid leads evaluating
          druids without falling into the parse trap.
        </li>
        <li>
          <strong>Tertiary:</strong> the broader Classic community, if this
          metric framework proves out for other HoT-centric specs.
        </li>
      </ul>

      <h2>Which builds this fits</h2>
      <p className={styles.section}>
        Bloomwatch&apos;s judgements are tuned for a Restoration-focused healer
        — deep resto gets the most precise read, and Dreamstate hybrids are
        reasonably covered too. A Regrowth-only resto build, a Restokin
        (Balance/healer hybrid), or a Balance druid playing an off-spec healer
        role doesn&apos;t have enough process data behind it yet, so its
        scorecard may not be a fair judgement of that play. Once you load a
        report, the fight screen will flag it directly if your detected build
        falls outside what&apos;s well-supported today.
      </p>

      <h2>Why not just look at the healing meter?</h2>
      <p className={styles.section}>
        Healing is zero-sum. Every hitpoint you heal can&apos;t be healed by
        another healer, so you and your co-healers are effectively competing for
        the same hitpoints. That competition doesn&apos;t make the raid any
        healthier, it just decides whose parse number goes up.
      </p>
      <p className={styles.section}>
        Two druids can play a fight identically and land on opposite ends of the
        meter depending on who got assigned the tank versus raid-wide AoE
        damage, how many other healers were in the group, or how efficiently
        everyone else played around them. None of that is something you
        controlled that pull.
      </p>
      <p className={styles.section}>
        Bloomwatch measures process instead of output: your GCD utilization,
        your Lifebloom refresh cadence, your mana-potion cooldown usage. Nobody
        can steal those from you, so they&apos;re a fair measure of how you
        actually played, pull after pull, regardless of assignment or raid comp.
      </p>

      <p className={styles.section}>
        Want the exact thresholds, and how the data is pulled from Warcraft Logs
        in the first place?{" "}
        <a href="#/judgements" className={styles.inlineLink}>
          Read the full judgement rationale →
        </a>
      </p>

      <div className={styles.actions}>
        <Button onClick={onContinue}>Continue</Button>
        <a
          className={styles.gameLink}
          href="https://branneman.github.io/tbc-resto-druid-rotation-game/"
          target="_blank"
          rel="noreferrer"
        >
          TBC Resto Druid Rotation Game ↗
        </a>
      </div>

      <p className={styles.caption}>
        Shown once on your first visit. Reachable anytime after that from an
        &quot;About&quot; link in the footer.
      </p>
    </div>
  );
}
