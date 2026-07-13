import { describe, expect, it } from "vitest";
import { extractManaSamples } from "./manaSamples";
import { aCastEvent } from "../testUtils/factories";

describe("extractManaSamples", () => {
  it("extracts current/max mana from the druid's own cast events", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
      aCastEvent({
        timestamp: 2000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9529, cost: 28 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([
      { timestampMs: 1000, currentMana: 9689, maxMana: 9815 },
      { timestampMs: 2000, currentMana: 9529, maxMana: 9815 },
    ]);
  });

  it("sorts samples by timestamp regardless of input order", () => {
    const events = [
      aCastEvent({
        timestamp: 2000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9529, cost: 28 }],
      }),
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2).map((s) => s.timestampMs)).toEqual([
      1000, 2000,
    ]);
  });

  it("ignores events from a different source", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 999,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events where resourceActor is not 1 (target's resource, not the caster's)", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 2,
        classResources: [{ amount: 8058, max: 0, type: 6395, cost: 23 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores non-cast events", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        type: "begincast",
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 220, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events with no classResources at all", () => {
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, resourceActor: 1 }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  it("ignores events with a malformed classResources entry", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: "not a number", type: 9689 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });
});
