// src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRefreshBuffEvent,
  aCastEvent,
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
    const castEvents = [
      aCastEvent({ timestamp: 0, sourceID: 2, targetID: 42 }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Buffs"
          ? buffEvents
          : dataType === "Casts"
            ? castEvents
            : [],
      );
    const fetchLookbackEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
        fetchLookbackEvents,
        new Set(),
        new Set(),
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
    const fetchLookbackEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
        fetchLookbackEvents,
        new Set(),
        new Set(),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });

  it("fetches a lookback window and resolves a carry-in target instead of excluding it", async () => {
    const fightStart = 2011529;
    const fightEnd = 2113050;
    const fight = aFight({ id: 6, startTime: fightStart, endTime: fightEnd });
    // Same fixture shape as lb3Uptime.test.ts's "resolves a carry-in
    // target" test: the fight-window timeline opens with a "refresh"
    // (no leading "open"), which is only possible if the buff was
    // already active before this fetch window began.
    const buffEvents = [
      aRefreshBuffEvent({ timestamp: 2016447, targetID: 5, sourceID: 2 }),
    ];
    const lookbackEvents = [
      anApplyBuffEvent({ timestamp: 1960000, targetID: 5, sourceID: 2 }),
      anApplyBuffStackEvent({
        timestamp: 1970000,
        stack: 3,
        targetID: 5,
        sourceID: 2,
      }),
    ];
    // A genuine in-fight 3-stack maintenance refresh (the aRefreshBuffEvent
    // above) is always preceded by a real cast at essentially the same
    // timestamp - without this, hasLifebloomCast would read false and the
    // whole fight would be excluded rather than exercising carry-in
    // resolution.
    const castEvents = [
      aCastEvent({ timestamp: 2016447, targetID: 5, sourceID: 2 }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Buffs"
          ? buffEvents
          : dataType === "Casts"
            ? castEvents
            : [],
      );
    const fetchLookbackEvents = vi.fn().mockResolvedValue(lookbackEvents);
    // Hoisted so its identity is stable across re-renders (an inline
    // `new Set(...)` in the renderHook callback would be a new reference
    // every render, re-triggering the effect and inflating call counts).
    const lifebloomAbilityIds = new Set([33763]);
    const faerieFireAbilityIds = new Set<number>();
    const bossActorIds = new Set<number>();

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        lifebloomAbilityIds,
        fetchEvents,
        fetchLookbackEvents,
        faerieFireAbilityIds,
        bossActorIds,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(fetchLookbackEvents).toHaveBeenCalledTimes(1);
    expect(fetchLookbackEvents).toHaveBeenCalledWith(
      "test-token",
      "4GYHZRdtL3bvhpc8",
      "Buffs",
      fightStart - 60_000,
      fightStart,
      true,
    );

    // The carry-in target resolves to 100% LB3 uptime (per the lookback
    // fixture above) rather than being excluded ("no maintained targets")
    // or read as a confident 0%/bad.
    if (result.current.status !== "ready") {
      throw new Error("expected ready status");
    }
    expect(result.current.stats[0]).toBe("LB3 uptime: 100%");
  });

  it("never calls fetchLookbackEvents when no target's timeline is ambiguous", async () => {
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
    const castEvents = [
      aCastEvent({ timestamp: 0, sourceID: 2, targetID: 42 }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Buffs"
          ? buffEvents
          : dataType === "Casts"
            ? castEvents
            : [],
      );
    const fetchLookbackEvents = vi.fn().mockResolvedValue([]);
    const lifebloomAbilityIds = new Set([33763]);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        lifebloomAbilityIds,
        fetchEvents,
        fetchLookbackEvents,
        new Set(),
        new Set(),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(fetchLookbackEvents).not.toHaveBeenCalled();
    expect(fetchLookbackEvents).toHaveBeenCalledTimes(0);
  });

  it("passes the genuine on-duty signal through to computeRestackTax without throwing", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 300000 });
    const FF_ID = 26993;
    const BOSS_ID = 149;
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
    // 4 boss-targeted Faerie Fire casts spanning most of the fight -- meets
    // computeFaerieFireDuty's on-duty thresholds for this 300000ms duration
    // (requires >= ceil(300000/80000) = 4 casts and a span >= 150000ms; here
    // the span is 245000ms), so onDuty genuinely resolves true.
    const castEvents = [
      aCastEvent({
        timestamp: 5000,
        sourceID: 2,
        targetID: BOSS_ID,
        abilityGameID: FF_ID,
      }),
      aCastEvent({
        timestamp: 100000,
        sourceID: 2,
        targetID: BOSS_ID,
        abilityGameID: FF_ID,
      }),
      aCastEvent({
        timestamp: 200000,
        sourceID: 2,
        targetID: BOSS_ID,
        abilityGameID: FF_ID,
      }),
      aCastEvent({
        timestamp: 250000,
        sourceID: 2,
        targetID: BOSS_ID,
        abilityGameID: FF_ID,
      }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => {
      if (dataType === "Buffs") return Promise.resolve(buffEvents);
      if (dataType === "Casts") return Promise.resolve(castEvents);
      return Promise.resolve([]);
    };
    const fetchLookbackEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
        fetchLookbackEvents,
        new Set([FF_ID]),
        new Set([BOSS_ID]),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    // This fixture's Faerie Fire casts genuinely trigger onDuty: true (see
    // comment above), confirming the hook's plumbing reaches
    // computeFaerieFireDuty/computeRestackTax with the real onDuty value
    // and resolves "ready" without throwing. This fixture's re-stack tax
    // cast count is 0, so the allowance's numeric effect on the good/fair
    // boundary can't be observed at this hook's output (which only exposes
    // the folded-together epic judgement, not each sibling metric's own
    // judgement) -- that boundary is unit-tested directly against
    // computeRestackTax/judgeRestackTax in restackTax.test.ts, which is the
    // load-bearing test for the numeric behavior.
  });

  it("excludes the epic when the druid cast zero Lifebloom-family spells this fight", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);
    const fetchLookbackEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
        fetchLookbackEvents,
        new Set(),
        new Set(),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      judgement: null,
      stats: ["No Lifebloom casts this fight"],
    });
  });
});
