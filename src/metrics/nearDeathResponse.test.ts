import { describe, expect, it } from "vitest";
import {
  computeNearDeathResponse,
  getHealingAbilityIds,
} from "./nearDeathResponse";
import {
  aDamageEvent,
  aHealEvent,
  aDeathEvent,
  aCastEvent,
  anApplyBuffEvent,
  anApplyBuffStackEvent,
} from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const SWIFTMEND_IDS = new Set([18562]);
const NS_IDS = new Set([17116]);
const LB_IDS = new Set([33763]);
const HEALING_TOUCH_ID = 26979;
const HEALING_IDS = new Set([33763, 774, 8936, HEALING_TOUCH_ID, 18562, 740]);

describe("computeNearDeathResponse", () => {
  it("judges good when the druid lands a reactive heal inside the crisis window", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 12 }),
    ];
    const healingEvents = [
      aHealEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
    ];
    const castEvents = [
      aCastEvent({
        timestamp: 10500,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: HEALING_TOUCH_ID,
      }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      healingEvents,
      [],
      castEvents,
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
    expect(result.crises[0]).toMatchObject({
      timestampMs: 10000,
      targetId: 50,
      hitPointsPct: 12,
      judged: true,
      responded: true,
      judgement: "good",
    });
    expect(result.judgement).toBe("good");
  });

  it("judges by the unspent-resource tally when nobody responded, on a target with no clear tank assignment", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 12000, targetID: 50, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].responded).toBe(false);
    expect(result.crises[0].judged).toBe(true);
    expect(result.crises[0].unspentCount).toBe(3);
    expect(result.crises[0].judgement).toBe("bad");
  });

  it("closes the crisis window on recovery, not on every subsequent low reading", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 8 }),
      aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 60 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
  });

  it("excludes an episode that ends in death rather than recovery", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 0 }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 10525, targetID: 50 })];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      deathEvents,
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(0);
  });

  it("does not misread a battle-rez gap as one long survived crisis (live-validated shape: death, then a much-later healthy reading)", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 10500, targetID: 50, hitPoints: 0 }),
      // Post-rez, ~90s later, a fresh healthy reading — must not be treated
      // as "the same crisis recovering".
      aDamageEvent({ timestamp: 100000, targetID: 50, hitPoints: 81 }),
    ];
    const deathEvents = [aDeathEvent({ timestamp: 10525, targetID: 50 })];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      deathEvents,
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      200000,
    );

    expect(result.crises).toHaveLength(0);
  });

  it("still reports a survived crisis left unresolved when the fight ends before recovery", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 50, hitPoints: 5 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(1);
    expect(result.crises[0].timestampMs).toBe(90000);
  });

  it("judges a crisis on a maintained target even when the druid has a clear tank assignment", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 50, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 50,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 50, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].maintained).toBe(true);
    expect(result.crises[0].judged).toBe(true);
  });

  it("judges a non-maintained crisis as fair when a resource was ready, even without a reactive heal", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 60,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 60,
        abilityGameID: 33763,
      }),
    ];
    // targetID 999 is never maintained -> the druid has exactly one
    // maintained target (60) elsewhere, a clear tank assignment. No prior
    // Swiftmend/Nature's Swiftness casts exist, so both read "ready" by
    // default -- surfacing "you could have helped" even though this
    // wasn't your assigned target.
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].maintained).toBe(false);
    expect(result.crises[0].judged).toBe(true);
    expect(result.crises[0].judgement).toBe("fair");
    expect(result.crises[0].judgedByReadyResource).toBe(true);
    expect(result.flaggedCount).toBe(0);
  });

  it("judges a non-maintained crisis as fair when only one of the two resources was ready", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 60,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 60,
        abilityGameID: 33763,
      }),
    ];
    // A Swiftmend cast 5s before the crisis leaves it on cooldown (15s
    // cooldown); Nature's Swiftness has no prior cast, so it's ready.
    const castEvents = [
      aCastEvent({
        timestamp: 85000,
        sourceID: DRUID_ID,
        targetID: 60,
        abilityGameID: 18562,
      }),
    ];
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      castEvents,
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].swiftmendReady).toBe(false);
    expect(result.crises[0].nsReady).toBe(true);
    expect(result.crises[0].judged).toBe(true);
    expect(result.crises[0].judgement).toBe("fair");
    expect(result.crises[0].judgedByReadyResource).toBe(true);
  });

  it("still shows a non-maintained crisis as context only when neither resource was ready", () => {
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, targetID: 60, abilityGameID: 33763 }),
      anApplyBuffStackEvent({
        timestamp: 1000,
        stack: 2,
        targetID: 60,
        abilityGameID: 33763,
      }),
      anApplyBuffStackEvent({
        timestamp: 2000,
        stack: 3,
        targetID: 60,
        abilityGameID: 33763,
      }),
    ];
    // Both on cooldown: Swiftmend 5s prior (15s cooldown), Nature's
    // Swiftness 60s prior (180s cooldown).
    const castEvents = [
      aCastEvent({
        timestamp: 30000,
        sourceID: DRUID_ID,
        targetID: 60,
        abilityGameID: 17116,
      }),
      aCastEvent({
        timestamp: 85000,
        sourceID: DRUID_ID,
        targetID: 60,
        abilityGameID: 18562,
      }),
    ];
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      castEvents,
      buffEvents,
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].swiftmendReady).toBe(false);
    expect(result.crises[0].nsReady).toBe(false);
    expect(result.crises[0].judged).toBe(false);
    expect(result.crises[0].judgement).toBeNull();
    expect(result.crises[0].judgedByReadyResource).toBe(false);
    expect(result.flaggedCount).toBe(0);
  });

  it("judges a crisis on any raider when the druid has no clear tank assignment (0 maintained targets)", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 999, hitPoints: 10 }),
      aDamageEvent({ timestamp: 91000, targetID: 999, hitPoints: 40 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].judged).toBe(true);
  });

  it("does not count a HoT tick that was already rolling before the crisis as a response", () => {
    // A Lifebloom cast lands well before the crisis opens -> ticks during
    // the window are Healing events, not new Casts events, so they're
    // invisible to the responded check (which only looks at castEvents).
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 40 }),
    ];
    const healingEvents = [
      aHealEvent({
        timestamp: 10500,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: 33763,
        tick: true,
      }),
    ];
    const castEvents = [
      // The cast that opened this HoT happened long before the crisis.
      aCastEvent({
        timestamp: 1000,
        sourceID: DRUID_ID,
        targetID: 50,
        abilityGameID: 33763,
      }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      healingEvents,
      [],
      castEvents,
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises[0].responded).toBe(false);
  });

  it("resolves to a good judgement with no crises when there are none", () => {
    const result = computeNearDeathResponse(
      [],
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result).toEqual({ crises: [], flaggedCount: 0, judgement: "good" });
  });

  it("swiftmendReady and nsReady are false when hasSwiftmend/hasNaturesSwiftness are false, even with no prior cast recorded", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 90000, targetID: 50, hitPoints: 10 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      false,
      false,
      0,
      100000,
    );

    expect(result.crises[0].swiftmendReady).toBe(false);
    expect(result.crises[0].nsReady).toBe(false);
    expect(result.crises[0].unspentCount).toBe(1);
    expect(result.crises[0].judgement).toBe("fair");
  });

  it("produces two separate crisis episodes for the same target across a dip-recover-dip-recover sequence", () => {
    const damageEvents = [
      aDamageEvent({ timestamp: 10000, targetID: 50, hitPoints: 10 }),
      aDamageEvent({ timestamp: 11000, targetID: 50, hitPoints: 50 }),
      aDamageEvent({ timestamp: 20000, targetID: 50, hitPoints: 8 }),
      aDamageEvent({ timestamp: 21000, targetID: 50, hitPoints: 60 }),
    ];

    const result = computeNearDeathResponse(
      damageEvents,
      [],
      [],
      [],
      [],
      DRUID_ID,
      HEALING_IDS,
      SWIFTMEND_IDS,
      NS_IDS,
      LB_IDS,
      true,
      true,
      0,
      100000,
    );

    expect(result.crises).toHaveLength(2);
    expect(result.crises[0].timestampMs).toBe(10000);
    expect(result.crises[1].timestampMs).toBe(20000);
    expect(result.crises.every((c) => c.targetId === 50)).toBe(true);
  });
});

describe("getHealingAbilityIds", () => {
  it("unions every tracked healing spell's ability ids, excluding Nature's Swiftness and Innervate", () => {
    const resolved = new Map<number, ResolvedAbility>([
      [33763, { kind: "spell", spell: "Lifebloom", rank: 1 }],
      [17116, { kind: "spell", spell: "Nature's Swiftness", rank: 1 }],
      [29166, { kind: "spell", spell: "Innervate", rank: 1 }],
      [26979, { kind: "spell", spell: "Healing Touch", rank: 13 }],
    ]);

    const ids = getHealingAbilityIds(resolved);

    expect(ids.has(33763)).toBe(true);
    expect(ids.has(26979)).toBe(true);
    expect(ids.has(17116)).toBe(false);
    expect(ids.has(29166)).toBe(false);
  });
});
