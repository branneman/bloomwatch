import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RateLimitBanner } from "./index";

describe("RateLimitBanner", () => {
  it("shows the rounded usage percentage and the running-low message", () => {
    render(<RateLimitBanner usagePct={82.4} onConnect={vi.fn()} />);

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByText(/Shared connection is running low/),
    ).toBeInTheDocument();
  });

  it("reveals OwnClientIdField when the disclosure is opened, and calls onConnect with its value", async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<RateLimitBanner usagePct={80} onConnect={onConnect} />);

    expect(
      screen.queryByLabelText("WCL API Client ID"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Use your own Client ID/ }),
    );
    await user.type(
      screen.getByLabelText("WCL API Client ID"),
      "my-own-client-id",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(onConnect).toHaveBeenCalledWith("my-own-client-id");
  });

  it("has a status role so it's announced non-intrusively", () => {
    render(<RateLimitBanner usagePct={80} onConnect={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
