import type { EpicId } from "../components/Scorecard/useFightEpicSummaries";
import type { Host } from "../../report/parseReportInput";

export type Route =
  | { screen: "input" }
  | { screen: "druidPicker"; reportCode: string; host: Host }
  | {
      screen: "dashboard";
      reportCode: string;
      host: Host;
      druidName: string;
    }
  | {
      screen: "fight";
      reportCode: string;
      host: Host;
      druidName: string;
      fightId: number;
    }
  | {
      screen: "fightEpic";
      reportCode: string;
      host: Host;
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
  "crisis",
  "prep",
];

function isEpicId(value: string): value is EpicId {
  return (EPIC_IDS as readonly string[]).includes(value);
}

function isHost(value: string): value is Host {
  return value === "fresh" || value === "classic";
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

    let index = 2;
    let host: Host = "fresh";
    if (segments[index] === "h") {
      const hostRaw =
        segments[index + 1] !== undefined
          ? decodeURIComponent(segments[index + 1])
          : "";
      host = isHost(hostRaw) ? hostRaw : "fresh";
      // Consume the "h", and consume the value if it exists
      index += segments[index + 1] !== undefined ? 2 : 1;
    }

    if (segments.length === index) {
      return { screen: "druidPicker", reportCode, host };
    }
    if (segments[index] !== "d" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const druidName = decodeURIComponent(segments[index + 1]);
    index += 2;

    if (segments.length === index) {
      return { screen: "dashboard", reportCode, host, druidName };
    }
    if (segments[index] !== "f" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const fightId = Number.parseInt(segments[index + 1], 10);
    if (Number.isNaN(fightId)) return INPUT_ROUTE;
    index += 2;

    if (segments.length === index) {
      return { screen: "fight", reportCode, host, druidName, fightId };
    }
    if (segments[index] !== "e" || segments.length < index + 2) {
      return INPUT_ROUTE;
    }
    const epicIdRaw = decodeURIComponent(segments[index + 1]);
    if (!isEpicId(epicIdRaw)) return INPUT_ROUTE;
    index += 2;

    if (segments.length === index) {
      return {
        screen: "fightEpic",
        reportCode,
        host,
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

function hostSegment(host: Host): string {
  return host === "fresh" ? "" : `/h/${host}`;
}

export function serializeRoute(route: Route): string {
  switch (route.screen) {
    case "input":
      return "#";
    case "druidPicker":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}`;
    case "dashboard":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}`;
    case "fight":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}`;
    case "fightEpic":
      return `#/r/${encodeURIComponent(route.reportCode)}${hostSegment(route.host)}/d/${encodeURIComponent(route.druidName)}/f/${route.fightId}/e/${route.epicId}`;
  }
}
