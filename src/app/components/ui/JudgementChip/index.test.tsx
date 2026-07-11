import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JudgementChip } from "./index";

describe("JudgementChip", () => {
  it.each([
    ["green", "Green"],
    ["orange", "Orange"],
    ["red", "Red"],
  ] as const)("renders the %s judgement as %s", (judgement, label) => {
    render(<JudgementChip judgement={judgement} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
