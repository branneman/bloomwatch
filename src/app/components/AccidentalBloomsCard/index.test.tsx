import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccidentalBloomsCard } from "./index";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import {
  aFight,
  aHealEvent,
  anApplyBuffEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[], healEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> =>
    Promise.resolve(dataType === "Healing" ? healEvents : buffEvents);
}

describe("AccidentalBloomsCard", () => {
  it("lists accidental blooms with count and judgement once loaded", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });
    const healEvents = [aHealEvent({ timestamp: 173000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 174500, targetID: 42 })];

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Offtank"]])}
        fetchEvents={makeFetchEvents(buffEvents, healEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Accidental blooms" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("2:53 — Offtank")).toBeInTheDocument();
  });

  it("shows a message when there are no accidental blooms", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 200000 });
    const healEvents = [aHealEvent({ timestamp: 173000, targetID: 42 })];

    render(
      <AccidentalBloomsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={makeFetchEvents([], healEvents)}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No accidental blooms this fight."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <AccidentalBloomsCard
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

  it("shows an error message when the fetch fails", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    render(
      <AccidentalBloomsCard
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
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
