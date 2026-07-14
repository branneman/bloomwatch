import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumableThroughputCard } from "./index";
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
  it("renders a table row per consumable with its judgement chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 }); // floor 3
    const events = [
      aManaSampleEvent(500, 6000), // 60% — triggers judging
      aCastEvent({
        timestamp: 1000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
      aCastEvent({
        timestamp: 2000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
      aCastEvent({
        timestamp: 3000,
        sourceID: DRUID_ID,
        abilityGameID: MANA_POTION_ID,
      }),
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
    // "Bad" appears twice: the card's own header chip (fight-level judgement is the
    // worst-of, which is red because of the 0/3 rune row) plus the rune row's own chip.
    expect(screen.getAllByText("Good")).toHaveLength(1); // potions row, 3/3
    expect(screen.getAllByText("Bad")).toHaveLength(2); // header chip + rune row, 0/3
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

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 360_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

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
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
