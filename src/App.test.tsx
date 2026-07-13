import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
  type ReportAbility,
} from "./wcl/client";
import { fetchEventsPage } from "./wcl/events";
import {
  aReportFights,
  aFight,
  aCastTableEntry,
  aReportAbility,
} from "./testUtils/factories";

vi.mock("./wcl/client", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchReportFights: vi.fn(),
  fetchCastsTable: vi.fn(),
  fetchMasterDataAbilities: vi.fn(),
}));

vi.mock("./wcl/events", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEventsPage: vi.fn(),
}));

// Matches useWclAuth's ACCESS_TOKEN_STORAGE_KEY (src/wcl/useWclAuth.ts) —
// simulating an already-authenticated session the same way test/e2e/smoke.spec.ts does.
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";
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
      icon: "spell_nature_lifebloom.jpg",
    }),
  ]);
  vi.mocked(fetchEventsPage).mockResolvedValue({
    events: [],
    nextPageTimestamp: null,
  });
}

async function loadReportAndReachPicker(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
  await user.click(screen.getByRole("button", { name: "Load report" }));
  await screen.findByRole("heading", { name: REPORT_TITLE });
}

async function confirmFightsAndReachDruidStage(
  user: ReturnType<typeof userEvent.setup>,
) {
  await loadReportAndReachPicker(user);
  await user.click(screen.getByLabelText(/Pull 1/));
  await user.click(screen.getByRole("button", { name: "Confirm fights" }));
  // Not "await screen.findByRole('← Change fight selection')": with a sole
  // detected druid, that screen can auto-advance straight to the Scorecard
  // fast enough that this checkpoint never becomes observable — the confirm
  // click above already synchronously flushes the fightsConfirmed state
  // change, so callers can rely on it without a separate wait here.
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
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
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");

    render(<App />);

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("renders the fight picker screen after a report loads, and not the report-input screen", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReportAndReachPicker(user);

    expect(screen.getByText(/Pull 1/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
    // Druid detection is scoped to the confirmed fight selection (it fetches
    // real cast data, which gets expensive across a whole report) — it
    // shouldn't run before the user has picked and confirmed any fights.
    expect(vi.mocked(fetchCastsTable)).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Get scorecard" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the report-input screen after clicking Load different WCL report on the fight picker", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReportAndReachPicker(user);

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(screen.queryByText(REPORT_TITLE)).not.toBeInTheDocument();
  });

  it("only detects druids in the confirmed fight selection, once fights are confirmed", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    // Two candidates, not one: a sole candidate auto-advances straight to
    // the Scorecard screen, unmounting the fight-picker screen this test
    // asserts against.
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);

    expect(vi.mocked(fetchCastsTable)).toHaveBeenCalledWith(
      "test-token",
      REPORT_CODE,
      [1],
      expect.anything(),
    );
    expect(
      screen.getByRole("button", { name: "Confirm fights", hidden: true }),
    ).not.toBeVisible();
  });

  it("returns to the fight picker with the prior selection intact when changing fight selection", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    // Two candidates, not one: a sole candidate auto-advances straight to
    // the Scorecard screen, which would race this test's own navigation.
    vi.mocked(fetchCastsTable).mockResolvedValue([
      aCastTableEntry(),
      aCastTableEntry({ id: 3, name: "Barrychuckle" }),
    ]);
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);

    await user.click(
      screen.getByRole("button", { name: "← Change fight selection" }),
    );

    expect(
      screen.getByRole("button", { name: "Confirm fights" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Pull 1/)).toBeChecked();
  });

  it("fetches master data abilities exactly once per report, even when that fetch is still in flight when the report finishes loading", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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

    // Reaching the fight/druid picker screen proves the loadedReport
    // transition happened while master data was still unresolved.
    await screen.findByText(/Pull 1/);
    expect(vi.mocked(fetchMasterDataAbilities)).toHaveBeenCalledTimes(1);
  });

  it("still resolves master data abilities fetched before the report finished loading, not aborted by the later screen transitions", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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
    // Reaches the druid-detection screen — two full screen transitions past
    // the point AbilityResolver's original mount would have unmounted,
    // if it were still gated on `!loadedReport`.
    await confirmFightsAndReachDruidStage(user);

    resolveMasterData!([
      aReportAbility(),
      aReportAbility({
        gameID: 33763,
        name: "Lifebloom",
        icon: "spell_nature_lifebloom.jpg",
      }),
    ]);

    // Sole candidate auto-advances straight to the Scorecard once
    // resolvedAbilities is the last piece canGetScorecard was waiting on —
    // no "Get scorecard" button to wait on here.
    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
  });

  it("jumps straight to the Scorecard screen once the sole druid auto-selects, with no Get scorecard click needed", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);

    // Sole-candidate auto-select (DruidPicker returns null) shouldn't leave a
    // bare "Druid" heading with nothing under it — see Fix 4.
    expect(
      screen.queryByRole("heading", { name: "Druid" }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get scorecard" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the fight picker, with the prior selection intact, after clicking ← All fights on the Scorecard dashboard", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);
    await screen.findByRole("button", { name: /GCD economy/ });

    await user.click(screen.getByRole("button", { name: "← All fights" }));

    expect(
      screen.getByRole("button", { name: "Confirm fights" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Pull 1/)).toBeChecked();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
    ).not.toBeInTheDocument();
  });

  it("returns to the report-input screen (not Connect) after clicking Load different WCL report", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);
    await screen.findByRole("button", { name: /GCD economy/ });

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(screen.queryByText(REPORT_TITLE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("shows the rate-limit fallback banner (without unmounting the current screen) when a request hits the default client's rate limit, and lets the user submit their own Client ID", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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
    await user.click(screen.getByLabelText(/Pull 1/));
    await user.click(screen.getByRole("button", { name: "Confirm fights" }));
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
});
