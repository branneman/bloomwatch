import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useManaEconomySummary } from "./useManaEconomySummary";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import { aCastEvent, aFight, aHealEvent } from "../../../testUtils/factories";

function makeFetchEvents(castEvents: WclEvent[], healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve(castEvents);
  };
}

describe("useManaEconomySummary", () => {
  it("starts loading, then reports the worst-of judgement and both stat lines", async () => {
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

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Map(),
        makeFetchEvents(castEvents, []),
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Mana at 20% is below the 70% threshold, so consumables are judged: floor =
    // 120_000/120_000 = 1, 0 potions and 0 runes used -> both rows orange (one below
    // floor), which is the worst-of against the mana curve's own "green" and the (empty,
    // green-default) overheal table.
    expect(result.current).toEqual({
      status: "ready",
      judgement: "orange",
      stats: ["Ending mana: 20%", "Potions: 0/1, Runes: 0/1"],
    });
  });

  it("folds a red overheal-table judgement into the worst-of", async () => {
    // kill: false keeps the mana curve's own judgement null (informational only,
    // regardless of ending mana), isolating the overheal table as the only judged
    // signal besides consumables.
    const fight = aFight({
      id: 6,
      kill: false,
      startTime: 0,
      endTime: 120_000,
    });
    const castEvents = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        // classResources[0].type is the *current* mana, .amount is the *max* pool (see
        // manaSamples.ts) -- 9000/10000 = 90%, which never drops below the 70% consumable
        // threshold, so consumableThroughput.judgement is also null (exempt).
        classResources: [{ amount: 10000, max: 0, type: 9000, cost: 0 }],
      }),
    ];
    const healingEvents = [
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
    ]);

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        resolvedAbilities,
        makeFetchEvents(castEvents, healingEvents),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Mana curve judgement is null (not a kill) and consumables are exempt (null) -- the
    // overheal table's Swiftmend row at 60% overheal is red, which must win the worst-of.
    expect(result.current).toMatchObject({ status: "ready", judgement: "red" });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Map(),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
