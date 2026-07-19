import { describe, expect, it } from "vitest";
import { computeGcdUtilization } from "./gcdUtilization";
import { aCastEvent, aBegincastEvent } from "../testUtils/factories";

describe("computeGcdUtilization", () => {
  it("costs 1.5s GCD per instant cast", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 774 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(4500);
    expect(result.fightDurationMs).toBe(10000);
    expect(result.utilizationPct).toBe(45);
    expect(result.judgement).toBe("bad");
  });

  it("uses the begincast-to-cast delta as the cost for a cast-time spell", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(2000);
  });

  it("ignores an interrupted cast (begincast with no following cast)", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(0);
  });

  it("clamps a cast-time delta below the GCD floor up to 1.5s", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 1200, sourceID: 2, abilityGameID: 26980 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(1500);
  });

  it("clamps utilizationPct to 100 without clamping activeTimeMs", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      aCastEvent({ timestamp: i * 1500, sourceID: 2, abilityGameID: 33763 }),
    );
    const result = computeGcdUtilization(events, 2, 0, 5000);
    expect(result.activeTimeMs).toBe(15000);
    expect(result.utilizationPct).toBe(100);
  });

  it("ignores casts from other actors", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 99, abilityGameID: 33763 }),
    ];
    const result = computeGcdUtilization(events, 2, 0, 10000);
    expect(result.activeTimeMs).toBe(0);
  });
});
