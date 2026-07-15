import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshCadenceCard } from "./index";
import * as refreshCadenceModule from "../../../metrics/refreshCadence";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

describe("RefreshCadenceCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the median, judgement, and histogram once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 20000 });
    const events = [
      anApplyBuffEvent({ timestamp: 1880312, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1881811, stack: 2, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1881811, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1883327, stack: 3, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1883327, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1889731, targetID: 42 }),
      aRefreshBuffEvent({ timestamp: 1896347, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 1903349, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Refresh cadence" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Median 6.5s")).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
  });

  it("shows a message when no 3-stack refreshes happened", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 20000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No 3-stack refreshes recorded this fight."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
    vi.spyOn(refreshCadenceModule, "computeRefreshCadence").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RefreshCadenceCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
