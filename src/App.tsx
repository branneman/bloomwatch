// src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ErrorOverlay } from "./app/components/ErrorOverlay";
import { recoverFromError } from "./app/errorRecovery";
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
import {
  RateLimitBanner,
  RATE_LIMIT_BANNER_THRESHOLD_PCT,
} from "./app/components/ui/RateLimitBanner";
import { AppHeader } from "./app/components/ui/AppHeader";
import { Footer } from "./app/components/ui/Footer";
import { JudgementRationale } from "./app/components/JudgementRationale";
import { withRateLimitDetection, withErrorReporting } from "./wcl/client";
import {
  useRateLimitUsage,
  useRateLimitUsageData,
} from "./wcl/useRateLimitUsage";
import { useHashRoute } from "./app/routing/useHashRoute";
import type { EpicId } from "./app/components/Scorecard/useFightEpicSummaries";
import type { DruidCandidate } from "./report/druidDetection";
import type { ActorClass } from "./metrics/innervateAudit";
import type { Route } from "./app/routing/hashRoute";
import logo from "./assets/logo/lifebloom.jpg";
import styles from "./App.module.css";

const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";

function App() {
  const [globalError, setGlobalError] = useState<unknown>(null);
  const reportError = useCallback((err: unknown) => setGlobalError(err), []);
  const {
    connect,
    accessToken,
    rateLimited,
    reportRateLimited,
    usingDefaultClient,
  } = useWclAuth(reportError);
  const usagePct = useRateLimitUsage();
  const rateLimitUsage = useRateLimitUsageData();
  const { route, navigate } = useHashRoute();
  const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
  const [druidCandidates, setDruidCandidates] = useState<
    DruidCandidate[] | null
  >(null);
  const [pickedDruidId, setPickedDruidId] = useState<number | null>(null);
  const [pendingFightId, setPendingFightId] = useState<number | null>(null);
  const [actorNames, setActorNames] = useState<Map<number, string>>(new Map());
  const [actorClasses, setActorClasses] = useState<Map<number, ActorClass>>(
    new Map(),
  );
  const [resolvedAbilities, setResolvedAbilities] = useState<Map<
    number,
    ResolvedAbility
  > | null>(null);
  const [eventFetcher] = useState(() => createEventFetcher());
  const pendingRouteRef = useRef<Route | null>(null);

  // First-time visit anywhere (not already headed to #/about itself):
  // remember where the visitor was actually headed, then redirect to
  // About. handleContinueFromAbout() below sends them on to that
  // remembered destination once they dismiss it — mirroring the old
  // "onboarding is an overlay, the route underneath is untouched" behavior,
  // just expressed as an explicit route now that About has a real URL.
  useEffect(() => {
    if (localStorage.getItem(ONBOARDING_SEEN_KEY) === "true") return;
    if (route.screen === "about") return;
    pendingRouteRef.current = route;
    navigate({ screen: "about" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: only the very first resolved route should ever trigger this redirect, not every subsequent route change.
  }, []);

  const reportCode =
    route.screen === "input" ||
    route.screen === "about" ||
    route.screen === "judgements"
      ? null
      : route.reportCode;
  const host =
    route.screen === "input" ||
    route.screen === "about" ||
    route.screen === "judgements"
      ? null
      : route.host;

  const wrappedFetchReportFights = useMemo(
    () =>
      withErrorReporting(
        withRateLimitDetection(fetchReportFights, reportRateLimited),
        reportError,
      ),
    [reportRateLimited, reportError],
  );
  const wrappedFetchCastsTable = useMemo(
    () =>
      withErrorReporting(
        withRateLimitDetection(fetchCastsTable, reportRateLimited),
        reportError,
      ),
    [reportRateLimited, reportError],
  );
  const wrappedFetchMasterDataAbilities = useMemo(
    () =>
      withErrorReporting(
        withRateLimitDetection(fetchMasterDataAbilities, reportRateLimited),
        reportError,
      ),
    [reportRateLimited, reportError],
  );
  const wrappedFetchEvents = useMemo(
    () =>
      withErrorReporting(
        withRateLimitDetection(eventFetcher.fetchEvents, reportRateLimited),
        reportError,
      ),
    [eventFetcher, reportRateLimited, reportError],
  );
  const wrappedFetchLookbackEvents = useMemo(
    () =>
      withErrorReporting(
        withRateLimitDetection(
          eventFetcher.fetchLookbackEvents,
          reportRateLimited,
        ),
        reportError,
      ),
    [eventFetcher, reportRateLimited, reportError],
  );

  function resetReportState() {
    setLoadedReport(null);
    setDruidCandidates(null);
    setActorNames(new Map());
    setActorClasses(new Map());
    setResolvedAbilities(null);
    setPickedDruidId(null);
  }

  function handleReportSubmit(parsed: ParsedReport) {
    resetReportState();
    setPendingFightId(parsed.fightId);
    navigate({
      screen: "druidPicker",
      reportCode: parsed.reportCode,
      host: parsed.host,
    });
  }

  function handleStartOver() {
    resetReportState();
    setPendingFightId(null);
    navigate({ screen: "input" });
  }

  function handleContinueFromAbout() {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    navigate(pendingRouteRef.current ?? { screen: "input" });
    pendingRouteRef.current = null;
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

  const abilitiesReady =
    lifebloomAbilityIds !== null &&
    rejuvenationAbilityIds !== null &&
    regrowthAbilityIds !== null &&
    swiftmendAbilityIds !== null &&
    naturesSwiftnessAbilityIds !== null &&
    resolvedAbilities !== null;

  const pickedDruid =
    druidCandidates?.find((d) => d.id === pickedDruidId) ?? null;

  const routeDruidName =
    route.screen === "dashboard" ||
    route.screen === "fight" ||
    route.screen === "fightEpic"
      ? route.druidName
      : null;
  const selectedDruid =
    routeDruidName !== null
      ? (druidCandidates?.find((d) => d.name === routeDruidName) ?? null)
      : null;

  const openFightId =
    route.screen === "fight" || route.screen === "fightEpic"
      ? route.fightId
      : null;
  const activeEpicId = route.screen === "fightEpic" ? route.epicId : null;

  function handleOpenFight(fightId: number) {
    if (reportCode === null || selectedDruid === null || host === null) return;
    navigate({
      screen: "fight",
      reportCode,
      host,
      druidName: selectedDruid.name,
      fightId,
    });
  }

  function handleCloseFight() {
    if (reportCode === null || selectedDruid === null || host === null) return;
    navigate({
      screen: "dashboard",
      reportCode,
      host,
      druidName: selectedDruid.name,
    });
  }

  function handleSelectEpic(epicId: EpicId | null) {
    if (reportCode === null || selectedDruid === null || host === null) return;
    if (route.screen !== "fight" && route.screen !== "fightEpic") return;
    const fightId = route.fightId;
    if (epicId === null) {
      navigate({
        screen: "fight",
        reportCode,
        host,
        druidName: selectedDruid.name,
        fightId,
      });
    } else {
      navigate({
        screen: "fightEpic",
        reportCode,
        host,
        druidName: selectedDruid.name,
        fightId,
        epicId,
      });
    }
  }

  function advanceFromPicker(druidName: string) {
    if (route.screen !== "druidPicker") return;
    if (pendingFightId !== null) {
      navigate({
        screen: "fight",
        reportCode: route.reportCode,
        host: route.host,
        druidName,
        fightId: pendingFightId,
      });
      setPendingFightId(null);
    } else {
      navigate({
        screen: "dashboard",
        reportCode: route.reportCode,
        host: route.host,
        druidName,
      });
    }
  }

  // Sole candidate has no picker UI to click through (DruidPicker returns
  // null and self-selects) — advance the moment abilities are also ready, no
  // button click needed. navigate() has a genuine side effect (pushState),
  // so — unlike a plain setState "adjusting state" pattern — this belongs in
  // an effect, not inline in the render body.
  useEffect(() => {
    if (druidCandidates === null || druidCandidates.length !== 1) return;
    if (!abilitiesReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- advanceFromPicker's setPendingFightId/navigate are a genuine side effect (pushState) gated behind async conditions (druidCandidates/abilitiesReady resolving), not a same-render "adjusting state" case the rule is meant to catch; see the comment above.
    advanceFromPicker(druidCandidates[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advanceFromPicker closes over route/pendingFightId/navigate, all fresh every render; re-running only when druidCandidates or abilitiesReady actually change (not on every render) is the intent.
  }, [druidCandidates, abilitiesReady]);

  // A route that already names a druid (e.g. a shared link) is confirmed or
  // silently rejected the moment candidates resolve — no picker shown
  // either way, per story 703's "silently fall back" decision.
  useEffect(() => {
    if (
      route.screen !== "dashboard" &&
      route.screen !== "fight" &&
      route.screen !== "fightEpic"
    ) {
      return;
    }
    if (druidCandidates === null) return;
    if (druidCandidates.some((d) => d.name === route.druidName)) return;
    navigate({
      screen: "druidPicker",
      reportCode: route.reportCode,
      host: route.host,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable (useCallback with no deps in useHashRoute); route/druidCandidates are the only real inputs.
  }, [route, druidCandidates]);

  // A fightId the loaded report doesn't actually have (stale/bad link)
  // falls back to the dashboard once the report's fights are known.
  useEffect(() => {
    if (route.screen !== "fight" && route.screen !== "fightEpic") return;
    if (loadedReport === null) return;
    if (nonTrashFightIds.includes(route.fightId)) return;
    navigate({
      screen: "dashboard",
      reportCode: route.reportCode,
      host: route.host,
      druidName: route.druidName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable; route/loadedReport/nonTrashFightIds are the only real inputs.
  }, [route, loadedReport, nonTrashFightIds]);

  if (globalError !== null) {
    return (
      <Shell>
        <ErrorOverlay error={globalError} onStartOver={recoverFromError} />
      </Shell>
    );
  }

  if (route.screen === "about") {
    return (
      <Shell>
        <Onboarding onContinue={handleContinueFromAbout} />
      </Shell>
    );
  }

  if (route.screen === "judgements") {
    return (
      <Shell>
        <JudgementRationale slug={route.slug} />
      </Shell>
    );
  }

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
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={() => navigate({ screen: "about" })}
            >
              About
            </button>
          </p>
        </Shell>
      )}

      {/* Onboarding and the pre-auth connect screen already show their own
          large centered logo+heading (a "hero" treatment) — this persistent
          slim header only starts once the user is past that gate, so it
          never duplicates the identity chrome. */}
      {accessToken && <AppHeader onClick={handleStartOver} />}

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

      {/* Hidden while 008's blocking fallback (rateLimited) is already
          showing — that screen has its own OwnClientIdField and a more
          urgent message, so showing both at once would be redundant. */}
      {accessToken &&
        !rateLimited &&
        usingDefaultClient &&
        usagePct !== null &&
        usagePct >= RATE_LIMIT_BANNER_THRESHOLD_PCT && (
          <Shell>
            <RateLimitBanner usagePct={usagePct} onConnect={connect} />
          </Shell>
        )}

      {accessToken && (
        <div
          className={rateLimited ? styles.dimmed : undefined}
          inert={rateLimited}
        >
          {/* Rendered for the whole lifetime of a known reportCode (not just
              while !loadedReport), same reasoning as before 703: its fetch
              can still be in flight when loadedReport resolves, and
              unmounting a component aborts its in-flight fetch. */}
          {reportCode && (
            <AbilityResolver
              accessToken={accessToken}
              reportCode={reportCode}
              fetchMasterDataAbilities={wrappedFetchMasterDataAbilities}
              onResolved={setResolvedAbilities}
            />
          )}

          {/* Also rendered for the whole lifetime of a loaded report, not
              just while the druid-pick screen is showing — a route that
              resumes straight to the dashboard/fight/epic screen (a shared
              link) never shows that screen at all, but still needs this to
              run so druidCandidates ever resolves. */}
          {loadedReport && reportCode && (
            <DruidDetector
              accessToken={accessToken}
              reportCode={reportCode}
              fightIds={nonTrashFightIds}
              fetchCastsTable={wrappedFetchCastsTable}
              onDruidsDetected={setDruidCandidates}
              onEntriesLoaded={handleEntriesLoaded}
            />
          )}

          {route.screen === "input" && (
            <Shell>
              <ReportInput onSubmit={handleReportSubmit} />
            </Shell>
          )}

          {reportCode && !loadedReport && (
            <Shell>
              <ConnectPanel
                accessToken={accessToken}
                reportCode={reportCode}
                fetchReportFights={wrappedFetchReportFights}
                onReportLoaded={setLoadedReport}
                onStartOver={handleStartOver}
              />
            </Shell>
          )}

          {loadedReport && route.screen === "druidPicker" && (
            <Shell>
              <h2>{loadedReport.title}</h2>
              <button
                type="button"
                className={styles.backLink}
                onClick={handleStartOver}
              >
                Load different WCL report
              </button>
              {druidCandidates !== null &&
                (druidCandidates.length > 1 ? (
                  <div className={styles.druidSection}>
                    <h3>Druid</h3>
                    <DruidPicker
                      candidates={druidCandidates}
                      selectedDruidId={pickedDruidId}
                      onSelect={setPickedDruidId}
                    />
                  </div>
                ) : (
                  <DruidPicker
                    candidates={druidCandidates}
                    selectedDruidId={pickedDruidId}
                    onSelect={setPickedDruidId}
                  />
                ))}
              <Button
                disabled={!(pickedDruid !== null && abilitiesReady)}
                onClick={() =>
                  pickedDruid && advanceFromPicker(pickedDruid.name)
                }
              >
                View report dashboard
              </Button>
            </Shell>
          )}

          {loadedReport &&
            reportCode &&
            host !== null &&
            selectedDruid !== null &&
            resolvedAbilities !== null &&
            lifebloomAbilityIds !== null &&
            rejuvenationAbilityIds !== null &&
            regrowthAbilityIds !== null &&
            swiftmendAbilityIds !== null &&
            naturesSwiftnessAbilityIds !== null && (
              <Shell>
                <ReportDashboard
                  accessToken={accessToken}
                  reportCode={reportCode}
                  host={host}
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
                  fetchLookbackEvents={wrappedFetchLookbackEvents}
                  openFightId={openFightId}
                  onOpenFight={handleOpenFight}
                  onCloseFight={handleCloseFight}
                  activeEpicId={activeEpicId}
                  onSelectEpic={handleSelectEpic}
                  onStartOver={handleStartOver}
                />
              </Shell>
            )}
        </div>
      )}

      {accessToken && (
        <Footer
          onReopenOnboarding={() => navigate({ screen: "about" })}
          rateLimitUsage={rateLimitUsage}
        />
      )}
    </>
  );
}

export default App;
