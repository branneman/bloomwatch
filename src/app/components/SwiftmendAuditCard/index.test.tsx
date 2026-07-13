import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwiftmendAuditCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  aRemoveBuffEvent,
  aHealEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  healingEvents: WclEvent[],
) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve(buffEvents);
  };
}

describe("SwiftmendAuditCard", () => {
  it("shows the wasteful count/judgement and a per-cast table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 26982 }),
      aRemoveBuffEvent({
        timestamp: 2001,
        targetID: 50,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 2000, targetID: 50, abilityGameID: 18562 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 1000,
        targetID: 50,
        resourceActor: 2,
        hitPoints: 80,
      }),
    ];

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents, healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Swiftmend quality audit" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 wasteful of 1 (100%)")).toBeInTheDocument(),
    );
    expect(screen.getByText("Maintank")).toBeInTheDocument();
    expect(screen.getByText("Rejuvenation")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Wasteful")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no Swiftmends", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No Swiftmends cast this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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
