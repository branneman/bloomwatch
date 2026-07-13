import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManaCurve } from "./index";

describe("ManaCurve", () => {
  it("renders an accessible chart labeled with the ending percentage", () => {
    render(
      <ManaCurve
        points={[
          { timestampMs: 0, pct: 90 },
          { timestampMs: 5000, pct: 30 },
        ]}
        fightStartMs={0}
        fightEndMs={10000}
        endingPct={30}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Mana curve, ending at 30%" }),
    ).toBeInTheDocument();
  });
});
