// src/App.test.tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  exchangeCodeForToken,
  WclApiError,
  type ReportAbility,
} from "./wcl/client";
import { fetchEventsPage } from "./wcl/events";
import { publishRateLimitUsage } from "./wcl/rateLimitUsage";
import { beginWclWarmupRetry, endWclWarmupRetry } from "./wcl/wclWarmup";
import {
  aReportFights,
  aFight,
  aCastTableEntry,
  aReportAbility,
  aRateLimitUsage,
} from "./testUtils/factories";

vi.mock("./wcl/client", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchReportFights: vi.fn(),
  fetchCastsTable: vi.fn(),
  fetchMasterDataAbilities: vi.fn(),
  exchangeCodeForToken: vi.fn(),
}));

vi.mock("./wcl/events", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEventsPage: vi.fn(),
}));

// Matches useWclAuth's ACCESS_TOKEN_STORAGE_KEY (src/wcl/useWclAuth.ts) —
// simulating an already-authenticated session the same way test/e2e/smoke.spec.ts does.
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";
// Matches App.tsx's ONBOARDING_SEEN_KEY. Every test below defaults to
// "already seen" (set in beforeEach) since this file's existing tests
// exercise the report-loading flow, not onboarding itself — the dedicated
// "Onboarding" describe block below clears this key explicitly instead.
const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";
const REPORT_CODE = "4GYHZRdtL3bvhpc8";
const REPORT_TITLE = "SSC+TK 2026-07-07";

function setUpHappyPathMocks() {
  vi.mocked(fetchReportFights).mockResolvedValue(
    aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
  );
  vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
  vi.mocked(fetchMasterDataAbilities).mockResolvedValue([
    aReportAbility(),
    aReportAbility({
      gameID: 33763,
      name: "Lifebloom",
    }),
  ]);
  vi.mocked(fetchEventsPage).mockResolvedValue({
    events: [],
    nextPageTimestamp: null,
  });
}

