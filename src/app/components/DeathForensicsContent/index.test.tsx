import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeathForensicsContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("DeathForensicsContent", () => {
  it("renders the per-death resource audit card", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <DeathForensicsContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Per-death resource audit" }),
    ).toBeInTheDocument();
  });
});
