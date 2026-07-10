import type { Fight, ReportFights } from "../wcl/client";

export function aFight(overrides: Partial<Fight> = {}): Fight {
  return {
    id: 1,
    name: "Coilfang Frenzy",
    startTime: 1477307,
    endTime: 1505939,
    encounterID: 601,
    kill: true,
    bossPercentage: null,
    ...overrides,
  };
}

export function aReportFights(
  overrides: Partial<ReportFights> = {},
): ReportFights {
  return {
    title: "SSC+TK 2026-07-07",
    fights: [aFight()],
    ...overrides,
  };
}
