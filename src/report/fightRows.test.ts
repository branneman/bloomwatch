import { describe, expect, it } from "vitest";
import { buildFightRows, formatDuration, groupFightsByZone } from "./fightRows";
import { aFight } from "../testUtils/factories";

describe("buildFightRows", () => {
  it("marks encounterID 0 fights as trash with no pull number", () => {
    const fights = [aFight({ id: 1, encounterID: 0 })];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it("numbers repeated attempts at the same encounter starting at 1", () => {
    const fights = [
      aFight({ id: 1, encounterID: 500 }),
      aFight({ id: 2, encounterID: 500 }),
      aFight({ id: 3, encounterID: 500 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.map((r) => r.pullNumber)).toEqual([1, 2, 3]);
  });

  it("keeps pull numbers separate across interleaved encounters", () => {
    const fights = [
      aFight({ id: 1, encounterID: 500 }),
      aFight({ id: 2, encounterID: 600 }),
      aFight({ id: 3, encounterID: 500 }),
      aFight({ id: 4, encounterID: 600 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.map((r) => r.pullNumber)).toEqual([1, 1, 2, 2]);
  });

  it("marks every fight as trash and pull-number-less for an all-trash report", () => {
    const fights = [
      aFight({ id: 1, encounterID: 0 }),
      aFight({ id: 2, encounterID: 0 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.every((r) => r.isTrash && r.pullNumber === null)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatDuration(5000)).toBe("0:05");
  });

  it("formats multi-minute durations as m:ss", () => {
    expect(formatDuration(90000)).toBe("1:30");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(59700)).toBe("1:00");
  });
});

describe("groupFightsByZone", () => {
  it("groups boss fights by zone in first-seen order", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 500,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
      aFight({
        id: 2,
        encounterID: 600,
        gameZone: { id: 550, name: "The Eye" },
      }),
      aFight({
        id: 3,
        encounterID: 501,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
    ];
    expect(groupFightsByZone(fights)).toEqual([
      { zoneId: 548, zoneName: "Serpentshrine Cavern", fightIds: [1, 3] },
      { zoneId: 550, zoneName: "The Eye", fightIds: [2] },
    ]);
  });

  it("excludes trash fights from every zone's fightIds", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 0,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
      aFight({
        id: 2,
        encounterID: 500,
        gameZone: { id: 548, name: "Serpentshrine Cavern" },
      }),
    ];
    expect(groupFightsByZone(fights)).toEqual([
      { zoneId: 548, zoneName: "Serpentshrine Cavern", fightIds: [2] },
    ]);
  });

  it("excludes fights with no gameZone", () => {
    const fights = [aFight({ id: 1, encounterID: 500, gameZone: null })];
    expect(groupFightsByZone(fights)).toEqual([]);
  });

  it("returns an empty array for an all-trash report", () => {
    const fights = [aFight({ id: 1, encounterID: 0 })];
    expect(groupFightsByZone(fights)).toEqual([]);
  });
});
