import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportDashboard } from "./index";
import { aFight } from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
};

const baseProps = {
  accessToken: "test-token",
  reportCode: "4GYHZRdtL3bvhpc8",
  host: "fresh" as const,
  reportTitle: "SSC+TK 2026-07-07",
  druidId: 101,
  druid,
  lifebloomAbilityIds: new Set<number>([33763]),
  rejuvenationAbilityIds: new Set<number>([26982]),
  regrowthAbilityIds: new Set<number>([26980]),
  swiftmendAbilityIds: new Set<number>([18562]),
  naturesSwiftnessAbilityIds: new Set<number>([17116]),
  resolvedAbilities: new Map(),
  targetNames: new Map(),
  actorClasses: new Map(),
  openFightId: null as number | null,
  onOpenFight: vi.fn(),
  onCloseFight: vi.fn(),
  activeEpicId: null,
  onSelectEpic: vi.fn(),
  onStartOver: vi.fn(),
};

describe("ReportDashboard", () => {
  it("renders every non-trash fight immediately and lets you click in before any judgement resolves", () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Trash pack", encounterID: 0 }),
    ];
    const fetchEvents = () => new Promise<never>(() => {}); // never resolves

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    const row = screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ });
    expect(row).toBeInTheDocument();
    expect(screen.queryByText(/Trash pack/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Calculating…").length).toBeGreaterThan(0);
  });

  it("calls onOpenFight on row click; rendering the fight's scorecard once openFightId is set is the parent's job", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onOpenFight = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    );
    expect(onOpenFight).toHaveBeenCalledWith(1);

    rerender(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
        openFightId={1}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pull 1 — Lady Vashj/ }),
    ).not.toBeInTheDocument();
  });

  it("calls onCloseFight when ← All fights is clicked from an open fight", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onCloseFight = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onCloseFight={onCloseFight}
      />,
    );

    await user.click(screen.getByRole("button", { name: "← All fights" }));
    expect(onCloseFight).toHaveBeenCalledOnce();
  });

  it("shows each fight's own worst-of judgement once its six epics resolve", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pull 1 — Lady Vashj/ }),
      ).toHaveTextContent(/Good|Fair|Bad/),
    );
  });

  it("opens directly on the fight named by openFightId", async () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Leotheras the Blind", kill: true }),
    ];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={2}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Leotheras the Blind/)).toBeInTheDocument();
  });

  it("passes activeEpicId/onSelectEpic through to the open fight's Scorecard", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const events: never[] = [];
    const fetchEvents = () => Promise.resolve(events);
    const onSelectEpic = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onSelectEpic={onSelectEpic}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    expect(onSelectEpic).toHaveBeenCalledWith("gcd");
  });

  it("shows six aggregated epic chips that resolve once every fight's data is in", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    for (const label of [
      "GCD economy",
      "Lifebloom discipline",
      "Spell discipline",
      "Mana economy",
      "Death forensics",
      "Prep hygiene",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );
  });
});
