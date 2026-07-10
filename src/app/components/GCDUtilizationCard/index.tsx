import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeGcdUtilization,
  type GcdUtilizationResult,
} from "../../../metrics/gcdUtilization";
import { formatDuration } from "../../../report/fightRows";

export interface GCDUtilizationCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: GcdUtilizationResult }
  | { accessToken: string; error: string };

const JUDGEMENT_LABEL: Record<GcdUtilizationResult["judgement"], string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function GCDUtilizationCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GCDUtilizationCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const computed = computeGcdUtilization(
          events,
          druidId,
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
              : "Failed to calculate GCD utilization.",
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
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
          <p>Active time: {formatDuration(result.result.activeTimeMs)}</p>
          <p>
            GCD utilization: {Math.round(result.result.utilizationPct)}% —{" "}
            {JUDGEMENT_LABEL[result.result.judgement]}
          </p>
          <p>
            Ceiling: ~40 casts/min at 0% haste (60s ÷ 1.5s GCD) — 100% is a
            theoretical maximum, not a target.
          </p>
        </>
      )}
    </section>
  );
}