async function loadReport(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
  await user.click(screen.getByRole("button", { name: "Load report" }));
  await screen.findByRole("heading", { name: REPORT_TITLE });
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("renders the Connect screen when there is no access token, with no Client ID required upfront", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("WCL API Client ID"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Optional: Use your own WCL API Client ID instead",
      }),
    ).toBeInTheDocument();
  });

  it("reveals the optional own-Client-ID field when its disclosure is expanded", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", {
        name: "Optional: Use your own WCL API Client ID instead",
      }),
    );

    expect(screen.getByLabelText("WCL API Client ID")).toBeInTheDocument();
  });

  it("renders the report-input screen (not Connect) once a token is present but no report is loaded", () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");

    render(<App />);

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("detects druids across the whole report immediately once it loads, with no fight-selection step first", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(vi.mocked(fetchCastsTable)).toHaveBeenCalledWith(
      "test-token",
      REPORT_CODE,
      [1],
      expect.anything(),
    );
    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
  });

  it("resets to the report-input screen when the header logo/wordmark is clicked", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    await user.click(screen.getByRole("button", { name: "Bloomwatch" }));

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
  });

  it("excludes trash fights from the fights it detects druids across", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({
        title: REPORT_TITLE,
        fights: [
          aFight({ id: 1, encounterID: 0, name: "Trash" }),
          aFight({ id: 2 }),
        ],
      }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(vi.mocked(fetchCastsTable)).toHaveBeenCalledWith(
      "test-token",
      REPORT_CODE,
      [2],
      expect.anything(),
    );
  });

  it("requires picking a druid before continuing to the dashboard, when more than one is detected", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      await screen.findByRole("button", { name: "View report dashboard" }),
    ).toBeDisabled();

    await user.click(screen.getAllByRole("radio")[0]);

    expect(
      screen.getByRole("button", { name: "View report dashboard" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "View report dashboard" }),
    );

    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("returns to the report-input screen after clicking Load different WCL report on the druid-pick screen", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);
    await screen.findByRole("button", { name: "View report dashboard" });

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(screen.queryByText(REPORT_TITLE)).not.toBeInTheDocument();
  });

  it("fetches master data abilities exactly once per report, even when that fetch is still in flight when the report finishes loading", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    // Master data intentionally never resolves in this test: it models the
    // real-world case (a large report's ability list is slower than the
    // small fights query) where the fetch is still in flight at the exact
    // moment `loadedReport` flips and the app transitions screens.
    vi.mocked(fetchMasterDataAbilities).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByRole("heading", { name: REPORT_TITLE });

    expect(vi.mocked(fetchMasterDataAbilities)).toHaveBeenCalledTimes(1);
  });

  it("still resolves master data abilities fetched before the report finished loading, not aborted by the later transition to the dashboard", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    let resolveMasterData: (abilities: ReportAbility[]) => void;
    // Mirrors real fetch()'s AbortSignal contract (reject with AbortError
    // once the signal fires) — a mock that ignores the signal can't
    // reproduce a bug that only exists because of that contract.
    vi.mocked(fetchMasterDataAbilities).mockImplementation(
      (_accessToken, _reportCode, signal) =>
        new Promise<ReportAbility[]>((resolve, reject) => {
          resolveMasterData = resolve;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByRole("heading", { name: REPORT_TITLE });

    resolveMasterData!([
      aReportAbility(),
      aReportAbility({
        gameID: 33763,
        name: "Lifebloom",
      }),
    ]);

    // Sole candidate auto-advances straight to the dashboard once
    // resolvedAbilities is the last piece the gate was waiting on — no
    // "View report dashboard" click needed.
    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("jumps straight to the whole-report dashboard once the sole druid auto-selects, with no button click needed", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();

    // Sole-candidate auto-select (DruidPicker returns null) shouldn't leave a
    // bare "Druid" heading with nothing under it — see Fix 4 (pre-702). Checked
    // after the dashboard has appeared (not right after loadReport) since the
    // druid-pick screen briefly exists while detection/ability-resolution are
    // still in flight — asserting its absence too early is a race, not a
    // meaningful check.
    expect(
      screen.queryByRole("heading", { name: "Druid" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View report dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("drills into a fight's scorecard from the whole-report dashboard, and back to the fight list via ← All fights", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    const row = await screen.findByRole("button", {
      name: /Pull 1 · Coilfang Frenzy/,
    });
    await user.click(row);

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All fights" }));

    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the rate-limit fallback banner (without unmounting the current screen) when a request hits the default client's rate limit, and lets the user submit their own Client ID", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockRejectedValue(
      new WclApiError(429, "rate limited"),
    );
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));

    await screen.findByRole("heading", { name: REPORT_TITLE });
    await screen.findByText(/temporarily over capacity/);

    await user.type(
      screen.getByLabelText("WCL API Client ID"),
      "my-own-client-id",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(localStorage.getItem("wcl_client_id")).toBe("my-own-client-id");
    expect(
      screen.getByRole("heading", { name: REPORT_TITLE }),
    ).toBeInTheDocument();
  });

  it("shows the recovery overlay (with the error visible in View details) when the report fails to load for a reason other than a rate limit", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockRejectedValue(
      new Error("WCL API responded 500: server error"),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));

    expect(
      await screen.findByText("Sorry, something went wrong."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText(/WCL API responded 500/)).toBeInTheDocument();
  });

  it("shows the recovery overlay when the OAuth redirect's state doesn't match (e.g. a stale or replayed URL)", async () => {
    window.history.pushState(null, "", "?code=abc123&state=stale-state");

    render(<App />);

    expect(
      await screen.findByText("Sorry, something went wrong."),
    ).toBeInTheDocument();
  });
});

describe("App — Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
  });

  it("shows onboarding before Connect on a first visit (no seen flag)", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Connect to Warcraft Logs (WCL)",
      }),
    ).not.toBeInTheDocument();
  });

  it("dismisses onboarding and reveals Connect when Continue is clicked, persisting the seen flag", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });

  it("dismisses onboarding via Skip intro the same way", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Skip intro →" }));

    expect(
      screen.getByRole("button", { name: "Connect to Warcraft Logs (WCL)" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });

  it("reopens onboarding from the About link without clearing the seen flag", async () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("true");
  });

  it("reopens onboarding from the persistent footer's About link once authenticated", async () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
  });
});

