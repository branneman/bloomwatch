import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AbilityResolver } from "./index";
import { aReportAbility } from "../../../testUtils/factories";

describe("AbilityResolver", () => {
  it("fetches master data abilities and reports the resolved map once loaded", async () => {
    const ability = aReportAbility({ gameID: 33763, name: "Lifebloom" });
    const fetchMasterDataAbilities = () => Promise.resolve([ability]);
    const onResolved = vi.fn();
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={onResolved}
      />,
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        new Map([[33763, { kind: "spell", spell: "Lifebloom", rank: 1 }]]),
      ),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fetchMasterDataAbilities = () => new Promise<never>(() => {});
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText("Resolving abilities…")).toBeInTheDocument();
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchMasterDataAbilities = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Resolving abilities…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts the in-flight fetch when unmounted", () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMasterDataAbilities = (
      _accessToken: string,
      _reportCode: string,
      signal?: AbortSignal,
    ) => {
      capturedSignal = signal;
      return new Promise<never>(() => {});
    };
    const { unmount } = render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );

    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
