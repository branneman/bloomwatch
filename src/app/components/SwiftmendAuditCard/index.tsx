import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeSwiftmendAudit,
  combineSwiftmendCardJudgement,
  type SwiftmendAuditResult,
  type SwiftmendClassification,
} from "../../../metrics/swiftmendAudit";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { ClassTag } from "../ui/ClassTag";
import { JudgementChip } from "../ui/JudgementChip";
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
  "Classification: efficient (consumed HoT ≤ 3s remaining, regardless of HP), emergency (not efficient, and target ≤ 50% HP), wasteful (neither). Good < 40% wasteful, fair 40-80%, bad > 80% of Swiftmend casts. Target HP% is read from the most recent Healing event on that target before the cast; if damage landed in the gap between that sample and the cast, the true HP may have been lower than shown. Utilization (casts vs. 15s-cooldown availability): good ≥50%, fair 25-50%, bad <25%, provisional pending real calibration. The header chip combines both judgements, with efficiency weighing heavier; a bad utilization can drag a good/fair efficiency down one notch, but never the reverse.";

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
        rationaleSlug="swiftmend-quality-audit"
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
        rationaleSlug="swiftmend-quality-audit"
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
        rationaleSlug="swiftmend-quality-audit"
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
        rationaleSlug="swiftmend-quality-audit"
      >
        <p>
          Not shown: this fight&apos;s talent data couldn&apos;t be read, so
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
        rationaleSlug="swiftmend-quality-audit"
      >
        {archetypeStatus.bucket === "unknown-no-talent-data" ? (
          <p>
            Not shown: this fight&apos;s talent data couldn&apos;t be read, so
            eligibility for Swiftmend (needs {SWIFTMEND_MIN_RESTORATION}+
            Restoration points) can&apos;t be confirmed.
          </p>
        ) : (
          <p>
            Not shown: this build can&apos;t take Swiftmend (needs{" "}
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
    utilizationPct,
    utilizationJudgement,
  } = result.result;

  const headerJudgement = combineSwiftmendCardJudgement(
    judgement,
    utilizationJudgement,
  );

  return (
    <MetricCard
      icon={ICON}
      title="Swiftmend quality audit"
      value={`${wastefulCount} wasteful of ${casts.length} (${wastefulPct.toFixed(0)}%)`}
      judgement={headerJudgement}
      threshold={THRESHOLD}
      rationaleSlug="swiftmend-quality-audit"
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
            cast.targetHpPct === null ? "n/a" : `${cast.targetHpPct}%`,
            <ClassTag tone={cast.classification}>
              {CLASSIFICATION_LABEL[cast.classification]}
            </ClassTag>,
          ])}
        />
      )}
      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span>
          {swiftmendCastCount} Swiftmend{swiftmendCastCount === 1 ? "" : "s"}{" "}
          cast of {availableWindows} possible 15s windows ·{" "}
          {utilizationPct.toFixed(0)}% utilization
        </span>
        <JudgementChip judgement={utilizationJudgement} />
      </p>
    </MetricCard>
  );
}
