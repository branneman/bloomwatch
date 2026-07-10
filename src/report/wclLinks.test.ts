import { describe, expect, it } from "vitest";
import { buildFightTimeUrl } from "./wclLinks";

describe("buildFightTimeUrl", () => {
  it("builds a fresh.warcraftlogs.com deep link scoped to the fight and time range", () => {
    const url = buildFightTimeUrl("4GYHZRdtL3bvhpc8", 6, 1500, 5000);
    expect(url).toBe(
      "https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8#fight=6&type=summary&start=1500&end=5000",
    );
  });
});
