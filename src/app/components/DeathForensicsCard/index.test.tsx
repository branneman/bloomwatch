import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeathForensicsCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aDeathEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Deaths") return Promise.resolve(deathEvents);
    if (dataType === "Casts") return Promise.resolve(castEvents);
    return Promise.resolve(buffEvents);
  };
}

describe("DeathForensicsCard", () => {
  it("shows the flagged count and a per-death card once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 50 })];

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[50, "Offtank"]])}
        fetchEvents={makeFetchEvents(deathEvents, [], buffEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Per-death resource audit" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 of 1 deaths flagged")).toBeInTheDocument(),
    );
    expect(screen.getByText("Offtank")).toBeInTheDocument();
    // Both the overall MetricCard verdict and the single flagged death's own
    // DeathCard chip render "Red" here — assert both are present rather than
    // a single ambiguous match.
    expect(screen.getAllByText("Red")).toHaveLength(2);
    expect(
      screen.getByText(/not automatically the druid's fault/),
    ).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no friendly deaths", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [], [])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No friendly deaths")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No friendly deaths this fight."),
    ).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("falls back to 'Target #<id>' when the death's target has no known name", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const deathEvents = [aDeathEvent({ timestamp: 90000, targetID: 999 })];

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents(deathEvents, [], [])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Target #999")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
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
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });

  it("requests the Deaths, Casts, and Buffs event types", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = vi.fn().mockResolvedValue([]);

    render(
      <DeathForensicsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No friendly deaths")).toBeInTheDocument(),
    );

    const requestedTypes = fetchEvents.mock.calls.map((call) => call[3]);
    expect(requestedTypes).toEqual(
      expect.arrayContaining(["Deaths", "Casts", "Buffs"]),
    );
  });
});
