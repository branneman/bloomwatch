// src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aFight,
} from "../../../testUtils/factories";

describe("useLifebloomDisciplineSummary", () => {
  it("starts loading, then reports the worst-of judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, sourceID: 2, targetID: 42 }),
      anApplyBuffStackEvent({
        timestamp: 100,
        sourceID: 2,
        targetID: 42,
        stack: 2,
      }),
      anApplyBuffStackEvent({
        timestamp: 200,
        sourceID: 2,
        targetID: 42,
        stack: 3,
      }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status).toBe("ready");
  });

  it("reports an error status when a fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
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
});
