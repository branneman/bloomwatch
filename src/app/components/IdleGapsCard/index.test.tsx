import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdleGapsCard } from "./index";
import * as idleGapsModule from "../../../metrics/idleGaps";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("IdleGapsCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
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
    expect(screen.getByText("Good")).toBeInTheDocument();
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

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <IdleGapsCard
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
    vi.spyOn(idleGapsModule, "computeIdleGaps").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

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
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
