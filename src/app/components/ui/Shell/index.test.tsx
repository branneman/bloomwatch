import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./index";

describe("Shell", () => {
  it("renders its children", () => {
    render(
      <Shell>
        <h1>Bloomwatch</h1>
      </Shell>,
    );
    expect(
      screen.getByRole("heading", { name: "Bloomwatch" }),
    ).toBeInTheDocument();
  });

  it("does not accept a width prop (fluid, capped by CSS only)", () => {
    // @ts-expect-error width was removed from ShellProps in story 706
    const props: import("./index").ShellProps = { width: 800, children: null };
    expect(props).toBeDefined();
  });
});
