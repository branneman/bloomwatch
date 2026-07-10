import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DruidPicker } from "./index";
import type { DruidCandidate } from "../../../report/druidDetection";

const dassz: DruidCandidate = {
  id: 2,
  name: "Dassz",
  healingCastCount: 1652,
  isRestoSpec: true,
};
const maoqi: DruidCandidate = {
  id: 4,
  name: "Maoqi",
  healingCastCount: 40,
  isRestoSpec: false,
};

describe("DruidPicker", () => {
  it("shows an informational message when there are no candidates", () => {
    render(<DruidPicker candidates={[]} onSelect={vi.fn()} />);
    expect(
      screen.getByText("No resto druids detected in this report."),
    ).toBeInTheDocument();
  });

  it("auto-selects the sole candidate without rendering a picker", () => {
    const onSelect = vi.fn();
    render(<DruidPicker candidates={[dassz]} onSelect={onSelect} />);
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("renders a radio option per candidate when there are multiple", () => {
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/Dassz/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Maoqi/)).toBeInTheDocument();
  });

  it("shows a Restoration badge only for candidates WCL labeled as such", () => {
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/Dassz/)).toHaveAccessibleName(/Restoration/);
    expect(screen.getByLabelText(/Maoqi/)).not.toHaveAccessibleName(
      /Restoration/,
    );
  });

  it("calls onSelect with the chosen druid's id when a radio option is picked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DruidPicker candidates={[dassz, maoqi]} onSelect={onSelect} />);
    await user.click(screen.getByLabelText(/Maoqi/));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
