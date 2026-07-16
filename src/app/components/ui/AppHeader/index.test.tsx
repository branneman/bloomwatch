import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./index";

describe("AppHeader", () => {
  it("shows the app's wordmark", () => {
    render(<AppHeader onClick={vi.fn()} />);

    expect(screen.getByText("Bloomwatch")).toBeInTheDocument();
  });

  it("calls onClick when the logo/wordmark is clicked", async () => {
    const onClick = vi.fn();
    render(<AppHeader onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "Bloomwatch" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
