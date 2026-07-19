import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownrankingDisciplineCard } from "./index";
import * as downrankingDisciplineModule from "../../../metrics/downrankingDiscipline";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aFight, aCastEvent, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
]);

function makeFetchEvents(castEvents: WclEvent[], healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve([]);
  };
}

describe("DownrankingDisciplineCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the flagged count/judgement and a per-rank table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: 50, abilityGameID: 26980 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1001,
        targetID: 50,
        abilityGameID: 26980,
        amount: 400,
        overheal: 600,
      }),
    ];

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents(castEvents, healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Downranking discipline" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 flagged max-rank cast")).toBeInTheDocument(),
    );
    expect(screen.getByText("Regrowth")).toBeInTheDocument();
    expect(screen.getByText("Rank 10 (max)")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
  });

  it("shows a message and good judgement when there are no tracked casts", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No Rejuvenation, Regrowth, or Healing Touch casts this fight.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
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
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
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
      downrankingDisciplineModule,
      "computeDownrankingDiscipline",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("requests Healing events with includeResources: true", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = vi.fn().mockResolvedValue([]);

    render(
      <DownrankingDisciplineCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No Rejuvenation, Regrowth, or Healing Touch casts this fight.",
        ),
      ).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find(
      (call) => call[3] === "Healing",
    );
    expect(healingCall?.[4]).toBe(true);
  });
});
