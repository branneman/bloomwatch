import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFightEpicSummaries } from "./useFightEpicSummaries";
import { aFight } from "../../../testUtils/factories";

describe("useFightEpicSummaries", () => {
  it("starts every epic loading, then resolves all six once their fetches settle", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useFightEpicSummaries(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        101,
        new Set([33763]),
        new Set([26982]),
        new Set([26980]),
        new Set([18562]),
        new Set([17116]),
        new Map(),
        new Map(),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({
      gcd: { status: "loading" },
      lifebloom: { status: "loading" },
      spell: { status: "loading" },
      mana: { status: "loading" },
      death: { status: "loading" },
      prep: { status: "loading" },
    });

    await waitFor(() =>
      expect(
        Object.values(result.current).every((s) => s.status === "ready"),
      ).toBe(true),
    );
  });
});
