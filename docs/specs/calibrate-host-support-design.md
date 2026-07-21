# Calibration tooling: host support + self-describing output

## Problem

`calibration-data/` (gitignored scratch output of `scripts/calibrate.ts`) turned
out to be a mix of two vintages of TBC report — Anniversary/"fresh" and the
2021-2022 Classic-launch window — with no reliable way to tell which is which:

- `calibrate.ts` always POSTs to `www.warcraftlogs.com` (hardcoded
  `USER_API_URL` in `src/wcl/client.ts`) and never records which vintage a
  report actually is. Since report codes resolve identically regardless of
  API host (story 012), this silently works for classic-vintage report codes
  too — it just produces output indistinguishable from a fresh/Anniversary
  report.
- A one-off, uncommitted script produced `calibration-data/classic/` (22
  files, all real 2021-2022-launch reports, each self-tagged
  `"source": "classic.warcraftlogs.com"`) for story 901/902's calibration
  evidence. That script no longer exists in the repo, so that folder's
  contents cannot be regenerated today.
- 20 of those 22 codes were later also written to the flat root folder by a
  normal `calibrate.ts` run — untagged, indistinguishable from genuine fresh
  reports, and three days staler than the rest of the root corpus.
- 2 of those 22 codes (`a2HMJ3wX6Tq9jpn7`, `tWCqHha9jRfTw8rG`) exist only in
  `classic/`, were never picked up by a root run, and aren't documented in
  `docs/testing.md`'s known-reports table.

Goal: make `calibrate.ts` support both API hosts, have its output
self-describe which vintage it came from, and use that to make the
classic-2021 corpus reproducible again — then regenerate the whole corpus and
retire the now-redundant `classic/` subfolder.

## Host threading through the shared client

`src/wcl/client.ts`'s `postGraphQLOnce`/`postGraphQL` are the single choke
point every WCL fetch function in the app funnels through (directly, or via
`src/wcl/events.ts`). Replace the single hardcoded `USER_API_URL` with:

```ts
const USER_API_URLS = {
  fresh: "https://www.warcraftlogs.com/api/v2/user",
  classic: "https://classic.warcraftlogs.com/api/v2/user",
} as const;
```

and give `postGraphQLOnce`/`postGraphQL` a trailing optional
`host: "fresh" | "classic" = "fresh"` parameter, threaded to the URL pick.
This fans out with small, additive signature changes to:

- `fetchReportFights`, `fetchCastsTable`, `fetchMasterDataAbilities`
  (`src/wcl/client.ts`) — each gains the same trailing optional `host` param.
- `fetchEventsPage`, `fetchLookbackEventsPage` (`src/wcl/events.ts`) — same.
- `createEventFetcher` (`src/wcl/eventCache.ts`) — gains an optional `host`
  param **at factory-creation time**, closed over rather than passed
  per-call. `calibrateReport.ts`'s `computeFightResult` calls
  `ctx.fetchEvents(...)` several times per fight; binding host once at
  `createEventFetcher(host)` construction means the `fetchEvents`/
  `fetchLookbackEvents` closures it returns keep their exact current
  signatures — zero changes to any of those call sites.

Every existing app call site (17 metric cards, `ConnectPanel`, etc.) omits
the new parameter and keeps getting `"fresh"` — identical behavior to today.
This is purely additive to the shared client; no app runtime behavior
changes.

`buildReportContext`/`calibrateReport` (`scripts/lib/calibrateReport.ts`)
gain a `host: "fresh" | "classic"` parameter, threaded to the three
`client.ts` calls and into `createEventFetcher(host)`.

## `calibrate.ts`: no new flag

`calibrate.ts`'s single positional argument now accepts either a bare
16-character report code or a full report URL — the same shapes
`parseReportInput` (`src/report/parseReportInput.ts`, already used by
`ConnectPanel`) already parses. Its `{ reportCode, host }` result feeds
`calibrateReport` directly:

