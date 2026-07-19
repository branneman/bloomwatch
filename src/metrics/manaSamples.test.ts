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

  it("ignores events whose classResources entry has no .max field", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([]);
  });

  // Some report vintages (e.g. 2021-2024 Classic-launch uploads, see
  // docs/testing.md) report classResources in the opposite shape validated
  // above: `.amount` is current mana, `.max` is the real max pool, and
  // `.type` is just the small resource-type enum (0 = mana). Live-validated
  // against report mtRh3kJ9YMLazyvQ fight 10 (Olklo).
  it("extracts current/max mana from the older report-vintage classResources shape", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 11827, max: 11960, type: 0, cost: 415 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([
      { timestampMs: 1000, currentMana: 11827, maxMana: 11960 },
    ]);
  });

  // Locks in the exact discriminator boundary: a real level-70 max mana pool
  // is always four digits or more, while the newer shape's unrelated `.max`
  // field is bounded by WoW's own non-mana resource scales (rage tops out at
  // 1000) and never reaches it.
  it("treats a .max of exactly 1000 as the older (real max pool) shape", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 500, max: 1000, type: 0, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([
      { timestampMs: 1000, currentMana: 500, maxMana: 1000 },
    ]);
  });

  it("treats a .max of 999 as the newer (garbage-field) shape", () => {
    const events = [
      aCastEvent({
        timestamp: 1000,
        sourceID: 2,
        resourceActor: 1,
        classResources: [{ amount: 9815, max: 999, type: 9689, cost: 26 }],
      }),
    ];

    expect(extractManaSamples(events, 2)).toEqual([
      { timestampMs: 1000, currentMana: 9689, maxMana: 9815 },
    ]);
  });
});
