import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./index";

describe("Field", () => {
  it("associates its label text with the wrapped input", () => {
    render(
      <Field label="WCL Client ID">
        <input placeholder="Paste your Client ID" />
      </Field>,
    );
    expect(screen.getByLabelText("WCL Client ID")).toHaveAttribute(
      "placeholder",
      "Paste your Client ID",
    );
  });
});
