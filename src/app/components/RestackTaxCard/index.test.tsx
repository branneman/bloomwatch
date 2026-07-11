import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RestackTaxCard } from "./index";

describe("RestackTaxCard", () => {
  it("renders the static mock re-stack-tax content", () => {
    render(<RestackTaxCard />);
    expect(
      screen.getByRole("heading", { name: "Re-stack tax" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 casts · ~2,400 mana")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("Sample — not yet computed")).toBeInTheDocument();
  });
});
