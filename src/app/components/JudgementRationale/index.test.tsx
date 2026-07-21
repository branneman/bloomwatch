import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JudgementRationale } from "./index";

describe("JudgementRationale", () => {
  it("renders the heading and every table-of-contents entry", () => {
    render(<JudgementRationale />);

    expect(
      screen.getByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Why process, not output" }),
    ).toHaveAttribute("href", "#/judgements/why-process-not-output");
    expect(screen.getByRole("link", { name: "GCD economy" })).toHaveAttribute(
      "href",
      "#/judgements/gcd-economy",
    );
  });

  it("renders the zero-sum healing argument", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/Healing is zero-sum/)).toBeInTheDocument();
  });

  it("scrolls to the section matching the given slug", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<JudgementRationale slug="how-judgements-combine" />);

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it("does not scroll when no slug is given", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<JudgementRationale />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("renders live GCD utilization thresholds, not hardcoded prose", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/85% or above/)).toBeInTheDocument();
    expect(screen.getByText(/70–85%/)).toBeInTheDocument();
  });

  it("renders live LB3 uptime thresholds", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/80% or above/)).toBeInTheDocument();
  });

  it("renders live Swiftmend wasteful-share thresholds", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/under 40%/)).toBeInTheDocument();
  });

  it("renders live ending-mana band thresholds", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/hoarding/)).toBeInTheDocument();
  });

  it("renders live death-forensics and crisis-response thresholds", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/2 or more unspent/)).toBeInTheDocument();
    expect(screen.getByText(/15% or below/)).toBeInTheDocument();
  });

  it("explains the data pipeline conceptually, with no verdict data ever stored", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/nothing is stored anywhere/i)).toBeInTheDocument();
  });

  it("keeps the one real query example collapsed by default, behind a disclosure", async () => {
    render(<JudgementRationale />);

    expect(screen.queryByText(/reportData/)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "See a real example query" }),
    );

    expect(screen.getByText(/reportData/)).toBeInTheDocument();
  });

  it("links out to the GitHub repository for the full technical picture", () => {
    render(<JudgementRationale />);

    expect(
      screen.getByRole("link", { name: /Read more on GitHub/ }),
    ).toHaveAttribute("href", "https://github.com/branneman/bloomwatch#readme");
  });
});
