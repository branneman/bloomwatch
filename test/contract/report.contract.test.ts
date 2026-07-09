import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { fetchReportFights } from "../../src/wcl/client";

config({ path: ".env.local" });

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;

describe.skipIf(!accessToken)("fetchReportFights (real WCL API)", () => {
  it("resolves the real fresh-realm report and returns its title and fight list", async () => {
    const result = await fetchReportFights(
      accessToken as string,
      "4GYHZRdtL3bvhpc8",
    );
    expect(result.title).toBe("SSC+TK 2026-07-07");
    expect(result.fights.length).toBeGreaterThan(0);
  });
});
