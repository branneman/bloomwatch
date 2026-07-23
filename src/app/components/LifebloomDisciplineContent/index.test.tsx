// src/app/components/LifebloomDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifebloomDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("LifebloomDisciplineContent", () => {
  it("renders all five Lifebloom-discipline cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);
    const fetchLookbackEvents = () => Promise.resolve([]);

    render(
      <LifebloomDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        showCards={true}
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        faerieFireAbilityIds={new Set()}
        bossActorIds={new Set()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
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

  it("shows an explanatory message and none of the five cards when showCards is false", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);
    const fetchLookbackEvents = () => Promise.resolve([]);

    render(
      <LifebloomDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        host="fresh"
        showCards={false}
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        faerieFireAbilityIds={new Set()}
        bossActorIds={new Set()}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        fetchLookbackEvents={fetchLookbackEvents}
      />,
    );

    expect(
      screen.getByText(
        "No Lifebloom casts this fight, so there's nothing to grade here.",
      ),
    ).toBeInTheDocument();
    for (const title of [
      "LB3 uptime per target",
      "Refresh cadence",
      "Accidental blooms",
      "Re-stack tax",
      "Concurrent LB3 targets",
    ]) {
      expect(
        screen.queryByRole("heading", { name: title }),
      ).not.toBeInTheDocument();
    }
  });
});
