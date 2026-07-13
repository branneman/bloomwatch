import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrepHygieneCard } from "./index";
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
  it("shows a green judgement and both rows present when fully prepped", async () => {
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
    // Two "Green" chips render once loaded: the card's own overall judgement
    // (MetricCard's header chip) and the flask/elixir row's own chip, which
    // happen to match here since both are green in this fully-prepped case.
    await waitFor(() => expect(screen.getAllByText("Green")).toHaveLength(2));
    expect(
      screen.getByText("Battle + guardian elixir active"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Present")).toHaveLength(2);
  });

  it("flags missing food and oil as Missing rows and a red judgement", async () => {
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

    // Two "Red" chips render here too, for the same reason as the green
    // case above: the card's overall judgement and the flask/elixir row's
    // own judgement are both red in this fully-unprepped case.
    await waitFor(() => expect(screen.getAllByText("Red")).toHaveLength(2));
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

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={() =>
          Promise.reject(new Error("WCL API responded 500: server error"))
        }
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
