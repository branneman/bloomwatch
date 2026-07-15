import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestackTaxCard } from "./index";
import * as restackTaxModule from "../../../metrics/restackTax";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[], castEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> =>
    Promise.resolve(dataType === "Casts" ? castEvents : buffEvents);
}

describe("RestackTaxCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows re-stack cast count, estimated mana, and judgement once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 11500, targetID: 42, stack: 2 }),
      anApplyBuffStackEvent({ timestamp: 13000, targetID: 42, stack: 3 }),
      aRemoveBuffEvent({ timestamp: 100000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 101000, targetID: 42 }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 10000, targetID: 42 }),
      aCastEvent({ timestamp: 11500, targetID: 42 }),
      aCastEvent({ timestamp: 13000, targetID: 42 }),
      aCastEvent({ timestamp: 101000, targetID: 42 }),
    ];

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Re-stack tax" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("1 casts · ~220 mana")).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("1:41 — Offtank")).toBeInTheDocument();
  });

  it("shows a message when there is no re-stack tax", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No re-stack tax this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
    vi.spyOn(restackTaxModule, "computeRestackTax").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <RestackTaxCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
