import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Popover } from "./index";

describe("Popover", () => {
  it("is closed by default", () => {
    render(
      <Popover triggerLabel="2 fair">
        <span>Boss A</span>
      </Popover>,
    );
    expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 fair" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens on hover and closes on unhover", async () => {
    const user = userEvent.setup();
    render(
      <Popover triggerLabel="2 fair">
        <span>Boss A</span>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "2 fair" });

    await user.hover(trigger);
    expect(screen.getByText("Boss A")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.unhover(trigger);
    expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes when focus moves elsewhere", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.tab();
    expect(screen.getByText("Boss A")).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
  });

  it("opens on click, for touch devices with no hover", async () => {
    const user = userEvent.setup();
    render(
      <Popover triggerLabel="2 fair">
        <span>Boss A</span>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "2 fair" });

    await user.click(trigger);
    expect(screen.getByText("Boss A")).toBeInTheDocument();
  });

  it("closes when clicking outside the popover", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Popover triggerLabel="2 fair">
          <span>Boss A</span>
        </Popover>
        <button type="button">Outside</button>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "2 fair" }));
    expect(screen.getByText("Boss A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Popover triggerLabel="2 fair">
        <span>Boss A</span>
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "2 fair" }));
    expect(screen.getByText("Boss A")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Boss A")).not.toBeInTheDocument();
  });
});
