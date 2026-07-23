// src/app/components/ReportDashboard/index.tsx
import { useCallback, useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import type { DruidCandidate } from "../../../report/druidDetection";
import type { Host } from "../../../report/parseReportInput";
import {
  buildFightRows,
  formatDuration,
  formatFightLabel,
} from "../../../report/fightRows";
import {
  combineFightEpicStatus,
  rollupEpicJudgement,
} from "../../../metrics/reportAggregation";
import type { Judgement } from "../../../metrics/judgement";
import {
  useFightEpicSummaries,
  type FightEpicSummaries,
  type EpicId,
} from "../Scorecard/useFightEpicSummaries";
import { useHealingRoleThisFight } from "../Scorecard/useHealingRoleThisFight";
import { Scorecard } from "../Scorecard";
import { Badge } from "../ui/Badge";
import { JudgementChip } from "../ui/JudgementChip";
import { Popover } from "../ui/Popover";
import { Alert } from "../ui/Alert";
import styles from "./index.module.css";

export interface ReportDashboardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  reportTitle: string;
  fights: Fight[];
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  faerieFireAbilityIds: Set<number>;
  bossActorIds: Set<number>;
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
  openFightId: number | null;
  onOpenFight: (fightId: number) => void;
  onCloseFight: () => void;
  activeEpicId: EpicId | null;
  onSelectEpic: (epicId: EpicId | null) => void;
  onOpenFightEpic: (fightId: number, epicId: EpicId) => void;
  onStartOver: () => void;
}

const EPIC_META: { id: keyof FightEpicSummaries; label: string }[] = [
  { id: "gcd", label: "GCD economy" },
  { id: "lifebloom", label: "Lifebloom discipline" },
  { id: "spell", label: "Spell discipline" },
  { id: "mana", label: "Mana economy" },
  { id: "death", label: "Death forensics" },
  { id: "crisis", label: "Crisis response" },
  { id: "prep", label: "Prep hygiene" },
];

function epicKey(s: FightEpicSummaries[keyof FightEpicSummaries]): string {
  return s.status === "ready" ? `ready:${s.judgement}` : s.status;
}

const JUDGEMENTS: Judgement[] = ["good", "fair", "bad"];

