import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useArchetypeBucket } from "./useArchetypeBucket";
import { aCombatantInfoEvent, aFight } from "../../../testUtils/factories";

describe("useArchetypeBucket", () => {
  it("starts loading, then reports the classified bucket", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "CombatantInfo"
          ? [
              aCombatantInfoEvent({
                sourceID: 2,
                talents: [{ id: 0 }, { id: 0 }, { id: 41 }],
              }),
            ]
          : [],
      );

    const { result } = renderHook(() =>
      useArchetypeBucket(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({ status: "ready", bucket: "deep-resto" });
  });

  it("reports unknown-no-talent-data as a ready bucket, not an error, when talents can't be read", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    const { result } = renderHook(() =>
      useArchetypeBucket(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      bucket: "unknown-no-talent-data",
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useArchetypeBucket(
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
