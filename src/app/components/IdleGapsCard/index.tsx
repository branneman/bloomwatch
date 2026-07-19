import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeIdleGaps,
  type IdleGapsResult,
} from "../../../metrics/idleGaps";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";

const idleGapsIcon =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_timestop.jpg";

export interface IdleGapsCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: IdleGapsResult }
  | { accessToken: string; error: string };

export function IdleGapsCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  fetchEvents,
}: IdleGapsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
      true,
    )
      .then((events) => {
        try {
          const computed = computeIdleGaps(
            events,
            druidId,
            fight.startTime,
            fight.endTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate idle gaps.",
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchEvents (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  const threshold =
    "Good < 5%, fair 5–15%, bad > 15% of fight duration, measured as total dead time as a share of the fight.";

  if (!isCurrent) {
    return (
      <MetricCard icon={idleGapsIcon} title="Idle gaps" threshold={threshold}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={idleGapsIcon} title="Idle gaps" threshold={threshold}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { deadTimePct, totalDeadTimeMs, gaps, longestGaps, judgement } =
    result.result;

  return (
    <MetricCard
      icon={idleGapsIcon}
      title="Idle gaps"
      value={`${Math.round(deadTimePct)}% dead time`}
      pct={Math.min(100, deadTimePct)}
      judgement={judgement}
      threshold={threshold}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        Every gap &gt; 1.7s between your casts, measured from end-of-GCD to next
        cast start. Total dead time: {formatDuration(totalDeadTimeMs)} (
        {gaps.length} gap{gaps.length === 1 ? "" : "s"}).
      </p>
      {longestGaps.length > 0 && (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {longestGaps.map((gap) => (
            <li key={gap.startMs}>
              <a
                href={buildFightTimeUrl(
                  host,
                  reportCode,
                  fight.id,
                  gap.startMs,
                  gap.endMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(gap.startMs - fight.startTime)} for{" "}
                {formatDuration(gap.durationMs)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
