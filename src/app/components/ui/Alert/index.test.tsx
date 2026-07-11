import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./index";

describe("Alert", () => {
  it("renders its children with role=alert", () => {
    render(<Alert tone="warning">Save a Client ID first.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Save a Client ID first.",
    );
  });
});
