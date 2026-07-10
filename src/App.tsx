import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  type ReportFights,
} from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import type { DruidCandidate } from "./report/druidDetection";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [, setSelectedFightIds] = useState<number[]>([]);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [, setSelectedDruidId] = useState<number | null>(null);

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
  }

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      {accessToken && <ReportInput onSubmit={handleReportSubmit} />}
      {accessToken && report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={fetchReportFights}
          onReportLoaded={setLoadedReport}
        />
      )}
      {loadedReport && (
        <FightPicker
          fights={loadedReport.fights}
          initialFightId={report?.fightId ?? null}
          onSelectionChange={setSelectedFightIds}
        />
      )}
      {accessToken && loadedReport && report && (
        <DruidDetector
          accessToken={accessToken}
          reportCode={report.reportCode}
          fightIds={loadedReport.fights.map((f) => f.id)}
          fetchCastsTable={fetchCastsTable}
          onDruidsDetected={setDruidCandidates}
        />
      )}
      {druidCandidates !== null && (
        <DruidPicker
          candidates={druidCandidates}
          onSelect={setSelectedDruidId}
        />
      )}
    </div>
  );
}

export default App;
