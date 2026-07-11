import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpellIcon } from "./index";

describe("SpellIcon", () => {
  it("renders an image at the given src, defaulting to 28x28", () => {
    render(<SpellIcon src="/icons/lifebloom.jpg" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/icons/lifebloom.jpg");
    expect(img).toHaveAttribute("width", "28");
    expect(img).toHaveAttribute("height", "28");
  });

  it("accepts a custom size", () => {
    render(<SpellIcon src="/icons/lifebloom.jpg" size={40} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("width", "40");
    expect(img).toHaveAttribute("height", "40");
  });
});
