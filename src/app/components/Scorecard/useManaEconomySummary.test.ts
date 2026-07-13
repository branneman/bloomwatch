import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useManaEconomySummary } from "./useManaEconomySummary";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("useManaEconomySummary", () => {
  it("starts loading, then reports the mana curve's judgement and stat line", async () => {
    const fight = aFight({
      id: 6,
      kill: true,
      startTime: 0,
      endTime: 120_000,
    });
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 10000, max: 0, type: 2000, cost: 0 }],
      }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      judgement: "green",
      stats: ["Ending mana: 20%"],
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 120_000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useManaEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
