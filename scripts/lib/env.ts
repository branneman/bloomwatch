import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export function loadAccessToken(): string {
  const token = process.env.WCL_TEST_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "WCL_TEST_ACCESS_TOKEN is not set. Add it to .env.local — see docs/testing.md's " +
        '"Secrets & credentials" section for how to obtain one.',
    );
    process.exit(1);
  }
  return token;
}
