import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GcdEconomyContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("GcdEconomyContent", () => {
  it("renders the GCD utilization and idle gaps cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <GcdEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
  });
});
