// src/report/archetypeDetection.test.ts
import { describe, expect, it } from "vitest";
import { classifyBucket, parseTalentPoints } from "./archetypeDetection";
import { aCombatantInfoEvent } from "../testUtils/factories";

describe("classifyBucket", () => {
  it("classifies deep-resto at the 41-point Restoration boundary", () => {
    expect(classifyBucket(0, 0, 41)).toBe("deep-resto");
    expect(classifyBucket(0, 0, 40)).not.toBe("deep-resto");
  });

  it("classifies likely-dreamstate-full at the 33-point Balance boundary", () => {
    expect(classifyBucket(33, 0, 10)).toBe("likely-dreamstate-full");
  });

  it("classifies likely-dreamstate-partial between 31 and 32 Balance points", () => {
    expect(classifyBucket(31, 0, 10)).toBe("likely-dreamstate-partial");
    expect(classifyBucket(32, 0, 10)).toBe("likely-dreamstate-partial");
  });

  it("classifies a 21/0/40 split as mostly-resto, not mostly-balance, even though balance >= 20", () => {
    expect(classifyBucket(21, 0, 40)).toBe("mostly-resto");
  });

  it("classifies mostly-balance at the 20-point Balance boundary when Balance dominates", () => {
    expect(classifyBucket(20, 5, 10)).toBe("mostly-balance");
  });

  it("classifies a 0/46/15 Feral-dominant split as other-unclassified, not mostly-resto", () => {
    expect(classifyBucket(0, 46, 15)).toBe("other-unclassified");
  });

  it("classifies a low, roughly-even split as other-unclassified", () => {
    expect(classifyBucket(0, 10, 5)).toBe("other-unclassified");
  });
});

describe("parseTalentPoints", () => {
  it("reads balance/feral/restoration in tree order from the matching druid's CombatantInfo event", () => {
    const events = [
      aCombatantInfoEvent({
        sourceID: 2,
        talents: [{ id: 45 }, { id: 0 }, { id: 16 }],
      }),
    ];
    expect(parseTalentPoints(events, 2)).toEqual([45, 0, 16]);
  });

  it("returns null when no CombatantInfo event matches the druid's sourceID", () => {
    const events = [
      aCombatantInfoEvent({
        sourceID: 5,
        talents: [{ id: 45 }, { id: 0 }, { id: 16 }],
      }),
    ];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });

  it("returns null when talents has the wrong number of entries", () => {
    const events = [
      aCombatantInfoEvent({ sourceID: 2, talents: [{ id: 45 }, { id: 0 }] }),
    ];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });

  it("returns null when the event has no talents field at all", () => {
    const events = [aCombatantInfoEvent({ sourceID: 2 })];
    expect(parseTalentPoints(events, 2)).toBeNull();
  });
});
