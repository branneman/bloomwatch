import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HotClipDetectionCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aCastEvent,
  anApplyBuffEvent,
  aRefreshBuffEvent,
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

describe("HotClipDetectionCard", () => {
  it("shows per-spell casts/clips/clip% and a merged clip list once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aRefreshBuffEvent({
        timestamp: 5000,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const castEvents = [
      aCastEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      aCastEvent({ timestamp: 5000, targetID: 42, abilityGameID: 26982 }),
    ];

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, castEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT clip detection" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Rejuvenation")).toBeInTheDocument(),
    );
    expect(screen.getByText("Regrowth")).toBeInTheDocument();
    expect(screen.getByText("50.0% clipped")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(
      screen.getByText("0:05 — Rejuvenation on Offtank"),
    ).toBeInTheDocument();
  });

  it("judges only on Rejuvenation's clip rate — a high Regrowth clip rate never turns the card red", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const buffEvents = [
      // Rejuvenation: clean, well under the 5% green threshold.
      anApplyBuffEvent({ timestamp: 0, targetID: 42, abilityGameID: 26982 }),
      // Regrowth: refreshed with 26s remaining out of 27s — a clip by the
      // same rule, but on a spell that's never judged.
      anApplyBuffEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      aRefreshBuffEvent({
        timestamp: 1000,
        targetID: 48,
        abilityGameID: 26980,
      }),
    ];
    const castEvents = [
      ...Array.from({ length: 50 }, (_, i) =>
        aCastEvent({ timestamp: i * 1000, targetID: 42, abilityGameID: 26982 }),
      ),
      aCastEvent({ timestamp: 0, targetID: 48, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 1000, targetID: 48, abilityGameID: 26980 }),
    ];

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents(buffEvents, castEvents)}
      />,
    );

    // Regrowth: 1 clip of 2 casts = 50% — would be red if it were judged.
    await waitFor(() => expect(screen.getByText("50.0%")).toBeInTheDocument());
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.queryByText("Red")).not.toBeInTheDocument();
  });

  it("shows a message when there are no HoT clips", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], [])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No HoT clips this fight.")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
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
      <HotClipDetectionCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
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
