// src/app/components/Scorecard/index.tsx
import { useMemo } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { getHealingAbilityIds } from "../../../metrics/nearDeathResponse";
import type { DruidCandidate } from "../../../report/druidDetection";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { GcdEconomyContent } from "../GcdEconomyContent";
import { LifebloomDisciplineContent } from "../LifebloomDisciplineContent";
import { SpellDisciplineContent } from "../SpellDisciplineContent";
import { ManaEconomyContent } from "../ManaEconomyContent";
import { DeathForensicsContent } from "../DeathForensicsContent";
import { NearDeathResponseContent } from "../NearDeathResponseContent";
import { PrepHygieneContent } from "../PrepHygieneContent";
import { useFightEpicSummaries, type EpicId } from "./useFightEpicSummaries";
import { useArchetypeBucket } from "./useArchetypeBucket";
import { useHealingRoleThisFight } from "./useHealingRoleThisFight";
import {
  BUCKET_DEFINITIONS,
  UNSUPPORTED_ARCHETYPE_BUCKETS,
  type TalentBucket,
} from "../../../report/archetypeDetection";
import { Widget } from "../ui/Widget";
import { JudgementChip } from "../ui/JudgementChip";
import { SpellIcon } from "../ui/SpellIcon";
import { Alert } from "../ui/Alert";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";
import styles from "./index.module.css";

export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  targetNames: Map<number, string>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  activeEpic: EpicId | null;
  onSelectEpic: (epicId: EpicId | null) => void;
  onBackToFights: () => void;
  onStartOver: () => void;
}

const GCD_ECONOMY_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_forceofnature.jpg";
const SPELL_DISCIPLINE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg";
const MANA_ECONOMY_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg";
const DEATH_FORENSICS_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg";
const CRISIS_RESPONSE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_holy_layonhands.jpg";
const PREP_HYGIENE_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg";

const ARCHETYPE_LABELS: Record<TalentBucket, string> = {
  "deep-resto": "Deep resto",
  "likely-dreamstate-full": "Likely Dreamstate (full)",
  "likely-dreamstate-partial": "Likely Dreamstate (partial)",
  "mostly-resto": "Mostly Restoration",
  "mostly-balance": "Mostly Balance",
  "restokin-shaped": "Restokin-shaped",
  "other-unclassified": "Other/unclassified",
  "unknown-no-talent-data": "Unknown (talent read unavailable)",
};

