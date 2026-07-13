import { useEffect, useState } from "react";
import type { CastTableEntry } from "../../../wcl/client";
import {
  detectDruids,
  type DruidCandidate,
} from "../../../report/druidDetection";

export interface DruidDetectorProps {
  accessToken: string;
  reportCode: string;
  fightIds: number[];
  fetchCastsTable: (
    accessToken: string,
    reportCode: string,
    fightIds: number[],
    signal?: AbortSignal,
  ) => Promise<CastTableEntry[]>;
  onDruidsDetected: (candidates: DruidCandidate[]) => void;
  onEntriesLoaded?: (entries: CastTableEntry[]) => void;
}

type FetchResult =
  | { accessToken: string; fightIdsKey: string; candidates: DruidCandidate[] }
  | { accessToken: string; fightIdsKey: string; error: string };

export function DruidDetector({
  accessToken,
  reportCode,
  fightIds,
  fetchCastsTable,
  onDruidsDetected,
  onEntriesLoaded,
}: DruidDetectorProps) {
  // Derive a primitive key from the fightIds array so the effect doesn't
  // re-fire on every parent render just because App.tsx passes a fresh
  // array reference (loadedReport.fights.map(...) creates a new array each
  // render). Reconstructing the array from this key inside the effect keeps
  // react-hooks/exhaustive-deps satisfied without a stale, unstable `fightIds`
  // dependency.
  const fightIdsKey = fightIds.join(",");
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    const ids = fightIdsKey === "" ? [] : fightIdsKey.split(",").map(Number);
    const controller = new AbortController();
    fetchCastsTable(accessToken, reportCode, ids, controller.signal)
      .then((entries) => {
        const candidates = detectDruids(entries);
        setResult({ accessToken, fightIdsKey, candidates });
        onDruidsDetected(candidates);
        onEntriesLoaded?.(entries);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          accessToken,
          fightIdsKey,
          error:
            err instanceof Error ? err.message : "Failed to detect druids.",
        });
      });
    return () => controller.abort();
  }, [
    accessToken,
    reportCode,
    fightIdsKey,
    fetchCastsTable,
    onDruidsDetected,
    onEntriesLoaded,
  ]);

  const isCurrent =
    result !== null &&
    result.accessToken === accessToken &&
    result.fightIdsKey === fightIdsKey;
  if (!isCurrent) return <p>Detecting druids…</p>;
  if ("error" in result) return <p role="alert">{result.error}</p>;

  return null;
}
