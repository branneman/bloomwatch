import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computeAccidentalBlooms,
  type AccidentalBloomsResult,
} from "../../../metrics/accidentalBlooms";
import type { Host } from "../../../report/parseReportInput";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { MetricCard } from "../ui/MetricCard";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";

export interface AccidentalBloomsCardProps {
  accessToken: string;
  reportCode: string;
  host: Host;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
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
  | { accessToken: string; result: AccidentalBloomsResult }
  | { accessToken: string; error: string };

const THRESHOLD =
  "Good 0, fair 1–2, bad ≥ 3 per fight. An accidental bloom is a re-application of Lifebloom on the same target within 3s of it blooming; the stack was rebuilt, not deliberately reset.";

export function AccidentalBloomsCard({
  accessToken,
  reportCode,
  host,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: AccidentalBloomsCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing", true),
    ])
      .then(([buffEvents, healEvents]) => {
        try {
          const computed = computeAccidentalBlooms(
            buffEvents,
            healEvents,
            druidId,
            lifebloomAbilityIds,
          );
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate accidental blooms.",
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
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Accidental blooms"
        threshold={THRESHOLD}
        rationaleSlug="accidental-blooms"
      >
        <p>Calculating…</p>
      </MetricCard>
    );
  }

  if ("error" in result) {
    return (
      <MetricCard
        icon={lifebloomIcon}
        title="Accidental blooms"
        threshold={THRESHOLD}
        rationaleSlug="accidental-blooms"
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { accidentalBlooms, count, judgement } = result.result;

  return (
    <MetricCard
      icon={lifebloomIcon}
      title="Accidental blooms"
      value={`${count}`}
      judgement={judgement}
      threshold={THRESHOLD}
      rationaleSlug="accidental-blooms"
    >
      {accidentalBlooms.length === 0 ? (
        <p>No accidental blooms this fight.</p>
      ) : (
        <ul
          style={{
            margin: "0 0 4px",
            paddingLeft: "16px",
            fontSize: "var(--text-small-size)",
          }}
        >
          {accidentalBlooms.map((bloom) => (
            <li key={`${bloom.timestampMs}-${bloom.targetId}`}>
              <a
                href={buildFightTimeUrl(
                  host,
                  reportCode,
                  fight.id,
                  bloom.timestampMs,
                  bloom.timestampMs,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {formatDuration(bloom.timestampMs - fight.startTime)} ·{" "}
                {targetNames.get(bloom.targetId) ?? `Target #${bloom.targetId}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
