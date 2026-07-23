import { describe, expect, it } from "vitest";
import { buildFightRows, formatDuration, formatFightLabel } from "./fightRows";
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

  it("marks Karazhan's Chess Event as trash even though it has a real encounterID", () => {
    const fights = [aFight({ id: 1, encounterID: 660 })];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it("marks every fight as trash and pull-number-less for an all-trash report", () => {
    const fights = [
      aFight({ id: 1, encounterID: 0 }),
      aFight({ id: 2, encounterID: 0 }),
    ];
    const rows = buildFightRows(fights);
    expect(rows.every((r) => r.isTrash && r.pullNumber === null)).toBe(true);
  });

  it("marks a heroic-dungeon zone visit as trash despite a nonzero encounterID", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 100004,
        kill: false,
        gameZone: { id: 547, name: "The Slave Pens" },
      }),
    ];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it("marks a different expansion's real raid boss as trash", () => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 611,
        kill: true,
        gameZone: { id: 1000, name: "Blackwing Lair" },
      }),
    ];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it("marks a fight with no gameZone at all as trash", () => {
    const fights = [
      aFight({ id: 1, encounterID: 50661, kill: true, gameZone: null }),
    ];
    const rows = buildFightRows(fights);
    expect(rows).toEqual([
      { fight: fights[0], isTrash: true, pullNumber: null },
    ]);
  });

  it.each([
    "Karazhan",
    "Gruul's Lair",
    "Magtheridon's Lair",
    "Serpentshrine Cavern",
    "The Eye",
    "Hyjal Summit",
    "Black Temple",
    "Sunwell Plateau",
    "Zul'Aman",
  ])("does not mark a real TBC raid boss in %s as trash", (zoneName) => {
    const fights = [
      aFight({
        id: 1,
        encounterID: 50661,
        kill: true,
        gameZone: { id: 1, name: zoneName },
      }),
    ];
    const rows = buildFightRows(fights);
    expect(rows[0].isTrash).toBe(false);
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

describe("formatFightLabel", () => {
  it("returns the plain boss name when there's no pull number", () => {
    const fight = aFight({ name: "Lady Vashj" });
    expect(formatFightLabel(fight, null)).toBe("Lady Vashj");
  });

  it("prefixes the pull number when one is given", () => {
    const fight = aFight({ name: "Lady Vashj" });
    expect(formatFightLabel(fight, 2)).toBe("Pull 2 · Lady Vashj");
  });
});
