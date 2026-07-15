import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeManaCurve,
  type ManaCurveResult,
} from "../../../metrics/manaCurve";
import { MetricCard } from "../ui/MetricCard";
import { ManaCurve } from "../ui/ManaCurve";

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_elemental_primal_mana.jpg";

const THRESHOLD =
  "Green 5–40% ending mana, orange 40–70% or 0–5%, red > 70% (hoarding) — kills only. Fights under 90s, and wipes, auto-downgrade to informational: short/easy fights make this metric moot. Ending mana is read from the druid's last cast of the fight, so it may be stale if that cast landed well before the kill.";

export interface ManaCurveCardProps {
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
  | { accessToken: string; result: ManaCurveResult }
  | { accessToken: string; error: string };

function informationalNote(fight: Fight): string | undefined {
  if (fight.kill !== true) return "Informational — not a kill";
  if (fight.endTime - fight.startTime < 90_000)
    return "Informational — fight under 90s";
  return undefined;
}

export function ManaCurveCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: ManaCurveCardProps) {
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
          const computed = computeManaCurve(
            events,
            druidId,
            fight.kill === true,
            fight.endTime - fight.startTime,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the mana curve.",
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
    fight.kill,
    druidId,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Mana curve & ending mana"
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
        title="Mana curve & ending mana"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { points, endingPct, judgement } = result.result;

  if (endingPct === null) {
    return (
      <MetricCard
        icon={ICON}
        title="Mana curve & ending mana"
        note="Informational — no mana data"
        threshold={THRESHOLD}
      >
        <p>No mana samples were found for this druid this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Mana curve & ending mana"
      value={`Ending mana: ${Math.round(endingPct)}%`}
      judgement={judgement}
      note={judgement === null ? informationalNote(fight) : undefined}
      threshold={THRESHOLD}
    >
      <ManaCurve
        points={points}
        fightStartMs={fight.startTime}
        fightEndMs={fight.endTime}
        endingPct={endingPct}
      />
    </MetricCard>
  );
}
