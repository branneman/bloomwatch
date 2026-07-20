import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumableThroughputCard } from "./index";
import * as consumableThroughputModule from "../../../metrics/consumableThroughput";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";

const DRUID_ID = 2;
const MANA_POTION_ID = 17531;

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [MANA_POTION_ID, { kind: "consumable", item: "Mana Potion" }],
]);

function aManaSampleEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("ConsumableThroughputCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a table row per consumable with its judgement chip", async () => {
    // 600s: Mana Potion floor 5 (120s interval), Rune floor 2 (300s interval, story 911).
    const fight = aFight({ id: 6, startTime: 0, endTime: 600_000 });
    const events = [
      aManaSampleEvent(500, 6000), // 60% — triggers judging
      ...[1000, 2000, 3000, 4000, 5000].map((timestamp) =>
        aCastEvent({
          timestamp,
          sourceID: DRUID_ID,
          abilityGameID: MANA_POTION_ID,
        }),
      ),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
    expect(screen.getByText("Rune")).toBeInTheDocument();
    // Header chip is "Fair" (mixedJudgement: good potions row + bad rune row),
    // not a flat "Bad" from the old worst-of combination.
    expect(screen.getAllByText("Good")).toHaveLength(1); // potions row, 5/5
    expect(screen.getAllByText("Fair")).toHaveLength(1); // header chip
    expect(screen.getAllByText("Bad")).toHaveLength(1); // rune row, 0/2
  });

  it("shows an informational note instead of a table when mana never drops below 70%", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const events = [aManaSampleEvent(500, 9000)]; // 90%, never below 70%
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Informational — mana never dropped below 70%"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Mana Potion")).not.toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
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
      consumableThroughputModule,
      "computeConsumableThroughput",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ConsumableThroughputCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={DRUID_ID}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
