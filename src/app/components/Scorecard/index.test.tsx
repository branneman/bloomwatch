// src/app/components/Scorecard/index.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Scorecard } from "./index";
import {
  aCastEvent,
  aCombatantInfoEvent,
  aFight,
} from "../../../testUtils/factories";
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
  druidId: 101,
  druid,
  lifebloomAbilityIds: new Set([33763]),
  rejuvenationAbilityIds: new Set([26982]),
  regrowthAbilityIds: new Set([26980]),
  swiftmendAbilityIds: new Set([18562]),
  naturesSwiftnessAbilityIds: new Set([17116]),
  resolvedAbilities: new Map([
    [33763, { kind: "spell" as const, spell: "Lifebloom" as const, rank: 1 }],
  ]),
  faerieFireAbilityIds: new Set<number>(),
  bossActorIds: new Set<number>(),
  targetNames: new Map(),
  actorClasses: new Map(),
  fetchLookbackEvents: () => Promise.resolve([]),
  activeEpic: null,
  onSelectEpic: vi.fn(),
  onBackToFights: vi.fn(),
  onStartOver: vi.fn(),
};

describe("Scorecard", () => {
  it("renders the fight header, all 6 epic widgets, and the footer", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const onBackToFights = vi.fn();
    const onStartOver = vi.fn();
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onBackToFights={onBackToFights}
        onStartOver={onStartOver}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Lady Vashj \(Kill, 5:41\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fernwhisper · Restoration")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
        "Talent archetype: Unknown (talent read unavailable)",
      ),
    );

    expect(
      screen.getByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Spell discipline/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mana economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Death forensics/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Prep hygiene/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not yet available")).not.toBeInTheDocument();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /can't judge target selection/,
    );

    const buttonNames = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttonNames.indexOf("Load different WCL report")).toBeLessThan(
      buttonNames.indexOf("← All fights"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "← All fights" }));
    expect(onBackToFights).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Load different WCL report" }),
    );
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("calls onSelectEpic('gcd') when the GCD economy widget is clicked; rendering the detail once activeEpic is set is the parent's job", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 10000,
    });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 101, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 101, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);
    const onSelectEpic = vi.fn();

    const { rerender } = render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onSelectEpic={onSelectEpic}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /GCD economy/ }),
      ).toHaveTextContent("Fair"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /GCD economy/ }));
    expect(onSelectEpic).toHaveBeenCalledWith("gcd");

    rerender(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onSelectEpic={onSelectEpic}
        activeEpic="gcd"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "← All metrics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Lifebloom discipline/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "← All fights" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load different WCL report" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All metrics" }));
    expect(onSelectEpic).toHaveBeenCalledWith(null);
  });

  it("shows an off-role Alert when the druid didn't clear the healing-cast threshold this fight", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        {...baseProps}
        fight={fight}
        fetchEvents={fetchEvents}
        onBackToFights={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(
      screen.getByText(/cast 0 healing spells this fight/),
    ).toBeInTheDocument();
  });

  it("shows an unsupported-build Alert when the detected archetype isn't well-supported", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "CombatantInfo"
          ? [
              aCombatantInfoEvent({
                sourceID: 101,
                talents: [{ id: 25 }, { id: 0 }, { id: 10 }],
              }),
            ]
          : [],
      );

    render(
      <Scorecard {...baseProps} fight={fight} fetchEvents={fetchEvents} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
        "Talent archetype: Mostly Balance",
      ),
    );
    expect(
      screen.getByText(/isn't one Bloomwatch judges well yet/),
    ).toBeInTheDocument();
  });

  it("doesn't show the unsupported-build Alert for a deep-resto archetype", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "CombatantInfo"
          ? [
              aCombatantInfoEvent({
                sourceID: 101,
                talents: [{ id: 0 }, { id: 0 }, { id: 41 }],
              }),
            ]
          : [],
      );

    render(
      <Scorecard {...baseProps} fight={fight} fetchEvents={fetchEvents} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Talent archetype:/)).toHaveTextContent(
        "Talent archetype: Deep resto",
      ),
    );
    expect(
      screen.queryByText(/isn't one Bloomwatch judges well yet/),
    ).not.toBeInTheDocument();
  });
});
