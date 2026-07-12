import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  fetchReportFights,
  fetchCastsTable,
  fetchMasterDataAbilities,
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

describe("App", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the Connect screen when there is no access token", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("WCL Client ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("renders the report-input screen (not Connect) once a token is present but no report is loaded", () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");

    render(<App />);

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Bloomwatch" }),
    ).not.toBeInTheDocument();
  });

  it("renders the fight/druid picker screen after a report loads, and not the report-input screen", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReportAndReachPicker(user);

    expect(screen.getByText(/Pull 1/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Report URL or code"),
    ).not.toBeInTheDocument();
  });

  it("enables Get scorecard once the sole druid auto-selects and a fight is checked, then shows the Scorecard screen (not the picker)", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReportAndReachPicker(user);

    const getScorecardButton = screen.getByRole("button", {
      name: "Get scorecard",
    });
    expect(getScorecardButton).toBeDisabled();

    await user.click(screen.getByLabelText(/Pull 1/));

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
    await loadReportAndReachPicker(user);

    await user.click(screen.getByLabelText(/Pull 1/));
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
});
