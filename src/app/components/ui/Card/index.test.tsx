import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./index";

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>GCD utilization</p>
      </Card>,
    );
    expect(screen.getByText("GCD utilization")).toBeInTheDocument();
  });
});
