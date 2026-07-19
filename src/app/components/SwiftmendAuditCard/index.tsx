import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeSwiftmendAudit,
  type SwiftmendAuditResult,
  type SwiftmendClassification,
} from "../../../metrics/swiftmendAudit";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { ClassTag } from "../ui/ClassTag";
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";
import { SWIFTMEND_MIN_RESTORATION } from "../../../report/archetypeDetection";

export interface SwiftmendAuditCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  swiftmendAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: SwiftmendAuditResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_relics_idolofrejuvenation.jpg";

const THRESHOLD =
  "Classification: efficient (consumed HoT ≤ 3s remaining, regardless of HP), emergency (not efficient, and target ≤ 50% HP), wasteful (neither). Good 0% wasteful, fair ≤ 25%, bad > 25% of Swiftmend casts. Target HP% is read from the most recent Healing event on that target before the cast — if damage landed in the gap between that sample and the cast, the true HP may have been lower than shown. Usage vs. 15s-cooldown availability is informational context only.";

const CLASSIFICATION_LABEL: Record<SwiftmendClassification, string> = {
  efficient: "Efficient",
  emergency: "Emergency",
  wasteful: "Wasteful",
};

export function SwiftmendAuditCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  swiftmendAbilityIds,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  targetNames,
  fetchEvents,
}: SwiftmendAuditCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  const archetypeStatus = useArchetypeBucket(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, castEvents, healingEvents]) => {
        try {
          const computed = computeSwiftmendAudit(
            buffEvents,
            castEvents,
            healingEvents,
            druidId,
            swiftmendAbilityIds,
            rejuvenationAbilityIds,
            regrowthAbilityIds,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the Swiftmend quality audit.",
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
    swiftmendAbilityIds,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  if (archetypeStatus.status === "loading") {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if (archetypeStatus.status === "error") {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        <p>
          Not shown — this fight&apos;s talent data couldn&apos;t be read, so
          eligibility for Swiftmend (needs {SWIFTMEND_MIN_RESTORATION}+
          Restoration points) can&apos;t be confirmed.
        </p>
      </MetricCard>
    );
  }

  if (
    archetypeStatus.status === "ready" &&
    archetypeStatus.restoration < SWIFTMEND_MIN_RESTORATION
  ) {
    return (
      <MetricCard
        icon={ICON}
        title="Swiftmend quality audit"
        threshold={THRESHOLD}
      >
        {archetypeStatus.bucket === "unknown-no-talent-data" ? (
          <p>
            Not shown — this fight&apos;s talent data couldn&apos;t be read, so
            eligibility for Swiftmend (needs {SWIFTMEND_MIN_RESTORATION}+
            Restoration points) can&apos;t be confirmed.
          </p>
        ) : (
          <p>
            Not shown — this build can&apos;t take Swiftmend (needs{" "}
            {SWIFTMEND_MIN_RESTORATION}+ Restoration points; this fight&apos;s
            build has {archetypeStatus.restoration}).
          </p>
        )}
      </MetricCard>
    );
  }

  const {
    casts,
    swiftmendCastCount,
    wastefulCount,
    wastefulPct,
    judgement,
    availableWindows,
  } = result.result;

  const utilizationPct =
    availableWindows === 0 ? 0 : (swiftmendCastCount / availableWindows) * 100;

  return (
    <MetricCard
      icon={ICON}
      title="Swiftmend quality audit"
      value={`${wastefulCount} wasteful of ${casts.length} (${wastefulPct.toFixed(0)}%)`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {casts.length === 0 ? (
        <p>No Swiftmends cast this fight.</p>
      ) : (
        <DataTable
          columns={[
            "Time",
            "Target",
            "HoT consumed",
            "Remaining",
            "Target HP%",
            "Classification",
          ]}
          rows={casts.map((cast) => [
            <a
              href={buildFightTimeUrl(
                host,
                reportCode,
                fight.id,
                cast.timestampMs,
                cast.timestampMs,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {formatDuration(cast.timestampMs - fight.startTime)}
            </a>,
            targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`,
            cast.consumedSpell,
            `${(cast.remainingMs / 1000).toFixed(1)}s`,
            cast.targetHpPct === null ? "—" : `${cast.targetHpPct}%`,
            <ClassTag tone={cast.classification}>
              {CLASSIFICATION_LABEL[cast.classification]}
            </ClassTag>,
          ])}
        />
      )}
      <p>
        {swiftmendCastCount} Swiftmend{swiftmendCastCount === 1 ? "" : "s"} cast
        of {availableWindows} possible 15s windows — {utilizationPct.toFixed(0)}
        % utilization (informational).
      </p>
    </MetricCard>
  );
}
