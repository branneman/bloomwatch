import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeIdleGaps,
  type IdleGapsResult,
} from "../../../metrics/idleGaps";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";

export interface IdleGapsCardProps {
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
  | { accessToken: string; result: IdleGapsResult }
  | { accessToken: string; error: string };

const JUDGEMENT_LABEL: Record<IdleGapsResult["judgement"], string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
};

export function IdleGapsCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: IdleGapsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const computed = computeIdleGaps(
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
              : "Failed to calculate idle gaps.",
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
          <p>
            Total dead time: {formatDuration(result.result.totalDeadTimeMs)} (
            {Math.round(result.result.deadTimePct)}% of fight) —{" "}
            {JUDGEMENT_LABEL[result.result.judgement]}
          </p>
          <p>Idle gaps &gt; 1.7s: {result.result.gaps.length}</p>
          {result.result.longestGaps.length > 0 && (
            <ul>
              {result.result.longestGaps.map((gap) => (
                <li key={gap.startMs}>
                  <a
                    href={buildFightTimeUrl(
                      reportCode,
                      fight.id,
                      gap.startMs,
                      gap.endMs,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatDuration(gap.startMs - fight.startTime)} for{" "}
                    {formatDuration(gap.durationMs)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
