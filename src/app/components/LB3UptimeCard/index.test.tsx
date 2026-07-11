import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LB3UptimeCard } from "./index";
import {
  aFight,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../../../testUtils/factories";

describe("LB3UptimeCard", () => {
  it("renders per-target LB3 uptime once loaded", async () => {
    const fight = aFight({
      id: 6,
      name: "The Lurker Below",
      startTime: 0,
      endTime: 11000,
    });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map([[42, "Fanah"]])}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "LB3 uptime per target" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fanah")).toBeInTheDocument());
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("falls back to a numeric target label when the name is unknown", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 11000 });
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 11000, targetID: 42 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <LB3UptimeCard
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
      expect(screen.getByText("Target #42")).toBeInTheDocument(),
    );
  });

  it("shows a message when there are no maintained targets", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LB3UptimeCard
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
      expect(screen.getByText("No maintained targets.")).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => new Promise<never>(() => {});

    render(
      <LB3UptimeCard
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
      <LB3UptimeCard
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
