import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";
import { Alert } from "../ui/Alert";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<ReportFights>;
  onReportLoaded: (report: ReportFights) => void;
}

type FetchResult =
  | { accessToken: string; report: ReportFights }
  | { accessToken: string; error: string };

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
  onReportLoaded,
}: ConnectPanelProps) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    fetchReportFights(accessToken, reportCode, controller.signal)
      .then((report) => {
        setResult({ accessToken, report });
        onReportLoaded(report);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          accessToken,
          error: err instanceof Error ? err.message : "Failed to fetch report.",
        });
      });
    return () => controller.abort();
  }, [accessToken, reportCode, fetchReportFights, onReportLoaded]);

  if (!accessToken) return <p>Not connected.</p>;

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Loading report…</p>;
  if ("error" in result) return <Alert tone="warning">{result.error}</Alert>;

  return (
    <div>
      <h2>{result.report.title}</h2>
    </div>
  );
}
