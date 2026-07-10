# Story 006 — Event fetching & caching layer — Design

Backlog reference: `docs/backlog.md` story 006.

## Problem

Every metric epic (B–G) needs to read WCL event streams (casts, buffs, heals, resources, deaths, combatant info) for a chosen fight. Right now `src/wcl/client.ts` only fetches fight metadata and a cast-count table (story 005's druid detection). There's no shared layer for raw per-fight events, no pagination handling, and no caching — without this, every future metric module would reinvent fetch-and-paginate and could redundantly re-fetch the same fight's events.

## Scope

Data-access layer only. No UI component and no wiring into `App.tsx` — nothing consumes this yet (the first consumer will be whichever metric story lands next after 007). Rate-limit _fallback UX_ (asking the user for their own Client ID) is story 008's job, not this one; this story only needs to make a rate-limit response distinguishable and carry a retryable, non-technical message.

## Live API findings (verified against report `4GYHZRdtL3bvhpc8`, see `docs/testing.md`)

- All six data categories the story lists (casts, buffs, heals, resources, deaths, combatant info) are served by one query shape: `events(fightIDs: [Int], dataType: EventDataType, startTime: Float, endTime: Float) { data, nextPageTimestamp }`. Confirmed dataType values: `Casts`, `Buffs`, `Healing`, `Resources`, `Deaths`, `CombatantInfo`.
- **`startTime`/`endTime` must always be passed together, as absolute report-relative timestamps** (same scale as each event's own `timestamp` field, and as `Fight.startTime`/`Fight.endTime` from `fetchReportFights`). WCL only substitutes "this fight's own bounds" when _both_ are omitted — passing just one silently returns zero results with no error. This is the one non-obvious trap the implementation must avoid.
- Pagination: when a query's result set exceeds WCL's internal budget, `nextPageTimestamp` is a non-null timestamp; re-querying with `startTime` set to that value (same `dataType`/`endTime`/`fightIDs`) continues from where the last page left off. `nextPageTimestamp: null` means done. Confirmed empirically with a real multi-page response (5062 events → next page → 5108 more events, still continuing).

## Architecture

Two new modules, split along the existing test-tier boundary (`docs/testing.md`):

### `src/wcl/events.ts` — raw single-page fetch (Tier 2: mocked-HTTP integration)

Mirrors the existing style of `fetchCastsTable` in `src/wcl/client.ts` (plain `fetch`, template-string GraphQL query, manual JSON parsing, no client library).

```ts
export type WclEventDataType =
  "Casts" | "Buffs" | "Healing" | "Resources" | "Deaths" | "CombatantInfo";

export interface WclEvent {
  timestamp: number;
  type: string;
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  fight: number;
  [key: string]: unknown; // dataType-specific fields — left untyped until a metric story needs them
}

export interface WclEventsPage {
  events: WclEvent[];
  nextPageTimestamp: number | null;
}

export class WclRateLimitError extends WclApiError {
  // thrown when the response status is 429; carries a plain-language,
  // retryable message instead of WclApiError's raw status/body text
}

export function fetchEventsPage(
  accessToken: string,
  reportCode: string,
  fightId: number,
  dataType: WclEventDataType,
  startTime: number,
  endTime: number,
): Promise<WclEventsPage>;
```

- Builds `events(fightIDs: [${fightId}], dataType: ${dataType}, startTime: ${startTime}, endTime: ${endTime}) { data, nextPageTimestamp }`.
- On HTTP 429: throws `WclRateLimitError` with message `"Warcraft Logs is rate-limiting requests right now — wait a moment and try again."`.
- On any other non-2xx: throws `WclApiError`, same as existing functions.

### `src/wcl/eventCache.ts` — pagination loop + session cache (Tier 1: pure logic)

```ts
export function createEventFetcher(
  fetchPage: typeof fetchEventsPage = fetchEventsPage,
): {
  fetchEvents(
    accessToken: string,
    reportCode: string,
    fight: { id: number; startTime: number; endTime: number },
    dataType: WclEventDataType,
  ): Promise<WclEvent[]>;
};
```

- `fetchPage` is injectable so Tier 1 tests use a hand-rolled fake instead of hitting HTTP — the real dependency-crossing boundary (`fetch`) stays exercised only in Tier 2, per `docs/testing.md`'s philosophy of faking at the boundary, not mocking internals.
- Cache key: `` `${reportCode}:${fight.id}:${dataType}` ``.
- The cache stores the **`Promise<WclEvent[]>`**, not just the resolved value — if two callers request the same key before the first resolves, both share one underlying fetch/pagination sequence.
- Pagination loop: `startTime = fight.startTime`; call `fetchPage`; append `.events`; if `.nextPageTimestamp` is non-null, set `startTime = nextPageTimestamp` and repeat (keeping `fight.endTime` fixed); stop when `nextPageTimestamp` is `null`; resolve with the concatenated array.
- **On any rejection** (rate limit or otherwise), the cache entry for that key is deleted before the rejection propagates, so a later call is a fresh attempt rather than replaying a stuck failure — required for the "retryable" acceptance criterion to actually mean something.
- `createEventFetcher()` returns a fresh instance with its own private cache (a closured `Map`, no module-level shared state) — each caller (and each test) gets isolation. This story does not decide where the one app-wide instance is instantiated; that's for whichever story wires the first consumer.

## Testing

**Tier 2** (`test/integration/events.test.ts`), fixtures in `test/integration/fixtures/`:

- `events-healing-single-page.json` — real captured response, `nextPageTimestamp: null` (trimmed to 5 sample events; the field that matters for this tier is the shape, not volume).
- `events-healing-paginated-page1.json` / `events-healing-paginated-page2.json` — real captured pair with non-null `nextPageTimestamp`, proving the field genuinely appears in real WCL responses and the parsing code reads it correctly.
- Assert the query sent includes `fightIDs`, `dataType`, and both `startTime`/`endTime`.
- Assert a synthetic HTTP 429 response (hand-built body, same precedent as the existing "throws WclApiError with the raw response on failure" test) throws `WclRateLimitError` with the plain-language message.

**Tier 1** (`src/wcl/eventCache.test.ts`), fake `fetchEventsPage`:

- Multi-page concatenation: fake returns page 1 (`nextPageTimestamp` set) then page 2 (`null`); result is both pages' events, in order.
- Single-fetch-per-key: second call with identical `(reportCode, fight, dataType)` returns cached data with zero additional fake invocations.
- Concurrent-call dedup: two calls issued before the first resolves both resolve to the same result from one fake invocation sequence.
- Independent cache keys: different `fightId`, `dataType`, or `reportCode` each trigger their own fetch.
- Error clears cache: a rejected fake call is not cached — a subsequent call retries (invokes the fake again) rather than immediately re-rejecting from a cached failure.

## Out of scope

- No UI wiring (`App.tsx` unchanged).
- No rate-limit fallback flow (default-client-ID / user-supplied-Client-ID UX) — story 008.
- No typed per-dataType event shapes beyond the generic `WclEvent` — deferred to whichever metric story first needs specific fields (likely 101/201, after 007's ability resolution lands).
