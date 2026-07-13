import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassTag } from "./index";

describe("ClassTag", () => {
  it.each([
    ["efficient", "Efficient"],
    ["emergency", "Emergency"],
    ["wasteful", "Wasteful"],
  ] as const)("renders %s tone content", (tone, text) => {
    render(<ClassTag tone={tone}>{text}</ClassTag>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
