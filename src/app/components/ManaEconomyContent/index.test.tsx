import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaEconomyContent } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { aCastEvent, aFight, aHealEvent } from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
]);

describe("ManaEconomyContent", () => {
  it("renders the mana curve, consumable throughput, and overheal table cards", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
    ];
    const fetchEvents = (
      _accessToken: string,
      _reportCode: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> => {
      if (dataType === "Healing") return Promise.resolve(healingEvents);
      return Promise.resolve(castEvents);
    };

    render(
      <ManaEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map<number, ActorClass>()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mana curve & ending mana" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Consumable throughput" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Innervate audit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "HoT-aware overheal table" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Ending mana: 20%")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Mana Potion")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Lifebloom")).toBeInTheDocument(),
    );
  });
});
