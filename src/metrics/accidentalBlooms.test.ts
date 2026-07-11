import { describe, expect, it } from "vitest";
import { computeAccidentalBlooms } from "./accidentalBlooms";
import { aHealEvent, anApplyBuffEvent } from "../testUtils/factories";

const DRUID_ID = 2;
const LIFEBLOOM_IDS = new Set([33763]);

describe("computeAccidentalBlooms", () => {
  it("returns zero accidental blooms and green judgement with no events", () => {
    const result = computeAccidentalBlooms([], [], DRUID_ID, LIFEBLOOM_IDS);
    expect(result).toEqual({
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    });
  });

  it("ignores periodic tick heals entirely", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, tick: true })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 101000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("does not count a bloom with no later re-application", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      [],
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("does not count a re-application on a different target", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 101000, targetID: 99 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("counts a re-application exactly at the 3s boundary as accidental", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 103000, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(1);
    expect(result.accidentalBlooms).toEqual([
      { timestampMs: 100000, targetId: 42 },
    ]);
    expect(result.judgement).toBe("orange");
  });

  it("does not count a re-application 1ms past the 3s boundary", () => {
    const healEvents = [aHealEvent({ timestamp: 100000, targetID: 42 })];
    const buffEvents = [anApplyBuffEvent({ timestamp: 103001, targetID: 42 })];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });

  it("judges 1-2 accidental blooms orange and 3+ red", () => {
    const healEvents = [
      aHealEvent({ timestamp: 100000, targetID: 1 }),
      aHealEvent({ timestamp: 200000, targetID: 2 }),
      aHealEvent({ timestamp: 300000, targetID: 3 }),
    ];
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 101000, targetID: 1 }),
      anApplyBuffEvent({ timestamp: 201000, targetID: 2 }),
      anApplyBuffEvent({ timestamp: 301000, targetID: 3 }),
    ];

    const twoBlooms = computeAccidentalBlooms(
      buffEvents.slice(0, 2),
      healEvents.slice(0, 2),
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(twoBlooms.count).toBe(2);
    expect(twoBlooms.judgement).toBe("orange");

    const threeBlooms = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(threeBlooms.count).toBe(3);
    expect(threeBlooms.judgement).toBe("red");
  });

  it("ignores heals and re-applications from a different source", () => {
    const healEvents = [
      aHealEvent({ timestamp: 100000, targetID: 42, sourceID: 5 }),
    ];
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 101000, targetID: 42, sourceID: 5 }),
    ];
    const result = computeAccidentalBlooms(
      buffEvents,
      healEvents,
      DRUID_ID,
      LIFEBLOOM_IDS,
    );
    expect(result.count).toBe(0);
  });
});
