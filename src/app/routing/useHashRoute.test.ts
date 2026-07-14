import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useHashRoute } from "./useHashRoute";

describe("useHashRoute", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "#");
  });

  afterEach(() => {
    window.history.pushState(null, "", "#");
  });

  it("initializes route from the current window.location.hash", () => {
    window.history.pushState(null, "", "#/r/4GYHZRdtL3bvhpc8");
    const { result } = renderHook(() => useHashRoute());

    expect(result.current.route).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
    });
  });

  it("navigate() updates window.location.hash and the returned route", () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      result.current.navigate({
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      });
    });

    expect(window.location.hash).toBe("#/r/4GYHZRdtL3bvhpc8/d/Dassz");
    expect(result.current.route).toEqual({
      screen: "dashboard",
      reportCode: "4GYHZRdtL3bvhpc8",
      druidName: "Dassz",
    });
  });

  it("updates route when a popstate event fires (browser back/forward)", async () => {
    const { result } = renderHook(() => useHashRoute());

    act(() => {
      result.current.navigate({
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
      });
    });
    act(() => {
      result.current.navigate({
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      });
    });

    // Simulate the browser's own back-button navigation: it moves
    // window.location.hash back to the previous pushState entry and fires
    // popstate — pushState/replaceState never fire this event themselves
    // (see hashRoute design spec), so this is the only way back/forward
    // updates reach the hook.
    await act(async () => {
      const popstatePromise = new Promise<void>((resolve) => {
        const handler = () => {
          window.removeEventListener("popstate", handler);
          resolve();
        };
        window.addEventListener("popstate", handler);
      });
      window.history.back();
      await popstatePromise;
    });

    expect(result.current.route).toEqual({
      screen: "druidPicker",
      reportCode: "4GYHZRdtL3bvhpc8",
    });
  });
});
