import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  computePrepHygiene,
  type PrepHygieneResult,
} from "../../../metrics/prepHygiene";
import { MetricCard } from "../ui/MetricCard";
import { ChecklistRow } from "../ui/ChecklistRow";
import { JudgementChip } from "../ui/JudgementChip";
import styles from "./index.module.css";

export interface PrepHygieneCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
    includeResources?: boolean,
  ) => Promise<WclEvent[]>;
}

type FetchResult =
  | { accessToken: string; result: PrepHygieneResult }
  | { accessToken: string; error: string };

const ICON =
  "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg";

const THRESHOLD =
  "Read from combatant-info auras/gear at fight start. Flask/elixir coverage: green with a recognized flask, or with both a battle and a guardian elixir; orange with only one of the two; red with neither — scoped to what actually helps a healer (Elixir of Healing Power, Elixir of Draenic Wisdom, Flask of Mighty Restoration and its Shattrath variant, Flask of Distilled Wisdom). Food buff: any Well Fed counts, assumed to be Golden Fish Sticks (TBC's only healing-relevant food) since the log can't distinguish which food was eaten. Weapon oil: only Superior Wizard Oil is recognized. The overall judgement is the worst of these three. See docs/backlog.md story 601.";

function flaskOrElixirLabel(
  flaskOrElixir: PrepHygieneResult["flaskOrElixir"],
): string {
  if (flaskOrElixir.hasFlask) return "Flask active";
  if (flaskOrElixir.hasBattleElixir && flaskOrElixir.hasGuardianElixir) {
    return "Battle + guardian elixir active";
  }
  if (flaskOrElixir.hasBattleElixir) {
    return "Only battle elixir active (no guardian elixir or flask)";
  }
  if (flaskOrElixir.hasGuardianElixir) {
    return "Only guardian elixir active (no battle elixir or flask)";
  }
  return "No flask or elixir active";
}

export function PrepHygieneCard({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: PrepHygieneCardProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    fetchEvents(accessToken, reportCode, fightArg, "CombatantInfo")
      .then((combatantInfoEvents) => {
        try {
          const computed = computePrepHygiene(combatantInfoEvents, druidId);
          setResult({ accessToken, result: computed });
        } catch (err) {
          setResult({
            accessToken,
            error:
              err instanceof Error
                ? err.message
                : "Failed to calculate prep hygiene.",
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
    fetchEvents,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;

  if (!isCurrent) {
    return (
      <MetricCard
        icon={ICON}
        title="Pull-time consumables check"
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
        title="Pull-time consumables check"
        threshold={THRESHOLD}
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const { flaskOrElixir, foodBuffPresent, weaponOilPresent, judgement } =
    result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Pull-time consumables check"
      judgement={judgement}
      threshold={THRESHOLD}
    >
      <div className={styles.flaskRow}>
        <JudgementChip judgement={flaskOrElixir.judgement} />
        <span>{flaskOrElixirLabel(flaskOrElixir)}</span>
      </div>
      <ChecklistRow label="Food buff (Well Fed)" present={foodBuffPresent} />
      <ChecklistRow
        label="Weapon oil (Superior Wizard Oil)"
        present={weaponOilPresent}
      />
    </MetricCard>
  );
}
