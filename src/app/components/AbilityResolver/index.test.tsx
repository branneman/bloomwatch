import { render, screen, waitFor } from "@testing-library/react";
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

  it("shows an error message when the fetch fails", async () => {
    const fetchMasterDataAbilities = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <AbilityResolver
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchMasterDataAbilities={fetchMasterDataAbilities}
        onResolved={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
