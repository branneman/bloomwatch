import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCurveCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

function aManaCastEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: 2,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("ManaCurveCard", () => {
  it("renders the ending mana percentage and judgement chip for a qualifying kill", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [aManaCastEvent(1000, 9000), aManaCastEvent(2000, 2000)];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows an informational note instead of a judgement chip on a wipe", async () => {
    const fight = aFight({
      id: 6,
      kill: false,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [aManaCastEvent(1000, 2000)];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    expect(screen.getByText("Informational — not a kill")).toBeInTheDocument();
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
  });

  it("shows a no-data message when the druid has zero mana samples", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No mana samples were found for this druid this fight.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Informational — no mana data"),
    ).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <ManaCurveCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
