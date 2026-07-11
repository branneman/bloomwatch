import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./index";

describe("Checkbox", () => {
  it("renders with the given label and reflects the checked prop", () => {
    render(<Checkbox label="Show trash fights" checked readOnly />);
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
  });

  it("calls onChange when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Show trash fights"
        checked={false}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
