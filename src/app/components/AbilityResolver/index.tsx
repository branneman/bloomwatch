import { useEffect, useState } from "react";
import type { ReportAbility } from "../../../wcl/client";
import {
  resolveAbilities,
  type ResolvedAbility,
} from "../../../abilities/resolveAbilities";
import { resolveFaerieFireAbilityIds } from "../../../abilities/resolveFaerieFireAbilityIds";
import { Shell } from "../ui/Shell";

export interface AbilityResolverProps {
  accessToken: string;
  reportCode: string;
  fetchMasterDataAbilities: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<ReportAbility[]>;
  fetchBossActorIds: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<Set<number>>;
  onResolved: (
    resolved: Map<number, ResolvedAbility>,
    faerieFireAbilityIds: Set<number>,
    bossActorIds: Set<number>,
  ) => void;
}

type FetchResult = {
  accessToken: string;
  resolved: Map<number, ResolvedAbility>;
};

export function AbilityResolver({
  accessToken,
  reportCode,
  fetchMasterDataAbilities,
  fetchBossActorIds,
  onResolved,
}: AbilityResolverProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMasterDataAbilities(accessToken, reportCode, controller.signal),
      fetchBossActorIds(accessToken, reportCode, controller.signal),
    ])
      .then(([abilities, bossActorIds]) => {
        const resolved = resolveAbilities(abilities);
        const faerieFireAbilityIds = resolveFaerieFireAbilityIds(abilities);
        setResult({ accessToken, resolved });
        onResolved(resolved, faerieFireAbilityIds, bossActorIds);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetch functions (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
    return () => controller.abort();
  }, [
    accessToken,
    reportCode,
    fetchMasterDataAbilities,
    fetchBossActorIds,
    onResolved,
  ]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent)
    return (
      <Shell>
        <p>Resolving abilities…</p>
      </Shell>
    );

  return null;
}
