import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppHeader } from "./index";

describe("AppHeader", () => {
  it("shows the app's wordmark", () => {
    render(<AppHeader />);

    expect(screen.getByText("Bloomwatch")).toBeInTheDocument();
  });
});
