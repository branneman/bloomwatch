import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudgementChip } from "./index";

describe("JudgementChip", () => {
  it.each([
    ["green", "Good"],
    ["orange", "Fair"],
    ["red", "Bad"],
  ] as const)("renders the %s judgement as %s", (judgement, label) => {
    render(<JudgementChip judgement={judgement} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
