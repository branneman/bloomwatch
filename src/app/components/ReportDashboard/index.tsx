// src/app/components/ReportDashboard/index.tsx
import { useCallback, useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import type { DruidCandidate } from "../../../report/druidDetection";
import { buildFightRows, formatDuration } from "../../../report/fightRows";
import {
  combineFightEpicStatus,
  worstReadyJudgement,
} from "../../../metrics/reportAggregation";
import {
  useFightEpicSummaries,
  type FightEpicSummaries,
  type EpicId,
} from "../Scorecard/useFightEpicSummaries";
import { Scorecard } from "../Scorecard";
import { Badge } from "../ui/Badge";
import { JudgementChip } from "../ui/JudgementChip";
import { Alert } from "../ui/Alert";
import styles from "./index.module.css";

export interface ReportDashboardProps {
  accessToken: string;
  reportCode: string;
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
  targetNames: Map<number, string>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
  openFightId: number | null;
  onOpenFight: (fightId: number) => void;
  onCloseFight: () => void;
  activeEpicId: EpicId | null;
  onSelectEpic: (epicId: EpicId | null) => void;
  onStartOver: () => void;
}

const EPIC_META: { id: keyof FightEpicSummaries; label: string }[] = [
  { id: "gcd", label: "GCD economy" },
  { id: "lifebloom", label: "Lifebloom discipline" },
  { id: "spell", label: "Spell discipline" },
  { id: "mana", label: "Mana economy" },
  { id: "death", label: "Death forensics" },
  { id: "prep", label: "Prep hygiene" },
];

function epicKey(s: FightEpicSummaries[keyof FightEpicSummaries]): string {
  return s.status === "ready" ? `ready:${s.judgement}` : s.status;
}

interface FightRowProps {
  fight: Fight;
  pullNumber: number | null;
  onOpen: (fightId: number) => void;
  onSummaries: (fightId: number, summaries: FightEpicSummaries) => void;
  accessToken: string;
  reportCode: string;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReportDashboardProps["fetchEvents"];
}

function FightRow({
  fight,
  pullNumber,
  onOpen,
  onSummaries,
  accessToken,
  reportCode,
  druidId,
  lifebloomAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  actorClasses,
  fetchEvents,
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

  const overall = combineFightEpicStatus(
    EPIC_META.map(({ id }) => summaries[id]),
  );
  const label =
    pullNumber === null ? fight.name : `Pull ${pullNumber} — ${fight.name}`;
  const duration = formatDuration(fight.endTime - fight.startTime);

  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => onOpen(fight.id)}
    >
      <span className={styles.rowLabel}>{label}</span>
      {fight.kill === true ? (
        <Badge tone="kill">Kill</Badge>
      ) : fight.kill === false ? (
        <Badge tone="wipe">{`Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`}</Badge>
      ) : null}
      <span className={styles.duration}>{duration}</span>
      {overall.status === "ready" ? (
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
  targetNames,
  actorClasses,
  fetchEvents,
  openFightId,
  onOpenFight,
  onCloseFight,
  activeEpicId,
  onSelectEpic,
  onStartOver,
}: ReportDashboardProps) {
  const [summariesByFight, setSummariesByFight] = useState<
    Map<number, FightEpicSummaries>
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

  const rows = buildFightRows(fights).filter((row) => !row.isTrash);
  const openFight = rows.find((row) => row.fight.id === openFightId)?.fight;

  if (openFight) {
    return (
      <Scorecard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={openFight}
        druidId={druidId}
        druid={druid}
        lifebloomAbilityIds={lifebloomAbilityIds}
        rejuvenationAbilityIds={rejuvenationAbilityIds}
        regrowthAbilityIds={regrowthAbilityIds}
        swiftmendAbilityIds={swiftmendAbilityIds}
        naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
        resolvedAbilities={resolvedAbilities}
        targetNames={targetNames}
        actorClasses={actorClasses}
        fetchEvents={fetchEvents}
        activeEpic={activeEpicId}
        onSelectEpic={onSelectEpic}
        onBackToFights={onCloseFight}
        onStartOver={onStartOver}
      />
    );
  }

  const allSummaries = Array.from(summariesByFight.values());
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} — Restoration`
    : druid.name;

  return (
    <div>
      <h2>{reportTitle}</h2>
      <p className={styles.summaryLine}>
        {druidLabel} · {rows.length} non-trash boss{" "}
        {rows.length === 1 ? "fight" : "fights"} aggregated automatically. Click
        a fight for its full single-fight scorecard.
      </p>

      <div className={styles.chipStrip}>
        {EPIC_META.map(({ id, label }) => {
          const judgement = worstReadyJudgement(allSummaries.map((s) => s[id]));
          return (
            <div key={id} className={styles.chip}>
              <span className={styles.chipLabel}>{label}</span>
              {judgement === null ? (
                <span className={styles.calculating}>Calculating…</span>
              ) : (
                <JudgementChip judgement={judgement} />
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
            accessToken={accessToken}
            reportCode={reportCode}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            rejuvenationAbilityIds={rejuvenationAbilityIds}
            regrowthAbilityIds={regrowthAbilityIds}
            swiftmendAbilityIds={swiftmendAbilityIds}
            naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
            resolvedAbilities={resolvedAbilities}
            actorClasses={actorClasses}
            fetchEvents={fetchEvents}
          />
        ))}
      </div>

      <Alert tone="warning">
        This dashboard can&apos;t judge target selection, assignment adherence,
        or positioning — only your process, aggregated across the report.
      </Alert>
    </div>
  );
}
