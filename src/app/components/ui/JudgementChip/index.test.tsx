import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudgementChip } from "./index";

describe("JudgementChip", () => {
  it.each([
    ["good", "Good"],
    ["fair", "Fair"],
    ["bad", "Bad"],
  ] as const)("renders the %s judgement as %s", (judgement, label) => {
    render(<JudgementChip judgement={judgement} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
