import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeHotClipDetection,
  type HotClipDetectionResult,
} from "../../../metrics/hotClipDetection";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";

export interface HotClipDetectionCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
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
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: HotClipDetectionResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_empoweredrejuvination.jpg";

const THRESHOLD =
  "A refresh counts as a clip if the existing aura had > 1 tick (> 3s) remaining. Clips consumed by Swiftmend are excluded — that's audited separately by story 302. Only Rejuvenation's clip rate drives this card's judgement (good < 5%, fair 5-15%, bad > 15% of its casts) — Regrowth's clip rate is shown for information only and never turns this bad. In Tree of Life form, Regrowth is the only direct heal available without a cooldown (Healing Touch forces a shapeshift out of form), so once Swiftmend is on cooldown, spamming Regrowth for its direct-heal component is the correct response to burst damage — even though it clips Regrowth's own HoT tail as a side effect. Judging that the same as a clipped Rejuvenation, whose entire purpose is the HoT, would punish a druid for correctly prioritizing direct healing.";

export function HotClipDetectionCard({
  accessToken,
  reportCode,
  host,
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
      fetchEvents(accessToken, reportCode, fightArg, "Casts", true),
    ])
      .then(([buffEvents, castEvents]) => {
        try {
          const computed = computeHotClipDetection(
            buffEvents,
            castEvents,
            druidId,
            rejuvenationAbilityIds,
            regrowthAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate HoT clip detection.",
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
  // Regrowth clipping is informational only and never affects this
  // judgement — see the threshold text and docs/backlog.md story 301.
  const judgement = rejuvenation.judgement;
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
                  host,
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
