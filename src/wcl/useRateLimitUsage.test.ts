import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRateLimitUsage, useRateLimitUsageData } from "./useRateLimitUsage";
import { publishRateLimitUsage } from "./rateLimitUsage";
import { aRateLimitUsage } from "../testUtils/factories";

describe("useRateLimitUsage", () => {
  it("returns null until the first usage is published", () => {
    const { result } = renderHook(() => useRateLimitUsage());
    expect(result.current).toBeNull();
  });

  it("returns the usage percentage after a publish", () => {
    const { result } = renderHook(() => useRateLimitUsage());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBe(80);
  });

  it("updates again on a later publish", () => {
    const { result } = renderHook(() => useRateLimitUsage());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });
    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    expect(result.current).toBe(25);
  });

  it("stops updating after unmount (no leaked listener)", () => {
    const { result, unmount } = renderHook(() => useRateLimitUsage());
    unmount();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBeNull();
  });
});

describe("useRateLimitUsageData", () => {
  it("returns null until the first usage is published", () => {
    const { result } = renderHook(() => useRateLimitUsageData());
    expect(result.current).toBeNull();
  });

  it("returns the raw usage object after a publish", () => {
    const { result } = renderHook(() => useRateLimitUsageData());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3000, pointsSpentThisHour: 465 }),
      );
    });

    expect(result.current).toEqual({
      limitPerHour: 3000,
      pointsSpentThisHour: 465,
    });
  });

  it("updates again on a later publish", () => {
    const { result } = renderHook(() => useRateLimitUsageData());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });
    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    expect(result.current).toEqual({
      limitPerHour: 3600,
      pointsSpentThisHour: 900,
    });
  });

  it("stops updating after unmount (no leaked listener)", () => {
    const { result, unmount } = renderHook(() => useRateLimitUsageData());
    unmount();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBeNull();
  });
});
