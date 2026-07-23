import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NearDeathResponseCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aDamageEvent,
  aCombatantInfoEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(damageEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "DamageTaken") return Promise.resolve(damageEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
        }),
      ]);
    }
    return Promise.resolve([]);
  };
}

function makeFetchEventsWithTalents(
  damageEvents: WclEvent[],
  restoration: number,
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "DamageTaken") return Promise.resolve(damageEvents);
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: restoration }],
        }),
      ]);
    }
    return Promise.resolve([]);
  };
}

describe("NearDeathResponseCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the flagged count and a per-crisis card once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[999, "Random raider"]])}
        fetchEvents={makeFetchEvents(damageEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Near-death response" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculating…")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("1 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.getByText("Random raider")).toBeInTheDocument();
    // Full eligibility (45 Restoration): both rows render, no ineligible note.
    expect(screen.getByText(/Swiftmend available/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nature's Swiftness available/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can't reach/)).not.toBeInTheDocument();
  });

  it("shows 'No crises' when there are none", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No crises")).toBeInTheDocument(),
    );
  });

  it("hides the Swiftmend row and shows its note for a talent-unreachable build", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[999, "Random raider"]])}
        // 26 Restoration: below Swiftmend's 30-point threshold, at/above
        // Nature's Swiftness's 20-point threshold -- the real Dreamstate-
        // build shape confirmed in docs/testing.md's bKRZ68XqgwYkxtzm entry.
        fetchEvents={makeFetchEventsWithTalents(damageEvents, 26)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("1 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nature's Swiftness available/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This build's talents can't reach Swiftmend; that row isn't shown.",
      ),
    ).toBeInTheDocument();
  });

  it("hides both cooldown rows and shows the combined note when neither talent threshold is reached", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    render(
      <NearDeathResponseCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        healingAbilityIds={new Set([33763])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[999, "Random raider"]])}
        fetchEvents={makeFetchEventsWithTalents(damageEvents, 0)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("0 of 1 crises flagged")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Swiftmend available/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nature's Swiftness available/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.",
      ),
    ).toBeInTheDocument();
  });
});
