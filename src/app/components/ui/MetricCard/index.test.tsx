import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./index";

describe("MetricCard", () => {
  it("renders title, value, and judgement chip", () => {
    render(
      <MetricCard
        title="GCD utilization"
        value="87%"
        pct={87}
        judgement="green"
        threshold="Green >= 85%."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "87",
    );
  });

  it("renders a note instead of a chip when judgement is absent", () => {
    render(
      <MetricCard
        title="Concurrent LB3 targets"
        value="Avg 1.6 · Peak 2"
        note="Informational — no judgement"
        threshold="No R/O/G."
      />,
    );
    expect(
      screen.getByText("Informational — no judgement"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Green")).not.toBeInTheDocument();
  });

  it("shows the threshold text only after opening the disclosure", async () => {
    const user = userEvent.setup();
    render(
      <MetricCard
        title="GCD utilization"
        value="87%"
        judgement="green"
        threshold="Green >= 85%, orange 70-85%, red < 70%."
      />,
    );
    expect(screen.queryByText(/Green >= 85%/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Why this threshold?" }),
    );
    expect(screen.getByText(/Green >= 85%/)).toBeInTheDocument();
  });

  it("renders children as the card body", () => {
    render(
      <MetricCard title="GCD utilization" judgement="green" threshold="...">
        <p>Time on the global cooldown.</p>
      </MetricCard>,
    );
    expect(
      screen.getByText("Time on the global cooldown."),
    ).toBeInTheDocument();
  });
});
