import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./index";

describe("Shell", () => {
  it("renders its children", () => {
    render(
      <Shell>
        <h1>Bloomwatch</h1>
      </Shell>,
    );
    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
  });

  it("applies the requested width as an inline style", () => {
    render(
      <Shell width={800}>
        <p>Scorecard</p>
      </Shell>,
    );
    expect(screen.getByText("Scorecard").parentElement).toHaveStyle({
      width: "800px",
    });
  });
});
