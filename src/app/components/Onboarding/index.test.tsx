import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Onboarding } from "./index";

describe("Onboarding", () => {
  it("renders the What this is / Who it's for / healing meter sections", () => {
    render(<Onboarding onContinue={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Who it's for" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Which builds this fits" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Why not just look at the healing meter?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Primary/)).toBeInTheDocument();
    expect(screen.getByText(/Secondary/)).toBeInTheDocument();
    expect(screen.getByText(/Tertiary/)).toBeInTheDocument();
    expect(
      screen.getByText(/deep resto gets the most precise read/),
    ).toBeInTheDocument();
  });

  it("links to the TBC Resto Druid Rotation Game", () => {
    render(<Onboarding onContinue={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "TBC Resto Druid Rotation Game ↗" }),
    ).toHaveAttribute(
      "href",
      "https://branneman.github.io/tbc-resto-druid-rotation-game/",
    );
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalled();
  });

  it("calls onContinue when Skip intro is clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "Skip intro →" }));

    expect(onContinue).toHaveBeenCalled();
  });
});
