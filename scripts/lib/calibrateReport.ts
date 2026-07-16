import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
} from "../../src/wcl/client";
import type { Fight } from "../../src/wcl/client";
import { createEventFetcher } from "../../src/wcl/eventCache";
import { detectDruids } from "../../src/report/druidDetection";
import type { DruidCandidate } from "../../src/report/druidDetection";
import { buildFightRows } from "../../src/report/fightRows";
import {
  resolveAbilities,
  resolveSpellAbilityIds,
} from "../../src/abilities/resolveAbilities";
import type { ResolvedAbility } from "../../src/abilities/resolveAbilities";
import type { ActorClass } from "../../src/metrics/innervateAudit";

export interface ReportContext {
  accessToken: string;
  reportCode: string;
  reportTitle: string;
  nonTrashFights: { fight: Fight; pullNumber: number | null }[];
  candidates: DruidCandidate[];
  resolvedAbilities: Map<number, ResolvedAbility>;
  lifebloomAbilityIds: Set<number>;
  rejuvenationAbilityIds: Set<number>;
  regrowthAbilityIds: Set<number>;
  swiftmendAbilityIds: Set<number>;
  naturesSwiftnessAbilityIds: Set<number>;
  actorClasses: Map<number, ActorClass>;
  fetchEvents: ReturnType<typeof createEventFetcher>["fetchEvents"];
}

export async function buildReportContext(
  accessToken: string,
  reportCode: string,
): Promise<ReportContext> {
  const { title, fights } = await fetchReportFights(accessToken, reportCode);
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => ({ fight: row.fight, pullNumber: row.pullNumber }));

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((row) => row.fight.id),
  );
  const candidates = detectDruids(castTableEntries);
  const actorClasses = new Map(
    castTableEntries.map((entry) => [
      entry.id,
      { class: entry.type, specIcon: entry.icon },
    ]),
  );

  const reportAbilities = await fetchMasterDataAbilities(
    accessToken,
    reportCode,
  );
  const resolvedAbilities = resolveAbilities(reportAbilities);

  const { fetchEvents } = createEventFetcher();

  return {
    accessToken,
    reportCode,
    reportTitle: title,
    nonTrashFights,
    candidates,
    resolvedAbilities,
    lifebloomAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Lifebloom"),
    rejuvenationAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Rejuvenation",
    ),
    regrowthAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Regrowth"),
    swiftmendAbilityIds: resolveSpellAbilityIds(resolvedAbilities, "Swiftmend"),
    naturesSwiftnessAbilityIds: resolveSpellAbilityIds(
      resolvedAbilities,
      "Nature's Swiftness",
    ),
    actorClasses,
    fetchEvents,
  };
}
