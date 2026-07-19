import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverhealTableCard } from "./index";
import * as overhealTableModule from "../../../metrics/overhealTable";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import {
  aCombatantInfoEvent,
  aFight,
  aHealEvent,
} from "../../../testUtils/factories";

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  [18562, { kind: "spell", spell: "Swiftmend", rank: 1 }],
]);

function makeFetchEvents(healingEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "Healing") return Promise.resolve(healingEvents);
    return Promise.resolve([]);
  };
}

describe("OverhealTableCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the judgement and a per-spell table once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const healingEvents = [
      aHealEvent({ abilityGameID: 33763, amount: 670, overheal: 330 }),
      aHealEvent({ abilityGameID: 18562, amount: 400, overheal: 600 }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT-aware overheal table" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Lifebloom")).toBeInTheDocument(),
    );
    expect(screen.getByText("Bloom")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("Swiftmend")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.queryAllByText("Bad").length).toBeGreaterThan(0);
  });

  it("renders a dash instead of a chip for informational HoT-tick rows", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [3627, { kind: "spell", spell: "Rejuvenation", rank: 6 }],
    ]);
    const healingEvents = [
      aHealEvent({
        abilityGameID: 3627,
        amount: 100,
        overheal: 0,
        tick: true,
      }),
    ];

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={makeFetchEvents(healingEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Rejuvenation")).toBeInTheDocument(),
    );
    expect(screen.getByText("HoT tick (informational)")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a message and green judgement when there are no heals to report", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No heals to report this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <OverhealTableCard
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
      <OverhealTableCard
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
    vi.spyOn(overhealTableModule, "computeOverhealTable").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <OverhealTableCard
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
      <OverhealTableCard
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
        screen.getByText("No heals to report this fight."),
      ).toBeInTheDocument(),
    );

    const healingCall = fetchEvents.mock.calls.find(
      (call) => call[3] === "Healing",
    );
    expect(healingCall?.[4]).toBe(true);
  });

  it("judges Regrowth-direct overheal against the detected archetype's threshold band", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const resolvedAbilities = new Map<number, ResolvedAbility>([
      [26980, { kind: "spell", spell: "Regrowth", rank: 10 }],
    ]);
    const healingEvents = [
      aHealEvent({ abilityGameID: 26980, amount: 30, overheal: 70 }), // 70% overheal, direct (not tick)
    ];
    const fetchEvents = (
      _accessToken: string,
      _reportCode: string,
      _fight: EventFetcherFight,
      dataType: WclEventDataType,
    ): Promise<WclEvent[]> => {
      if (dataType === "Healing") return Promise.resolve(healingEvents);
      if (dataType === "CombatantInfo") {
        return Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 2,
            talents: [{ id: 35 }, { id: 0 }, { id: 13 }],
          }),
        ]);
      }
      return Promise.resolve([]);
    };

    render(
      <OverhealTableCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={resolvedAbilities}
        fetchEvents={fetchEvents}
      />,
    );

    // The archetype bucket (useArchetypeBucket) and the healing events
    // (this component's own effect) resolve from two independent fetches,
    // and the healing-events effect re-fires once the bucket arrives — so
    // "Regrowth (direct)" is present in an intermediate render that still
    // used the default deep-resto band (red/"Bad") before the dreamstate
    // band ("Fair") settles. All three assertions must live inside waitFor
    // so it retries until the real settled state holds, not just the first
    // render where the label happens to exist.
    await waitFor(() => {
      expect(screen.getByText("Regrowth (direct)")).toBeInTheDocument();
      // 70% overheal is red under deep-resto's band (>60%) but only orange under
      // dreamstate's wider band (60-85%). This druid's talents (35/0/13) classify as
      // likely-dreamstate-full, so it must land orange ("Fair"), not red ("Bad").
      expect(screen.queryAllByText("Fair").length).toBeGreaterThan(0);
      expect(screen.queryByText("Bad")).not.toBeInTheDocument();
    });
  });
});