function JudgementBreakdown({
  breakdown,
  fights,
  epicId,
  onOpenFightEpic,
}: {
  breakdown: Record<Judgement, number>;
  fights: Record<Judgement, { fightId: number; label: string }[]>;
  epicId: EpicId;
  onOpenFightEpic: (fightId: number, epicId: EpicId) => void;
}) {
  const present = JUDGEMENTS.filter((j) => breakdown[j] > 0);
  const interactive = present.length >= 2;

  return (
    <span className={styles.chipBreakdown}>
      {present.map((judgement, index) => (
        <span key={judgement}>
          {index > 0 && " · "}
          {interactive ? (
            <Popover
              triggerLabel={`${breakdown[judgement]} ${judgement}`}
              triggerClassName={styles.breakdownSegment}
            >
              <ul className={styles.breakdownList}>
                {fights[judgement].map((fight) => (
                  <li key={fight.fightId}>
                    <button
                      type="button"
                      className={styles.breakdownLink}
                      onClick={() => onOpenFightEpic(fight.fightId, epicId)}
                    >
                      {fight.label}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          ) : (
            `${breakdown[judgement]} ${judgement}`
          )}
        </span>
      ))}
    </span>
  );
}

interface FightRowProps {
  fight: Fight;
  pullNumber: number | null;
  onOpen: (fightId: number) => void;
  onSummaries: (fightId: number, summaries: FightEpicSummaries) => void;
  onHealingRole: (fightId: number, isHealingThisFight: boolean) => void;
  accessToken: string;
  reportCode: string;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  faerieFireAbilityIds: Set<number>;
  bossActorIds: Set<number>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReportDashboardProps["fetchEvents"];
  fetchLookbackEvents: ReportDashboardProps["fetchLookbackEvents"];
}

function FightRow({
  fight,
  pullNumber,
  onOpen,
  onSummaries,
  onHealingRole,
  accessToken,
  reportCode,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  faerieFireAbilityIds,
  bossActorIds,
  actorClasses,
  fetchEvents,
  fetchLookbackEvents,
}: FightRowProps) {
  const summaries = useFightEpicSummaries(
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
    faerieFireAbilityIds,
    bossActorIds,
  );
  const healingRole = useHealingRoleThisFight(
    accessToken,
    reportCode,
    fight,
    druidId,
    resolvedAbilities,
    fetchEvents,
  );

  // Reports to the parent whenever any epic's resolved status actually
  // changes, collapsed to short keys so the effect doesn't refire on
  // unrelated parent re-renders — same trick DruidDetector uses for its
  // fightIds prop (see src/app/components/DruidDetector/index.tsx).
  const summaryDeps = EPIC_META.map(({ id }) => epicKey(summaries[id]));
  useEffect(() => {
    onSummaries(fight.id, summaries);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summaryDeps flattens `summaries` into stable string keys; `summaries` itself is a fresh object every render and would refire this effect every render if listed directly
  }, [fight.id, onSummaries, ...summaryDeps]);

  useEffect(() => {
    if (healingRole.status !== "ready") return;
    onHealingRole(fight.id, healingRole.isHealingThisFight);
  }, [fight.id, onHealingRole, healingRole]);

  const overall = combineFightEpicStatus(
    EPIC_META.map(({ id }) => summaries[id]),
  );
  const label = formatFightLabel(fight, pullNumber);
  const duration = formatDuration(fight.endTime - fight.startTime);

  const isOffRole =
    healingRole.status === "ready" && !healingRole.isHealingThisFight;

  return (
    <button
      type="button"
      className={isOffRole ? `${styles.row} ${styles.offRole}` : styles.row}
      onClick={() => onOpen(fight.id)}
    >
      <span className={styles.rowLabel}>{label}</span>
      {fight.kill === true ? (
        <Badge tone="kill">Kill</Badge>
      ) : fight.kill === false ? (
        <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
      ) : null}
      <span className={styles.duration}>{duration}</span>
      {isOffRole ? (
        <span className={styles.offRoleLabel}>Not healing this fight</span>
      ) : overall.status === "ready" ? (
        <JudgementChip judgement={overall.judgement} />
      ) : overall.status === "error" ? (
        <span className={styles.calculating}>{overall.error}</span>
      ) : (
        <span className={styles.calculating}>Calculating…</span>
      )}
    </button>
  );
}

export function ReportDashboard({
  accessToken,
  reportCode,
  host,
  reportTitle,
  fights,
  druidId,
  druid,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  faerieFireAbilityIds,
  bossActorIds,
  targetNames,
  actorClasses,
  fetchEvents,
  fetchLookbackEvents,
  openFightId,
  onOpenFight,
  onCloseFight,
  activeEpicId,
  onSelectEpic,
  onOpenFightEpic,
  onStartOver,
}: ReportDashboardProps) {
  const [summariesByFight, setSummariesByFight] = useState<
    Map<number, FightEpicSummaries>
  >(new Map());
  const [healingRoleByFight, setHealingRoleByFight] = useState<
    Map<number, boolean>
  >(new Map());

  const handleSummaries = useCallback(
    (fightId: number, summaries: FightEpicSummaries) => {
      setSummariesByFight((prev) => {
        const next = new Map(prev);
        next.set(fightId, summaries);
        return next;
      });
    },
    [],
  );
  const handleHealingRole = useCallback(
    (fightId: number, isHealingThisFight: boolean) => {
      setHealingRoleByFight((prev) => {
        const next = new Map(prev);
        next.set(fightId, isHealingThisFight);
        return next;
      });
    },
    [],
  );

  const rows = buildFightRows(fights).filter((row) => !row.isTrash);
  const openFight = rows.find((row) => row.fight.id === openFightId)?.fight;

  if (openFight) {
    return (
      <Scorecard
        accessToken={accessToken}
        reportCode={reportCode}
        host={host}
        fight={openFight}
        druidId={druidId}
        druid={druid}
        lifebloomAbilityIds={lifebloomAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        resolvedAbilities={resolvedAbilities}
        faerieFireAbilityIds={faerieFireAbilityIds}
        bossActorIds={bossActorIds}
        targetNames={targetNames}
        actorClasses={actorClasses}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
        activeEpic={activeEpicId}
        onSelectEpic={onSelectEpic}
        onBackToFights={onCloseFight}
        onStartOver={onStartOver}
      />
    );
  }

  const onRoleRows = rows.filter(
    (row) => healingRoleByFight.get(row.fight.id) !== false,
  );
  const onRoleEntries = onRoleRows
    .map((row) => {
      const summaries = summariesByFight.get(row.fight.id);
      return summaries === undefined
        ? undefined
        : { fight: row.fight, pullNumber: row.pullNumber, summaries };
    })
    .filter(
      (
        e,
      ): e is {
        fight: Fight;
        pullNumber: number | null;
        summaries: FightEpicSummaries;
      } => e !== undefined,
    );
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} · Restoration`
    : druid.name;

  return (
    <div>
      <h2>{reportTitle}</h2>
      <p className={styles.summaryLine}>
        {druidLabel} · {rows.length} non-trash boss{" "}
        {rows.length === 1 ? "fight" : "fights"} averaged automatically into a
        category-by-category verdict below. Click a fight for its full
        single-fight scorecard.
      </p>

      <div className={styles.chipStrip}>
        {EPIC_META.map(({ id, label }) => {
          const rollup = rollupEpicJudgement(
            onRoleEntries.map((e) => ({
              status: e.summaries[id],
              weightMs: e.fight.endTime - e.fight.startTime,
              fightId: e.fight.id,
              label: formatFightLabel(e.fight, e.pullNumber),
            })),
          );
          return (
            <div key={id} className={styles.chip}>
              <div className={styles.chipInfo}>
                <span className={styles.chipLabel}>{label}</span>
                {rollup !== null && (
                  <JudgementBreakdown
                    breakdown={rollup.breakdown}
                    fights={rollup.fights}
                    epicId={id}
                    onOpenFightEpic={onOpenFightEpic}
                  />
                )}
              </div>
              {rollup === null ? (
                <span className={styles.calculating}>Calculating…</span>
              ) : (
                <JudgementChip judgement={rollup.judgement} />
              )}
            </div>
          );
        })}
      </div>

      {/* Every FightRow below fetches its own epics' events on mount rather than
          lazily on drill-in — intentional (story 010): the chip strip above needs
          every fight's judgement to compute the worst-case per epic, so eager
          per-fight fetching isn't an oversight to "fix" into lazy loading. */}
      <div className={styles.rows}>
        {rows.map(({ fight, pullNumber }) => (
          <FightRow
            key={fight.id}
            fight={fight}
            pullNumber={pullNumber}
            onOpen={onOpenFight}
            onSummaries={handleSummaries}
            onHealingRole={handleHealingRole}
            accessToken={accessToken}
            reportCode={reportCode}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            resolvedAbilities={resolvedAbilities}
            faerieFireAbilityIds={faerieFireAbilityIds}
            bossActorIds={bossActorIds}
            actorClasses={actorClasses}
            fetchEvents={fetchEvents}
            fetchLookbackEvents={fetchLookbackEvents}
          />
        ))}
      </div>

      <Alert tone="warning">
        This dashboard can&apos;t judge target selection, assignment adherence,
        or positioning; only your process, aggregated across the report.
      </Alert>
    </div>
  );
}
