import { useWclAuth } from "./wcl/useWclAuth";
import { fetchReportFights } from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";

const REPORT_CODE = "4GYHZRdtL3bvhpc8";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      <ConnectPanel
        accessToken={accessToken}
        reportCode={REPORT_CODE}
        fetchReportFights={fetchReportFights}
      />
    </div>
  );
}

export default App;
