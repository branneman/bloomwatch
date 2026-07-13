import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChecklistRow } from "./index";

describe("ChecklistRow", () => {
  it("shows Present for a present item", () => {
    render(<ChecklistRow label="Food buff" present={true} />);
    expect(screen.getByText("Food buff")).toBeInTheDocument();
    expect(screen.getByText("Present")).toBeInTheDocument();
  });

  it("shows Missing for an absent item", () => {
    render(<ChecklistRow label="Weapon oil" present={false} />);
    expect(screen.getByText("Weapon oil")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });
});
