import { describe, expect, it } from "vitest";
import { computeCastIntervals } from "./castIntervals";
import { aCastEvent, aBegincastEvent } from "../testUtils/factories";

describe("computeCastIntervals", () => {
  it("occupies exactly one GCD for an instant cast", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([{ start: 1000, end: 2500 }]);
  });

  it("uses the begincast-to-cast delta as the interval for a cast-time spell", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([{ start: 1000, end: 3000 }]);
  });

  it("produces no interval for an interrupted cast (begincast with no following cast)", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([]);
  });

  it("clamps a cast-time delta below the GCD floor up to 1.5s", () => {
    const events = [
      aBegincastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 26980 }),
      aCastEvent({ timestamp: 1200, sourceID: 2, abilityGameID: 26980 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([{ start: 1000, end: 2500 }]);
  });

  it("ignores casts from other actors", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 99, abilityGameID: 33763 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([]);
  });

  it("produces one interval per cast in sequence", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const intervals = computeCastIntervals(events, 2);
    expect(intervals).toEqual([
      { start: 1000, end: 2500 },
      { start: 3000, end: 4500 },
    ]);
  });
});
