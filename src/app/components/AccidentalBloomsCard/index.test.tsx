import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccidentalBloomsCard } from "./index";

describe("AccidentalBloomsCard", () => {
  it("renders the static mock accidental-blooms content", () => {
    render(<AccidentalBloomsCard />);
    expect(
      screen.getByRole("heading", { name: "Accidental blooms" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
    expect(screen.getByText("2:53 — Offtank")).toBeInTheDocument();
  });
});
