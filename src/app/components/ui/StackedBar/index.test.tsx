import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StackedBar } from "./index";

describe("StackedBar", () => {
  it("renders a legend entry per segment with its percentage", () => {
    render(
      <StackedBar
        segments={[
          { label: "0 targets", pct: 3, color: "var(--border)" },
          { label: "1 target", pct: 41, color: "var(--accent-border)" },
          { label: "2 targets", pct: 56, color: "var(--accent)" },
        ]}
      />,
    );
    expect(screen.getByText("0 targets · 3%")).toBeInTheDocument();
    expect(screen.getByText("1 target · 41%")).toBeInTheDocument();
    expect(screen.getByText("2 targets · 56%")).toBeInTheDocument();
  });
});
