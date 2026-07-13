import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
  WclApiError,
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
  await screen.findByRole("button", { name: "← Change fight selection" });
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

  it("only detects druids in the confirmed fight selection, once fights are confirmed", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
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

  it("enables Get scorecard once the sole druid auto-selects, then shows the Scorecard screen (not the picker)", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);

    const getScorecardButton = screen.getByRole("button", {
      name: "Get scorecard",
    });
    // Starts disabled until druid detection resolves and the sole candidate
    // auto-selects; not asserted as an intermediate state here since the
    // mocked fetch can resolve before this line runs.
    await waitFor(() => expect(getScorecardButton).toBeEnabled());
    // Sole-candidate auto-select (DruidPicker returns null) shouldn't leave a
    // bare "Druid" heading with nothing under it — see Fix 4.
    expect(
      screen.queryByRole("heading", { name: "Druid" }),
    ).not.toBeInTheDocument();

    await user.click(getScorecardButton);

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Coilfang Frenzy/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get scorecard" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the report-input screen (not Connect) after clicking Start over", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await confirmFightsAndReachDruidStage(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Get scorecard" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Get scorecard" }));
    await screen.findByRole("button", { name: /GCD economy/ });

    await user.click(screen.getByRole("button", { name: "Start over" }));

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
