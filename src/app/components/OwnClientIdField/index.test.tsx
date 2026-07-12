import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OwnClientIdField } from "./index";

describe("OwnClientIdField", () => {
  it("disables the connect button until a Client ID is entered", async () => {
    const user = userEvent.setup();
    render(<OwnClientIdField onConnect={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: "Connect with this Client ID",
    });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("WCL API Client ID"), "my-id");

    expect(button).toBeEnabled();
  });

  it("calls onConnect with the entered Client ID", async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<OwnClientIdField onConnect={onConnect} />);

    await user.type(screen.getByLabelText("WCL API Client ID"), "my-id");
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(onConnect).toHaveBeenCalledWith("my-id");
  });

  it("links to the WCL client registration page", () => {
    render(<OwnClientIdField onConnect={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Register a free client" }),
    ).toHaveAttribute("href", "https://www.warcraftlogs.com/api/clients/");
  });
});
