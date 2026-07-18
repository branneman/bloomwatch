import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaturesSwiftnessCard } from "./index";
import * as naturesSwiftnessAuditModule from "../../../metrics/naturesSwiftnessAudit";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  aFight,
  aCastEvent,
  aCombatantInfoEvent,
} from "../../../testUtils/factories";

const RESOLVED: Map<number, ResolvedAbility> = new Map([
  [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
  [9758, { kind: "spell", spell: "Healing Touch", rank: 8 }],
]);

function makeFetchEvents(castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Casts") return Promise.resolve(castEvents);
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

describe("NaturesSwiftnessCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the usage count and a per-cast follow-up list once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 400000 });
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
      aCastEvent({ timestamp: 1500, targetID: 50, abilityGameID: 9758 }),
    ];

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map([[50, "Maintank"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Nature's Swiftness audit" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Used 1× of 3 available windows"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/followed by Healing Touch \(Rank 8\) on Maintank/),
    ).toBeInTheDocument();
  });

  it("shows 'no follow-up cast recorded' when nothing follows before the fight ends", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 400000 });
    const castEvents = [
      aCastEvent({ timestamp: 1000, targetID: -1, abilityGameID: 17116 }),
    ];

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/no follow-up cast recorded/),
      ).toBeInTheDocument(),
    );
  });

  it("shows a message when Nature's Swiftness was not cast this fight", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Nature's Swiftness was not cast this fight."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
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
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
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
    vi.spyOn(
      naturesSwiftnessAuditModule,
      "computeNaturesSwiftnessAudit",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("shows a placeholder instead of real content when Restoration is below Nature's Swiftness's threshold", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 400000 });
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
              talents: [{ id: 0 }, { id: 0 }, { id: 19 }],
            }),
          ])
        : Promise.resolve([]);

    render(
      <NaturesSwiftnessCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        fight={fight}
        druidId={2}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={RESOLVED}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          /Not shown — this build can't take Nature's Swiftness/,
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Nature's Swiftness was not cast this fight."),
    ).not.toBeInTheDocument();
  });
});
