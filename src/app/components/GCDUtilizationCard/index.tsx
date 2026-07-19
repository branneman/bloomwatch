import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeGcdUtilization,
  type GcdUtilizationResult,
} from "../../../metrics/gcdUtilization";
import { formatDuration } from "../../../report/fightRows";
import { MetricCard } from "../ui/MetricCard";

const gcdUtilizationIcon =
  "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_sprint.jpg";

export interface GCDUtilizationCardProps {
  accessToken: string;
  reportCode: string;
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
  | { accessToken: string; result: GcdUtilizationResult }
  | { accessToken: string; error: string };

export function GCDUtilizationCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GCDUtilizationCardProps) {
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
          const computed = computeGcdUtilization(
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
                : "Failed to calculate GCD utilization.",
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
    "Good ≥ 85%, fair 70–85%, bad < 70%. ~40 casts/min is the theoretical ceiling at 0% haste (60s ÷ 1.5s GCD) — 100% is not a realistic target, just the ceiling the percentage is measured against.";

  if (!isCurrent) {
    return (
      <MetricCard
        icon={gcdUtilizationIcon}
        title="GCD utilization"
        threshold={threshold}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={gcdUtilizationIcon}
        title="GCD utilization"
        threshold={threshold}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { utilizationPct, activeTimeMs, judgement } = result.result;

  return (
    <MetricCard
      icon={gcdUtilizationIcon}
      title="GCD utilization"
      value={`${Math.round(utilizationPct)}%`}
      pct={Math.min(100, utilizationPct)}
      judgement={judgement}
      threshold={threshold}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        Time spent on the global cooldown (1.5s per instant, actual cast time
        for cast-time spells) as a share of total fight duration. Active time
        this fight: {formatDuration(activeTimeMs)}.
      </p>
    </MetricCard>
  );
}
