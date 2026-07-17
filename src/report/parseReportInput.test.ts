import { describe, expect, it } from "vitest";
import { parseReportInput } from "./parseReportInput";

const CODE = "4GYHZRdtL3bvhpc8";

describe("parseReportInput", () => {
  it("accepts a bare 16-character report code", () => {
    expect(parseReportInput(CODE)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
      host: "fresh",
    });
  });

  it("trims whitespace around a bare code", () => {
    expect(parseReportInput(`  ${CODE}  `)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
      host: "fresh",
    });
  });

  it("accepts a fresh.warcraftlogs.com URL with no fragment", () => {
    expect(
      parseReportInput(`https://fresh.warcraftlogs.com/reports/${CODE}`),
    ).toEqual({ ok: true, reportCode: CODE, fightId: null, host: "fresh" });
  });

  it("accepts a fresh.warcraftlogs.com URL without a scheme", () => {
    expect(parseReportInput(`fresh.warcraftlogs.com/reports/${CODE}`)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
      host: "fresh",
    });
  });

  it("extracts the fight id from a #fight=N fragment", () => {
    expect(
      parseReportInput(
        `https://fresh.warcraftlogs.com/reports/${CODE}#fight=5`,
      ),
    ).toEqual({ ok: true, reportCode: CODE, fightId: 5, host: "fresh" });
  });

  it("extracts the fight id when the fragment has extra params", () => {
    expect(
      parseReportInput(
        `https://fresh.warcraftlogs.com/reports/${CODE}#fight=12&type=healing`,
      ),
    ).toEqual({ ok: true, reportCode: CODE, fightId: 12, host: "fresh" });
  });

  it("rejects a www. URL as an unsupported realm", () => {
    const result = parseReportInput(
      `https://www.warcraftlogs.com/reports/${CODE}`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unsupported-realm");
    expect(result.message).toMatch(/fresh/i);
  });

  it("accepts a classic.warcraftlogs.com URL with host: classic", () => {
    const result = parseReportInput(
      `https://classic.warcraftlogs.com/reports/${CODE}`,
    );
    if (!result.ok) throw new Error("unreachable");
    expect(result).toEqual({ ok: true, reportCode: CODE, fightId: null, host: "classic" });
  });

  it("accepts a classic.warcraftlogs.com URL with a fight fragment", () => {
    const result = parseReportInput(
      `https://classic.warcraftlogs.com/reports/${CODE}#fight=6`,
    );
    if (!result.ok) throw new Error("unreachable");
    expect(result).toEqual({ ok: true, reportCode: CODE, fightId: 6, host: "classic" });
  });

  it("defaults host to fresh for a bare report code", () => {
    const result = parseReportInput(CODE);
    if (!result.ok) throw new Error("unreachable");
    expect(result.host).toBe("fresh");
  });

  it("rejects empty input as generically invalid", () => {
    const result = parseReportInput("");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects garbage text as generically invalid", () => {
    const result = parseReportInput("not a report link");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects a wrong-length code as generically invalid", () => {
    const result = parseReportInput("abc123");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects a path segment with more than 16 alphanumeric characters instead of truncating", () => {
    const result = parseReportInput(
      `https://fresh.warcraftlogs.com/reports/${CODE}EXTRA`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects a non-warcraftlogs URL as generically invalid", () => {
    const result = parseReportInput("https://example.com/reports/" + CODE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });
});
