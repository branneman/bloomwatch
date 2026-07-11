import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefreshCadenceCard } from "./index";

describe("RefreshCadenceCard", () => {
  it("renders the static mock refresh-cadence content", () => {
    render(<RefreshCadenceCard />);
    expect(
      screen.getByRole("heading", { name: "Refresh cadence" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Median 6.4s")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("Sample — not yet computed")).toBeInTheDocument();
    expect(screen.getByText("Early (< 5.5s)")).toBeInTheDocument();
    expect(screen.getByText("Ideal (5.5–7s)")).toBeInTheDocument();
    expect(screen.getByText("Late (> 7s)")).toBeInTheDocument();
  });
});
