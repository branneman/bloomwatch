import { readFile, writeFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";
import { detectDruids } from "../src/report/druidDetection";
import { buildFightRows } from "../src/report/fightRows";
import {
  fetchReportFights,
  fetchCastsTable,
  type Host,
} from "../src/wcl/client";
import { createEventFetcher } from "../src/wcl/eventCache";
import {
  classifyBucket,
  BUCKET_DEFINITIONS,
  parseTalentPoints,
  type TalentBucket,
} from "../src/report/archetypeDetection";

function isHostKey(value: string): value is Host {
  return value === "fresh" || value === "classic";
}

async function fetchTalents(
  accessToken: string,
  host: Host,
  reportCode: string,
  fight: { id: number; startTime: number; endTime: number },
  druidId: number,
): Promise<[number, number, number] | null> {
  const { fetchEvents } = createEventFetcher(undefined, undefined, host);
  const events = await fetchEvents(
    accessToken,
    reportCode,
    fight,
    "CombatantInfo",
  );
  return parseTalentPoints(events, druidId);
}

interface ArchetypeEntry {
  druidId: number;
  druidName: string;
  source: Host;
  balance: number | null;
  feral: number | null;
  restoration: number | null;
  bucket: TalentBucket;
}

interface ArchetypeFile {
  bucketDefinitions: Record<TalentBucket, string>;
  reports: Record<string, ArchetypeEntry>;
}

const OUTPUT_PATH = new URL(
  "../docs/calibration-archetypes.json",
  import.meta.url,
).pathname;

async function loadExisting(): Promise<ArchetypeFile> {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { bucketDefinitions: BUCKET_DEFINITIONS, reports: {} };
  }
}

async function main() {
  const reportCode = process.argv[2];
  const hostFlagIndex = process.argv.indexOf("--host");
  const hostArg =
    hostFlagIndex >= 0 ? process.argv[hostFlagIndex + 1] : "fresh";
  if (!reportCode || !isHostKey(hostArg)) {
    console.error(
      "usage: tagArchetypes.ts <reportCode> [--host fresh|classic]",
    );
    process.exit(1);
  }
  const host = hostArg;
  const accessToken = loadAccessToken();

  const { fights } = await fetchReportFights(
    accessToken,
    reportCode,
    undefined,
    host,
  );
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => row.fight);

  const castTableEntries = await fetchCastsTable(
    accessToken,
    reportCode,
    nonTrashFights.map((f) => f.id),
    undefined,
    host,
  );
  const candidates = detectDruids(castTableEntries);

  if (candidates.length === 0) {
    console.log(`No resto druid candidates detected in ${reportCode}.`);
    return;
  }

  const file = await loadExisting();
  file.bucketDefinitions = BUCKET_DEFINITIONS;

  for (const candidate of candidates) {
    const firstFight = nonTrashFights[0];
    const talents = await fetchTalents(
      accessToken,
      host,
      reportCode,
      firstFight,
      candidate.id,
    );
    const [balance, feral, restoration] = talents ?? [null, null, null];
    const bucket: TalentBucket =
      talents === null
        ? "unknown-no-talent-data"
        : classifyBucket(
            balance as number,
            feral as number,
            restoration as number,
          );

    const key = `${reportCode}:${candidate.name}`;
    file.reports[key] = {
      druidId: candidate.id,
      druidName: candidate.name,
      source: host,
      balance,
      feral,
      restoration,
      bucket,
    };
    console.log(
      `${key}\t${host}\t${balance}/${feral}/${restoration}\t${bucket}`,
    );
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
