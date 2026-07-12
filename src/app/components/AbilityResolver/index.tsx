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
    signal?: AbortSignal,
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
    const controller = new AbortController();
    fetchMasterDataAbilities(accessToken, reportCode, controller.signal)
      .then((abilities) => {
        const resolved = resolveAbilities(abilities);
        setResult({ accessToken, resolved });
        onResolved(resolved);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          accessToken,
          error:
            err instanceof Error ? err.message : "Failed to resolve abilities.",
        });
      });
    return () => controller.abort();
  }, [accessToken, reportCode, fetchMasterDataAbilities, onResolved]);

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Resolving abilities…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return null;
}
