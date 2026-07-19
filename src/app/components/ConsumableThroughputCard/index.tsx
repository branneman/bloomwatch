import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeConsumableThroughput,
  type ConsumableThroughputResult,
} from "../../../metrics/consumableThroughput";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { JudgementChip } from "../ui/JudgementChip";

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_sealofkings.jpg";

const THRESHOLD =
  "Expected floor per consumable = ⌊fight duration / 120s⌋, for fights where mana dropped below 70% at any point (fights that never did are exempt). Good ≥ floor, fair = floor − 1, bad ≤ floor − 2. Dark Rune and Demonic Rune share one in-game cooldown, so they're counted together as one Rune row rather than judged separately.";

export interface ConsumableThroughputCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: ConsumableThroughputResult }
  | { accessToken: string; error: string };

export function ConsumableThroughputCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: ConsumableThroughputCardProps) {
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
          const computed = computeConsumableThroughput(
            events,
            druidId,
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
                : "Failed to calculate consumable throughput.",
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
    resolvedAbilities,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Consumable throughput"
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
        title="Consumable throughput"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { exempt, rows, judgement } = result.result;

  if (exempt) {
    return (
      <MetricCard
        icon={ICON}
        title="Consumable throughput"
        note="Informational — mana never dropped below 70%"
        threshold={THRESHOLD}
      >
        <p>
          Mana never dropped below 70% this fight, so no consumable floor
          applies.
        </p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Consumable throughput"
      judgement={judgement}
      threshold={THRESHOLD}
    >
      <DataTable
        columns={["Consumable", "Used", "Expected floor", "Judgement"]}
        rows={rows.map((row) => [
          row.label,
          `${row.used}`,
          `${row.expectedFloor}`,
          <JudgementChip judgement={row.judgement} />,
        ])}
      />
    </MetricCard>
  );
}
