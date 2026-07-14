import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeathCard } from "./index";

describe("DeathCard", () => {
  it("renders a judged, maintained-target death with all fields", () => {
    render(
      <DeathCard
        target="Offtank"
        time="3:47"
        maintained={true}
        lb3={false}
        swiftmendReady={true}
        nsReady={true}
        idlePreceding={true}
        judgement="red"
      />,
    );

    expect(screen.getByText("Offtank")).toBeInTheDocument();
    expect(screen.getByText("3:47")).toBeInTheDocument();
    expect(screen.getByText("Bad")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("shows 'Not judged' and 'n/a — not maintained' for an unmaintained target", () => {
    render(
      <DeathCard
        target="Raid member (Warrior)"
        time="5:02"
        maintained={false}
        lb3={false}
        swiftmendReady={false}
        nsReady={true}
        idlePreceding={false}
        judgement={null}
      />,
    );

    expect(screen.getByText("Not judged")).toBeInTheDocument();
    expect(screen.getByText("n/a — not maintained")).toBeInTheDocument();
    expect(screen.getByText("On cooldown")).toBeInTheDocument();
  });
});
