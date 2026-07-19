import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDeathForensicsSummary } from "./useDeathForensicsSummary";
import { aFight } from "../../../testUtils/factories";

describe("useDeathForensicsSummary", () => {
  it("starts loading, then reports a ready status", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useDeathForensicsSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([18562]),
        new Set([17116]),
        new Set([33763]),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      judgement: "good",
      stats: ["No friendly deaths"],
    });
  });

  it("reports an error status when a fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useDeathForensicsSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([18562]),
        new Set([17116]),
        new Set([33763]),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });

  it("doesn't count a talent-unreachable resource as unspent", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 100000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "Deaths" ? [] : []);

    const { result } = renderHook(() =>
      useDeathForensicsSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([18562]),
        new Set([17116]),
        new Set([33763]),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("unreachable");
    expect(result.current.stats).toEqual(["No friendly deaths"]);
  });
});
