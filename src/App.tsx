import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import { fetchReportFights } from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  // fightId is parsed now; story 003 (fight list & selection) will consume it
  // to pre-select the linked fight once that picker exists.
  const [report, setReport] = useState<ParsedReport | null>(null);

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      {accessToken && <ReportInput onSubmit={setReport} />}
      {accessToken && report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={fetchReportFights}
        />
      )}
    </div>
  );
}

export default App;
