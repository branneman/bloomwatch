import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Widget } from "./index";

describe("Widget", () => {
  it("renders judgement and stats and fires onOpen when clicked", async () => {
    const onOpen = vi.fn();
    render(
      <Widget
        icon="icon.jpg"
        label="GCD economy"
        judgement="fair"
        stats={["GCD utilization: 87%", "Idle gaps: 6.2% dead time"]}
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: /GCD economy/ });
    expect(button).toHaveTextContent("Fair");
    expect(button).toHaveTextContent("GCD utilization: 87%");
    expect(button).toHaveTextContent("Idle gaps: 6.2% dead time");
    expect(button).toHaveTextContent("View details →");

    const user = userEvent.setup();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("falls back to a note instead of a chip, but stays clickable", async () => {
    const onOpen = vi.fn();
    render(
      <Widget
        icon="icon.jpg"
        label="GCD economy"
        note="Calculating…"
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: /GCD economy/ });
    expect(button).toHaveTextContent("Calculating…");
    expect(screen.queryByText(/^(Good|Fair|Bad)$/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders disabled with no button role or click target when onOpen is omitted", () => {
    render(
      <Widget
        icon="icon.jpg"
        label="Spell discipline"
        note="Not yet available"
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Spell discipline")).toBeInTheDocument();
    expect(screen.getByText("Not yet available")).toBeInTheDocument();
    expect(screen.queryByText("View details →")).not.toBeInTheDocument();
  });
});
