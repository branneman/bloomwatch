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
import { Button } from "./app/components/ui/Button";
import { Alert } from "./app/components/ui/Alert";
import { Disclosure } from "./app/components/ui/Disclosure";
import { OwnClientIdField } from "./app/components/OwnClientIdField";
import { withRateLimitDetection } from "./wcl/client";
import type { DruidCandidate } from "./report/druidDetection";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

function App() {
  const { connect, accessToken, authError, rateLimited, reportRateLimited } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [selectedFightIds, setSelectedFightIds] = useState<number[]>([]);
  const [fightsConfirmed, setFightsConfirmed] = useState(false);
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

  const wrappedFetchReportFights = useMemo(
    () => withRateLimitDetection(fetchReportFights, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchCastsTable = useMemo(
    () => withRateLimitDetection(fetchCastsTable, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchMasterDataAbilities = useMemo(
    () => withRateLimitDetection(fetchMasterDataAbilities, reportRateLimited),
    [reportRateLimited],
  );
  const wrappedFetchEvents = useMemo(
    () => withRateLimitDetection(eventFetcher.fetchEvents, reportRateLimited),
    [eventFetcher, reportRateLimited],
  );

  function resetReportState() {
    setLoadedReport(null);
    setSelectedFightIds([]);
    setFightsConfirmed(false);
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

  function handleChangeFightSelection() {
    setFightsConfirmed(false);
    setDruidCandidates(null);
    setSelectedDruidId(null);
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
  const rejuvenationAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Rejuvenation")
        : null,
    [resolvedAbilities],
  );
  const regrowthAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Regrowth")
        : null,
    [resolvedAbilities],
  );

  const selectedDruid =
    druidCandidates?.find((d) => d.id === selectedDruidId) ?? null;

  const canGetScorecard =
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
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
          <Button onClick={() => connect()}>
            Connect to Warcraft Logs (WCL)
          </Button>
          <Disclosure summary="Optional: Use your own WCL API Client ID instead">
            <OwnClientIdField onConnect={connect} />
          </Disclosure>
          {authError && <Alert tone="warning">{authError}</Alert>}
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.
          </p>
        </Shell>
      )}

      {accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
            The shared connection is temporarily over capacity — too many people
            are using Bloomwatch&apos;s default connection right now. Register
            your own free WCL API client to keep going; it only takes a minute.
          </Alert>
          <OwnClientIdField onConnect={connect} />
        </Shell>
      )}

      {accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
          {!loadedReport && (
            <Shell>
              <ReportInput onSubmit={handleReportSubmit} />
              {report && (
                <ConnectPanel
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  fetchReportFights={wrappedFetchReportFights}
                  onReportLoaded={setLoadedReport}
                />
              )}
              {report && (
                <AbilityResolver
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
                  onResolved={setResolvedAbilities}
                />
              )}
            </Shell>
          )}

          {report && loadedReport && !scorecardRequested && (
            <Shell>
              <h2>{loadedReport.title}</h2>
              {/* Kept mounted (just hidden) rather than conditionally
                  rendered when confirmed: FightPicker owns its checkbox
                  state internally, and unmounting it would lose the user's
                  selection if they come back to change it. */}
              <div style={{ display: fightsConfirmed ? "none" : undefined }}>
                <FightPicker
                  fights={loadedReport.fights}
                  initialFightId={report.fightId}
                  onSelectionChange={setSelectedFightIds}
                />
                <Button
                  disabled={selectedFightIds.length === 0}
                  onClick={() => setFightsConfirmed(true)}
                >
                  Confirm fights
                </Button>
              </div>

              {fightsConfirmed && (
                <>
                  <button
                    type="button"
                    className={styles.backLink}
                    onClick={handleChangeFightSelection}
                  >
                    ← Change fight selection
                  </button>
                  <DruidDetector
                    accessToken={accessToken}
                    reportCode={report.reportCode}
                    fightIds={selectedFightIds}
                    fetchCastsTable={wrappedFetchCastsTable}
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
                </>
              )}
            </Shell>
          )}

          {report &&
            loadedReport &&
            scorecardRequested &&
            selectedDruid !== null &&
            lifebloomAbilityIds !== null &&
            rejuvenationAbilityIds !== null &&
            regrowthAbilityIds !== null &&
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
                    rejuvenationAbilityIds={rejuvenationAbilityIds}
                    regrowthAbilityIds={regrowthAbilityIds}
                    targetNames={actorNames}
                    fetchEvents={wrappedFetchEvents}
                    onStartOver={handleStartOver}
                  />
                </Shell>
              ))}
        </div>
      )}
    </>
  );
}

export default App;
