import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportInput } from "./index";

const CODE = "4GYHZRdtL3bvhpc8";

describe("ReportInput", () => {
  it("calls onSubmit with the parsed report code and null fightId for a bare code", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/report url or code/i), CODE);
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(onSubmit).toHaveBeenCalledWith({ reportCode: CODE, fightId: null });
  });

  it("calls onSubmit with the parsed fight id from a URL fragment", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      `https://fresh.warcraftlogs.com/reports/${CODE}#fight=5`,
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(onSubmit).toHaveBeenCalledWith({ reportCode: CODE, fightId: 5 });
  });

  it("shows the unsupported-realm message and does not submit for a www. URL", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      `https://www.warcraftlogs.com/reports/${CODE}`,
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/fresh/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a generic message and does not submit for garbage input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      "not a report link",
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
