const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;
const WCL_HOSTNAME_PATTERN = /^([a-z0-9]+)\.warcraftlogs\.com$/;
const REPORT_PATH_PATTERN = /\/reports\/([A-Za-z0-9]{16})/;

export type ParseReportInputResult =
  | { ok: true; reportCode: string; fightId: number | null }
  | { ok: false; reason: "unsupported-realm" | "invalid"; message: string };

const UNSUPPORTED_REALM_MESSAGE =
  'This tool only supports TBC Anniversary ("fresh") realm reports. Paste a link from fresh.warcraftlogs.com.';
const INVALID_MESSAGE =
  "Couldn't recognize that as a Warcraft Logs report URL or code. Paste a fresh.warcraftlogs.com report link, or just the 16-character report code.";

export function parseReportInput(input: string): ParseReportInputResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (REPORT_CODE_PATTERN.test(trimmed)) {
    return { ok: true, reportCode: trimmed, fightId: null };
  }

  const url = parseUrl(trimmed);
  if (!url) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  const hostMatch = url.hostname.match(WCL_HOSTNAME_PATTERN);
  if (!hostMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (hostMatch[1] !== "fresh") {
    return {
      ok: false,
      reason: "unsupported-realm",
      message: UNSUPPORTED_REALM_MESSAGE,
    };
  }

  const pathMatch = url.pathname.match(REPORT_PATH_PATTERN);
  if (!pathMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  return {
    ok: true,
    reportCode: pathMatch[1],
    fightId: parseFightId(url.hash),
  };
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

function parseFightId(hash: string): number | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const raw = new URLSearchParams(fragment).get("fight");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
