import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";

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

type FetchResult = { accessToken: string; report: ReportFights };

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
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchReportFights (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
    return () => controller.abort();
  }, [accessToken, reportCode, fetchReportFights, onReportLoaded]);

  if (!accessToken) return <p>Not connected.</p>;

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Loading report…</p>;

  return (
    <div>
      <h2>{result.report.title}</h2>
    </div>
  );
}
