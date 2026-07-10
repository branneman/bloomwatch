import { describe, expect, it } from "vitest";
import { judgeThreshold } from "./judgement";

describe("judgeThreshold", () => {
  it("returns green at or above greenMin", () => {
    expect(judgeThreshold(85, { greenMin: 85, orangeMin: 70 })).toBe("green");
    expect(judgeThreshold(100, { greenMin: 85, orangeMin: 70 })).toBe("green");
  });

  it("returns orange between orangeMin (inclusive) and greenMin (exclusive)", () => {
    expect(judgeThreshold(70, { greenMin: 85, orangeMin: 70 })).toBe("orange");
    expect(judgeThreshold(84.9, { greenMin: 85, orangeMin: 70 })).toBe(
      "orange",
    );
  });

  it("returns red below orangeMin", () => {
    expect(judgeThreshold(69.9, { greenMin: 85, orangeMin: 70 })).toBe("red");
    expect(judgeThreshold(0, { greenMin: 85, orangeMin: 70 })).toBe("red");
  });
});
