import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeConcurrentLb3Targets,
  type ConcurrentLb3Result,
} from "../../../metrics/concurrentLb3Targets";
import { detectCarryInTargets } from "../../../metrics/lifebloomStacks";
import { MetricCard } from "../ui/MetricCard";
import { StackedBar } from "../ui/StackedBar";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

const LOOKBACK_WINDOW_MS = 60_000;

export interface ConcurrentTargetsCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
  fetchLookbackEvents: (
    accessToken: string,
    reportCode: string,
    dataType: WclEventDataType,
    startTime: number,
    endTime: number,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: ConcurrentLb3Result }
  | { accessToken: string; error: string };

const THRESHOLD =
  "Good when 2+ targets held Lifebloom's 3rd stack for at least 50% of the fight — a reward-only signal recognizing multi-target maintenance as the skill it is. Never fair or bad: anything below that bar may simply reflect your raid healing assignment, not weaker play.";

const LEVEL_COLORS = [
  "var(--border)",
  "var(--accent-border)",
  "var(--accent)",
  "var(--purple-600)",
];

function colorForLevel(count: number): string {
  return LEVEL_COLORS[Math.min(count, LEVEL_COLORS.length - 1)];
}

export function ConcurrentTargetsCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
  fetchLookbackEvents,
}: ConcurrentTargetsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then(async (events) => {
        let carryInTargets: ReturnType<typeof detectCarryInTargets>;
        try {
          // Compute-stage, same as computeConcurrentLb3Targets below: a
          // throw here is a bug in the metrics layer, not a fetch failure,
          // so it renders the local card error rather than bubbling to the
          // outer .catch (which is reserved for genuine fetch failures
          // already escalated globally — see the comment there).
          carryInTargets = detectCarryInTargets(
            events,
            druidId,
            lifebloomAbilityIds,
          );
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate concurrent LB3 targets.",
          });
          return;
        }

        const lookbackEvents =
          carryInTargets.length > 0
            ? await fetchLookbackEvents(
                accessToken,
                reportCode,
                "Buffs",
                fight.startTime - LOOKBACK_WINDOW_MS,
                fight.startTime,
                true,
              )
            : undefined;

        try {
          const computed = computeConcurrentLb3Targets(
            events,
            druidId,
            lifebloomAbilityIds,
            fight.startTime,
            fight.endTime,
            lookbackEvents,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate concurrent LB3 targets.",
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
    fetchLookbackEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Concurrent LB3 targets"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Concurrent LB3 targets"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { avgConcurrent, peakConcurrent, levels, judgement } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Concurrent LB3 targets"
      value={`Avg ${avgConcurrent.toFixed(1)} · Peak ${peakConcurrent}`}
      judgement={judgement}
      note={judgement === null ? "Informational — no judgement" : undefined}
      threshold={THRESHOLD}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 12px" }}>
        How many targets simultaneously had your LB3, as a share of the fight.
        Maintaining multiple tanks at once is recognized as the skill it is.
      </p>
      <StackedBar
        segments={levels.map((level) => ({
          label: `${level.count} target${level.count === 1 ? "" : "s"}`,
          pct: level.pct,
          color: colorForLevel(level.count),
        }))}
      />
    </MetricCard>
  );
}
