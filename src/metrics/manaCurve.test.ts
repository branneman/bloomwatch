import { describe, expect, it } from "vitest";
import { computeManaCurve } from "./manaCurve";
import { aCastEvent } from "../testUtils/factories";

function aManaCastEvent(
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID: 2,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("computeManaCurve", () => {
  it("builds pct points from mana samples and reports ending pct", () => {
    const events = [aManaCastEvent(1000, 9000), aManaCastEvent(2000, 3000)];

    const result = computeManaCurve(events, 2, true, 120_000);

    expect(result.points).toEqual([
      { timestampMs: 1000, pct: 90 },
      { timestampMs: 2000, pct: 30 },
    ]);
    expect(result.endingPct).toBe(30);
  });

  it("judges green in the middle of the band on a kill ≥ 90s", () => {
    const events = [aManaCastEvent(1000, 2000)]; // 20%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("green");
  });

  it("judges orange just above the green band", () => {
    const events = [aManaCastEvent(1000, 5000)]; // 50%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("orange");
  });

  it("judges orange just below the green band", () => {
    const events = [aManaCastEvent(1000, 200)]; // 2%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("orange");
  });

  it("judges red above 70%", () => {
    const events = [aManaCastEvent(1000, 8000)]; // 80%
    expect(computeManaCurve(events, 2, true, 120_000).judgement).toBe("red");
  });

  it("treats exactly 5% and exactly 40% as green (band boundaries)", () => {
    expect(
      computeManaCurve([aManaCastEvent(1000, 500)], 2, true, 120_000).judgement,
    ).toBe("green");
    expect(
      computeManaCurve([aManaCastEvent(1000, 4000)], 2, true, 120_000)
        .judgement,
    ).toBe("green");
  });

  it("is informational (null judgement) on a wipe", () => {
    const events = [aManaCastEvent(1000, 2000)];
    expect(computeManaCurve(events, 2, false, 120_000).judgement).toBeNull();
  });

  it("is informational (null judgement) on a kill under 90s", () => {
    const events = [aManaCastEvent(1000, 2000)];
    expect(computeManaCurve(events, 2, true, 89_999).judgement).toBeNull();
  });

  it("reports null points/endingPct/judgement when the druid has no qualifying samples", () => {
    const result = computeManaCurve([], 2, true, 120_000);
    expect(result).toEqual({ points: [], endingPct: null, judgement: null });
  });
});
