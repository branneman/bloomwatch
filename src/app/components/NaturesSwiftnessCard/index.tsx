import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeNaturesSwiftnessAudit,
  type NaturesSwiftnessAuditResult,
  type NaturesSwiftnessFollowUp,
} from "../../../metrics/naturesSwiftnessAudit";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";
import { NATURES_SWIFTNESS_MIN_RESTORATION } from "../../../report/archetypeDetection";

export interface NaturesSwiftnessCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  naturesSwiftnessAbilityIds: Set<number>;
  resolvedAbilities: Map<number, ResolvedAbility>;
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
  | { accessToken: string; result: NaturesSwiftnessAuditResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg";

const THRESHOLD =
  "Reports casts vs. theoretical availability (3 min cooldown). Informational — no judgement; Nature's Swiftness is situational by design. Unused-while-available during a raid death is cross-referenced separately in the death forensics audit.";

function formatFollowUp(
  followUp: NaturesSwiftnessFollowUp | null,
  targetNames: Map<number, string>,
): string {
  if (followUp === null) return "no follow-up cast recorded";
  const rankLabel = followUp.rank !== null ? ` (Rank ${followUp.rank})` : "";
  const targetLabel =
    followUp.targetId === undefined
      ? "an unknown target"
      : (targetNames.get(followUp.targetId) ?? `Target #${followUp.targetId}`);
  return `followed by ${followUp.spell}${rankLabel} on ${targetLabel}`;
}

export function NaturesSwiftnessCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  naturesSwiftnessAbilityIds,
  resolvedAbilities,
  targetNames,
  fetchEvents,
}: NaturesSwiftnessCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  const archetypeStatus = useArchetypeBucket(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );

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
          const computed = computeNaturesSwiftnessAudit(
            events,
            druidId,
            naturesSwiftnessAbilityIds,
            resolvedAbilities,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the Nature's Swiftness audit.",
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
    naturesSwiftnessAbilityIds,
    resolvedAbilities,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Nature's Swiftness audit"
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
        icon={ICON}
        title="Nature's Swiftness audit"
        note="Informational — no judgement"
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
        title="Nature's Swiftness audit"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if (
    archetypeStatus.status === "ready" &&
    archetypeStatus.restoration < NATURES_SWIFTNESS_MIN_RESTORATION
  ) {
    return (
      <MetricCard
        icon={ICON}
        title="Nature's Swiftness audit"
        note="Informational — no judgement"
        threshold={THRESHOLD}
      >
        <p>
          Not shown — this build can&apos;t take Nature&apos;s Swiftness (needs{" "}
          {NATURES_SWIFTNESS_MIN_RESTORATION}+ Restoration points; this
          fight&apos;s build has {archetypeStatus.restoration}).
        </p>
      </MetricCard>
    );
  }

  const { casts, castCount, availableWindows } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Nature's Swiftness audit"
      value={`Used ${castCount}× of ${availableWindows} available windows`}
      note="Informational — no judgement"
      threshold={THRESHOLD}
    >
      {castCount === 0 ? (
        <p>Nature&apos;s Swiftness was not cast this fight.</p>
      ) : (
        <ul
          style={{
            margin: 0,
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {casts.map((cast) => (
            <li key={cast.timestampMs}>
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
              </a>{" "}
              — {formatFollowUp(cast.followUp, targetNames)}
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
