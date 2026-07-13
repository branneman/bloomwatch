import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrepHygieneContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("PrepHygieneContent", () => {
  it("renders the prep hygiene card", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });

    render(
      <PrepHygieneContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={() => new Promise<never>(() => {})}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Pull-time consumables check" }),
    ).toBeInTheDocument();
  });
});
