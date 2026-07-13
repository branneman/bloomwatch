// src/app/components/Scorecard/index.tsx
import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { DruidCandidate } from "../../../report/druidDetection";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { GcdEconomyContent } from "../GcdEconomyContent";
import { LifebloomDisciplineContent } from "../LifebloomDisciplineContent";
import { SpellDisciplineContent } from "../SpellDisciplineContent";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { Widget } from "../ui/Widget";
import { JudgementChip } from "../ui/JudgementChip";
import { SpellIcon } from "../ui/SpellIcon";
import { Alert } from "../ui/Alert";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";
import styles from "./index.module.css";

export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  onBackToFights: () => void;
  onStartOver: () => void;
}

type EpicId = "gcd" | "lifebloom" | "spell" | "mana" | "death" | "prep";

const GCD_ECONOMY_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_forceofnature.jpg";
const SPELL_DISCIPLINE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg";

const DISABLED_EPICS: { id: EpicId; label: string; icon: string }[] = [
  {
    id: "mana",
    label: "Mana economy",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg",
  },
  {
    id: "death",
    label: "Death forensics",
    icon: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg",
  },
  {
    id: "prep",
    label: "Prep hygiene",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg",
  },
];

export function Scorecard({
  accessToken,
  reportCode,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  targetNames,
  fetchEvents,
  onBackToFights,
  onStartOver,
}: ScorecardProps) {
  const [activeEpic, setActiveEpic] = useState<EpicId | null>(null);

  const gcdSummary = useGcdEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const lifebloomSummary = useLifebloomDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const spellSummary = useSpellDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    fetchEvents,
  );

  const outcome =
    fight.kill === true
      ? "Kill"
      : fight.kill === false
        ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
        : "Trash";
  const duration = formatDuration(fight.endTime - fight.startTime);
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} — Restoration`
    : druid.name;

  return (
    <div>
      <h2 className={styles.fightHeading}>
        {fight.name} ({outcome}, {duration})
      </h2>
      <p className={styles.druidLine}>{druidLabel}</p>
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
        <a
          href={buildFightTimeUrl(
            reportCode,
            fight.id,
            0,
            fight.endTime - fight.startTime,
          )}
          target="_blank"
          rel="noreferrer"
        >
          View on Warcraft Logs →
        </a>
      </p>

      {activeEpic === null && (
        <>
          <button
            type="button"
            className={styles.backLink}
            onClick={onStartOver}
          >
            Load different WCL report
          </button>
          <button
            type="button"
            className={styles.backLink}
            onClick={onBackToFights}
          >
            ← All fights
          </button>
          <div className={styles.grid}>
            <Widget
              icon={GCD_ECONOMY_ICON}
              label="GCD economy"
              onOpen={() => setActiveEpic("gcd")}
              judgement={
                gcdSummary.status === "ready" ? gcdSummary.judgement : undefined
              }
              stats={
                gcdSummary.status === "ready" ? gcdSummary.stats : undefined
              }
              note={
                gcdSummary.status === "loading"
                  ? "Calculating…"
                  : gcdSummary.status === "error"
                    ? gcdSummary.error
                    : undefined
              }
            />
            <Widget
              icon={lifebloomIcon}
              label="Lifebloom discipline"
              onOpen={() => setActiveEpic("lifebloom")}
              judgement={
                lifebloomSummary.status === "ready"
                  ? lifebloomSummary.judgement
                  : undefined
              }
              stats={
                lifebloomSummary.status === "ready"
                  ? lifebloomSummary.stats
                  : undefined
              }
              note={
                lifebloomSummary.status === "loading"
                  ? "Calculating…"
                  : lifebloomSummary.status === "error"
                    ? lifebloomSummary.error
                    : undefined
              }
            />
            <Widget
              icon={SPELL_DISCIPLINE_ICON}
              label="Spell discipline"
              onOpen={() => setActiveEpic("spell")}
              judgement={
                spellSummary.status === "ready"
                  ? spellSummary.judgement
                  : undefined
              }
              stats={
                spellSummary.status === "ready" ? spellSummary.stats : undefined
              }
              note={
                spellSummary.status === "loading"
                  ? "Calculating…"
                  : spellSummary.status === "error"
                    ? spellSummary.error
                    : undefined
              }
            />
            {DISABLED_EPICS.map((epic) => (
              <Widget
                key={epic.id}
                icon={epic.icon}
                label={epic.label}
                note="Not yet available"
              />
            ))}
          </div>
        </>
      )}

      {activeEpic === "gcd" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setActiveEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={GCD_ECONOMY_ICON} />
            <h2 className={styles.epicTitle}>GCD economy</h2>
            {gcdSummary.status === "ready" && (
              <JudgementChip judgement={gcdSummary.judgement} />
            )}
          </div>
          <GcdEconomyContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "lifebloom" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setActiveEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={lifebloomIcon} />
            <h2 className={styles.epicTitle}>Lifebloom discipline</h2>
            {lifebloomSummary.status === "ready" && (
              <JudgementChip judgement={lifebloomSummary.judgement} />
            )}
          </div>
          <LifebloomDisciplineContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "spell" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setActiveEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={SPELL_DISCIPLINE_ICON} />
            <h2 className={styles.epicTitle}>Spell discipline</h2>
            {spellSummary.status === "ready" && (
              <JudgementChip judgement={spellSummary.judgement} />
            )}
          </div>
          <SpellDisciplineContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      <div className={styles.footer}>
        <Alert tone="warning">
          This scorecard can&apos;t judge target selection, assignment
          adherence, or positioning — only your process.
        </Alert>
      </div>
    </div>
  );
}
