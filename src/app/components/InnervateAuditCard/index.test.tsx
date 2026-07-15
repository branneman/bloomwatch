import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InnervateAuditCard } from "./index";
import * as innervateAuditModule from "../../../metrics/innervateAudit";
import type { WclEvent } from "../../../wcl/events";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";
import type { ActorClass } from "../../../metrics/innervateAudit";
import { aCastEvent, aFight } from "../../../testUtils/factories";

const INNERVATE_ID = 29166;
const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [INNERVATE_ID, { kind: "spell", spell: "Innervate", rank: 1 }],
]);

function makeFetchEvents(castEvents: WclEvent[]) {
  return (): Promise<WclEvent[]> => Promise.resolve(castEvents);
}

describe("InnervateAuditCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading state before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={() => new Promise<never>(() => {})}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Innervate audit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
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
    vi.spyOn(innervateAuditModule, "computeInnervateAudit").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("renders a green chip and the ally's name/class when cast on a mana-using ally", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 50,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [50, { class: "Mage", specIcon: "Mage-Fire" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[50, "Aggrolol"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Cast at 0:10, Aggrolol (Mage)"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("renders a red chip when cast on a non-mana-using ally", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 51,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [51, { class: "Warrior", specIcon: "Warrior-Fury" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[51, "Bigaxe"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() => expect(screen.getByText("Bad")).toBeInTheDocument());
  });

  it("renders 'self' and the own mana% for a self-cast", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 2,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
    ];

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Cast at 0:10, self")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Own mana at cast: 29%/)).toBeInTheDocument();
  });

  it("shows 'Not cast this fight' with no chip when never cast and not mana-constrained", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={new Map()}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Not cast this fight")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Bad")).not.toBeInTheDocument();
  });

  it("lists a 2nd cast as informational without its own chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300_000 });
    const castEvents = [
      aCastEvent({
        timestamp: 10_000,
        sourceID: 2,
        targetID: 2,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }],
      }),
      aCastEvent({
        timestamp: 200_000,
        sourceID: 2,
        targetID: 51,
        abilityGameID: INNERVATE_ID,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 5000, cost: 0 }],
      }),
    ];
    const actorClasses = new Map<number, ActorClass>([
      [51, { class: "Warrior", specIcon: "Warrior-Fury" }],
    ]);

    render(
      <InnervateAuditCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        resolvedAbilities={RESOLVED_ABILITIES}
        actorClasses={actorClasses}
        targetNames={new Map([[51, "Bigaxe"]])}
        fetchEvents={makeFetchEvents(castEvents)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Also cast at/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Bigaxe/)).toBeInTheDocument();
  });
});
