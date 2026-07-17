import { readFile, writeFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";
import { detectDruids } from "../src/report/druidDetection";
import { buildFightRows } from "../src/report/fightRows";
import type { Fight, CastTableEntry } from "../src/wcl/client";

// This script has its own small host-parameterized fetch layer rather than
// reusing src/wcl/client.ts (hardcoded to www.warcraftlogs.com) or
// scripts/lib/calibrateReport.ts (same). Story 012 — making the WCL client
// itself host-flexible — is in progress in a separate worktree; duplicating
// a few fetch calls here avoids merge conflicts with that work.

const HOSTS = {
  fresh: "https://www.warcraftlogs.com/api/v2/user",
  classic: "https://classic.warcraftlogs.com/api/v2/user",
} as const;

type HostKey = keyof typeof HOSTS;

function isHostKey(value: string): value is HostKey {
  return value === "fresh" || value === "classic";
}

async function graphql(
  accessToken: string,
  host: HostKey,
  query: string,
): Promise<unknown> {
  const resp = await fetch(HOSTS[host], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${bodyText}`);
  const parsed: unknown = JSON.parse(bodyText);
  const { data, errors } = parsed as {
    data?: unknown;
    errors?: { message?: string }[];
  };
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(`GraphQL error: ${JSON.stringify(errors)}`);
  }
  return data;
}

async function fetchReportFights(
  accessToken: string,
  host: HostKey,
  reportCode: string,
): Promise<Fight[]> {
  const data = (await graphql(
    accessToken,
    host,
    `query { reportData { report(code: "${reportCode}") { fights { id name startTime endTime encounterID kill bossPercentage } } } }`,
  )) as { reportData: { report: { fights: Fight[] } | null } };
  const report = data.reportData.report;
  if (!report) throw new Error("report not found");
  return report.fights;
}

async function fetchCastsTable(
  accessToken: string,
  host: HostKey,
  reportCode: string,
  fightIds: number[],
): Promise<CastTableEntry[]> {
  const data = (await graphql(
    accessToken,
    host,
    `query { reportData { report(code: "${reportCode}") { table(fightIDs: [${fightIds.join(",")}], dataType: Casts) } } }`,
  )) as {
    reportData: { report: { table: { data: { entries: CastTableEntry[] } } } };
  };
  return data.reportData.report.table.data.entries;
}

interface TalentEntry {
  id: number;
}
interface CombatantInfoEvent {
  sourceID?: number;
  talents?: TalentEntry[];
}

async function fetchTalents(
  accessToken: string,
  host: HostKey,
  reportCode: string,
  fight: { id: number; startTime: number; endTime: number },
  druidId: number,
): Promise<[number, number, number] | null> {
  const data = (await graphql(
    accessToken,
    host,
    `query { reportData { report(code: "${reportCode}") { events(fightIDs: [${fight.id}], startTime: ${fight.startTime}, endTime: ${fight.endTime}, dataType: CombatantInfo) { data } } } }`,
  )) as {
    reportData: { report: { events: { data: CombatantInfoEvent[] } } };
  };
  const events = data.reportData.report.events.data;
  const ci = events.find((e) => e.sourceID === druidId && e.talents);
  if (!ci?.talents || ci.talents.length !== 3) return null;
  const [balance, feral, restoration] = ci.talents.map((t) => t.id);
  return [balance, feral, restoration];
}

type Bucket =
  | "deep-resto"
  | "likely-dreamstate-full"
  | "likely-dreamstate-partial"
  | "mostly-resto"
  | "mostly-balance"
  | "restokin-shaped"
  | "other-unclassified"
  | "unknown-no-talent-data";

// Order matters: deep-resto and the two dreamstate tiers are specific
// signatures checked first; "mostly-resto" vs "mostly-balance" is a
// same-priority fallback comparison between whichever tree actually has
// more points, not two independent thresholds — a 21/0/40 split has to land
// in "mostly-resto" (resto dominates) even though balance alone is >= 20.
// Feral is checked too: a 0/46/15 split isn't "mostly-resto" just because
// restoration > balance — Feral dominates both, so it falls through to
// "other-unclassified" (not a target archetype for this app at all) rather
// than being mislabeled as leaning Restoration.
function classifyBucket(
  balance: number,
  feral: number,
  restoration: number,
): Bucket {
  if (restoration >= 41) return "deep-resto";
  if (balance >= 33) return "likely-dreamstate-full";
  if (balance >= 31) return "likely-dreamstate-partial";
  if (restoration > balance && restoration > feral) return "mostly-resto";
  if (balance >= 20 && balance > feral) return "mostly-balance";
  return "other-unclassified";
}

const BUCKET_DEFINITIONS: Record<Bucket, string> = {
  "deep-resto": "Restoration >= 41 (Tree of Life-eligible)",
  "likely-dreamstate-full": "Balance >= 33 (full 3/3 Dreamstate-eligible)",
  "likely-dreamstate-partial": "Balance >= 31 (>=1 point Dreamstate-eligible)",
  "mostly-resto":
    "Restoration > Balance, but below deep-resto's 41-point cutoff and below Dreamstate's 31-point Balance threshold",
  "mostly-balance": "Balance >= Restoration and Balance >= 20",
  "restokin-shaped": "signature not yet determined — see story 900",
  "other-unclassified": "doesn't fit any bucket above",
  "unknown-no-talent-data": "talent read failed or unavailable",
};

interface ArchetypeEntry {
  druidId: number;
  druidName: string;
  source: HostKey;
  balance: number | null;
  feral: number | null;
  restoration: number | null;
  bucket: Bucket;
}

interface ArchetypeFile {
  bucketDefinitions: Record<Bucket, string>;
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

  const fights = await fetchReportFights(accessToken, host, reportCode);
  const nonTrashFights = buildFightRows(fights)
    .filter((row) => !row.isTrash)
    .map((row) => row.fight);

  const castTableEntries = await fetchCastsTable(
    accessToken,
    host,
    reportCode,
    nonTrashFights.map((f) => f.id),
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
    const bucket: Bucket =
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
