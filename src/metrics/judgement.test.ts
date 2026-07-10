import { describe, expect, it } from "vitest";
import { judgeThreshold, judgeThresholdBelow } from "./judgement";

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

describe("judgeThresholdBelow", () => {
  it("returns green below greenMax", () => {
    expect(judgeThresholdBelow(4.9, { greenMax: 5, orangeMax: 15 })).toBe(
      "green",
    );
    expect(judgeThresholdBelow(0, { greenMax: 5, orangeMax: 15 })).toBe(
      "green",
    );
  });

  it("returns orange between greenMax (inclusive) and orangeMax (inclusive)", () => {
    expect(judgeThresholdBelow(5, { greenMax: 5, orangeMax: 15 })).toBe(
      "orange",
    );
    expect(judgeThresholdBelow(15, { greenMax: 5, orangeMax: 15 })).toBe(
      "orange",
    );
  });

  it("returns red above orangeMax", () => {
    expect(judgeThresholdBelow(15.1, { greenMax: 5, orangeMax: 15 })).toBe(
      "red",
    );
    expect(judgeThresholdBelow(100, { greenMax: 5, orangeMax: 15 })).toBe(
      "red",
    );
  });
});
