import { describe, expect, it } from "vitest";
import { computeIdleGaps } from "./idleGaps";
import { aCastEvent } from "../testUtils/factories";

describe("computeIdleGaps", () => {
  it("flags a gap greater than 1.7s between two casts", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 10000);
    expect(result.gaps).toEqual([
      { startMs: 1500, endMs: 5000, durationMs: 3500 },
    ]);
    expect(result.totalDeadTimeMs).toBe(3500);
  });

  it("excludes a gap of exactly the 1.7s threshold", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3200, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 10000);
    expect(result.gaps).toEqual([]);
  });

  it("includes a gap one millisecond over the threshold", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3201, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 10000);
    expect(result.gaps).toEqual([
      { startMs: 1500, endMs: 3201, durationMs: 1701 },
    ]);
  });

  it("does not synthesize a gap before the first cast or after the last cast", () => {
    const events = [
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 20000);
    expect(result.gaps).toEqual([]);
    expect(result.totalDeadTimeMs).toBe(0);
  });

  it("keeps only the 5 longest gaps in longestGaps, sorted descending", () => {
    const timestamps = [0, 4000, 10000, 18000, 28000, 40000, 54000];
    const events = timestamps.map((timestamp) =>
      aCastEvent({ timestamp, sourceID: 2, abilityGameID: 33763 }),
    );
    const result = computeIdleGaps(events, 2, 0, 60000);
    expect(result.gaps).toHaveLength(6);
    expect(result.longestGaps).toHaveLength(5);
    expect(result.longestGaps.map((g) => g.durationMs)).toEqual([
      12500, 10500, 8500, 6500, 4500,
    ]);
  });

  it("computes deadTimePct and a good judgement below 5%", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 100000);
    expect(result.deadTimePct).toBeCloseTo(3.5);
    expect(result.judgement).toBe("good");
  });

  it("judges fair between 5% and 15%, bad above 15%", () => {
    const fairEvents = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 10000, sourceID: 2, abilityGameID: 33763 }),
    ];
    expect(computeIdleGaps(fairEvents, 2, 0, 100000).judgement).toBe("fair");

    const badEvents = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 20000, sourceID: 2, abilityGameID: 33763 }),
    ];
    expect(computeIdleGaps(badEvents, 2, 0, 100000).judgement).toBe("bad");
  });

  it("judges 6% dead time good after story 908's recalibration (was fair under the old 5% boundary)", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 7500, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 100000);
    expect(result.deadTimePct).toBeCloseTo(6);
    expect(result.judgement).toBe("good");
  });

  it("ignores casts from other actors", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 99, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 5000, sourceID: 99, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 10000);
    expect(result.gaps).toEqual([]);
  });

  it("returns a good, empty result when there are fewer than two casts", () => {
    const events = [
      aCastEvent({ timestamp: 0, sourceID: 2, abilityGameID: 33763 }),
    ];
    const result = computeIdleGaps(events, 2, 0, 10000);
    expect(result.gaps).toEqual([]);
    expect(result.totalDeadTimeMs).toBe(0);
    expect(result.judgement).toBe("good");
  });
});
