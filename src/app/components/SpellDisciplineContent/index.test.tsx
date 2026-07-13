// src/app/components/SpellDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpellDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("SpellDisciplineContent", () => {
  it("renders the HoT clip detection, Swiftmend audit, Downranking discipline, and Nature's Swiftness cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <SpellDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        rejuvenationAbilityIds={new Set([26982])}
        regrowthAbilityIds={new Set([26980])}
        swiftmendAbilityIds={new Set([18562])}
        naturesSwiftnessAbilityIds={new Set([17116])}
        resolvedAbilities={new Map()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "HoT clip detection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Swiftmend quality audit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Downranking discipline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nature's Swiftness audit" }),
    ).toBeInTheDocument();
  });
});
