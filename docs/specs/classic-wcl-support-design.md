# Design: Support `classic.warcraftlogs.com` TBC reports for subscribed users

Implements backlog story 012. See `docs/backlog.md` story 012 for the full user story and original acceptance criteria (this spec supersedes two of those criteria — see "Backlog amendments" below, based on live API findings made during design).

## Background / live findings

The backlog story flagged two things as unverified: (a) whether WCL's API exposes a proactive subscription-status field, and (b) whether report data needs per-host routing (`www` vs `classic` vs `fresh`). Both were resolved via live queries against the real WCL API during design (using `mtRh3kJ9YMLazyvQ`, a real `classic.`-sourced "BT / Hyjal" TBC report, and `4GYHZRdtL3bvhpc8`, the canonical `fresh.`-sourced fixture):

- **Report codes are host-agnostic at the API level.** `reportData.report(code: "...")` returns identical data whether posted to `www.`, `classic.`, or `fresh.warcraftlogs.com`'s `/api/v2/user` endpoint. There is no per-host data partition for individual report lookups — the host-dependent behavior CLAUDE.md already documents (`classic.`'s SSC/TK zone conflating 2021-launch and Anniversary data) is specific to zone/ranking browsing queries, which this app never makes. **Consequence: `src/wcl/client.ts`'s existing single `USER_API_URL` needs no host parameterization.**
- **No `currentUser`-level subscription field exists.** Full schema introspection against `/api/v2/user` found a `SubscriptionStatus` enum (`Silver`/`Gold`/`Platinum`/`AlchemicalSociety`) but it is not attached to any reachable field, argument, or input — it's vestigial/unused in the public schema.
- **A better, per-report field exists instead: `Report.archiveStatus`.** Shape: `{ isArchived: boolean, isAccessible: boolean, archiveDate: Int }`. Confirmed live:
  - `mtRh3kJ9YMLazyvQ` (2021-era BT/Hyjal): `{ isArchived: true, isAccessible: true, archiveDate: 1723865664 }`
  - `4GYHZRdtL3bvhpc8` (recent Anniversary report): `{ isArchived: false, isAccessible: true, archiveDate: null }`
  - `isAccessible` is scoped to the _authenticated account making the request_ — this is the proactive entitlement signal the backlog story was looking for, just not where it expected. The test account used for this research already has full access to every report tried, so `isAccessible: false` was never observed directly; the field's shape and naming make its meaning unambiguous, but the "what happens if the whole report node is denied instead" case (see Error handling) is a documented gap, not a verified behavior.
