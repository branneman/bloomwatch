import { test, expect } from "@playwright/test";

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;

test.skip(!accessToken, "WCL_TEST_ACCESS_TOKEN not set — see docs/testing.md");

test("a pre-authenticated visit renders the real fight list", async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem("wcl_access_token", token as string);
  }, accessToken);

  await page.goto("/");

  await expect(page.getByText("SSC+TK 2026-07-07")).toBeVisible();
  await expect(page.getByText(/\d+ fights/)).toBeVisible();
});
