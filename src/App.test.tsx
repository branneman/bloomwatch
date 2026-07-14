// src/App.test.tsx
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
      icon: "spell_nature_lifebloom.jpg",
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
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");

    render(<App />);

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("detects druids across the whole report immediately once it loads, with no fight-selection step first", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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

  it("excludes trash fights from the fights it detects druids across", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("returns to the report-input screen after clicking Load different WCL report on the druid-pick screen", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
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
    await screen.findByRole("heading", { name: REPORT_TITLE });

    expect(vi.mocked(fetchMasterDataAbilities)).toHaveBeenCalledTimes(1);
  });

  it("still resolves master data abilities fetched before the report finished loading, not aborted by the later transition to the dashboard", async () => {
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
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByRole("heading", { name: REPORT_TITLE });

    resolveMasterData!([
      aReportAbility(),
      aReportAbility({
        gameID: 33763,
        name: "Lifebloom",
        icon: "spell_nature_lifebloom.jpg",
      }),
    ]);

    // Sole candidate auto-advances straight to the dashboard once
    // resolvedAbilities is the last piece the gate was waiting on — no
    // "View report dashboard" click needed.
    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("jumps straight to the whole-report dashboard once the sole druid auto-selects, with no button click needed", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
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
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    const row = await screen.findByRole("button", {
      name: /Pull 1 — Coilfang Frenzy/,
    });
    await user.click(row);

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All fights" }));

    expect(
      await screen.findByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /GCD economy/ }),
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

describe("App — Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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
});
