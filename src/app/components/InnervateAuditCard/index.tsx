import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  computeInnervateAudit,
  type ActorClass,
  type InnervateAuditResult,
} from "../../../metrics/innervateAudit";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";

export interface InnervateAuditCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  actorClasses: Map<number, ActorClass>;
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
  | { accessToken: string; result: InnervateAuditResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_lightning.jpg";

const THRESHOLD =
  "Only the first Innervate cast of the fight is judged (a 2nd is possible on a long fight thanks to the 3-min cooldown, but is listed as informational context only). Red if never cast on a fight that's mana-constrained (own mana dropped below 70% at some point) and at least 3 minutes long. Cast on another player: green if they're a mana-using class/spec, red if not (mana wasted on a Warrior, Rogue, or Feral-spec Druid). Self-cast: green normally, orange if cast in the fight's final 10%.";

function describeTarget(
  cast: {
    isSelfCast: boolean;
    targetId: number;
    targetClass: ActorClass | undefined;
  },
  targetNames: Map<number, string>,
): string {
  if (cast.isSelfCast) return "self";
  const name = targetNames.get(cast.targetId) ?? `Target #${cast.targetId}`;
  return cast.targetClass ? `${name} (${cast.targetClass.class})` : name;
}

export function InnervateAuditCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  resolvedAbilities,
  actorClasses,
  targetNames,
  fetchEvents,
}: InnervateAuditCardProps) {
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
        const computed = computeInnervateAudit(
          events,
          druidId,
          resolvedAbilities,
          actorClasses,
          fight.endTime - fight.startTime,
          fight.startTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate the Innervate audit.",
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
    actorClasses,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard icon={ICON} title="Innervate audit" threshold={THRESHOLD}>
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard icon={ICON} title="Innervate audit" threshold={THRESHOLD}>
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { firstCast, laterCasts, judgement } = result.result;

  if (firstCast === null) {
    return (
      <MetricCard
        icon={ICON}
        title="Innervate audit"
        value="Not cast this fight"
        judgement={judgement}
        note={
          judgement === null
            ? "Informational — not mana-constrained, or under 3 minutes"
            : undefined
        }
        threshold={THRESHOLD}
      >
        <p>Innervate was not cast this fight.</p>
      </MetricCard>
    );
  }

  return (
    <MetricCard
      icon={ICON}
      title="Innervate audit"
      value={`Cast at ${formatDuration(firstCast.timestampMs - fight.startTime)}, ${describeTarget(firstCast, targetNames)}`}
      judgement={firstCast.judgement}
      threshold={THRESHOLD}
    >
      <p>
        {firstCast.isSelfCast
          ? "Own"
          : `${describeTarget(firstCast, targetNames)}'s`}{" "}
        mana at cast:{" "}
        {firstCast.manaPct === null
          ? "unknown"
          : `${Math.round(firstCast.manaPct)}%`}
        .
      </p>
      {laterCasts.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {laterCasts.map((cast) => (
            <li key={cast.timestampMs}>
              Also cast at{" "}
              <a
                href={buildFightTimeUrl(
                  reportCode,
                  fight.id,
                  cast.timestampMs,
                  cast.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(cast.timestampMs - fight.startTime)}
              </a>
              , {describeTarget(cast, targetNames)} (informational — only the
              first cast is judged).
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
