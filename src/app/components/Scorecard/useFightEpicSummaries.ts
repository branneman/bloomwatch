import { useMemo } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
import { useNearDeathResponseSummary } from "./useNearDeathResponseSummary";
import { usePrepHygieneSummary } from "./usePrepHygieneSummary";
import { getHealingAbilityIds } from "../../../metrics/nearDeathResponse";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

export interface FightEpicSummaries {
  gcd: EpicSummaryStatus;
  lifebloom: EpicSummaryStatus;
  spell: EpicSummaryStatus;
  mana: EpicSummaryStatus;
  death: EpicSummaryStatus;
  crisis: EpicSummaryStatus;
  prep: EpicSummaryStatus;
}

export type EpicId = keyof FightEpicSummaries;

type FetchEvents = (
  accessToken: string,
  reportCode: string,
  fight: EventFetcherFight,
  dataType: WclEventDataType,
  includeResources?: boolean,
) => Promise<WclEvent[]>;

// Wraps the seven per-epic summary hooks Scorecard needs for its widget
// grid, so both Scorecard and ReportDashboard's per-fight rows can get all
// seven without each re-writing the same seven hook calls in the same
// order.
export function useFightEpicSummaries(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  resolvedAbilities: Map<number, ResolvedAbility>,
  actorClasses: Map<number, ActorClass>,
  fetchEvents: FetchEvents,
): FightEpicSummaries {
  const gcd = useGcdEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const lifebloom = useLifebloomDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const spell = useSpellDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    rejuvenationAbilityIds,
    regrowthAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    resolvedAbilities,
    fetchEvents,
  );
  const mana = useManaEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    resolvedAbilities,
    actorClasses,
    fetchEvents,
  );
  const death = useDeathForensicsSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const healingAbilityIds = useMemo(
    () => getHealingAbilityIds(resolvedAbilities),
    [resolvedAbilities],
  );
  const crisis = useNearDeathResponseSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    healingAbilityIds,
    swiftmendAbilityIds,
    naturesSwiftnessAbilityIds,
    lifebloomAbilityIds,
    fetchEvents,
  );
  const prep = usePrepHygieneSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );

  return { gcd, lifebloom, spell, mana, death, crisis, prep };
}
