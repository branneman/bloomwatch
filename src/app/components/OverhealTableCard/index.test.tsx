import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverhealTableCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aFight, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
]);

function makeFetchEvents(healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve([]);
  };
}

describe("OverhealTableCard", () => {
  it("shows the judgement and a per-spell table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT-aware overheal table" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Lifebloom")).toBeInTheDocument(),
    );
    expect(screen.getByText("Bloom")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("Swiftmend")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.queryAllByText("Bad").length).toBeGreaterThan(0);
  });

  it("renders a dash instead of a chip for informational HoT-tick rows", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
    ]);
    const healingEvents = [
      aHealEvent({
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Rejuvenation")).toBeInTheDocument(),
    );
    expect(screen.getByText("HoT tick (informational)")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no heals to report", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No heals to report this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });

  it("requests Healing events with includeResources: true", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = vi.fn().mockResolvedValue([]);

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No heals to report this fight."),
      ).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find(
      (call) => call[3] === "Healing",
    );
    expect(healingCall?.[4]).toBe(true);
  });
});
