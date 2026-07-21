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
  "Read from combatant-info auras/gear at fight start. Flask/elixir coverage: good with a recognized flask, or with both a battle and a guardian elixir; fair with only one of the two; bad with neither, scoped to what actually helps a healer (Elixir of Healing Power, Elixir of Draenic Wisdom, Flask of Mighty Restoration and its Shattrath variant, Flask of Distilled Wisdom). Food buff: any Well Fed counts, assumed to be Golden Fish Sticks (TBC's only healing-relevant food) since the log can't distinguish which food was eaten. Weapon oil: only Superior Wizard Oil is recognized. Enchant coverage: judged across 9 slots (Head, Shoulder, Back, Chest, Wrist, Hands, Legs, Feet, MainHand's permanent enchant); a slot with a recognized best-in-slot or a legitimate lesser (\"acceptable\") enchant both count as covered; only a truly missing or unrecognized enchant counts against the score. Good 0 missing, fair 1-3, bad 4+. Head and Legs are judged the same as any other slot even though their enchants are reputation/profession-gated. Gem coverage: judged on whatever gems are actually socketed (an unfilled socket can't be distinguished from a slot with no socket at all, so this can only flag a present-but-wrong gem, never an empty one), plus a Head-slot meta-gem check. Good 0 wrong/unrecognized, fair 1-2, bad 3+. Both bands are provisional, pending a future calibration pass. The overall judgement combines all five checks (flask/elixir, food, oil, enchant coverage, gem coverage): a good-and-bad mix reads fair, otherwise it's the worst of the five.";

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
        rationaleSlug="prep-hygiene"
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
        rationaleSlug="prep-hygiene"
      >
        <p role="alert">{result.error}</p>
      </MetricCard>
    );
  }

  const {
    flaskOrElixir,
    foodBuffPresent,
    weaponOilPresent,
    enchantCoverage,
    gemCoverage,
    judgement,
  } = result.result;

  return (
    <MetricCard
      icon={ICON}
      title="Pull-time consumables check"
      judgement={judgement}
      threshold={THRESHOLD}
      rationaleSlug="prep-hygiene"
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
      <div className={styles.flaskRow}>
        <JudgementChip judgement={enchantCoverage.judgement} />
        <span>
          {enchantCoverage.missingSlots.length === 0
            ? "All 9 enchantable slots enchanted"
            : `Missing/unrecognized enchant: ${enchantCoverage.missingSlots.join(", ")}`}
          {enchantCoverage.acceptableSlots.length > 0 && (
            <em className={styles.upgradeNote}>
              {" "}
              (upgrade available: {enchantCoverage.acceptableSlots.join(", ")})
            </em>
          )}
        </span>
      </div>
      <div className={styles.flaskRow}>
        <JudgementChip judgement={gemCoverage.judgement} />
        <span>
          {gemCoverage.missingOrWrongCount === 0
            ? "All gems recognized, meta gem correct"
            : `${gemCoverage.missingOrWrongCount} gem(s) wrong or unrecognized${gemCoverage.metaGemRecognized ? "" : " (including meta)"}`}
          {gemCoverage.acceptableCount > 0 && (
            <em className={styles.upgradeNote}>
              {" "}
              ({gemCoverage.acceptableCount} on an upgradeable tier)
            </em>
          )}
        </span>
      </div>
    </MetricCard>
  );
}
