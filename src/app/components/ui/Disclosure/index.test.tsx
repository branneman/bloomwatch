import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./index";

describe("Disclosure", () => {
  it("hides its content by default and reveals it on click", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="Why this threshold?">
        Green ≥ 85%, orange 70–85%, red &lt; 70%.
      </Disclosure>,
    );
    expect(screen.queryByText(/Green ≥ 85%/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Why this threshold?" }),
    );
    expect(screen.getByText(/Green ≥ 85%/)).toBeInTheDocument();
  });

  it("marks the toggle button's aria-expanded state", async () => {
    const user = userEvent.setup();
    render(<Disclosure summary="Why this threshold?">Detail text.</Disclosure>);
    const button = screen.getByRole("button", { name: "Why this threshold?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
