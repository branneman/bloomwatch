import { useCallback, useMemo, useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  type ReportFights,
  type CastTableEntry,
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
import { Scorecard } from "./app/components/Scorecard";
import { Shell } from "./app/components/ui/Shell";
import { Field } from "./app/components/ui/Field";
import { Input } from "./app/components/ui/Input";
import { Button } from "./app/components/ui/Button";
import { Alert } from "./app/components/ui/Alert";
import type { DruidCandidate } from "./report/druidDetection";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

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
  const [scorecardRequested, setScorecardRequested] = useState(false);
  const [eventFetcher] = useState(() => createEventFetcher());

  function resetReportState() {
    setLoadedReport(null);
    setSelectedFightIds([]);
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setResolvedAbilities(null);
    setScorecardRequested(false);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    resetReportState();
  }

  function handleStartOver() {
    setReport(null);
    resetReportState();
  }

  const handleEntriesLoaded = useCallback((entries: CastTableEntry[]) => {
    setActorNames(new Map(entries.map((e) => [e.id, e.name])));
  }, []);

  const lifebloomAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Lifebloom")
        : null,
    [resolvedAbilities],
  );

  const selectedDruid =
    druidCandidates?.find((d) => d.id === selectedDruidId) ?? null;

  const canGetScorecard =
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    selectedFightIds.length > 0;

  return (
    <>
      {!accessToken && (
        <Shell>
          <div className={styles.connectHeader}>
            <img src={logo} width={40} height={40} alt="" />
            <h1>Bloomwatch</h1>
          </div>
          <p className={styles.tagline}>
            Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
            scorecard that judges your process — not another parse percentile
            that healing, being zero-sum, can&apos;t fairly measure.
          </p>
          <Field label="WCL Client ID">
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Paste your Client ID"
            />
          </Field>
          <Button onClick={() => connect()}>Connect</Button>
          {authError && <Alert tone="warning">{authError}</Alert>}
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.
          </p>
        </Shell>
      )}

      {accessToken && !loadedReport && (
        <Shell>
          <ReportInput onSubmit={handleReportSubmit} />
          {report && (
            <ConnectPanel
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchReportFights={fetchReportFights}
              onReportLoaded={setLoadedReport}
            />
          )}
          {report && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={fetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}
        </Shell>
      )}

      {accessToken && report && loadedReport && !scorecardRequested && (
        <Shell>
          <h2>{loadedReport.title}</h2>
          {resolvedAbilities === null && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={fetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}
          <FightPicker
            fights={loadedReport.fights}
            initialFightId={report.fightId}
            onSelectionChange={setSelectedFightIds}
          />
          <DruidDetector
            accessToken={accessToken}
            reportCode={report.reportCode}
            fightIds={loadedReport.fights.map((f) => f.id)}
            fetchCastsTable={fetchCastsTable}
            onDruidsDetected={setDruidCandidates}
            onEntriesLoaded={handleEntriesLoaded}
          />
          {druidCandidates !== null &&
            (druidCandidates.length > 1 ? (
              <div className={styles.druidSection}>
                <h3>Druid</h3>
                <DruidPicker
                  candidates={druidCandidates}
                  selectedDruidId={selectedDruidId}
                  onSelect={setSelectedDruidId}
                />
              </div>
            ) : (
              <DruidPicker
                candidates={druidCandidates}
                selectedDruidId={selectedDruidId}
                onSelect={setSelectedDruidId}
              />
            ))}
          <Button
            disabled={!canGetScorecard}
            onClick={() => setScorecardRequested(true)}
          >
            Get scorecard
          </Button>
        </Shell>
      )}

      {accessToken &&
        report &&
        loadedReport &&
        scorecardRequested &&
        selectedDruid !== null &&
        lifebloomAbilityIds !== null &&
        loadedReport.fights
          .filter((f) => selectedFightIds.includes(f.id))
          .map((f) => (
            <Shell width={800} key={f.id}>
              <Scorecard
                accessToken={accessToken}
                reportCode={report.reportCode}
                fight={f}
                druidId={selectedDruid.id}
                druid={selectedDruid}
                lifebloomAbilityIds={lifebloomAbilityIds}
                targetNames={actorNames}
                fetchEvents={eventFetcher.fetchEvents}
                onStartOver={handleStartOver}
              />
            </Shell>
          ))}
    </>
  );
}

export default App;
