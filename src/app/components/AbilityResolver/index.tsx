import { useEffect, useState } from "react";
import type { ReportAbility } from "../../../wcl/client";
import {
  resolveAbilities,
  type ResolvedAbility,
} from "../../../abilities/resolveAbilities";

export interface AbilityResolverProps {
  accessToken: string;
  reportCode: string;
  fetchMasterDataAbilities: (
    accessToken: string,
    reportCode: string,
  ) => Promise<ReportAbility[]>;
  onResolved: (resolved: Map<number, ResolvedAbility>) => void;
}

type FetchResult =
  | { accessToken: string; resolved: Map<number, ResolvedAbility> }
  | { accessToken: string; error: string };

export function AbilityResolver({
  accessToken,
  reportCode,
  fetchMasterDataAbilities,
  onResolved,
}: AbilityResolverProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    fetchMasterDataAbilities(accessToken, reportCode)
      .then((abilities) => {
        const resolved = resolveAbilities(abilities);
        setResult({ accessToken, resolved });
        onResolved(resolved);
      })
      .catch((err: unknown) =>
        setResult({
          accessToken,
          error:
            err instanceof Error ? err.message : "Failed to resolve abilities.",
        }),
      );
  }, [accessToken, reportCode, fetchMasterDataAbilities, onResolved]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Resolving abilities…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return null;
}
