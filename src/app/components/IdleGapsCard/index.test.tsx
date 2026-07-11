import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdleGapsCard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("IdleGapsCard", () => {
  it("renders total dead time, judgement, and the longest gaps once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 100000,
    });
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <IdleGapsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("4% dead time")).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(
      screen.getByText(/Total dead time: 0:04 \(1 gap\)/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "0:02 for 0:04" });
    expect(link).toHaveAttribute(
      "href",
      "https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8#fight=6&type=summary&start=1500&end=5000",
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <IdleGapsCard
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
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <IdleGapsCard
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
