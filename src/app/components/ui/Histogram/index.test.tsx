import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Histogram } from "./index";

describe("Histogram", () => {
  it("renders one column per bucket with its label and percentage", () => {
    render(
      <Histogram
        buckets={[
          {
            label: "Early (< 5.5s)",
            pct: 14,
            color: "var(--judgement-fair)",
          },
          { label: "Ideal (5.5–7s)", pct: 71, color: "var(--judgement-good)" },
          { label: "Late (> 7s)", pct: 15, color: "var(--judgement-bad)" },
        ]}
      />,
    );
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
  });
});