describe("App — About and Judgements routes", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("shows the About screen and updates the hash when visited directly", () => {
    window.history.pushState(null, "", "#/about");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/about");
  });

  it("shows the Judgement Rationale screen when visited directly", () => {
    window.history.pushState(null, "", "#/judgements");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
  });

  it("scrolls to the linked section instead of resetting to the top when visited directly with a slug (docs/inbox.md regression)", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    const scrollIntoViewSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewSpy;
    window.history.pushState(null, "", "#/judgements/gcd-economy");

    render(<App />);

    expect(scrollIntoViewSpy).toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("links from About to the Judgement Rationale page", async () => {
    window.history.pushState(null, "", "#/about");
    const user = userEvent.setup();

    render(<App />);

    await user.click(
      screen.getByRole("link", { name: /Read the full judgement rationale/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/judgements");
  });

  it("opens the Judgement Rationale page from the footer, once authenticated", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("link", { name: "How judgements work" }));

    expect(
      await screen.findByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
  });
});

describe("App — first-visit redirect to About", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
  });

  it("redirects a first-time visit at the root to #/about", () => {
    render(<App />);

    expect(window.location.hash).toBe("#/about");
    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
  });

  it("returns to the originally-requested screen after Continue", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const user = userEvent.setup();

    render(<App />);
    expect(window.location.hash).toBe("#/about");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    // serializeRoute({screen: "input"}) is "#" (hashRoute.ts) — pushing a
    // bare "#" fragment normalizes to an empty string per the URL spec (both
    // jsdom and real browsers), the same behavior already asserted below at
    // "shows the recovery overlay when the OAuth redirect's state doesn't
    // match" (`expect(window.location.hash).toBe("")`).
    expect(window.location.hash).toBe("");
  });

  it("does not redirect a direct first-time visit to #/about itself", () => {
    window.history.pushState(null, "", "#/about");

    render(<App />);

    expect(window.location.hash).toBe("#/about");
  });
});

