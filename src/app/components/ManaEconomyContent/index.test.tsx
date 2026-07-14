import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaEconomyContent } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("ManaEconomyContent", () => {
  it("renders the mana curve and consumable throughput cards", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <ManaEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
  });
});
