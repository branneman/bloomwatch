import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./index";

describe("Badge", () => {
  it.each([
    ["kill", "Kill"],
    ["wipe", "Wipe (34%)"],
    ["trash", "Trash"],
  ] as const)("renders %s tone content", (tone, text) => {
    render(<Badge tone={tone}>{text}</Badge>);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
