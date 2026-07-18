import { describe, expect, it } from "vitest";
import {
  judgeThreshold,
  judgeThresholdBelow,
  judgementBreakdown,
  weightedMedianJudgement,
  type Judgement,
} from "./judgement";

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

describe("weightedMedianJudgement", () => {
  it("returns null for an empty list", () => {
    expect(weightedMedianJudgement([])).toBeNull();
  });

  it("returns null when every entry has zero weight", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "red", weightMs: 0 },
        { judgement: "green", weightMs: 0 },
      ]),
    ).toBeNull();
  });

  it("returns green when green fights account for most of the duration", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 8000 },
        { judgement: "red", weightMs: 1000 },
      ]),
    ).toBe("green");
  });

  it("returns orange when orange-or-worse crosses half the duration but red alone doesn't", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 4000 },
        { judgement: "orange", weightMs: 4000 },
        { judgement: "red", weightMs: 2000 },
      ]),
    ).toBe("orange");
  });

  it("returns red when red alone accounts for more than half the duration", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 3000 },
        { judgement: "red", weightMs: 7000 },
      ]),
    ).toBe("red");
  });

  it("rounds an exact green/red boundary tie toward red", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 5000 },
        { judgement: "red", weightMs: 5000 },
      ]),
    ).toBe("red");
  });

  it("rounds an exact green/orange boundary tie toward orange", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "green", weightMs: 5000 },
        { judgement: "orange", weightMs: 5000 },
      ]),
    ).toBe("orange");
  });

  it("reproduces story 904's cited GCD economy split without red dominating", () => {
    // docs/backlog.md story 904: a real corpus's GCD economy fights split
    // 33% green / 27% orange / 39% red by fight, but worst-of rollup reads
    // 0% green / 9% orange / 91% red. Modeled here as equal-duration
    // fights so the weighting is uniform and the split is exact.
    const entries: { judgement: Judgement; weightMs: number }[] = [
      ...Array.from({ length: 33 }, () => ({
        judgement: "green" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 27 }, () => ({
        judgement: "orange" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 39 }, () => ({
        judgement: "red" as const,
        weightMs: 1000,
      })),
    ];
    expect(weightedMedianJudgement(entries)).toBe("orange");
  });
});

describe("judgementBreakdown", () => {
  it("counts fights per judgement bucket", () => {
    expect(
      judgementBreakdown([
        { judgement: "green" },
        { judgement: "green" },
        { judgement: "orange" },
        { judgement: "red" },
      ]),
    ).toEqual({ green: 2, orange: 1, red: 1 });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(judgementBreakdown([])).toEqual({ green: 0, orange: 0, red: 0 });
  });
});
