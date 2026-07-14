import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeDownrankingDiscipline,
  type DownrankingDisciplineResult,
} from "../../../metrics/downrankingDiscipline";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { ClassTag } from "../ui/ClassTag";

export interface DownrankingDisciplineCardProps {
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
  | { accessToken: string; result: DownrankingDisciplineResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_resistnature.jpg";

const THRESHOLD =
  "Flag: a max-rank Regrowth or Healing Touch cast whose direct-heal component averaged > 50% overheal at that rank — a sign the max rank should have been downranked. Green 0 flags, orange 1-2 flags (never red — at most one flaggable group per spell). Rejuvenation is shown for visibility only and is never flagged: it's a pure HoT, and HoT-tick overheal is too entangled with raid overlap and situational calls (e.g. deliberately downranking for threat management) to safely judge from logs alone.";

function formatRank(rank: number | null, isMaxRank: boolean): string {
  if (rank === null) return "Rank —";
  return isMaxRank ? `Rank ${rank} (max)` : `Rank ${rank}`;
}

export function DownrankingDisciplineCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  fetchEvents,
}: DownrankingDisciplineCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([castEvents, healingEvents]) => {
        const computed = computeDownrankingDiscipline(
          castEvents,
          healingEvents,
          druidId,
          resolvedAbilities,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate downranking discipline.",
        }),
      );
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
        title="Downranking discipline"
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
        title="Downranking discipline"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { breakdown, flaggedCount, judgement } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Downranking discipline"
      value={`${flaggedCount} flagged max-rank cast${flaggedCount === 1 ? "" : "s"}`}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      {breakdown.length === 0 ? (
        <p>No Rejuvenation, Regrowth, or Healing Touch casts this fight.</p>
      ) : (
        <DataTable
          columns={[
            "Spell",
            "Rank",
            "Casts",
            "Avg effective heal",
            "Direct overheal %",
            "",
          ]}
          rows={breakdown.map((row) => [
            row.spell,
            formatRank(row.rank, row.isMaxRank),
            `${row.castCount}`,
            Math.round(row.avgEffectiveHeal).toLocaleString(),
            `${row.directOverhealPct.toFixed(0)}%`,
            row.flagged ? <ClassTag tone="flagged">Flagged</ClassTag> : "",
          ])}
        />
      )}
    </MetricCard>
  );
}
