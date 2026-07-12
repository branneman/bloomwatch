import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeHotClipDetection,
  type HotClipDetectionResult,
} from "../../../metrics/hotClipDetection";
import { worstJudgement } from "../../../metrics/epicSummary";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";

export interface HotClipDetectionCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: HotClipDetectionResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_empoweredrejuvination.jpg";

const THRESHOLD =
  "A refresh counts as a clip if the existing aura had > 1 tick (> 3s) remaining. Clips consumed by Swiftmend are excluded — that's audited separately by story 302. Green < 5%, orange 5-15%, red > 15% of that spell's casts.";

export function HotClipDetectionCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  rejuvenationAbilityIds,
  regrowthAbilityIds,
  targetNames,
  fetchEvents,
}: HotClipDetectionCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
    ])
      .then(([buffEvents, castEvents]) => {
        const computed = computeHotClipDetection(
          buffEvents,
          castEvents,
          druidId,
          rejuvenationAbilityIds,
          regrowthAbilityIds,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate HoT clip detection.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard icon={ICON} title="HoT clip detection" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="HoT clip detection" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { rejuvenation, regrowth, clipEvents } = result.result;
  const judgement = worstJudgement([
    rejuvenation.judgement,
    regrowth.judgement,
  ]);
  const totalCasts = rejuvenation.castCount + regrowth.castCount;
  const totalClips = rejuvenation.clipCount + regrowth.clipCount;
  const overallPct = totalCasts === 0 ? 0 : (totalClips / totalCasts) * 100;

  return (
    <MetricCard
      icon={ICON}
      title="HoT clip detection"
      value={`${overallPct.toFixed(1)}% clipped`}
      pct={overallPct}
      judgement={judgement}
      threshold={THRESHOLD}
    >
      <DataTable
        columns={["Spell", "Casts", "Clips", "Clip %"]}
        rows={[
          [
            rejuvenation.spell,
            `${rejuvenation.castCount}`,
            `${rejuvenation.clipCount}`,
            `${rejuvenation.clipPct.toFixed(1)}%`,
          ],
          [
            regrowth.spell,
            `${regrowth.castCount}`,
            `${regrowth.clipCount}`,
            `${regrowth.clipPct.toFixed(1)}%`,
          ],
        ]}
      />
      {clipEvents.length === 0 ? (
        <p>No HoT clips this fight.</p>
      ) : (
        <ul
          style={{
            margin: "8px 0 0",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {clipEvents.map((clip) => (
            <li key={`${clip.timestampMs}-${clip.targetId}-${clip.spell}`}>
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  clip.timestampMs,
                  clip.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(clip.timestampMs - fight.startTime)} —{" "}
                {clip.spell} on{" "}
                {targetNames.get(clip.targetId) ?? `Target #${clip.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
