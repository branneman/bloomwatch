import { test, expect } from "@playwright/test";

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;
const REPORT_CODE = "4GYHZRdtL3bvhpc8";

test.skip(!accessToken, "WCL_TEST_ACCESS_TOKEN not set — see docs/testing.md");

test("a pre-authenticated visit renders the real fight list and allows picking a fight", async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem("wcl_access_token", token as string);
  }, accessToken);

  // "/" would resolve to the domain root on GitHub Pages (base path is /bloomwatch/,
  // not the domain root) — "./" correctly stays relative to baseURL in both
  // local dev (http://localhost:5173) and production (.../bloomwatch/).
  await page.goto("./");

  await page.getByLabel("Report URL or code").fill(REPORT_CODE);
  await page.getByRole("button", { name: "Load report" }).click();

  await expect(page.getByText("SSC+TK 2026-07-07")).toBeVisible();

  const firstBossFight = page
    .getByRole("checkbox", {
      name: /^Pull \d+/,
    })
    .first();
  await expect(firstBossFight).toBeVisible();
  await firstBossFight.click();
  await expect(firstBossFight).toBeChecked();
});
