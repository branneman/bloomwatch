# Calibration tooling design

Two new developer scripts under `scripts/`, built to support story 802 (threshold calibration) and, going forward, to replace ad-hoc curl/python one-offs when debugging against the real WCL API — both this session's problem, since none of that session's exploratory queries were saved anywhere reusable.

## Why

- `src/metrics/*.ts`'s `compute*` functions are already pure (no React/DOM dependency), and `src/wcl/client.ts`'s fetch functions already run fine in plain Node — proven today by the Tier 4 contract tests, which call them from Node via `vitest`. The pieces exist; there's no orchestration that ties them together outside the UI.
- 802 needs to run the app's real judgement logic against many real reports to spot miscalibrated thresholds. Doing that by hand (load the app, paste a report URL, click through) doesn't scale to dozens of candidate logs.
- Today, anyone (human or Claude Code) debugging against the live WCL API improvises raw `curl` + a scratch script per session. None of it is saved; the same schema exploration (e.g. "which WCL host serves Anniversary-only rankings?") gets re-derived from scratch next time.

## `scripts/calibrate.ts`

**Usage:** `npm run calibrate -- <reportCode>`

**Data flow:**

1. Load `WCL_TEST_ACCESS_TOKEN` from `.env.local` via the shared env loader (below). Missing token → clear error pointing at `docs/testing.md`, exit 1.
2. `fetchReportFights(reportCode)` → title + fight list.
3. Filter to non-trash fights via the existing `buildFightRows` (`src/report/fightRows.ts`) — the same function `App.tsx` uses to build `nonTrashFightIds`.
4. `fetchCastsTable` across those fight IDs → `detectDruids` (`src/report/druidDetection.ts`) → every qualifying resto candidate (not just the top parser — a report often has 2+ real healers worth sampling).
5. `fetchMasterDataAbilities` + `resolveAbilities` once for the whole report (ability IDs are report-wide).
6. For each candidate × each non-trash fight: fetch each epic's event data via the shared cached `fetchEvents` (`src/wcl/eventCache.ts`), using the same `dataType`/`includeResources` each metric card already passes, then call the same `compute*` function each card calls. Roll each epic's metrics together via the existing `epicSummary.ts` `summarize*` functions. Every metric's full numeric result is kept, not just its judgement — the point is seeing _why_ a threshold landed where it did, not just the color.
7. Whole-report rollup per candidate:
   - **Judgement**: reuse `combineFightEpicStatus`/`worstReadyJudgement` (`src/metrics/reportAggregation.ts`) — this matches what 702's dashboard actually ships today (its chip strip is judgement-only worst-of; there's no numeric blending anywhere in the current UI, contrary to what story 702's prose might suggest).
   - **Numeric pooling** (new, script-only logic, not reused from the app since the app doesn't do this anywhere): sum counts across fights (e.g. total accidental blooms), duration-weighted-average percentages (e.g. GCD utilization). This surfaces "fine most nights, one bad fight drags the average" patterns that per-fight judgement alone hides.
8. Write JSON to `calibration-data/<reportCode>.json`. Write to a temp path and rename on success, so a crash never leaves a half-written file behind to accidentally commit.

**Output location:** `calibration-data/<reportCode>.json` at repo root, one file per report, **committed to the repo** with real player/guild names intact (matching `docs/testing.md`'s existing precedent of naming real players in prose).

**Output shape (illustrative, not final field names):**

```json
{
  "reportCode": "...",
  "reportTitle": "...",
  "generatedAt": "2026-07-16T12:00:00Z",
  "druids": [
    {
      "druidId": 6,
      "druidName": "Blohz",
      "isRestoSpec": true,
      "fights": [
        {
          "fightId": 12,
          "bossName": "Al'ar",
          "kill": true,
          "durationMs": 245000,
          "epics": {
            "gcdEconomy": {
              "judgement": "green",
              "stats": ["GCD utilization: 91%", "Idle gaps: 2.1% dead time"],
              "metrics": { "gcdUtilization": { "...": "full compute result" } }
            }
          }
        }
      ],
      "rollup": {
        "epics": {
          "gcdEconomy": { "judgement": "orange", "pooled": { "...": "..." } }
        }
      }
    }
  ]
}
```

**Error handling:** WCL/GraphQL errors surface the raw message and exit 1, no file written. No resto druid detected in the report → clear message, exit 0, no file (not an error — just nothing to calibrate).

## `scripts/wcl-query.ts`

**Usage:** `npm run wcl:query -- '<graphql query text>'` or `npm run wcl:query -- --file path/to/query.graphql`, with `--host www|classic|fresh` (default `www`).

The `--host` flag exists because this session discovered the three WCL hosts behave differently for classic content: `classic.warcraftlogs.com`'s SSC/TK zone conflates the 2021 TBC Classic launch with Anniversary data (old parses dominate); `www.warcraftlogs.com` has its own separate, Anniversary-only zone for the same content; `fresh.warcraftlogs.com` is the guild-facing UI the user pulled report/guild links from. Baking this in means nobody has to rediscover it by trial and error again.

Prints formatted JSON to stdout only — no file-writing opinion, caller redirects if they want persistence. (Deliberately different from `calibrate.ts`, which does own its output location — this tool is the ad-hoc exploration replacement for this session's curl usage, closer to a curl replacement than a data-generation pipeline.)

## Shared infrastructure

`scripts/lib/env.ts` — loads `WCL_TEST_ACCESS_TOKEN` from `.env.local` via the same `dotenv` pattern `test/contract` and `playwright.config.ts` already use, so neither script duplicates that setup.

## Documentation updates

- **CLAUDE.md**: rewrite "Running live WCL queries yourself" to lead with `scripts/wcl-query.ts` (raw curl stays documented as a fallback for when node/tsx isn't available); add a "Working conventions" bullet noting `src/metrics/*.ts`'s `compute*` functions have two independent consumers — the UI's metric cards and `scripts/calibrate.ts` — both need checking when a signature changes.
- **README**: short "Developer scripts" section pointing at both scripts.
- **docs/testing.md**: add both scripts to the "Running everything locally" command block; note `calibrate.ts`'s role supporting 802 and future recalibration passes, cross-referenced with `docs/thresholds.md`.

## Testing approach

Both scripts sit outside the Tier 0–5 pyramid (`docs/testing.md`), in the same category as `test:contract`/`test:e2e` — real API only, on-demand, no CI wiring. No new automated test tier: the `compute*` functions they call already have Tier 1 unit coverage, and the fetch-wiring glue (which `dataType`/`includeResources` each metric needs) is low-risk, inspectable-by-reading rather than logic that needs its own test suite.

## Explicitly out of scope

A real bug was found while sourcing calibration candidates: `F7aL6x13zVq8kTRt` has a druid who respecced to Balance for some bosses and back to Restoration for others within the same report. Story 005's auto-detection picks one `druidId` for the whole report, and 702/701 reuse it for every fight — including the Balance ones, where zero healing casts currently reads as a false "green" (0 accidental blooms, 0 restack-tax casts, etc., rather than "not applicable"). This is a real aggregation-scope bug, independent of any threshold _value_, and not something this calibration tooling fixes. It should become its own backlog story. Until fixed, `calibrate.ts`'s output for affected reports needs manual review to exclude off-role fights from calibration conclusions — the script itself won't detect or filter them.
