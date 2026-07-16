import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./index";

describe("Footer", () => {
  it("calls onReopenOnboarding when the About link is clicked", async () => {
    const onReopenOnboarding = vi.fn();
    render(<Footer onReopenOnboarding={onReopenOnboarding} />);

    await userEvent.click(screen.getByRole("button", { name: "About" }));

    expect(onReopenOnboarding).toHaveBeenCalledOnce();
  });

  it("shows a version string in <commit-count>-<hash> form", () => {
    render(<Footer onReopenOnboarding={vi.fn()} />);

    expect(screen.getByText(/^\d+-[0-9a-f]{7,}$/)).toBeInTheDocument();
  });
});
