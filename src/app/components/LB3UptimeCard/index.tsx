import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeLb3Uptime,
  type Lb3UptimeResult,
} from "../../../metrics/lb3Uptime";
import type { Judgement } from "../../../metrics/judgement";

export interface LB3UptimeCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: Lb3UptimeResult }
  | { accessToken: string; error: string };

const JUDGEMENT_LABEL: Record<Judgement, string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function LB3UptimeCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: LB3UptimeCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Buffs",
    )
      .then((events) => {
        const computed = computeLb3Uptime(
          events,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        setResult({ accessToken, result: computed });
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error
              ? err.message
              : "Failed to calculate LB3 uptime.",
        }),
      );
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

  return (
    <section>
      <h3>{fight.name}</h3>
      {!isCurrent && <p>Calculating…</p>}
      {isCurrent && "error" in result && <p role="alert">{result.error}</p>}
      {isCurrent && !("error" in result) && (
        <>
          {result.result.targets.length === 0 ? (
            <p>No maintained targets.</p>
          ) : (
            <ul>
              {result.result.targets.map((target) => (
                <li key={target.targetId}>
                  {targetNames.get(target.targetId) ??
                    `Target #${target.targetId}`}
                  : {Math.round(target.lb3UptimePct)}% —{" "}
                  {JUDGEMENT_LABEL[target.judgement]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
