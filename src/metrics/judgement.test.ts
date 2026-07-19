import { describe, expect, it } from "vitest";
import {
  judgeThreshold,
  judgeThresholdBelow,
  judgementBreakdown,
  weightedMedianJudgement,
  type Judgement,
} from "./judgement";

describe("judgeThreshold", () => {
  it("returns good at or above goodMin", () => {
    expect(judgeThreshold(85, { goodMin: 85, fairMin: 70 })).toBe("good");
    expect(judgeThreshold(100, { goodMin: 85, fairMin: 70 })).toBe("good");
  });

  it("returns fair between fairMin (inclusive) and goodMin (exclusive)", () => {
    expect(judgeThreshold(70, { goodMin: 85, fairMin: 70 })).toBe("fair");
    expect(judgeThreshold(84.9, { goodMin: 85, fairMin: 70 })).toBe("fair");
  });

  it("returns bad below fairMin", () => {
    expect(judgeThreshold(69.9, { goodMin: 85, fairMin: 70 })).toBe("bad");
    expect(judgeThreshold(0, { goodMin: 85, fairMin: 70 })).toBe("bad");
  });
});

describe("judgeThresholdBelow", () => {
  it("returns good below goodMax", () => {
    expect(judgeThresholdBelow(4.9, { goodMax: 5, fairMax: 15 })).toBe("good");
    expect(judgeThresholdBelow(0, { goodMax: 5, fairMax: 15 })).toBe("good");
  });

  it("returns fair between goodMax (inclusive) and fairMax (inclusive)", () => {
    expect(judgeThresholdBelow(5, { goodMax: 5, fairMax: 15 })).toBe("fair");
    expect(judgeThresholdBelow(15, { goodMax: 5, fairMax: 15 })).toBe("fair");
  });

  it("returns bad above fairMax", () => {
    expect(judgeThresholdBelow(15.1, { goodMax: 5, fairMax: 15 })).toBe("bad");
    expect(judgeThresholdBelow(100, { goodMax: 5, fairMax: 15 })).toBe("bad");
  });
});

describe("weightedMedianJudgement", () => {
  it("returns null for an empty list", () => {
    expect(weightedMedianJudgement([])).toBeNull();
  });

  it("returns null when every entry has zero weight", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "bad", weightMs: 0 },
        { judgement: "good", weightMs: 0 },
      ]),
    ).toBeNull();
  });

  it("returns fair whenever both good and bad fights are present, regardless of which dominates by duration", () => {
    // Requested directly: a bad-dominant mix (8 bad vs. 1 good, 2 fair)
    // used to read as a flat "bad" under the median alone, burying the
    // fact a fight actually went well.
    expect(
      weightedMedianJudgement([
        { judgement: "good", weightMs: 1000 },
        { judgement: "fair", weightMs: 2000 },
        { judgement: "bad", weightMs: 8000 },
      ]),
    ).toBe("fair");
    // Symmetric case: good-dominant with a single bad fight also caps at
    // "fair" rather than "good" — the override doesn't care which side
    // dominates, only that both extremes are present at all.
    expect(
      weightedMedianJudgement([
        { judgement: "good", weightMs: 8000 },
        { judgement: "bad", weightMs: 1000 },
      ]),
    ).toBe("fair");
  });

  it("returns good when only good and fair fights are present and fair doesn't cross half", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "good", weightMs: 8000 },
        { judgement: "fair", weightMs: 2000 },
      ]),
    ).toBe("good");
  });

  it("returns bad when bad alone crosses half the duration and no good fights are present", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "fair", weightMs: 3000 },
        { judgement: "bad", weightMs: 7000 },
      ]),
    ).toBe("bad");
  });

  it("returns fair when fair-or-worse crosses half but bad alone doesn't, and no good fights are present", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "fair", weightMs: 6000 },
        { judgement: "bad", weightMs: 4000 },
      ]),
    ).toBe("fair");
  });

  it("rounds an exact fair/bad boundary tie toward bad", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "fair", weightMs: 5000 },
        { judgement: "bad", weightMs: 5000 },
      ]),
    ).toBe("bad");
  });

  it("rounds an exact good/fair boundary tie toward fair", () => {
    expect(
      weightedMedianJudgement([
        { judgement: "good", weightMs: 5000 },
        { judgement: "fair", weightMs: 5000 },
      ]),
    ).toBe("fair");
  });

  it("reproduces story 904's cited GCD economy split without bad dominating", () => {
    // docs/backlog.md story 904: a real corpus's GCD economy fights split
    // 33% good / 27% fair / 39% bad by fight, but worst-of rollup reads
    // 0% good / 9% fair / 91% bad. Modeled here as equal-duration fights
    // so the weighting is uniform and the split is exact. Since both good
    // and bad fights are present, this now resolves via the fair-override
    // rather than the median calculation, but the answer is unchanged.
    const entries: { judgement: Judgement; weightMs: number }[] = [
      ...Array.from({ length: 33 }, () => ({
        judgement: "good" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 27 }, () => ({
        judgement: "fair" as const,
        weightMs: 1000,
      })),
      ...Array.from({ length: 39 }, () => ({
        judgement: "bad" as const,
        weightMs: 1000,
      })),
    ];
    expect(weightedMedianJudgement(entries)).toBe("fair");
  });
});

describe("judgementBreakdown", () => {
  it("counts fights per judgement bucket", () => {
    expect(
      judgementBreakdown([
        { judgement: "good" },
        { judgement: "good" },
        { judgement: "fair" },
        { judgement: "bad" },
      ]),
    ).toEqual({ good: 2, fair: 1, bad: 1 });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(judgementBreakdown([])).toEqual({ good: 0, fair: 0, bad: 0 });
  });
});
