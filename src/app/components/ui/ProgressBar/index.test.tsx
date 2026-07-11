import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./index";

describe("ProgressBar", () => {
  it("exposes pct as aria-valuenow", () => {
    render(<ProgressBar pct={87} judgement="green" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "87",
    );
  });

  it("clamps values above 100 down to 100", () => {
    render(<ProgressBar pct={140} judgement="neutral" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("clamps negative values up to 0", () => {
    render(<ProgressBar pct={-5} judgement="red" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