- A bare code → `host: "fresh"` (identical to today's only behavior).
- A `https://classic.warcraftlogs.com/reports/<code>` (or bare
  `classic.warcraftlogs.com/reports/<code>`) URL → `host: "classic"`.
- Invalid input reuses `parseReportInput`'s existing
  `unsupported-realm`/`invalid` error messages instead of a new bespoke one.

No `--host` flag is introduced — this mirrors how the app itself never asks
for a host either; it reads it off whatever link the user pastes in.

## Output schema

`CalibrationOutput` (`scripts/lib/types.ts`) gains one field:

```ts
export interface CalibrationOutput {
  reportCode: string;
  reportTitle: string;
  generatedAt: string;
  source: "fresh" | "classic"; // new
  druids: DruidResult[];
}
```

populated in `calibrateReport()` from the `host` it ran with. This is the
same two-value vocabulary `docs/calibration-archetypes.json` already uses
for its own `source` field (not the old `classic/` script's ad-hoc
`"classic.warcraftlogs.com"` hostname string) — one shared concept across
the calibration tooling.

## File layout

`calibrate.ts` writes every report to `calibration-data/<code>.json` —
`calibration-data/classic/` goes away entirely, since the JSON itself now
self-reports vintage. That subfolder was the _only_ signal of vintage
before, which is exactly what let root-level duplicates go untagged and
stale in the first place.

## `tagArchetypes.ts` consolidation

`tagArchetypes.ts` carries its own small host-parameterized fetch layer
(`graphql`, `fetchReportFights`, `fetchCastsTable`, `fetchTalents`) built
specifically to avoid merge conflicts with story 012, which has since
landed — and it has already drifted (its `fetchReportFights` query is
missing `zone.expansion.id`/`archiveStatus`/`rateLimitData`, which the real
`client.ts` version has). Once `client.ts` is host-aware:

- `tagArchetypes.ts` imports `fetchReportFights`/`fetchCastsTable` from
  `src/wcl/client.ts` instead of its own copies.
- `fetchTalents` (a raw `CombatantInfo` events read) switches to
  `createEventFetcher(host).fetchEvents(..., "CombatantInfo")` — the same
  path `calibrateReport.ts` already uses for that data type.
- Its own private `graphql`/`fetchReportFights`/`fetchCastsTable`/
  `fetchTalents` functions are deleted.
- Its CLI interface (`--host fresh|classic`) is unchanged — it processes one
  already-known report per invocation rather than parsing a pasted link, so
  a flag still makes sense there.

## Regenerating the corpus

The only _complete_ record of which report codes are classic-vintage is the
current `calibration-data/classic/` folder's 22 filenames —
`docs/calibration-archetypes.json` is missing one (`yNLDrn9z7hM3KRBG`) and
`docs/testing.md`'s narrative table is missing two (`a2HMJ3wX6Tq9jpn7`,
`tWCqHha9jRfTw8rG`), so neither is a safe substitute.

Regeneration process (order matters — the two code sets overlap by 20, and
processing them in the wrong order would clobber a correctly-tagged
`"classic"` file with a wrongly-tagged `"fresh"` one):

1. Compute the full set of 103 unique codes: the 101 existing root
   filenames unioned with the 22 `classic/` filenames.
2. Re-run `calibrate.ts` for the 22 `classic/` codes first, via their
   `classic.warcraftlogs.com/reports/<code>` form →
   `calibration-data/<code>.json` with `source: "classic"`. This recovers
   the 2 orphaned codes that never had a root copy.
3. Re-run `calibrate.ts` for the remaining 81 codes (root codes not also in
   `classic/`) as bare codes → `source: "fresh"`, refreshed against current
   metrics/thresholds. This set deliberately excludes the 20 codes already
   handled in step 2.
4. Confirm all 103 unique codes exist in the flat `calibration-data/`
   folder, then delete `calibration-data/classic/`.

This is ~103 live calibration runs against the real WCL API, each issuing
several requests per fight — meaningful API quota usage and wall-clock time,
with a real chance of hitting WCL's rate limit mid-run. The implementation
will include a small **resumable** regeneration script rather than a
fire-and-forget loop: for each `(code, host)` pair in the plan above, it
skips the pair if `calibration-data/<code>.json` already exists _and_ its
`source` field already matches the expected `host` for that pair. Since the
classic pass always runs before the fresh pass, a re-run after a rate-limit
interruption simply picks up wherever it left off, in either phase, with no
extra state to track. This script is a one-time migration aid, not
committed product tooling.

## Docs

`docs/testing.md`:

- "Calibration tooling" section: describe the new bare-code-or-URL
  invocation and the new `source` output field; drop any implication of a
  `--host` flag.
- Note `calibration-data/classic/` no longer exists, folded into the flat
  layout.
- `tagArchetypes.ts` paragraph: note it now shares `client.ts`'s fetch
  functions instead of carrying its own copy.
- Add a short note by the "Known real 2021-2022 TBC Classic reports" table
  clarifying it's a curated subset of exemplars, not a full corpus index —
  the full corpus (including the 2 previously-orphaned codes) now lives in
  `calibration-data/` with `source` tagging.

## Out of scope

- No change to how the shipped app selects a WCL API host — `client.ts`'s
  new `host` parameter is additive and every app call site keeps its
  existing default (`"fresh"`).
- No attempt to auto-detect report vintage from WCL response data itself
  (e.g. `archiveStatus.isArchived`, zone IDs). Per CLAUDE.md,
  `classic.warcraftlogs.com`'s SSC/TK zone conflates 2021-launch and
  Anniversary data, so such a signal wouldn't be reliable anyway — vintage
  continues to come from which link/code the operator supplies, same as the
  app's own `ConnectPanel` flow.
- No new judgement/narrative content written for the 2 previously-orphaned
  report codes in `docs/testing.md`'s table — only their reproducibility gap
  is closed.
