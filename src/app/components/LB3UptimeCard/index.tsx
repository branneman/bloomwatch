import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeLb3Uptime,
  type Lb3UptimeResult,
} from "../../../metrics/lb3Uptime";
import { MetricCard } from "../ui/MetricCard";
import { JudgementChip } from "../ui/JudgementChip";
import { ProgressBar } from "../ui/ProgressBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface LB3UptimeCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: Lb3UptimeResult }
  | { accessToken: string; error: string };

export function LB3UptimeCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: LB3UptimeCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then((events) => {
        try {
          const computed = computeLb3Uptime(
            events,
            druidId,
            lifebloomAbilityIds,
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
                : "Failed to calculate LB3 uptime.",
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
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  const threshold =
    "Measured from first reaching 3 stacks. Green ≥ 90%, orange 75–90%, red < 75%, per target. Only targets with ≥ 30% overall LB uptime are shown — one-off casts don't count as maintained.";

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="LB3 uptime per target"
        threshold={threshold}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="LB3 uptime per target"
        threshold={threshold}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="LB3 uptime per target"
      threshold={threshold}
    >
      {result.result.targets.length === 0 ? (
        <p>No maintained targets.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {result.result.targets.map((target) => (
            <div key={target.targetId}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "var(--text-small-size)",
                }}
              >
                <span>
                  {targetNames.get(target.targetId) ??
                    `Target #${target.targetId}`}
                </span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <strong style={{ color: "var(--text-h)" }}>
                    {Math.round(target.lb3UptimePct)}%
                  </strong>
                  <JudgementChip judgement={target.judgement} />
                </span>
              </div>
              <ProgressBar
                pct={Math.min(100, target.lb3UptimePct)}
                judgement={target.judgement}
              />
            </div>
          ))}
        </div>
      )}
    </MetricCard>
  );
}
