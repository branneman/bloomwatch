import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorOverlay } from "./index";

describe("ErrorOverlay", () => {
  it("shows the apology and keeps details collapsed by default", () => {
    render(<ErrorOverlay error={new Error("boom")} onStartOver={vi.fn()} />);

    expect(
      screen.getByText("Sorry, something went wrong."),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("reveals the error message and stack in View details once expanded", async () => {
    const error = new Error("boom");
    const user = userEvent.setup();
    render(<ErrorOverlay error={error} onStartOver={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "View details" }));

    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("falls back to String(error) for a non-Error value", async () => {
    const user = userEvent.setup();
    render(<ErrorOverlay error="a plain string error" onStartOver={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "View details" }));

    expect(screen.getByText(/a plain string error/)).toBeInTheDocument();
  });

  it("calls onStartOver when Start over is clicked", async () => {
    const onStartOver = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorOverlay error={new Error("boom")} onStartOver={onStartOver} />,
    );

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("links to the GitHub issues page", () => {
    render(<ErrorOverlay error={new Error("boom")} onStartOver={vi.fn()} />);

    expect(screen.getByRole("link", { name: "open an issue" })).toHaveAttribute(
      "href",
      "https://github.com/branneman/bloomwatch/issues",
    );
  });
});
