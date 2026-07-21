import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAccessToken } from "./lib/env";
import { calibrateReport } from "./lib/calibrateReport";
import { parseReportInput } from "../src/report/parseReportInput";
import { WclApiError } from "../src/wcl/client";
import { WclRateLimitError } from "../src/wcl/events";

async function writeCalibrationOutput(
  reportCode: string,
  output: unknown,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "calibration-data");
  await mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, `${reportCode}.json`);
  const tempPath = `${finalPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(tempPath, finalPath);
  return finalPath;
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run calibrate -- <reportCode or report URL>");
    process.exit(1);
  }

  const parsed = parseReportInput(input);
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  const output = await calibrateReport(
    accessToken,
    parsed.reportCode,
    parsed.host,
  );

  if (output.druids.length === 0) {
    console.log(
      `No resto druid candidates detected in report ${parsed.reportCode}. Nothing written.`,
    );
    return;
  }

  const filePath = await writeCalibrationOutput(parsed.reportCode, output);
  console.log(
    `Wrote ${filePath} — ${output.druids.length} druid(s), ` +
      `${output.druids[0].fights.length} fight(s) each.`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof WclRateLimitError) {
    console.error("Rate limited by WCL. Wait a bit and try again.");
  } else if (err instanceof WclApiError) {
    console.error(`WCL API error: ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`Failed: ${err.message}`);
  } else {
    console.error("Failed with an unknown error.", err);
  }
  process.exit(1);
});
