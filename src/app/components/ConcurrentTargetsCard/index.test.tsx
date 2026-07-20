import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent } from "../../../wcl/events";
import * as concurrentLb3TargetsModule from "../../../metrics/concurrentLb3Targets";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[]) {
  return (): Promise<WclEvent[]> => Promise.resolve(buffEvents);
}

const noopFetchLookbackEvents = (): Promise<WclEvent[]> => Promise.resolve([]);

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
        fetchLookbackEvents={noopFetchLookbackEvents}
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

  it("shows a Good chip (not the informational note) when 2+ targets held LB3 for at least 50% of the fight", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 10000, stack: 3, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 15000, stack: 2, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 20000, stack: 3, targetID: 47 }),
    ];

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
        fetchLookbackEvents={noopFetchLookbackEvents}
      />,
    );

    await waitFor(() => expect(screen.getByText("Good")).toBeInTheDocument());
    expect(
      screen.queryByText("Informational — no judgement"),
    ).not.toBeInTheDocument();
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
        fetchLookbackEvents={noopFetchLookbackEvents}
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
        fetchLookbackEvents={noopFetchLookbackEvents}
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
        fetchLookbackEvents={noopFetchLookbackEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("fetches a lookback window and resolves a carry-in target instead of excluding it", async () => {
    const fightStart = 2011529;
    const fightEnd = 2113050;
    const fight = aFight({ id: 6, startTime: fightStart, endTime: fightEnd });
    // Same fixture shape as concurrentLb3Targets.test.ts's Task 6 "resolves"
    // scenario: the fight-window timeline opens with a "refresh" (no
    // leading "open"), which is only possible if the buff was already
    // active before this fetch window began.
    const buffEvents = [
      aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 2 }),
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1960000, targetID: 5, sourceID: 2 }),
      anApplyBuffStackEvent({
        timestamp: 1970000,
        stack: 3,
        targetID: 5,
        sourceID: 2,
      }),
    ];
    const fetchLookbackEvents = vi.fn().mockResolvedValue(lookbackEvents);

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    // A single target held stack-3 for the whole fight (resolved via the
    // lookback) -> 100% avg/peak-1 concurrency, not "Avg 0.0 · Peak 0"
    // (which is what an excluded/unresolved carry-in target would read).
    await waitFor(() =>
      expect(screen.getByText("Avg 1.0 · Peak 1")).toBeInTheDocument(),
    );

    expect(fetchLookbackEvents).toHaveBeenCalledTimes(1);
    expect(fetchLookbackEvents).toHaveBeenCalledWith(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      "Buffs",
      fightStart - 60_000,
      fightStart,
      true,
    );
  });

  it("never calls fetchLookbackEvents when no target's timeline is ambiguous", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 5000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];
    const fetchLookbackEvents = vi.fn().mockResolvedValue([]);

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Avg 0.6 · Peak 1")).toBeInTheDocument(),
    );
    expect(fetchLookbackEvents).not.toHaveBeenCalled();
  });
});
