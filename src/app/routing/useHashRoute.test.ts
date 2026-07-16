import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
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

  it("wins the race against a same-tick popstate dispatched by an earlier-declared sibling effect (e.g. useWclAuth's OAuth-return flow)", () => {
    // Reproduces the actual bug from the story-703 re-review, inside a
    // single renderHook() call: App.tsx calls useWclAuth() before
    // useHashRoute(), and useWclAuth's completeAuth() restores a shared
    // link's hash via history.replaceState and dispatches a synthetic
    // popstate *synchronously* in its own mount effect (before its first
    // await) — see src/wcl/useWclAuth.ts. React flushes mount effects in
    // hook-declaration order, so that dispatch fires before useHashRoute's
    // effect has run and attached its own popstate listener; the event
    // lands on nobody. This harness mirrors that exact hook order: an
    // inline effect declared first does the replaceState + dispatch, then
    // useHashRoute() is called.
    //
    // Under the old useHashRoute (which only ever updated route inside its
    // popstate handler), this assertion fails: route stays parsed from the
    // stale "#" hash the initial render saw. The fix's unconditional
    // setRoute(parseHash(window.location.hash)) at the top of the mount
    // effect closes the gap regardless of firing order, since it re-reads
    // the *current* hash rather than relying on having been listening at
    // the moment it changed.
    const { result } = renderHook(() => {
      useEffect(() => {
        window.history.replaceState(null, "", "#/r/CODE/d/Name");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, []);
      return useHashRoute();
    });

    expect(result.current.route).toEqual({
      screen: "dashboard",
      reportCode: "CODE",
      druidName: "Name",
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

  it("scrolls to the top on every route change, not just the initial mount", () => {
    const scrollToSpy = vi.spyOn(window, "scrollTo");
    const { result } = renderHook(() => useHashRoute());
    scrollToSpy.mockClear(); // only interested in scrolls caused by navigation, not mount

    act(() => {
      result.current.navigate({
        screen: "druidPicker",
        reportCode: "4GYHZRdtL3bvhpc8",
      });
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    scrollToSpy.mockClear();
    act(() => {
      result.current.navigate({
        screen: "dashboard",
        reportCode: "4GYHZRdtL3bvhpc8",
        druidName: "Dassz",
      });
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });
});
