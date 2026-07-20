import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LB3UptimeCard } from "./index";
import * as lb3UptimeModule from "../../../metrics/lb3Uptime";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

const noopFetchLookbackEvents = () => Promise.resolve([]);

describe("LB3UptimeCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders per-target LB3 uptime once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 11000,
    });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Fanah"]])}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={noopFetchLookbackEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "LB3 uptime per target" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fanah")).toBeInTheDocument());
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("falls back to a numeric target label when the name is unknown", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 11000 });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={noopFetchLookbackEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Target #42")).toBeInTheDocument(),
    );
  });

  it("shows a message when there are no maintained targets", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={noopFetchLookbackEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No maintained targets.")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
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
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
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
    vi.spyOn(lb3UptimeModule, "computeLb3Uptime").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
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
    // Same fixture shape as lb3Uptime.test.ts's "resolves a carry-in
    // target" test: the fight-window timeline opens with a "refresh" (no
    // leading "open"), which is only possible if the buff was already
    // active before this fetch window began.
    const events = [
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
    const fetchEvents = () => Promise.resolve(events);
    const fetchLookbackEvents = vi.fn().mockResolvedValue(lookbackEvents);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[5, "Fanah"]])}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    await waitFor(() => expect(screen.getByText("Fanah")).toBeInTheDocument());

    expect(fetchLookbackEvents).toHaveBeenCalledTimes(1);
    expect(fetchLookbackEvents).toHaveBeenCalledWith(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      "Buffs",
      fightStart - 60_000,
      fightStart,
      true,
    );

    // Resolved to 100% LB3 uptime/"Good" rather than excluded ("No
    // maintained targets.") or read as a confident 0%/bad.
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(
      screen.queryByText("No maintained targets."),
    ).not.toBeInTheDocument();
  });

  it("does not show a local error message when fetchLookbackEvents rejects (escalates to the app-level recovery overlay instead)", async () => {
    const fightStart = 2011529;
    const fightEnd = 2113050;
    const fight = aFight({ id: 6, startTime: fightStart, endTime: fightEnd });
    // Same carry-in fixture shape as the "fetches a lookback window" test
    // above: the fight-window timeline opens with a "refresh" (no leading
    // "open"), so detectCarryInTargets finds a carry-in target and
    // fetchLookbackEvents actually gets called.
    const events = [
      aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 2 }),
    ];
    const fetchEvents = () => Promise.resolve(events);
    const fetchLookbackEvents = vi
      .fn()
      .mockRejectedValue(new Error("WCL API responded 500: server error"));

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[5, "Fanah"]])}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    await waitFor(() => expect(fetchLookbackEvents).toHaveBeenCalledTimes(1));
    // Let the rejection settle through the component's async chain.
    await act(async () => {
      await Promise.resolve().then(() => Promise.resolve());
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never calls fetchLookbackEvents when no target's timeline is ambiguous", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 11000,
    });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);
    const fetchLookbackEvents = vi.fn().mockResolvedValue([]);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Fanah"]])}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    await waitFor(() => expect(screen.getByText("Fanah")).toBeInTheDocument());
    expect(fetchLookbackEvents).not.toHaveBeenCalled();
  });
});
