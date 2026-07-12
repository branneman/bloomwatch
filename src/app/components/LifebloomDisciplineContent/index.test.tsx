// src/app/components/LifebloomDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifebloomDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("LifebloomDisciplineContent", () => {
  it("renders all five Lifebloom-discipline cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LifebloomDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    for (const title of [
      "LB3 uptime per target",
      "Refresh cadence",
      "Accidental blooms",
      "Re-stack tax",
      "Concurrent LB3 targets",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });
});
