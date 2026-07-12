import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "./index";

describe("DataTable", () => {
  it("renders a header row and one row per data row", () => {
    render(
      <DataTable
        columns={["Spell", "Casts", "Clips", "Clip %"]}
        rows={[
          ["Rejuvenation", "64", "4", "6.3%"],
          ["Regrowth", "22", "3", "13.6%"],
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Spell" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Clip %" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rejuvenation")).toBeInTheDocument();
    expect(screen.getByText("13.6%")).toBeInTheDocument();
  });

  it("renders React-node cells, not just strings", () => {
    render(
      <DataTable
        columns={["Spell", "Verdict"]}
        rows={[["Rejuvenation", <span key="v">Orange</span>]]}
      />,
    );

    expect(screen.getByText("Orange")).toBeInTheDocument();
  });
});
