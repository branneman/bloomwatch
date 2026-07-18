import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHealingRoleThisFight } from "./useHealingRoleThisFight";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { ResolvedAbility } from "../../../abilities/resolveAbilities";

describe("useHealingRoleThisFight", () => {
  const resolvedAbilities = new Map<number, ResolvedAbility>([
    [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
  ]);

  it("starts loading, then reports on-role once the healing-cast threshold clears", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      healingCastCount: 3,
      isHealingThisFight: true,
    });
  });

  it("reports off-role when no healing casts resolve", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      healingCastCount: 0,
      isHealingThisFight: false,
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useHealingRoleThisFight(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        resolvedAbilities,
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
