import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeOverhealTable,
  type OverhealCategory,
  type OverhealTableResult,
} from "../../../metrics/overhealTable";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { JudgementChip } from "../ui/JudgementChip";

export interface OverhealTableCardProps {
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
  | { accessToken: string; result: OverhealTableResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_lightningoverload.jpg";

const THRESHOLD =
  "Separate thresholds by heal type. Bloom overheal (Lifebloom): green < 40%, orange 40-70%, red > 70%. Direct heal overheal (Regrowth direct, Healing Touch, Swiftmend): green < 30%, orange 30-50%, red > 50%. HoT tick overheal (Rejuvenation, Regrowth's HoT portion) is shown for context only, with no judgement of its own — high overheal is inherent to HoTs whose ticks often land on a target other healers are also topping off.";

const CATEGORY_LABEL: Record<OverhealCategory, string> = {
  "hot-tick": "HoT tick (informational)",
  bloom: "Bloom",
  direct: "Direct",
};

export function OverhealTableCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: OverhealTableCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Healing",
      true,
    )
      .then((healingEvents) => {
        try {
          const computed = computeOverhealTable(
            healingEvents,
            druidId,
            resolvedAbilities,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate the overheal table.",
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
        title="HoT-aware overheal table"
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
        title="HoT-aware overheal table"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { rows, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="HoT-aware overheal table"
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {rows.length === 0 ? (
        <p>No heals to report this fight.</p>
      ) : (
        <DataTable
          columns={["Category", "Spell", "Overheal %", "Judgement"]}
          rows={rows.map((row) => [
            CATEGORY_LABEL[row.category],
            row.spell,
            `${row.overhealPct}%`,
            row.judgement === null ? (
              "—"
            ) : (
              <JudgementChip judgement={row.judgement} />
            ),
          ])}
        />
      )}
    </MetricCard>
  );
}
