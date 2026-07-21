import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeHotClipDetection,
  type HotClipDetectionResult,
} from "../../../metrics/hotClipDetection";
import { mixedJudgement } from "../../../metrics/judgement";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import { DataTable } from "../ui/DataTable";
import { JudgementChip } from "../ui/JudgementChip";
import { useArchetypeBucket } from "../Scorecard/useArchetypeBucket";

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
  "A refresh counts as a clip if the existing aura had > 1 tick (> 3s) remaining. Clips consumed by Swiftmend are excluded; that's audited separately under Spell discipline. Rejuvenation's clip rate always drives this card's judgement (good < 5%, fair 5-15%, bad > 15% of its casts). For a deep-resto (Tree of Life-eligible) druid, Regrowth's clip rate is shown for information only and never turns this bad; in Tree of Life form, Regrowth is the only direct heal available without a cooldown (Healing Touch forces a shapeshift out of form), so once Swiftmend is on cooldown, spamming Regrowth for its direct-heal component is the correct response to burst damage, even though it clips Regrowth's own HoT tail as a side effect. For every other detected archetype (which never reaches Tree of Life and so keeps Healing Touch available with no form-swap tax), Regrowth's clip rate is judged by the same bands as Rejuvenation's and also feeds this card's judgement. A failed talent read (archetype undetermined) is treated like deep-resto here: informational only, since Tree of Life eligibility can't be ruled out.";

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
  const archetypeStatus = useArchetypeBucket(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const archetypeBucket =
    archetypeStatus.status === "ready" ? archetypeStatus.bucket : undefined;

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
            archetypeBucket,
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
    archetypeBucket,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="HoT clip detection"
        threshold={THRESHOLD}
        rationaleSlug="rejuv-clip-share"
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={ICON}
        title="HoT clip detection"
        threshold={THRESHOLD}
        rationaleSlug="rejuv-clip-share"
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { rejuvenation, regrowth, clipEvents } = result.result;
  // Regrowth only carries a judgement for a non-deep-resto archetype (story
  // 914) — mixedJudgement folds it in when present, matching how it never
  // affected the verdict before this story shipped.
  const judgement = mixedJudgement([
    rejuvenation.judgement,
    regrowth.judgement ?? null,
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
      rationaleSlug="rejuv-clip-share"
    >
      <DataTable
        columns={["Spell", "Casts", "Clips", "Clip %", "Judgement"]}
        rows={[
          [
            rejuvenation.spell,
            `${rejuvenation.castCount}`,
            `${rejuvenation.clipCount}`,
            `${rejuvenation.clipPct.toFixed(1)}%`,
            <JudgementChip judgement={rejuvenation.judgement} />,
          ],
          [
            regrowth.spell,
            `${regrowth.castCount}`,
            `${regrowth.clipCount}`,
            `${regrowth.clipPct.toFixed(1)}%`,
            regrowth.judgement === undefined ? (
              "n/a"
            ) : (
              <JudgementChip judgement={regrowth.judgement} />
            ),
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
                {formatDuration(clip.timestampMs - fight.startTime)} ·{" "}
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
