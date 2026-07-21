import { render, screen } from "@testing-library/react";
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
});
