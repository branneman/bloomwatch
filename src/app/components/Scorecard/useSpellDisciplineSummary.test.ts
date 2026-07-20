// src/app/components/Scorecard/useSpellDisciplineSummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSpellDisciplineSummary } from "./useSpellDisciplineSummary";
import { anApplyBuffEvent, aFight } from "../../../testUtils/factories";

describe("useSpellDisciplineSummary", () => {
  it("starts loading, then reports the worst-of judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const buffEvents = [
      anApplyBuffEvent({
        timestamp: 0,
        sourceID: 2,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);

    const { result } = renderHook(() =>
      useSpellDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Set([17116]),
        new Map(),
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
      useSpellDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Set([17116]),
        new Map(),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });

  it("excludes Swiftmend from the pooled judgement when the druid can't reach its talent", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "CombatantInfo" ? [] : []);

    const { result } = renderHook(() =>
      useSpellDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Set([17116]),
        new Map(),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("unreachable");
    expect(
      result.current.stats.some((line) => line.startsWith("Swiftmend")),
    ).toBe(false);
  });
});
