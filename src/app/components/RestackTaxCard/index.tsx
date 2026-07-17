import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeRestackTax,
  type RestackTaxResult,
} from "../../../metrics/restackTax";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface RestackTaxCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
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
  | { accessToken: string; result: RestackTaxResult }
  | { accessToken: string; error: string };

const THRESHOLD =
  "R/O/G scales with fight length: roughly one green-tier cast per 2 minutes elapsed, one orange-tier cast per minute elapsed. Each target's first ramp to 3 stacks is free — only casts that rebuild a stack after it was already established count, at an estimated 220 mana each (Lifebloom's flat TBC base cost, not adjusted for talents or gear).";

export function RestackTaxCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: RestackTaxCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
    ])
      .then(([buffEvents, castEvents]) => {
        try {
          const computed = computeRestackTax(
            buffEvents,
            castEvents,
            druidId,
            lifebloomAbilityIds,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate re-stack tax.",
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
        title="Re-stack tax"
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
        title="Re-stack tax"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { casts, castCount, estimatedMana, judgement } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Re-stack tax"
      value={`${castCount} casts · ~${estimatedMana} mana`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {casts.length === 0 ? (
        <p>No re-stack tax this fight.</p>
      ) : (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {casts.map((cast) => (
            <li key={`${cast.timestampMs}-${cast.targetId}`}>
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
                {formatDuration(cast.timestampMs - fight.startTime)} —{" "}
                {targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
