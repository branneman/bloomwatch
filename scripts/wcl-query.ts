import { readFile } from "node:fs/promises";
import { loadAccessToken } from "./lib/env";

const HOSTS = {
  www: "https://www.warcraftlogs.com/api/v2/client",
  classic: "https://classic.warcraftlogs.com/api/v2/client",
  fresh: "https://fresh.warcraftlogs.com/api/v2/client",
} as const;
type HostKey = keyof typeof HOSTS;

function isHostKey(value: string): value is HostKey {
  return value === "www" || value === "classic" || value === "fresh";
}

interface ParsedArgs {
  host: HostKey;
  query: string | null;
  filePath: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let host: HostKey = "www";
  let query: string | null = null;
  let filePath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") {
      const value = argv[++i];
      if (value === undefined || !isHostKey(value)) {
        throw new Error(
          `--host must be one of www, classic, fresh (got "${value}")`,
        );
      }
      host = value;
    } else if (arg === "--file") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--file requires a path");
      filePath = value;
    } else {
      query = arg;
    }
  }

  return { host, query, filePath };
}

function printUsage(): void {
  console.error(
    "Usage: npm run wcl:query -- '<graphql query>' [--host www|classic|fresh]",
  );
  console.error(
    "       npm run wcl:query -- --file path/to/query.graphql [--host www|classic|fresh]",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const queryText = args.filePath
    ? await readFile(args.filePath, "utf8")
    : args.query;

  if (!queryText) {
    printUsage();
    process.exit(1);
  }

  const accessToken = loadAccessToken();
  const response = await fetch(HOSTS[args.host], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: queryText }),
  });

  const body: unknown = await response.json();
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
