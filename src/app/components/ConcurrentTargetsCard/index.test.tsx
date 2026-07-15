import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent } from "../../../wcl/events";
import * as concurrentLb3TargetsModule from "../../../metrics/concurrentLb3Targets";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[]) {
  return (): Promise<WclEvent[]> => Promise.resolve(buffEvents);
}

describe("ConcurrentTargetsCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows average, peak, and level breakdown once loaded, with no judgement chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 5000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Concurrent LB3 targets" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Avg 0.6 · Peak 1")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
    expect(screen.getByText("0 targets — 40%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 60%")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ConcurrentTargetsCard
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
      <ConcurrentTargetsCard
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
    vi.spyOn(
      concurrentLb3TargetsModule,
      "computeConcurrentLb3Targets",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ConcurrentTargetsCard
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
