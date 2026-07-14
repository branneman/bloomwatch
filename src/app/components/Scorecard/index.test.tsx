// src/app/components/Scorecard/index.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Scorecard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
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
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={101}
        druid={druid}
        lifebloomAbilityIds={new Set([33763])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={new Map()}
        targetNames={new Map()}
        actorClasses={new Map()}
        fetchEvents={fetchEvents}
        onBackToFights={onBackToFights}
        onStartOver={onStartOver}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Lady Vashj \(Kill, 5:41\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fernwhisper — Restoration")).toBeInTheDocument();

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

    // "Load different WCL report" reads above "← All fights" — the bigger
    // reset sits above the smaller one.
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

  it("drills into GCD economy detail and back to the overview", async () => {
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

    render(
      <Scorecard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={101}
        druid={druid}
        lifebloomAbilityIds={new Set([33763])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={new Map()}
        targetNames={new Map()}
        actorClasses={new Map()}
        fetchEvents={fetchEvents}
        onBackToFights={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /GCD economy/ }),
      ).toHaveTextContent("Red"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /GCD economy/ }));

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
    // Fight/report navigation only makes sense on the dashboard — the
    // metric-detail view already has its own way back to the dashboard.
    expect(
      screen.queryByRole("button", { name: "← All fights" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load different WCL report" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All metrics" }));
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
  });
});
