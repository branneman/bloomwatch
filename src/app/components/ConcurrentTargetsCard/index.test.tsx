import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrentTargetsCard } from "./index";

describe("ConcurrentTargetsCard", () => {
  it("renders the static mock concurrent-targets content with no judgement chip", () => {
    render(<ConcurrentTargetsCard />);
    expect(
      screen.getByRole("heading", { name: "Concurrent LB3 targets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Avg 1.6 · Peak 2")).toBeInTheDocument();
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
    expect(screen.getByText("0 targets — 3%")).toBeInTheDocument();
    expect(screen.getByText("1 target — 41%")).toBeInTheDocument();
    expect(screen.getByText("2 targets — 56%")).toBeInTheDocument();
  });
});