export function Scorecard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  targetNames,
  actorClasses,
  fetchEvents,
  fetchLookbackEvents,
  activeEpic,
  onSelectEpic,
  onBackToFights,
  onStartOver,
}: ScorecardProps) {
  const {
    gcd: gcdSummary,
    lifebloom: lifebloomSummary,
    spell: spellSummary,
    mana: manaSummary,
    death: deathSummary,
    crisis: crisisSummary,
    prep: prepSummary,
  } = useFightEpicSummaries(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
    fetchLookbackEvents,
  );
  const healingAbilityIds = useMemo(
    () => getHealingAbilityIds(resolvedAbilities),
    [resolvedAbilities],
  );
  const archetypeStatus = useArchetypeBucket(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const healingRoleStatus = useHealingRoleThisFight(
    accessToken,
    reportCode,
    fight,
    druidId,
    resolvedAbilities,
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
      <p className={styles.archetypeLine}>
        Talent archetype:{" "}
        {archetypeStatus.status === "loading" && "Calculating…"}
        {archetypeStatus.status === "error" && "unavailable"}
        {archetypeStatus.status === "ready" && (
          <span title={BUCKET_DEFINITIONS[archetypeStatus.bucket]}>
            {ARCHETYPE_LABELS[archetypeStatus.bucket]}
          </span>
        )}
      </p>
      {archetypeStatus.status === "ready" &&
        UNSUPPORTED_ARCHETYPE_BUCKETS.has(archetypeStatus.bucket) && (
          <Alert tone="warning">
            This fight&apos;s detected build (
            {ARCHETYPE_LABELS[archetypeStatus.bucket]}) isn&apos;t one
            Bloomwatch judges well yet — the process judgements below may not be
            a fair read on this playstyle.
          </Alert>
        )}
      {healingRoleStatus.status === "ready" &&
        !healingRoleStatus.isHealingThisFight && (
          <Alert tone="warning">
            {druid.name} cast {healingRoleStatus.healingCastCount} healing spell
            {healingRoleStatus.healingCastCount === 1 ? "" : "s"} this fight —
            the judgements below may not be meaningful for an off-role pull.
          </Alert>
        )}
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
        <a
          href={buildFightTimeUrl(
            host,
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
              onOpen={() => onSelectEpic("gcd")}
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
              onOpen={() => onSelectEpic("lifebloom")}
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
              onOpen={() => onSelectEpic("spell")}
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
            <Widget
              icon={MANA_ECONOMY_ICON}
              label="Mana economy"
              onOpen={() => onSelectEpic("mana")}
              judgement={
                manaSummary.status === "ready"
                  ? manaSummary.judgement
                  : undefined
              }
              stats={
                manaSummary.status === "ready" ? manaSummary.stats : undefined
              }
              note={
                manaSummary.status === "loading"
                  ? "Calculating…"
                  : manaSummary.status === "error"
                    ? manaSummary.error
                    : undefined
              }
            />
            <Widget
              icon={DEATH_FORENSICS_ICON}
              label="Death forensics"
              onOpen={() => onSelectEpic("death")}
              judgement={
                deathSummary.status === "ready"
                  ? deathSummary.judgement
                  : undefined
              }
              stats={
                deathSummary.status === "ready" ? deathSummary.stats : undefined
              }
              note={
                deathSummary.status === "loading"
                  ? "Calculating…"
                  : deathSummary.status === "error"
                    ? deathSummary.error
                    : undefined
              }
            />
            <Widget
              icon={CRISIS_RESPONSE_ICON}
              label="Crisis response"
              onOpen={() => onSelectEpic("crisis")}
              judgement={
                crisisSummary.status === "ready"
                  ? crisisSummary.judgement
                  : undefined
              }
              stats={
                crisisSummary.status === "ready"
                  ? crisisSummary.stats
                  : undefined
              }
              note={
                crisisSummary.status === "loading"
                  ? "Calculating…"
                  : crisisSummary.status === "error"
                    ? crisisSummary.error
                    : undefined
              }
            />
            <Widget
              icon={PREP_HYGIENE_ICON}
              label="Prep hygiene"
              onOpen={() => onSelectEpic("prep")}
              judgement={
                prepSummary.status === "ready"
                  ? prepSummary.judgement
                  : undefined
              }
              stats={
                prepSummary.status === "ready" ? prepSummary.stats : undefined
              }
              note={
                prepSummary.status === "loading"
                  ? "Calculating…"
                  : prepSummary.status === "error"
                    ? prepSummary.error
                    : undefined
              }
            />
          </div>
        </>
      )}

      {activeEpic === "gcd" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
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
            host={host}
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
            onClick={() => onSelectEpic(null)}
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
            host={host}
            fight={fight}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
            fetchLookbackEvents={fetchLookbackEvents}
          />
        </div>
      )}

      {activeEpic === "spell" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
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
            host={host}
            fight={fight}
            druidId={druidId}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            resolvedAbilities={resolvedAbilities}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "mana" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={MANA_ECONOMY_ICON} />
            <h2 className={styles.epicTitle}>Mana economy</h2>
            {manaSummary.status === "ready" && (
              <JudgementChip judgement={manaSummary.judgement} />
            )}
          </div>
          <ManaEconomyContent
            accessToken={accessToken}
            reportCode={reportCode}
            host={host}
            fight={fight}
            druidId={druidId}
            resolvedAbilities={resolvedAbilities}
            actorClasses={actorClasses}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "death" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={DEATH_FORENSICS_ICON} />
            <h2 className={styles.epicTitle}>Death forensics</h2>
            {deathSummary.status === "ready" && (
              <JudgementChip judgement={deathSummary.judgement} />
            )}
          </div>
          <DeathForensicsContent
            accessToken={accessToken}
            reportCode={reportCode}
            host={host}
            fight={fight}
            druidId={druidId}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "crisis" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={CRISIS_RESPONSE_ICON} />
            <h2 className={styles.epicTitle}>Crisis response</h2>
            {crisisSummary.status === "ready" && (
              <JudgementChip judgement={crisisSummary.judgement} />
            )}
          </div>
          <NearDeathResponseContent
            accessToken={accessToken}
            reportCode={reportCode}
            host={host}
            fight={fight}
            druidId={druidId}
            healingAbilityIds={healingAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "prep" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => onSelectEpic(null)}
          >
            ← All metrics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={PREP_HYGIENE_ICON} />
            <h2 className={styles.epicTitle}>Prep hygiene</h2>
            {prepSummary.status === "ready" && (
              <JudgementChip judgement={prepSummary.judgement} />
            )}
          </div>
          <PrepHygieneContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
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
