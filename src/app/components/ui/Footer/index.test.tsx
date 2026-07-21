import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./index";

describe("Footer", () => {
  it("calls onReopenOnboarding when the About link is clicked", async () => {
    const onReopenOnboarding = vi.fn();
    render(
      <Footer onReopenOnboarding={onReopenOnboarding} rateLimitUsage={null} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "About" }));

    expect(onReopenOnboarding).toHaveBeenCalledOnce();
  });

  it("shows a version string in Version: <commit-count>-<hash> form", () => {
    render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

    expect(
      screen.getByText(/^Version: \d+-[0-9a-f]{7,}\.?$/),
    ).toBeInTheDocument();
  });

  it("omits the rate-limit budget line when no usage data is available yet", () => {
    render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

    expect(screen.queryByText(/WCL rate limit budget/)).not.toBeInTheDocument();
  });

  it("shows the rate-limit budget line once usage data is available", () => {
    render(
      <Footer
        onReopenOnboarding={vi.fn()}
        rateLimitUsage={{ limitPerHour: 3000, pointsSpentThisHour: 465 }}
      />,
    );

    expect(
      screen.getByText("WCL rate limit budget: 465/3000."),
    ).toBeInTheDocument();
  });

  it("rounds a fractional points-spent value in the rate-limit budget line", () => {
    render(
      <Footer
        onReopenOnboarding={vi.fn()}
        rateLimitUsage={{ limitPerHour: 9000, pointsSpentThisHour: 76.02 }}
      />,
    );

    expect(
      screen.getByText("WCL rate limit budget: 76/9000."),
    ).toBeInTheDocument();
  });

  it("links to the Judgement Rationale page", () => {
    render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

    expect(
      screen.getByRole("link", { name: "How judgements work" }),
    ).toHaveAttribute("href", "#/judgements");
  });
});
