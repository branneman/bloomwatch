import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
  ) => Promise<ReportFights>;
}

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
}: ConnectPanelProps) {
  const [report, setReport] = useState<ReportFights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchReportFights(accessToken, reportCode)
      .then((result) => {
        setError(null);
        setReport(result);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to fetch report.",
        ),
      );
  }, [accessToken, reportCode, fetchReportFights]);

  if (!accessToken) return <p>Not connected.</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading report…</p>;

  return (
    <div>
      <h2>{report.title}</h2>
      <p>{report.fights.length} fights</p>
    </div>
  );
}
