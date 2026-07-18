# Story 903a — Per-fight talent-archetype detection: design

Spec for `docs/backlog.md` story 903a. Full acceptance criteria live there; this doc is the implementation design.

## Problem

Story 900 built an offline classifier (`scripts/tagArchetypes.ts`) that buckets a druid into a talent archetype (deep resto, likely Dreamstate, mostly Balance, etc.) from `CombatantInfo`'s `talents` field, used to tag the calibration corpus (`docs/calibration-archetypes.json`). That classification only exists as a one-off CLI tool run against reports the maintainers chose to pull — it's invisible in the app itself. Stories 903c (hide talent-gated metric cards) and 903d (onboarding notice) both need this same detection available live, per fight, for whichever druid/report a real user loads. 903a is the detection + display groundwork those two later stories build on.

## Architecture

### Shared classifier module: `src/report/archetypeDetection.ts`

New file, sibling to `src/report/druidDetection.ts` (same style: small, pure, no fetching). Extracted from `scripts/tagArchetypes.ts`, values unchanged:

- `TalentBucket` — the 8-value union (`"deep-resto" | "likely-dreamstate-full" | "likely-dreamstate-partial" | "mostly-resto" | "mostly-balance" | "restokin-shaped" | "other-unclassified" | "unknown-no-talent-data"`). String values are unchanged from `scripts/tagArchetypes.ts`'s `Bucket` type — `docs/calibration-archetypes.json` already has 75 records using this exact vocabulary, and nothing about this story should invalidate that data.
- `BUCKET_DEFINITIONS: Record<TalentBucket, string>` — unchanged, moved as-is.
- `classifyBucket(balance: number, feral: number, restoration: number): TalentBucket` — unchanged logic and ordering (deep-resto → dreamstate tiers → resto/balance dominance comparison → other-unclassified), moved as-is including its existing inline comments explaining the `21/0/40` and `0/46/15` edge cases.
- `parseTalentPoints(events: WclEvent[], druidId: number): [number, number, number] | null` — new, but not new logic: extracted from `scripts/tagArchetypes.ts`'s `fetchTalents`, split so the WCL-fetching half stays in the script (which has its own host-parameterized fetch layer per its existing comment) and the pure parsing half (find the `CombatantInfo` event for this `sourceID`, validate `talents.length === 3`, map to `[balance, feral, restoration]`) is shared.

`scripts/tagArchetypes.ts` is updated to import `TalentBucket`, `BUCKET_DEFINITIONS`, and `classifyBucket` from this module instead of defining its own copies, and to use `parseTalentPoints` inside its existing `fetchTalents` after the GraphQL call. No behavior change to the script — same 75-report output.

### Hook: `src/app/components/Scorecard/useArchetypeBucket.ts`

New file, colocated with the Scorecard's other `use*Summary` hooks (`usePrepHygieneSummary.ts` is the closest shape match — same signature style, same `CombatantInfo` dataType). Signature:

```ts
function useArchetypeBucket(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  fetchEvents: (...) => Promise<WclEvent[]>,
): { status: "loading" } | { status: "ready"; bucket: TalentBucket } | { status: "error"; error: string }
```

