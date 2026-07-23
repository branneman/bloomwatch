import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWclWarmupActive } from "./useWclWarmupActive";
import { beginWclWarmupRetry, endWclWarmupRetry } from "./wclWarmup";

describe("useWclWarmupActive", () => {
  it("is false until a warmup retry begins", () => {
    const { result } = renderHook(() => useWclWarmupActive());
    expect(result.current).toBe(false);
  });

  it("becomes true once a warmup retry begins", () => {
    const { result } = renderHook(() => useWclWarmupActive());

    act(() => {
      beginWclWarmupRetry();
    });

    expect(result.current).toBe(true);

    act(() => {
      endWclWarmupRetry();
    });
  });

  it("stays true while a second overlapping retry is still active", () => {
    const { result } = renderHook(() => useWclWarmupActive());

    act(() => {
      beginWclWarmupRetry();
      beginWclWarmupRetry();
    });
    act(() => {
      endWclWarmupRetry();
    });

    expect(result.current).toBe(true);

    act(() => {
      endWclWarmupRetry();
    });
  });

  it("becomes false again once every retry ends", () => {
    const { result } = renderHook(() => useWclWarmupActive());

    act(() => {
      beginWclWarmupRetry();
    });
    act(() => {
      endWclWarmupRetry();
    });

    expect(result.current).toBe(false);
  });

  it("stops updating after unmount (no leaked listener)", () => {
    const { result, unmount } = renderHook(() => useWclWarmupActive());
    unmount();

    act(() => {
      beginWclWarmupRetry();
    });

    expect(result.current).toBe(false);

    act(() => {
      endWclWarmupRetry();
    });
  });
});
