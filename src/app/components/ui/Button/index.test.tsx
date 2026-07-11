import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./index";

describe("Button", () => {
  it("renders its label and calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Connect</Button>);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it never submits an enclosing form", () => {
    render(<Button>Get scorecard</Button>);
    expect(
      screen.getByRole("button", { name: "Get scorecard" }),
    ).toHaveAttribute("type", "button");
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Get scorecard
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Get scorecard" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