describe("App — shareable URL state", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("updates the URL hash as the user navigates report → druid → dashboard → fight → epic", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    // The sole-candidate auto-advance (druid detection + ability
    // resolution, then a useEffect-driven navigate()) is async and not yet
    // guaranteed to have settled the instant the report title appears —
    // wait for the hash to reach its post-auto-advance value rather than
    // asserting synchronously, matching how the dashboard UI itself is
    // awaited below.
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}`,
      ),
    );

    await user.click(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    );
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1`,
    );

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1/e/gcd`,
    );
  });

  it("moves back a screen via the browser back button, same as the in-app back-link", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);
    await user.click(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    );
    await screen.findByRole("button", { name: /GCD economy/ });

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    await screen.findByRole("heading", { name: "GCD utilization" });

    // One back() undoes exactly one navigate() call — the same granularity
    // as the in-app "← All metrics" link, which only closes the epic detail
    // and returns to the fight's widget list, not all the way to the
    // dashboard. Per story 703's acceptance criteria, browser back/forward
    // must mirror whichever in-app back-link applies "everywhere in the
    // flow — not just at the top level", and "← All metrics" (not
    // "← All fights") is what's shown while an epic is open.
    await act(async () => {
      window.history.back();
    });

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "GCD utilization" }),
    ).not.toBeInTheDocument();
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1`,
    );

    // A second back() undoes the fight-open navigate() too, landing on the
    // dashboard — matching "← All fights" this time.
    await act(async () => {
      window.history.back();
    });

    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
    ).not.toBeInTheDocument();
  });

  it("refetches when browser back/forward lands on a different previously-viewed report, instead of showing the first report's stale fight list", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const REPORT_CODE_B = "wXyZ0123AbCd4567";
    const REPORT_B_TITLE = "Sunwell 2026-07-20";
    // Two distinct reports with different fight lists but the same lone druid,
    // so both auto-advance to a dashboard. fetchReportFights is keyed on
    // reportCode so each report returns its own fights.
    vi.mocked(fetchReportFights).mockImplementation((_token, code) =>
      Promise.resolve(
        code === REPORT_CODE_B
          ? aReportFights({
              title: REPORT_B_TITLE,
              fights: [aFight({ id: 1, name: "Kalecgos" })],
            })
          : aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
      ),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([aCastTableEntry()]);
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([
      aReportAbility(),
      aReportAbility({ gameID: 33763, name: "Lifebloom" }),
    ]);
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });

    // Land straight on report A's dashboard (a deep link), which loads it.
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}`,
    );
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();

    // Simulate the browser back/forward button landing on a *different*
    // previously-viewed report's dashboard URL — a hash change via popstate
    // that bypasses handleReportSubmit/handleStartOver (the only two places
    // that reset report-scoped state imperatively), exactly like a real
    // back/forward navigation across two reports viewed in the same tab.
    act(() => {
      window.history.pushState(
        null,
        "",
        `#/r/${REPORT_CODE_B}/d/${encodeURIComponent("Dassz")}`,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // The dashboard must now reflect report B, not keep showing report A's
    // stale fights (the "wrong boss names, some fights missing" symptom).
    expect(
      await screen.findByRole("button", { name: /Pull 1 · Kalecgos/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Coilfang Frenzy/ }),
    ).not.toBeInTheDocument();
  });

  it("resumes directly on a deep-linked fight+epic screen, skipping the report-input step", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1/e/lifebloom`,
    );

    render(<App />);

    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Lifebloom discipline" }),
    ).toBeInTheDocument();
  });

  it("falls back to the druid picker when the URL names a druid that isn't a detected candidate", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    vi.mocked(fetchEventsPage).mockResolvedValue({
      events: [],
      nextPageTimestamp: null,
    });
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("NotARealDruid")}`,
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: "View report dashboard" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/r/${REPORT_CODE}`);
  });

  it("falls back to the dashboard when the URL names a fight that isn't in this report", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    window.history.pushState(
      null,
      "",
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/999`,
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: /Pull 1 · Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}`,
    );
  });

  it("resumes on the shared-link screen after completing the OAuth redirect round-trip, not the report-input screen (closes the real gap the 747d355 fix left open)", async () => {
    // No pre-existing access token: this is the fresh-tab OAuth-return case
    // (a shared link opened by someone not yet connected), which is exactly
    // what forces connect()'s full-page-redirect detour through WCL in the
    // first place.
    setUpHappyPathMocks();
    const pendingHash = `#/r/${REPORT_CODE}/d/${encodeURIComponent("Dassz")}/f/1/e/lifebloom`;
    // Mirrors what useWclAuth's connect() stashes into sessionStorage right
    // before the full-page redirect to WCL (src/wcl/useWclAuth.ts) — a test
    // can't literally follow that redirect, so it reconstructs the
    // post-redirect state directly instead.
    sessionStorage.setItem("wcl_pkce_verifier", "test-verifier");
    sessionStorage.setItem("wcl_pkce_state", "test-state");
    sessionStorage.setItem("wcl_pending_hash", pendingHash);
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "returned-token",
      expiresIn: 3600,
    });
    // Mirrors WCL's redirect back: ?code & matching state in the query
    // string, no hash yet (the hash is only restored once completeAuth()
    // runs, from wcl_pending_hash) — a relative pushState with only a
    // search component drops any existing fragment, matching a real
    // full-page navigation back from WCL.
    window.history.pushState(null, "", "?code=abc123&state=test-state");
    expect(window.location.hash).toBe("");

    render(<App />);

    // This is the assertion the prior fix (747d355) claimed to satisfy but
    // didn't: window.location.hash alone being restored isn't enough if
    // useHashRoute's React state never re-syncs to it (see the effect-order
    // race in useHashRoute.ts). Asserting the *rendered* screen, not just
    // the URL, is what actually catches that gap.
    expect(
      await screen.findByRole("heading", { name: "Lifebloom discipline" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
  });
});

describe("App — Rate-limit usage banner", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("shows the banner once usage crosses 75% on the shared default client, and hides it again below that", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(
      await screen.findByText(/Shared connection is running low/),
    ).toBeInTheDocument();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    await waitFor(() =>
      expect(
        screen.queryByText(/Shared connection is running low/),
      ).not.toBeInTheDocument(),
    );
  });

  it("never shows the banner once a custom Client ID has been set, regardless of usage", async () => {
    localStorage.setItem("wcl_client_id", "my-own-client-id");
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 3500 }),
      );
    });

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();
  });

  it("does not show the banner while the 008 rate-limited fallback is already showing", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockRejectedValue(
      new WclApiError(429, "rate limited"),
    );
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByText(/temporarily over capacity/);

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();
  });
});

describe("App — WCL warmup banner", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("shows a friendlier message while a WCL query is retrying a cold-cache warmup error, and hides it again once resolved", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      screen.queryByText(/Waiting on Warcraft Logs/),
    ).not.toBeInTheDocument();

    act(() => {
      beginWclWarmupRetry();
    });

    expect(
      await screen.findByText(/Waiting on Warcraft Logs/),
    ).toBeInTheDocument();

    act(() => {
      endWclWarmupRetry();
    });

    await waitFor(() =>
      expect(
        screen.queryByText(/Waiting on Warcraft Logs/),
      ).not.toBeInTheDocument(),
    );
  });
});
