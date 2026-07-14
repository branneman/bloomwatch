import type { EpicId } from "../components/Scorecard/useFightEpicSummaries";

export type Route =
  | { screen: "input" }
  | { screen: "druidPicker"; reportCode: string }
  | { screen: "dashboard"; reportCode: string; druidName: string }
  | {
      screen: "fight";
      reportCode: string;
      druidName: string;
      fightId: number;
    }
  | {
      screen: "fightEpic";
      reportCode: string;
      druidName: string;
      fightId: number;
      epicId: EpicId;
    };

const EPIC_IDS: readonly EpicId[] = [
  "gcd",
  "lifebloom",
  "spell",
  "mana",
  "death",
  "prep",
];

function isEpicId(value: string): value is EpicId {
  return (EPIC_IDS as readonly string[]).includes(value);
}

const INPUT_ROUTE: Route = { screen: "input" };

export function parseHash(hash: string): Route {
  try {
    const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
    const segments = fragment
      .split("/")
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) return INPUT_ROUTE;
    if (segments[0] !== "r" || segments.length < 2) return INPUT_ROUTE;
    const reportCode = decodeURIComponent(segments[1]);

    if (segments.length === 2) return { screen: "druidPicker", reportCode };
    if (segments[2] !== "d" || segments.length < 4) return INPUT_ROUTE;
    const druidName = decodeURIComponent(segments[3]);

    if (segments.length === 4) {
      return { screen: "dashboard", reportCode, druidName };
    }
    if (segments[4] !== "f" || segments.length < 6) return INPUT_ROUTE;
    const fightId = Number.parseInt(segments[5], 10);
    if (Number.isNaN(fightId)) return INPUT_ROUTE;

    if (segments.length === 6) {
      return { screen: "fight", reportCode, druidName, fightId };
    }
    if (segments[6] !== "e" || segments.length < 8) return INPUT_ROUTE;
    const epicIdRaw = decodeURIComponent(segments[7]);
    if (!isEpicId(epicIdRaw)) return INPUT_ROUTE;

    if (segments.length === 8) {
      return {
        screen: "fightEpic",
        reportCode,
        druidName,
        fightId,
        epicId: epicIdRaw,
      };
    }
    return INPUT_ROUTE;
  } catch (e) {
    if (e instanceof URIError) {
      return INPUT_ROUTE;
    }
    throw e;
  }
}

export function serializeRoute(route: Route): string {
  switch (route.screen) {
    case "input":
      return "#";
    case "druidPicker":
      return `#/r/${encodeURIComponent(route.reportCode)}`;
    case "dashboard":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}`;
    case "fight":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}`;
    case "fightEpic":
      return `#/r/${encodeURIComponent(route.reportCode)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}/e/${route.epicId}`;
  }
}
