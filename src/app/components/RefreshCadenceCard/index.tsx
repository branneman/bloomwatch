import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeRefreshCadence,
  type RefreshCadenceResult,
  type RefreshCadenceBucketLabel,
} from "../../../metrics/refreshCadence";
import { MetricCard } from "../ui/MetricCard";
import { Histogram } from "../ui/Histogram";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface RefreshCadenceCardProps {
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
}

type FetchResult =
  | { accessToken: string; result: RefreshCadenceResult }
  | { accessToken: string; error: string };

const BUCKET_LABEL: Record<RefreshCadenceBucketLabel, string> = {
  redEarly: "< 5s",
  orange: "5–6s",
  green: "6–7s",
  redLate: "> 7s",
};

const BUCKET_COLOR: Record<RefreshCadenceBucketLabel, string> = {
  redEarly: "var(--judgement-red)",
  orange: "var(--judgement-orange)",
  green: "var(--judgement-green)",
  redLate: "var(--judgement-red)",
};

const THRESHOLD =
  "Only refreshes on targets already at 3 stacks count. Buckets and median R/O/G share the same bands: red < 5s, orange 5–6s, green 6–7s, red > 7s — a late refresh risks an accidental bloom, counted separately by the accidental-bloom counter below.";

export function RefreshCadenceCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  fetchEvents,
}: RefreshCadenceCardProps) {
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
          const computed = computeRefreshCadence(
            events,
            druidId,
            lifebloomAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate refresh cadence.",
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

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Refresh cadence"
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
        title="Refresh cadence"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { result: cadence } = result;

  if (cadence.medianMs === null) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Refresh cadence"
        threshold={THRESHOLD}
      >
        <p>No 3-stack refreshes recorded this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Refresh cadence"
      value={`Median ${(cadence.medianMs / 1000).toFixed(1)}s`}
      judgement={cadence.judgement}
      threshold={THRESHOLD}
    >
      <p style={{ fontSize: "var(--text-small-size)", margin: "0 0 4px" }}>
        Interval between your Lifebloom refreshes on 3-stacked targets — too
        early wastes mana and GCDs, too late risks an accidental bloom.
      </p>
      <Histogram
        buckets={cadence.buckets.map((bucket) => ({
          label: BUCKET_LABEL[bucket.label],
          pct: bucket.pct,
          color: BUCKET_COLOR[bucket.label],
        }))}
      />
    </MetricCard>
  );
}
