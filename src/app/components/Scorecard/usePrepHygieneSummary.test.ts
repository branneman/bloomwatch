import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePrepHygieneSummary } from "./usePrepHygieneSummary";
import { aCombatantInfoEvent, aFight } from "../../../testUtils/factories";

describe("usePrepHygieneSummary", () => {
  it("starts loading, then reports the judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "CombatantInfo" ? [aCombatantInfoEvent()] : [],
      );

    const { result } = renderHook(() =>
      usePrepHygieneSummary(
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
      judgement: "good",
      stats: [
        "Prep: battle + guardian elixir active",
        "Food & oil: both present",
      ],
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      usePrepHygieneSummary(
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
