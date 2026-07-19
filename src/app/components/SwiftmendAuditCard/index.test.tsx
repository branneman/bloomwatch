import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwiftmendAuditCard } from "./index";
import * as swiftmendAuditModule from "../../../metrics/swiftmendAudit";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  aCombatantInfoEvent,
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
    if (dataType === "CombatantInfo") {
      return Promise.resolve([
        aCombatantInfoEvent({
          sourceID: 2,
          talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
        }),
      ]);
    }
    return Promise.resolve(buffEvents);
  };
}

describe("SwiftmendAuditCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        host="fresh"
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
    expect(screen.getByText("Bad")).toBeInTheDocument();
  });

  it("shows a dash for Target HP% when no Healing sample is available", async () => {
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

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents, [])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("1 wasteful of 1 (100%)")).toBeInTheDocument(),
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Wasteful")).toBeInTheDocument();
  });

  it("shows a message and good judgement when there are no Swiftmends", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
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
    vi.spyOn(swiftmendAuditModule, "computeSwiftmendAudit").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("requests Healing events with includeResources: true", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = vi.fn(
      (
        ...args: [string, string, EventFetcherFight, WclEventDataType, boolean?]
      ) => {
        const dataType = args[3];
        return dataType === "CombatantInfo"
          ? Promise.resolve([
              aCombatantInfoEvent({
                sourceID: 2,
                talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
              }),
            ])
          : Promise.resolve([]);
      },
    );

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
      expect(
        screen.getByText("No Swiftmends cast this fight."),
      ).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find(
      (call) => call[3] === "Healing",
    );
    expect(healingCall?.[4]).toBe(true);
  });

  it("shows a placeholder instead of real content when Restoration is below Swiftmend's threshold", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> =>
      dataType === "CombatantInfo"
        ? Promise.resolve([
            aCombatantInfoEvent({
              sourceID: 2,
              talents: [{ id: 0 }, { id: 0 }, { id: 29 }],
            }),
          ])
        : Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
      expect(
        screen.getByText(/Not shown — this build can't take Swiftmend/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Swiftmends cast this fight."),
    ).not.toBeInTheDocument();
  });

  it("shows an 'unknown' placeholder (not a false confirmed 0) when talent data couldn't be read", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> =>
      dataType === "CombatantInfo" ? Promise.resolve([]) : Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
      expect(
        screen.getByText(
          /this fight's talent data couldn't be read, so eligibility for Swiftmend/,
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/this fight's build has/),
    ).not.toBeInTheDocument();
  });

  it("shows an 'unknown' placeholder (not a full audit) when talent-archetype detection errors", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> =>
      dataType === "CombatantInfo"
        ? Promise.reject(new Error("WCL API responded 500: server error"))
        : Promise.resolve([]);

    render(
      <SwiftmendAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
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
      expect(
        screen.getByText(
          /this fight's talent data couldn't be read, so eligibility for Swiftmend/,
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("No Swiftmends cast this fight."),
    ).not.toBeInTheDocument();
  });
});
