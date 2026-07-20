import { describe, expect, it } from "vitest";
import { computeLb3Uptime } from "./lb3Uptime";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aRemoveBuffEvent,
} from "../testUtils/factories";

const LB_IDS = new Set([33763]);

describe("computeLb3Uptime", () => {
  it("excludes the ramp-up period from the 3-stack window", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 3000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 20000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 20000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 100,
        lb3UptimeMs: 17000,
        windowMs: 17000,
        lb3UptimePct: 100,
        judgement: "good",
      },
    ]);
  });

  it("reports multiple targets independently", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 10000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 0, targetID: 47 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 47 }),
      aRemoveBuffEvent({ timestamp: 4000, targetID: 47 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets.map((t) => t.targetId)).toEqual([42, 47]);
    expect(result.targets[1]).toMatchObject({
      targetId: 47,
      lb3UptimeMs: 0,
      lb3UptimePct: 0,
      judgement: "bad",
    });
  });

  it("excludes a target below the 30% maintained-uptime threshold", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 99 }),
      aRemoveBuffEvent({ timestamp: 1000, targetID: 99 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 100000);
    expect(result.targets).toEqual([]);
  });

  it("closes an interval still open at fightEnd", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 2000, stack: 3, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 5000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 100,
        lb3UptimeMs: 3000,
        windowMs: 3000,
        lb3UptimePct: 100,
        judgement: "good",
      },
    ]);
  });

  it("reports 0% and bad for a maintained target that never reaches 3 stacks", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 2, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 8000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 80,
        lb3UptimeMs: 0,
        windowMs: 10000,
        lb3UptimePct: 0,
        judgement: "bad",
      },
    ]);
  });

  it("accumulates 3-stack time across a drop and re-ramp, keeping the first-reached timestamp", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 3000, targetID: 42 }),
      anApplyBuffEvent({ timestamp: 5000, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 5500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 6000, stack: 3, targetID: 42 }),
      aRemoveBuffEvent({ timestamp: 9000, targetID: 42 }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([
      {
        targetId: 42,
        lbUptimePct: 70,
        lb3UptimeMs: 5000,
        windowMs: 9000,
        lb3UptimePct: (5000 / 9000) * 100,
        judgement: "bad",
      },
    ]);
  });

  it("judges fair between 60% and 80%, good at or above 80%", () => {
    const baseEvents = (dropAt: number, reopenAt: number) => [
      anApplyBuffEvent({ timestamp: 0, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 500, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: 1000, stack: 3, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: dropAt, stack: 2, targetID: 42 }),
      anApplyBuffStackEvent({ timestamp: reopenAt, stack: 3, targetID: 42 }),
    ];

    const goodResult = computeLb3Uptime(
      baseEvents(6000, 6500),
      2,
      LB_IDS,
      0,
      11000,
    );
    expect(goodResult.targets[0].lb3UptimePct).toBe(95);
    expect(goodResult.targets[0].judgement).toBe("good");

    const fairResult = computeLb3Uptime(
      baseEvents(6000, 9000),
      2,
      LB_IDS,
      0,
      11000,
    );
    expect(fairResult.targets[0].lb3UptimePct).toBe(70);
    expect(fairResult.targets[0].judgement).toBe("fair");
  });

  it("ignores events from a different caster and non-Lifebloom abilities", () => {
    const events = [
      anApplyBuffEvent({ timestamp: 0, targetID: 42, sourceID: 99 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 3,
        targetID: 42,
        abilityGameID: 26982,
      }),
    ];
    const result = computeLb3Uptime(events, 2, LB_IDS, 0, 10000);
    expect(result.targets).toEqual([]);
  });
});
