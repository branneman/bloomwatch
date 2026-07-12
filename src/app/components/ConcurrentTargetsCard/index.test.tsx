import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrentTargetsCard } from "./index";
import type { WclEvent } from "../../../wcl/events";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../../../testUtils/factories";

function makeFetchEvents(buffEvents: WclEvent[]) {
  return (): Promise<WclEvent[]> => Promise.resolve(buffEvents);
}

describe("ConcurrentTargetsCard", () => {
  it("shows average, peak, and level breakdown once loaded, with no judgement chip", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 5000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        fetchEvents={makeFetchEvents(buffEvents)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Concurrent LB3 targets" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Avg 0.6 · Peak 1")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
    expect(screen.getByText("0 targets — 40%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 60%")).toBeInTheDocument();
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
      <ConcurrentTargetsCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
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