Fetches `"CombatantInfo"` via the passed-in `fetchEvents` (the same event-cache-backed function every other card uses — cache key is `${reportCode}:${fight.id}:CombatantInfo:false`, identical to `usePrepHygieneSummary`'s call for the same fight, so when both hooks run in the same Scorecard render this is one network request, not two), then calls `parseTalentPoints` + `classifyBucket`. A `null` from `parseTalentPoints` (no matching event, or malformed `talents`) resolves to `{status: "ready", bucket: "unknown-no-talent-data"}` — this is an expected, named outcome per story 900's own bucket definitions, not an error state. `status: "error"` is reserved for a genuine compute exception, mirroring `usePrepHygieneSummary`'s try/catch shape.

### `Scorecard/index.tsx`

Calls the new hook alongside the existing `useFightEpicSummaries` call and renders one line under the existing `druidLine` paragraph. No other component is touched — 903c/903d will thread this further later.

### Host handling

Verified live during design: `postGraphQL` (hardcoded to `www.warcraftlogs.com`, used by `fetchEvents`) already resolves reports whose canonical host is `classic.warcraftlogs.com` — confirmed against `mtRh3kJ9YMLazyvQ` ("BT / Hyjal"), which returns its title correctly via the default host. WCL report codes are globally resolvable regardless of which subdomain a report was uploaded through; `Host`/`host` elsewhere in this codebase (story 012) exists for URL parsing, archive/subscription gating, and building correct outbound deep-links back to the browser — not for event-level data fetching. No host parameter is needed anywhere in this story's new code.

## UI / display

A new line is added to `Scorecard/index.tsx` directly below the existing `druidLine` paragraph, in the same unconditional position as `druidLine`/`reportLine` (i.e. visible regardless of `activeEpic`, not just on the overview grid):

```
Talent archetype: {label}
```

Human-readable labels (component-local `const`, not exported — 903c/903d can promote this to the shared module later if they need it too):

| Bucket                      | Label                             |
| --------------------------- | --------------------------------- |
| `deep-resto`                | Deep resto                        |
| `likely-dreamstate-full`    | Likely Dreamstate (full)          |
| `likely-dreamstate-partial` | Likely Dreamstate (partial)       |
| `mostly-resto`              | Mostly Restoration                |
| `mostly-balance`            | Mostly Balance                    |
| `restokin-shaped`           | Restokin-shaped                   |
| `other-unclassified`        | Other/unclassified                |
| `unknown-no-talent-data`    | Unknown (talent read unavailable) |

The line's text gets a `title` attribute set to `BUCKET_DEFINITIONS[bucket]` for a native hover tooltip explaining the threshold — no custom tooltip component, no extra chrome.

States:

- Loading → `Talent archetype: Calculating…`
- Compute error → `Talent archetype: unavailable` (quiet — this is supplementary context surfaced for the first time in-app, not an existing judged metric, so it follows the same local/non-escalating failure handling as `usePrepHygieneSummary`; a genuine WCL fetch failure is still escalated to the full-screen overlay by the already-wrapped `fetchEvents`, per story 708's convention)
- Ready → `Talent archetype: {label}`, including the `unknown-no-talent-data` case (rendered as "Unknown (talent read unavailable)", not hidden — a user should see that detection genuinely couldn't read talents for this fight, not see nothing)

No `JudgementChip`, no R/O/G coloring — this is a fact, not a judgement. 903c is where archetype starts affecting which cards render or how they're judged.

## Testing

- `src/report/archetypeDetection.test.ts` — unit tests for `classifyBucket` (port the boundary/edge cases already documented in `scripts/tagArchetypes.ts`'s comments: `21/0/40` → `mostly-resto` not `mostly-balance`; `0/46/15` → `other-unclassified` not `mostly-resto`; boundary values at the 41/33/31/20 cutoffs) and `parseTalentPoints` (valid 3-entry `talents` for the right `sourceID`; no matching event; malformed/wrong-length `talents` → `null` in both cases).
- `src/app/components/Scorecard/useArchetypeBucket.test.ts` — mirrors `usePrepHygieneSummary.test.ts`: loading → ready happy path, and a compute-failure path producing `status: "error"`.
- `src/app/components/Scorecard/index.test.tsx` — extend existing tests to assert the archetype line renders with the right label once the hook resolves.
- `scripts/tagArchetypes.ts` — no new test; its existing behavior (already validated live against 75 real reports per story 900) must be unchanged after the extraction, which `npm run typecheck`'s `tsconfig.scripts.json` coverage plus a manual re-run against one already-tagged report (compare output to the existing `docs/calibration-archetypes.json` entry) confirms.
- Real-data spot-check: run the app against one report/druid already present in `docs/testing.md` with a known bucket (e.g. `bKRZ68XqgwYkxtzm`'s Dreamstate druid, or a deep-resto exemplar from story 901) and confirm the in-app display matches `docs/calibration-archetypes.json`'s existing offline classification for that same druid.

## Out of scope (deferred to later sub-stories)

- Hiding or altering any metric card's rendering based on the detected bucket (903c).
- Any change to healing-role detection or per-fight aggregation (903b).
- Onboarding screen or any messaging about supported/unsupported playstyles (903d).
- Surfacing the bucket anywhere outside the Scorecard (e.g. `ReportDashboard`'s fight list, `DruidPicker`) — would require eager per-fight `CombatantInfo` fetching up front, which this story doesn't need.
