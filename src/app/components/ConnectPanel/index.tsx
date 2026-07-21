import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
    signal?: AbortSignal,
  ) => Promise<ReportFights>;
  onReportLoaded: (report: ReportFights) => void;
  onStartOver: () => void;
}

type FetchResult = { accessToken: string; report: ReportFights };
type Rejection = { accessToken: string; message: string };

const TBC_EXPANSION_ID = 1001;

// Best-effort fallback for the case (unverified — this project's test
// account has full access to every report tried) where WCL denies the
// whole report node for an inaccessible archived report instead of
// resolving it with archiveStatus.isAccessible: false.
const SUBSCRIPTION_ERROR_PATTERN = /subscri|premium|upgrade|archived/i;

const UNSUPPORTED_EXPANSION_MESSAGE =
  "This report isn't Burning Crusade content; Bloomwatch only judges TBC logs.";
const SUBSCRIPTION_REQUIRED_MESSAGE =
  "This report requires an active Warcraft Logs subscription to view.";

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
  onReportLoaded,
  onStartOver,
}: ConnectPanelProps) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this always precedes new async work below (a fresh fetchReportFights call for this render's accessToken/reportCode), clearing any stale rejection from a previous fetch before it can render; it's not a same-render "adjusting state" case the rule is meant to catch.
    setRejection(null);
    const controller = new AbortController();
    fetchReportFights(accessToken, reportCode, controller.signal)
      .then((report) => {
        if (report.expansionId !== TBC_EXPANSION_ID) {
          setRejection({ accessToken, message: UNSUPPORTED_EXPANSION_MESSAGE });
          return;
        }
        if (!report.archiveStatus.isAccessible) {
          setRejection({ accessToken, message: SUBSCRIPTION_REQUIRED_MESSAGE });
          return;
        }
        setResult({ accessToken, report });
        onReportLoaded(report);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (
          err instanceof Error &&
          SUBSCRIPTION_ERROR_PATTERN.test(err.message)
        ) {
          setRejection({ accessToken, message: SUBSCRIPTION_REQUIRED_MESSAGE });
          return;
        }
        // Anything else is already escalated to the full-screen recovery
        // overlay by the wrapped fetchReportFights (see wcl/client.ts's
        // withErrorReporting) — nothing to render locally.
      });
    return () => controller.abort();
  }, [accessToken, reportCode, fetchReportFights, onReportLoaded]);

  if (!accessToken) return <p>Not connected.</p>;

  const isRejectionCurrent =
    rejection !== null && rejection.accessToken === accessToken;
  if (isRejectionCurrent) {
    const { message } = rejection;
    return (
      <div>
        <Alert tone="warning">
          {message}
          {message === SUBSCRIPTION_REQUIRED_MESSAGE && (
            <>
              {" "}
              <a
                href="https://www.warcraftlogs.com/subscribe"
                target="_blank"
                rel="noreferrer"
              >
                See Warcraft Logs subscription options →
              </a>
            </>
          )}
        </Alert>
        <Button onClick={onStartOver}>Load different WCL report</Button>
      </div>
    );
  }

  const isCurrent = result !== null && result.accessToken === accessToken;
  if (!isCurrent) return <p>Loading report…</p>;

  return (
    <div>
      <h2>{result.report.title}</h2>
    </div>
  );
}
