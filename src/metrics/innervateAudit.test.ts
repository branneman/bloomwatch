import { describe, expect, it } from "vitest";
import {
  computeInnervateAudit,
  isManaUsingActor,
  type ActorClass,
} from "./innervateAudit";
import { aCastEvent } from "../testUtils/factories";
import type { ResolvedAbility } from "../abilities/resolveAbilities";

const DRUID_ID = 2;
const MAGE_ID = 10;
const WARRIOR_ID = 11;
const INNERVATE_ID = 29166;
const FIGHT_START = 0;
const FIGHT_DURATION = 300_000; // 5 min

const RESOLVED_ABILITIES = new Map<number, ResolvedAbility>([
  [INNERVATE_ID, { kind: "spell", spell: "Innervate", rank: 1 }],
]);

const MAGE: ActorClass = { class: "Mage", specIcon: "Mage-Fire" };
const WARRIOR: ActorClass = { class: "Warrior", specIcon: "Warrior-Fury" };
const FERAL_DRUID: ActorClass = {
  class: "Druid",
  specIcon: "Druid-Feral Combat",
};
const BALANCE_DRUID: ActorClass = {
  class: "Druid",
  specIcon: "Druid-Balance",
};

const ACTOR_CLASSES = new Map<number, ActorClass>([
  [MAGE_ID, MAGE],
  [WARRIOR_ID, WARRIOR],
]);

function anInnervateCast(timestamp: number, targetID?: number) {
  return aCastEvent({
    timestamp,
    sourceID: DRUID_ID,
    abilityGameID: INNERVATE_ID,
    targetID,
    resourceActor: 1,
    classResources: [{ amount: 10000, max: 0, type: 2900, cost: 0 }], // 29%
  });
}

function aManaSampleEvent(
  sourceID: number,
  timestamp: number,
  currentMana: number,
  maxMana = 10000,
) {
  return aCastEvent({
    timestamp,
    sourceID,
    resourceActor: 1,
    classResources: [{ amount: maxMana, max: 0, type: currentMana, cost: 0 }],
  });
}

describe("isManaUsingActor", () => {
  it("treats Warrior and Rogue as non-mana-using", () => {
    expect(isManaUsingActor(WARRIOR)).toBe(false);
    expect(isManaUsingActor({ class: "Rogue", specIcon: "Rogue-Combat" })).toBe(
      false,
    );
  });

  it("treats Feral Druid as non-mana-using but Balance/Restoration Druid as mana-using", () => {
    expect(isManaUsingActor(FERAL_DRUID)).toBe(false);
    expect(isManaUsingActor(BALANCE_DRUID)).toBe(true);
    expect(
      isManaUsingActor({ class: "Druid", specIcon: "Druid-Restoration" }),
    ).toBe(true);
  });

  it("treats every other class as mana-using", () => {
    expect(isManaUsingActor(MAGE)).toBe(true);
  });

  it("assumes mana-using when the actor's class couldn't be resolved", () => {
    expect(isManaUsingActor(undefined)).toBe(true);
  });
});

describe("computeInnervateAudit", () => {
  it("judges good when cast on a mana-using ally, reading the ally's mana% from its nearest own sample", () => {
    const events = [
      aManaSampleEvent(MAGE_ID, 9000, 4500), // 45%, closest sample to the 10000ms cast
      aManaSampleEvent(MAGE_ID, 20000, 9000),
      anInnervateCast(10000, MAGE_ID),
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toMatchObject({
      timestampMs: 10000,
      isSelfCast: false,
      targetId: MAGE_ID,
      targetClass: MAGE,
      manaPct: 45,
      judgement: "good",
    });
    expect(result.judgement).toBe("good");
  });

  it("judges bad when cast on a non-mana-using ally (Warrior)", () => {
    const events = [anInnervateCast(10000, WARRIOR_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("bad");
    expect(result.judgement).toBe("bad");
  });

  it("judges bad when cast on a Feral-spec Druid", () => {
    const FERAL_ID = 12;
    const actorClasses = new Map([[FERAL_ID, FERAL_DRUID]]);
    const events = [anInnervateCast(10000, FERAL_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      actorClasses,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("bad");
  });

  it("judges self-cast good when it's well within the fight, reading mana straight off the cast event", () => {
    const events = [anInnervateCast(10000, DRUID_ID)];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toMatchObject({
      isSelfCast: true,
      targetId: DRUID_ID,
      targetClass: undefined,
      manaPct: 29,
      judgement: "good",
    });
  });

  it("treats an omitted targetID as a self-cast", () => {
    const events = [anInnervateCast(10000)]; // no targetID
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.isSelfCast).toBe(true);
  });

  it("judges self-cast fair when it lands in the fight's final 10%", () => {
    const events = [anInnervateCast(280_000, DRUID_ID)]; // 93.3% elapsed of 300_000
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.judgement).toBe("fair");
  });

  it("only judges the first cast; later casts are listed but carry no judgement", () => {
    const events = [
      anInnervateCast(10000, DRUID_ID), // first: self-cast, good
      anInnervateCast(200_000, WARRIOR_ID), // second: would be bad, but doesn't count
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.judgement).toBe("good");
    expect(result.laterCasts).toHaveLength(1);
    expect(result.laterCasts[0]).toMatchObject({
      timestampMs: 200_000,
      isSelfCast: false,
      targetId: WARRIOR_ID,
    });
    expect(result.laterCasts[0]).not.toHaveProperty("judgement");
  });

  it("is bad when never cast on a mana-constrained fight of at least 3 minutes", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 6000)]; // 60%, below 70%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      180_000,
      FIGHT_START,
    );
    expect(result.firstCast).toBeNull();
    expect(result.judgement).toBe("bad");
  });

  it("is informational (no judgement) when never cast but mana never dropped below 70%", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 8000)]; // 80%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      300_000,
      FIGHT_START,
    );
    expect(result.judgement).toBeNull();
  });

  it("is informational (no judgement) when never cast and the fight is under 3 minutes, even if mana-constrained", () => {
    const events = [aManaSampleEvent(DRUID_ID, 1000, 6000)]; // 60%
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      179_999,
      FIGHT_START,
    );
    expect(result.judgement).toBeNull();
  });

  it("reports an unknown mana% when the target has no cast-with-resources event in the fight, but still judges on class", () => {
    const events = [anInnervateCast(10000, MAGE_ID)]; // Mage never casts anything else
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast?.manaPct).toBeNull();
    expect(result.firstCast?.judgement).toBe("good");
  });

  it("ignores casts from other players and non-Innervate abilities", () => {
    const events = [
      aCastEvent({
        timestamp: 5000,
        sourceID: MAGE_ID,
        abilityGameID: INNERVATE_ID,
      }), // different source
      aCastEvent({
        timestamp: 6000,
        sourceID: DRUID_ID,
        abilityGameID: 33763,
      }), // Lifebloom, unresolved by RESOLVED_ABILITIES here
    ];
    const result = computeInnervateAudit(
      events,
      DRUID_ID,
      RESOLVED_ABILITIES,
      ACTOR_CLASSES,
      FIGHT_DURATION,
      FIGHT_START,
    );
    expect(result.firstCast).toBeNull();
  });
});
