// src/App.tsx
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
import { buildFightRows } from "./report/fightRows";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { Onboarding } from "./app/components/Onboarding";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";
import { DruidDetector } from "./app/components/DruidDetector";
import { DruidPicker } from "./app/components/DruidPicker";
import { AbilityResolver } from "./app/components/AbilityResolver";
import { ReportDashboard } from "./app/components/ReportDashboard";
import { Shell } from "./app/components/ui/Shell";
import { Button } from "./app/components/ui/Button";
import { Alert } from "./app/components/ui/Alert";
import { Disclosure } from "./app/components/ui/Disclosure";
import { OwnClientIdField } from "./app/components/OwnClientIdField";
import { withRateLimitDetection } from "./wcl/client";
import type { DruidCandidate } from "./report/druidDetection";
import type { ActorClass } from "./metrics/innervateAudit";
import type { EpicId } from "./app/components/Scorecard/useFightEpicSummaries";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";

function App() {
  const { connect, accessToken, authError, rateLimited, reportRateLimited } =
    useWclAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [selectedDruidId, setSelectedDruidId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [actorClasses, setActorClasses] = useState<Map<number, ActorClass>>(
    new Map(),
  );
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [dashboardRequested, setDashboardRequested] = useState(false);
  const [eventFetcher] = useState(() => createEventFetcher());
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_SEEN_KEY) === "true",
  );
  const [activeEpicId, setActiveEpicId] = useState<EpicId | null>(null);
  const [openFightId, setOpenFightId] = useState<number | null>(null);

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
    setDruidCandidates(null);
    setSelectedDruidId(null);
    setActorNames(new Map());
    setActorClasses(new Map());
    setResolvedAbilities(null);
    setDashboardRequested(false);
    setActiveEpicId(null);
    setOpenFightId(null);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    setReport(parsed);
    resetReportState();
    setOpenFightId(parsed.fightId);
  }

  function handleStartOver() {
    setReport(null);
    resetReportState();
  }

  function dismissOnboarding() {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    setOnboardingDismissed(true);
  }

  function reopenOnboarding() {
    setOnboardingDismissed(false);
  }

  const handleEntriesLoaded = useCallback((entries: CastTableEntry[]) => {
    setActorNames(new Map(entries.map((e) => [e.id, e.name])));
    setActorClasses(
      new Map(entries.map((e) => [e.id, { class: e.type, specIcon: e.icon }])),
    );
  }, []);

  const nonTrashFightIds = useMemo(
    () =>
      loadedReport
        ? buildFightRows(loadedReport.fights)
            .filter((row) => !row.isTrash)
            .map((row) => row.fight.id)
        : [],
    [loadedReport],
  );

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
  const swiftmendAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Swiftmend")
        : null,
    [resolvedAbilities],
  );
  const naturesSwiftnessAbilityIds = useMemo(
    () =>
      resolvedAbilities
        ? resolveSpellAbilityIds(resolvedAbilities, "Nature's Swiftness")
        : null,
    [resolvedAbilities],
  );

  const selectedDruid =
    druidCandidates?.find((d) => d.id === selectedDruidId) ?? null;

  const canGetDashboard =
    selectedDruid !== null &&
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    naturesSwiftnessAbilityIds !== null &&
    resolvedAbilities !== null;

  // A single candidate has no picker to interact with (DruidPicker
  // auto-selects it silently) — requiring a "View report dashboard" click on
  // top of that would be a confirmation step with nothing left to confirm.
  // Updated directly during render (React's "adjusting state" pattern)
  // rather than in an effect, since it's purely derived from already-
  // rendered state and naturally settles once dashboardRequested flips true.
  if (druidCandidates?.length === 1 && canGetDashboard && !dashboardRequested) {
    setDashboardRequested(true);
  }

  return (
    <>
      {!onboardingDismissed && (
        <Shell width={820}>
          <Onboarding onContinue={dismissOnboarding} />
        </Shell>
      )}

      {onboardingDismissed && !accessToken && (
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
            made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={reopenOnboarding}
            >
              About
            </button>
          </p>
        </Shell>
      )}

      {onboardingDismissed && accessToken && rateLimited && (
        <Shell>
          <Alert tone="warning">
            The shared connection is temporarily over capacity — too many people
            are using Bloomwatch&apos;s default connection right now. Register
            your own free WCL API client to keep going; it only takes a minute.
          </Alert>
          <OwnClientIdField onConnect={connect} />
        </Shell>
      )}

      {onboardingDismissed && accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
          {/* Rendered for the whole lifetime of `report` (not just while
              !loadedReport) rather than only on the first screen: its fetch
              can still be in flight when loadedReport resolves (masterData
              is a bigger query than the fights list), and unmounting a
              component aborts its in-flight fetch (see ConnectPanel/
              AbilityResolver's AbortSignal cleanup) — mounting it here once,
              for the whole flow, means that abort only ever fires for a
              genuine report change/reset, never for a normal screen
              transition. */}
          {report && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={report.reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}

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
            </Shell>
          )}

          {report && loadedReport && !dashboardRequested && (
            <Shell>
              <h2>{loadedReport.title}</h2>
              <button
                type="button"
                className={styles.backLink}
                onClick={handleStartOver}
              >
                Load different WCL report
              </button>
              <DruidDetector
                accessToken={accessToken}
                reportCode={report.reportCode}
                fightIds={nonTrashFightIds}
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
                disabled={!canGetDashboard}
                onClick={() => setDashboardRequested(true)}
              >
                View report dashboard
              </Button>
            </Shell>
          )}

          {report &&
            loadedReport &&
            dashboardRequested &&
            selectedDruid !== null &&
            lifebloomAbilityIds !== null &&
            rejuvenationAbilityIds !== null &&
            regrowthAbilityIds !== null &&
            swiftmendAbilityIds !== null &&
            naturesSwiftnessAbilityIds !== null &&
            resolvedAbilities !== null && (
              <Shell width={920}>
                <ReportDashboard
                  accessToken={accessToken}
                  reportCode={report.reportCode}
                  reportTitle={loadedReport.title}
                  fights={loadedReport.fights}
                  druidId={selectedDruid.id}
                  druid={selectedDruid}
                  lifebloomAbilityIds={lifebloomAbilityIds}
                  rejuvenationAbilityIds={rejuvenationAbilityIds}
                  regrowthAbilityIds={regrowthAbilityIds}
                  swiftmendAbilityIds={swiftmendAbilityIds}
                  naturesSwiftnessAbilityIds={naturesSwiftnessAbilityIds}
                  resolvedAbilities={resolvedAbilities}
                  targetNames={actorNames}
                  actorClasses={actorClasses}
                  fetchEvents={wrappedFetchEvents}
                  openFightId={openFightId}
                  onOpenFight={setOpenFightId}
                  onCloseFight={() => setOpenFightId(null)}
                  activeEpicId={activeEpicId}
                  onSelectEpic={setActiveEpicId}
                  onStartOver={handleStartOver}
                />
              </Shell>
            )}
        </div>
      )}
    </>
  );
}

export default App;
