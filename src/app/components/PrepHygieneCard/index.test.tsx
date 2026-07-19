import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrepHygieneCard } from "./index";
import * as prepHygieneModule from "../../../metrics/prepHygiene";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { aCombatantInfoEvent, aFight } from "../../../testUtils/factories";

function makeFetchEvents(combatantInfoEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "CombatantInfo") {
      return Promise.resolve(combatantInfoEvents);
    }
    return Promise.resolve([]);
  };
}

describe("PrepHygieneCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a good judgement and both rows present when fully prepped", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([aCombatantInfoEvent()])}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Pull-time consumables check" }),
    ).toBeInTheDocument();
    // Two "Good" chips render once loaded: the card's own overall judgement
    // (MetricCard's header chip) and the flask/elixir row's own chip, which
    // happen to match here since both are good in this fully-prepped case.
    await waitFor(() => expect(screen.getAllByText("Good")).toHaveLength(2));
    expect(
      screen.getByText("Battle + guardian elixir active"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Present")).toHaveLength(2);
  });

  it("flags missing food and oil as Missing rows and a bad judgement", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const combatant = aCombatantInfoEvent({
      auras: [],
      gear: Array.from({ length: 16 }, () => ({})),
    });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    // Two "Bad" chips render here too, for the same reason as the good
    // case above: the card's overall judgement and the flask/elixir row's
    // own judgement are both bad in this fully-unprepped case.
    await waitFor(() => expect(screen.getAllByText("Bad")).toHaveLength(2));
    expect(screen.getByText("No flask or elixir active")).toBeInTheDocument();
    expect(screen.getAllByText("Missing")).toHaveLength(2);
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={() => new Promise<never>(() => {})}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(prepHygieneModule, "computePrepHygiene").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
