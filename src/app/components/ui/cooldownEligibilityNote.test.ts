import { describe, expect, it } from "vitest";
import { describeIneligibleCooldowns } from "./cooldownEligibilityNote";

describe("describeIneligibleCooldowns", () => {
  it("returns null when both resources are talent-eligible", () => {
    expect(describeIneligibleCooldowns(true, true)).toBeNull();
  });

  it("names only Swiftmend when only Swiftmend is talent-ineligible", () => {
    expect(describeIneligibleCooldowns(false, true)).toBe(
      "This build's talents can't reach Swiftmend; that row isn't shown.",
    );
  });

  it("names only Nature's Swiftness when only Nature's Swiftness is talent-ineligible", () => {
    expect(describeIneligibleCooldowns(true, false)).toBe(
      "This build's talents can't reach Nature's Swiftness; that row isn't shown.",
    );
  });

  it("names both when neither resource is talent-eligible", () => {
    expect(describeIneligibleCooldowns(false, false)).toBe(
      "This build's talents can't reach Swiftmend or Nature's Swiftness; those rows aren't shown.",
    );
  });
});
