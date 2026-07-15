import { describe, expect, it, vi } from "vitest";
import {
  subscribeRateLimitUsage,
  publishRateLimitUsage,
} from "./rateLimitUsage";

describe("rateLimitUsage", () => {
  it("delivers a published usage to a subscribed listener", () => {
    const listener = vi.fn();
    subscribeRateLimitUsage(listener);

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 });

    expect(listener).toHaveBeenCalledWith({
      limitPerHour: 3600,
      pointsSpentThisHour: 2880,
    });
  });

  it("delivers to every subscribed listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeRateLimitUsage(first);
    subscribeRateLimitUsage(second);

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 1000 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("stops delivering once the returned unsubscribe function is called", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRateLimitUsage(listener);
    unsubscribe();

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 500 });

    expect(listener).not.toHaveBeenCalled();
  });
});
