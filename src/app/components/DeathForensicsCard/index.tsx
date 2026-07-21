import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeDeathForensics,
  type DeathForensicsResult,
} from "../../../metrics/deathForensics";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DeathCard } from "../ui/DeathCard";
import { Alert } from "../ui/Alert";
import {
  parseTalentPoints,
  SWIFTMEND_MIN_RESTORATION,
  NATURES_SWIFTNESS_MIN_RESTORATION,
} from "../../../report/archetypeDetection";

export interface DeathForensicsCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  lifebloomAbilityIds: Set<number>;
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
  | { accessToken: string; result: DeathForensicsResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg";

const THRESHOLD =
  "For each friendly death: target, time, LB3 status on that target, Swiftmend CD state, Nature's Swiftness CD state, and whether you were idle (a GCD available) in the preceding 5s. Only maintained targets (>=30% Lifebloom uptime) are judged — good 0 unspent resources, fair 1, bad >=2 of {Swiftmend ready, Nature's Swiftness ready, idle-with-a-GCD-available}. LB3 status is shown for context but doesn't count toward that tally. A death is not automatically the druid's fault — this audits your readiness only, not target selection, assignments, or positioning.";

export function DeathForensicsCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  swiftmendAbilityIds,
  naturesSwiftnessAbilityIds,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: DeathForensicsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Deaths"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo"),
    ])
      .then(([deathEvents, castEvents, buffEvents, combatantInfoEvents]) => {
        try {
          const talents = parseTalentPoints(combatantInfoEvents, druidId);
          const restoration = talents === null ? 0 : talents[2];
          const computed = computeDeathForensics(
            deathEvents,
            castEvents,
            buffEvents,
            druidId,
            swiftmendAbilityIds,
            naturesSwiftnessAbilityIds,
            lifebloomAbilityIds,
            restoration >= SWIFTMEND_MIN_RESTORATION,
            restoration >= NATURES_SWIFTNESS_MIN_RESTORATION,
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
                : "Failed to calculate the per-death resource audit.",
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
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Per-death resource audit"
        threshold={THRESHOLD}
        rationaleSlug="death-forensics"
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={ICON}
        title="Per-death resource audit"
        threshold={THRESHOLD}
        rationaleSlug="death-forensics"
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { deaths, flaggedCount, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Per-death resource audit"
      value={
        deaths.length === 0
          ? "No friendly deaths"
          : `${flaggedCount} of ${deaths.length} deaths flagged`
      }
      judgement={judgement}
      threshold={THRESHOLD}
      rationaleSlug="death-forensics"
    >
      {deaths.length === 0 ? (
        <p>No friendly deaths this fight.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {deaths.map((death) => (
            <DeathCard
              key={`${death.targetId}-${death.timestampMs}`}
              target={
                targetNames.get(death.targetId) ?? `Target #${death.targetId}`
              }
              time={
                <a
                  href={buildFightTimeUrl(
                    host,
                    reportCode,
                    fight.id,
                    death.timestampMs,
                    death.timestampMs,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  {formatDuration(death.timestampMs - fight.startTime)}
                </a>
              }
              maintained={death.maintained}
              lb3={death.lb3Rolling}
              swiftmendReady={death.swiftmendReady}
              nsReady={death.nsReady}
              idlePreceding={death.idlePreceding}
              judgement={death.judgement}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="warning">
          A death is not automatically the druid&apos;s fault; this audits your
          readiness only — not target selection, assignments, or positioning.
        </Alert>
      </div>
    </MetricCard>
  );
}
