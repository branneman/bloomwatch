import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  type ReportFights,
} from "./wcl/client";
import { createEventFetcher } from "./wcl/eventCache";
import {
  resolveSpellAbilityIds,
  type ResolvedAbility,
} from "./abilities/resolveAbilities";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { FightPicker } from "./app/components/FightPicker";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import { AbilityResolver } from "./app/components/AbilityResolver";
import { GCDUtilizationCard } from "./app/components/GCDUtilizationCard";
import { IdleGapsCard } from "./app/components/IdleGapsCard";
import { LB3UptimeCard } from "./app/components/LB3UptimeCard";
import type { DruidCandidate } from "./report/druidDetection";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [selectedFightIds, setSelectedFightIds] = useState<number[]>([]);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [selectedDruidId, setSelectedDruidId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [eventFetcher] = useState(() => createEventFetcher());

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setResolvedAbilities(null);
  }

  const lifebloomAbilityIds = resolvedAbilities
    ? resolveSpellAbilityIds(resolvedAbilities, "Lifebloom")
    : null;

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
      {accessToken && report && (
        <AbilityResolver
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchMasterDataAbilities={fetchMasterDataAbilities}
          onResolved={setResolvedAbilities}
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
          onEntriesLoaded={(entries) =>
            setActorNames(new Map(entries.map((e) => [e.id, e.name])))
          }
        />
      )}
      {druidCandidates !== null && (
        <DruidPicker
          candidates={druidCandidates}
          onSelect={setSelectedDruidId}
        />
      )}
      {accessToken &&
        report &&
        loadedReport &&
        selectedDruidId !== null &&
        lifebloomAbilityIds !== null &&
        selectedFightIds.length > 0 && (
          <div>
            {loadedReport.fights
              .filter((f) => selectedFightIds.includes(f.id))
              .map((f) => (
                <div key={f.id}>
                  <GCDUtilizationCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                  <IdleGapsCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                  <LB3UptimeCard
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fight={f}
                    druidId={selectedDruidId}
                    lifebloomAbilityIds={lifebloomAbilityIds}
                    targetNames={actorNames}
                    fetchEvents={eventFetcher.fetchEvents}
                  />
                </div>
              ))}
          </div>
        )}
    </div>
  );
}

export default App;
