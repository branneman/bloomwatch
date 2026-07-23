import { describe, expect, it, vi } from "vitest";
import {
  subscribeWclWarmup,
  beginWclWarmupRetry,
  endWclWarmupRetry,
} from "./wclWarmup";

describe("wclWarmup", () => {
  it("delivers the current active count to a listener on subscribe", () => {
    const listener = vi.fn();
    subscribeWclWarmup(listener);

    expect(listener).toHaveBeenCalledWith(0);
  });

  it("increments and publishes on beginWclWarmupRetry", () => {
    const listener = vi.fn();
    subscribeWclWarmup(listener);
    listener.mockClear();

    beginWclWarmupRetry();

    expect(listener).toHaveBeenCalledWith(1);

    endWclWarmupRetry();
  });

  it("decrements and publishes on endWclWarmupRetry", () => {
    beginWclWarmupRetry();
    const listener = vi.fn();
    subscribeWclWarmup(listener);
    listener.mockClear();

    endWclWarmupRetry();

    expect(listener).toHaveBeenCalledWith(0);
  });

  it("never goes below zero", () => {
    const listener = vi.fn();
    subscribeWclWarmup(listener);
    listener.mockClear();

    endWclWarmupRetry();

    expect(listener).toHaveBeenCalledWith(0);
  });

  it("stops delivering once the returned unsubscribe function is called", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWclWarmup(listener);
    unsubscribe();
    listener.mockClear();

    beginWclWarmupRetry();

    expect(listener).not.toHaveBeenCalled();
    endWclWarmupRetry();
  });

  it("supports overlapping retries: count reflects however many are active", () => {
    const listener = vi.fn();
    subscribeWclWarmup(listener);
    listener.mockClear();

    beginWclWarmupRetry();
    beginWclWarmupRetry();
    expect(listener).toHaveBeenLastCalledWith(2);

    endWclWarmupRetry();
    expect(listener).toHaveBeenLastCalledWith(1);

    endWclWarmupRetry();
    expect(listener).toHaveBeenLastCalledWith(0);
  });
});