- **`Report.zone.expansion.id`** gives the expansion ID needed to confirm TBC content: `1001` = "The Burning Crusade" (confirmed live). `1000`/`1002`/`1003`/`1004` = Vanilla/Wrath/Cata/MoP respectively (per backlog story 012's own text, confirmed same session).

## Backlog amendments

Story 012's acceptance criteria #2 ("bare code tries www then falls back to classic") and #5 ("WCL API base URL becomes a per-request choice") are replaced — they described a host-routing mechanism that live testing shows is unnecessary. `docs/backlog.md` will be updated in the same commit as implementation to reflect:

- No host-based fallback or base-URL selection — one endpoint (`www.warcraftlogs.com/api/v2/user`) already serves all three source hosts.
- The subscription-detection criterion is sharpened to name the real field: `Report.archiveStatus.isAccessible`, not a `currentUser`-level field.

## Architecture & data flow

No new requests. `fetchReportFights`'s existing query gains two field groups:

```graphql
report(code: "...") {
  title
  fights { id name startTime endTime encounterID kill bossPercentage }
  zone { expansion { id name } }
  archiveStatus { isArchived isAccessible }
}
```

`ReportFights` (exported from `src/wcl/client.ts`) gains:

```ts
expansionId: number;
archiveStatus: {
  isArchived: boolean;
  isAccessible: boolean;
}
```

The TBC-content check and the accessibility check both require this network round-trip, so neither can live in the existing pure/sync `parseReportInput`. They're evaluated in `ConnectPanel`, the one place the app already gates report readiness before advancing past it.

## Component changes

### `src/report/parseReportInput.ts`

- `WCL_HOSTNAME_PATTERN` match: accept `"fresh"` and `"classic"` (currently only `"fresh"`); everything else (`www`, any other subdomain) still hits `unsupported-realm` with the existing message.
- `ParseReportInputResult`'s `ok: true` branch gains `host: "fresh" | "classic"`. A bare 16-char code (no URL) has no host string to read — defaults to `"fresh"`, matching today's only-implicit-host behavior.
- Pure/sync, no I/O — unchanged in kind, only in accepted host set and return shape.

### `src/wcl/client.ts`

- `fetchReportFights`'s query string and return mapping gain the two field groups above. No other exported function changes.

### `src/app/components/ConnectPanel/index.tsx`

After `fetchReportFights` resolves, before calling `onReportLoaded`:

1. `report.expansionId !== 1001` → render a rejection `Alert` ("This report isn't Burning Crusade content — Bloomwatch only judges TBC logs.") plus a back-link to load a different report. Do not call `onReportLoaded`.
2. Else if `report.archiveStatus.isAccessible === false` → render a distinct rejection `Alert` ("This report requires an active Warcraft Logs subscription to view.") with a link to WCL's subscription page, plus the same back-link.
3. Else → unchanged, calls `onReportLoaded` as today.

Additionally, the existing `.catch()` (which currently just no-ops for non-abort errors, relying on `withErrorReporting` to have already escalated to the full-screen overlay) gets a pre-check: if the caught error's `.message` case-insensitively matches `/subscri|premium|upgrade|archived/`, render the same subscription-required Alert locally instead of letting the generic overlay handle it. This is a fallback for the unverified case where WCL denies the whole `report` node (rather than resolving it with `isAccessible: false`) for an inaccessible archived report — since that can't be triggered with the available test account, this path is best-effort pattern matching, not a verified error shape. If it turns out never to fire in practice, that's fine; if it fires on the wrong condition, it degrades to showing a subscription message on an unrelated error, which is still better than nothing but should be revisited if ever observed live.

`ConnectPanel` needs a new prop (e.g. `onStartOver: () => void`) to power its rejection back-link, matching the pattern `App.tsx` already uses elsewhere (`handleStartOver`).

### `src/report/wclLinks.ts`

- `buildFightTimeUrl(host, reportCode, fightId, startMs, endMs)` — a new leading `host: "fresh" | "classic"` parameter, interpolated in place of the hardcoded `"fresh"` literal.

### Routing (`src/app/routing/hashRoute.ts`) and the component tree

Per story 703, the URL hash is the single source of truth for navigation — so `host` must survive reload and shared links, not just live in transient React state. `Route`'s four report-bearing variants gain `host: "fresh" | "classic"`; the serialized URL only appends a `/h/classic` segment when non-default, so every existing `fresh.`-sourced URL is unchanged. `parseHash` treats a missing or unrecognized host segment as `"fresh"` (a soft default, not a route-rejecting error, since host is cosmetic metadata, not routing-critical).

From there, `host` is prop-threaded exactly the way `reportCode` already is today, end to end: `App.tsx` → `ReportDashboard` → `Scorecard` → each of the six `*Content` wrapper components → the individual metric cards that call `buildFightTimeUrl` (`IdleGapsCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `HotClipDetectionCard`, `SwiftmendAuditCard`, `NaturesSwiftnessCard`, `InnervateAuditCard`, `DeathForensicsCard`). This touches on the order of 20 files. It was evaluated against a smaller alternative (a dedicated ambient-state module, mirroring `rateLimitUsage.ts`'s existing pub/sub pattern) and against dropping the feature entirely; prop-threading was chosen to stay consistent with how `reportCode` — a conceptually identical per-report fact — already flows through this exact same component tree, rather than introducing a second ambient-state mechanism for a sibling fact.

## Error handling

Four distinct rejection reasons, two existing and two new:

| Reason                  | Where raised                                                            | Existing? |
| ----------------------- | ----------------------------------------------------------------------- | --------- |
| `invalid`               | `parseReportInput`, sync                                                | yes       |
| `unsupported-realm`     | `parseReportInput`, sync                                                | yes       |
| `unsupported-expansion` | `ConnectPanel`, after fetch                                             | **new**   |
| `subscription-required` | `ConnectPanel`, after fetch (proactive field or fallback message match) | **new**   |

The two new reasons follow story 708's existing split: they are business-rule rejections on an otherwise-successful fetch, not technical failures, so they render as local inline `Alert`s (same tier as `ReportInput`'s existing parse-error display) rather than escalating to the full-screen `ErrorOverlay`. Genuine technical failures (429, timeout, malformed response) continue to escalate exactly as today.

## Testing

- **Tier 1** (`parseReportInput.test.ts`): add `classic.` acceptance cases asserting `host: "classic"`; existing `classic.`-rejection case flips to an acceptance case; add a case confirming bare-code `host` defaults to `"fresh"`; `www.`/other-subdomain rejection cases unchanged.
- **Tier 2** (MSW, `src/wcl/client.test.ts` or equivalent): fixture-driven cases for `fetchReportFights` parsing `zone.expansion.id` and `archiveStatus` correctly from a response shape; a captured real fixture from `mtRh3kJ9YMLazyvQ` added to `test/integration/fixtures/`.
- **Tier 3** (`ConnectPanel.test.tsx`): cases for the `expansionId !== 1001` rejection, the `archiveStatus.isAccessible === false` rejection, the message-pattern-match fallback on a thrown error, and confirming the happy path (TBC + accessible) still calls `onReportLoaded` unchanged.
- **Real fixture documentation**: `mtRh3kJ9YMLazyvQ` ("BT / Hyjal") added to `docs/testing.md`'s known-reports table, documenting what it validates (real `classic.`-sourced TBC report; confirmed `expansion.id: 1001`; confirmed `archiveStatus: { isArchived: true, isAccessible: true }` against the project's test account).

## Docs updates (same commit as implementation, per CLAUDE.md's "a story isn't done until its paperwork is retired")

- `docs/backlog.md`: story 012 marked done; acceptance criteria #2 and #5 rewritten per "Backlog amendments" above; this spec file deleted once implemented (per CLAUDE.md convention, grep first for stray references).
- `docs/roadmap.md`: line ~30 ("Anniversary ('fresh') realm reports resolve against `https://www.warcraftlogs.com/api/v2/user` — a single host regardless of which subdomain the report link uses") updated to note `classic.` reports resolve the same way; the "Explicitly out of scope" list (line ~78, "non-Anniversary ('progression') TBC realms... TBC Anniversary ('fresh') realms only") updated to say TBC content generally (Anniversary and original 2021-2024 Classic-launch), still excluding every other expansion/realm type.
- `CLAUDE.md`: principle 1 ("In scope: TBC Anniversary ('fresh') realms only — no other WoW version, expansion, or realm type") updated to match the widened scope.

## Out of scope

- `www.warcraftlogs.com` report links remain rejected (`unsupported-realm`) — not part of story 012, which only asks to widen `classic.` support.
- No change to OAuth/PKCE login flow — it already always runs against `www.warcraftlogs.com` regardless of report host, and the resulting token is account-scoped, not host-scoped (confirmed in codebase research; no code there needs to change).
- No change to Client ID selection (story 008) — already fully decoupled from API host by construction (`fetchReportFights` takes an access token, not a Client ID).
