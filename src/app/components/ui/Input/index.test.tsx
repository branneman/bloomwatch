import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./index";

describe("Input", () => {
  it("renders the given placeholder and forwards typed input via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="Paste your Client ID" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Paste your Client ID");
    await user.type(input, "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
