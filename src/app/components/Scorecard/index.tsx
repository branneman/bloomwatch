import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { DruidCandidate } from "../../../report/druidDetection";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { GCDUtilizationCard } from "../GCDUtilizationCard";
import { IdleGapsCard } from "../IdleGapsCard";
import { LB3UptimeCard } from "../LB3UptimeCard";
import { RefreshCadenceCard } from "../RefreshCadenceCard";
import { AccidentalBloomsCard } from "../AccidentalBloomsCard";
import { RestackTaxCard } from "../RestackTaxCard";
import { ConcurrentTargetsCard } from "../ConcurrentTargetsCard";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
  onStartOver: () => void;
}

export function Scorecard({
  accessToken,
  reportCode,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
  onStartOver,
}: ScorecardProps) {
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

      <h2>GCD economy</h2>
      <div className={styles.group}>
        <GCDUtilizationCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          fetchEvents={fetchEvents}
        />
        <IdleGapsCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          fetchEvents={fetchEvents}
        />
      </div>

      <h2>Lifebloom discipline</h2>
      <div className={styles.group}>
        <LB3UptimeCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          lifebloomAbilityIds={lifebloomAbilityIds}
          targetNames={targetNames}
          fetchEvents={fetchEvents}
        />
        <RefreshCadenceCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          lifebloomAbilityIds={lifebloomAbilityIds}
          fetchEvents={fetchEvents}
        />
        <AccidentalBloomsCard
          accessToken={accessToken}
          reportCode={reportCode}
          fight={fight}
          druidId={druidId}
          lifebloomAbilityIds={lifebloomAbilityIds}
          targetNames={targetNames}
          fetchEvents={fetchEvents}
        />
        <RestackTaxCard />
        <ConcurrentTargetsCard />
      </div>

      <div className={styles.footer}>
        <Alert tone="warning">
          This scorecard can&apos;t judge target selection, assignment
          adherence, or positioning — only your process.
        </Alert>
      </div>
      <div className={styles.startOver}>
        <Button variant="secondary" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </div>
  );
}
