# Design: Active time & GCD utilization (story 101)

Implements backlog story 101 (`docs/backlog.md`, Epic B — GCD economy).

## Goal

Show the druid their active time and GCD-utilization percentage per fight: time spent on the global cooldown (or a longer cast) divided by fight duration, judged red/orange/green.

## Key decisions

**Cast cost is derived from events, not a hardcoded cast-time table.** WCL's `Casts` event stream emits a `begincast` immediately followed by a `cast` for any spell with a cast time; instant spells emit only `cast`. The timestamp delta between a paired `begincast`/`cast` is the real, haste-adjusted elapsed cast time. This was confirmed live against report `4GYHZRdtL3bvhpc8` (fight 6, Lurker Below): Regrowth (rank 10, ability 26980) showed 5/5 `begincast`→`cast` pairs with ~1993–2024ms deltas, matching its known ~2s base cast time; Lifebloom/Rejuvenation casts emitted `cast` only, no `begincast`. Deriving from events means no second hardcoded spell-cast-time table alongside `resolveAbilities` (story 007), and it automatically produces the correct (lower) cost for a Nature's-Swiftness-instant cast-time spell, since NS makes the next cast skip `begincast` entirely.

**All of the druid's casts count, not just recognized healing spells.** GCD utilization measures how full the cast timeline was, not what was cast. Filtering to a fixed healing-spell list would silently undercount active time for any other cast (Faerie Fire, a shapeshift, Innervate, etc.) and creates a dependency on `resolveAbilities` this metric doesn't structurally need. Events are simply filtered to `sourceID === druidId`.

**One card per selected fight, no aggregation.** The fight picker (story 004) already supports multi-select and whole-zone selection. Story 101's acceptance criteria is single-fight framed, and cross-fight aggregation is explicitly story 702 (Phase 4). Rather than restrict selection or invent an aggregation formula, this story renders one independent `GCDUtilizationCard` per currently-selected fight.

**A shared R/O/G judgement helper is introduced now, not deferred.** `src/metrics/judgement.ts` exports `Judgement = "green" | "orange" | "red"` and `judgeThreshold(value, { greenMin, orangeMin })` for the common "higher is better, two cutoffs" shape. This story is the first real consumer (not a speculative abstraction), and per backlog, nearly every metric story from here on needs the same red/orange/green concept — better to have one shared type from the start than have each card reinvent the string union.

## Data flow

```
App.tsx
  useState(() => createEventFetcher())          // story 006, one instance, shared cache
  selectedFightIds, selectedDruidId              // already tracked, now actually consumed
    │
    ▼
loadedReport.fights.filter(selected) → one <GCDUtilizationCard> per fight
    │
    ▼ (per card, on mount / dep change)
fetchEvents(accessToken, reportCode, fight, "Casts")   // story 006 fetcher, dataType Casts
    │
    ▼
computeGcdUtilization(events, druidId, fight.startTime, fight.endTime)
    │
    ▼
{ activeTimeMs, fightDurationMs, utilizationPct, judgement } → rendered card
```

## Calculation module — `src/metrics/gcdUtilization.ts`

```ts
export const GCD_MS = 1500; // TBC's fixed global cooldown, does not scale with haste

export interface GcdUtilizationResult {
  activeTimeMs: number;
  fightDurationMs: number;
  utilizationPct: number; // clamped to [0, 100]
  judgement: Judgement;
}

export function computeGcdUtilization(
  events: WclEvent[],
  druidId: number,
  fightStart: number,
  fightEnd: number,
): GcdUtilizationResult;
```

Algorithm:

1. Filter `events` to `sourceID === druidId`.
2. Walk in timestamp order, maintaining `pending: Map<abilityGameID, begincastTimestamp>`.
   - `begincast`: `pending.set(abilityGameID, timestamp)` (overwrites any stale pending entry for that ability — e.g. an interrupted cast followed by a fresh attempt).
   - `cast`: if `pending.has(abilityGameID)`, cost = `max(timestamp - pending.get(abilityGameID), GCD_MS)`, then delete the pending entry. Else cost = `GCD_MS`. Add cost to a running `activeTimeMs` total.
   - A `begincast` with no following `cast` for that ability (interrupted/cancelled cast) contributes nothing — that dead time is story 102's concern, not this one.
3. `fightDurationMs = fightEnd - fightStart`.
4. `utilizationPct = Math.min(100, (activeTimeMs / fightDurationMs) * 100)`. Note `activeTimeMs` itself is reported raw (uncapped) — only the percentage clamps, per the acceptance criteria's "values > 100% clamp to 100%".
5. `judgement = judgeThreshold(utilizationPct, { greenMin: 85, orangeMin: 70 })` — thresholds per backlog story 101: green ≥ 85%, orange 70–85%, red < 70%.

## Judgement helper — `src/metrics/judgement.ts`

```ts
export type Judgement = "green" | "orange" | "red";

// Higher value is better (e.g. GCD utilization %, LB3 uptime %).
export function judgeThreshold(
  value: number,
  thresholds: { greenMin: number; orangeMin: number },
): Judgement {
  if (value >= thresholds.greenMin) return "green";
  if (value >= thresholds.orangeMin) return "orange";
  return "red";
}
```

## Component — `src/app/components/GCDUtilizationCard/index.tsx`

Props: `accessToken: string`, `reportCode: string`, `fight: Fight`, `druidId: number`, `fetchEvents` (same signature as `createEventFetcher().fetchEvents`, injected for testability — mirrors `DruidDetector`'s `fetchCastsTable` prop).

Behavior:

- On mount and whenever `accessToken`/`reportCode`/`fight.id`/`druidId` change, calls `fetchEvents(accessToken, reportCode, { id: fight.id, startTime: fight.startTime, endTime: fight.endTime }, "Casts")`, then `computeGcdUtilization(events, druidId, fight.startTime, fight.endTime)`.
- Renders (once resolved): fight name; active time formatted mm:ss; GCD utilization %; a colored indicator by judgement; a fixed explainer line — "Ceiling: ~40 casts/min at 0% haste (60s ÷ 1.5s GCD) — 100% is a theoretical maximum, not a target."
- While pending: "Calculating…". On error: `role="alert"` with the error message. Uses the same `isCurrent`-gating pattern as `DruidDetector` to avoid rendering stale results after `accessToken` changes.

## App.tsx wiring

- `selectedFightIds` and `selectedDruidId` are currently tracked via `useState` but discarded (`[, setSelectedFightIds]` / `[, setSelectedDruidId]`). This story starts consuming both values.
- Add `const [eventFetcher] = useState(() => createEventFetcher());` once at the top level, so its internal cache (story 006) is shared across all rendered cards for the session.
- Once `accessToken`, `report`, `loadedReport`, `selectedDruidId !== null`, and `selectedFightIds.length > 0` are all true, render:
  ```tsx
  {
    loadedReport.fights
      .filter((f) => selectedFightIds.includes(f.id))
      .map((f) => (
        <GCDUtilizationCard
          key={f.id}
          accessToken={accessToken}
          reportCode={report.reportCode}
          fight={f}
          druidId={selectedDruidId}
          fetchEvents={eventFetcher.fetchEvents}
        />
      ));
  }
  ```

## Testing plan

- **Tier 1** (`src/metrics/judgement.test.ts`, `src/metrics/gcdUtilization.test.ts`): threshold boundaries for `judgeThreshold`; for `computeGcdUtilization` — all-instant fight, mixed begincast/cast pairs (haste-derived delta), an unmatched/interrupted `begincast` contributing zero, a sub-`GCD_MS` delta being clamped up, a fight where summed active time exceeds duration (percentage clamps to 100, `activeTimeMs` does not), and events from other `sourceID`s being ignored.
- New factories in `src/testUtils/factories.ts`: `aCastEvent(overrides)` and `aBegincastEvent(overrides)` (the former is anticipated by name in `docs/testing.md`'s Tier 1 section).
- **Tier 3** (`src/app/components/GCDUtilizationCard/index.test.tsx`): loading state, resolved state (correct percentage/judgement rendered from fixture events via a fake `fetchEvents`), and error state.
- No new Tier 2 fixture needed — `Casts`-dataType pagination/parsing is already covered by existing `eventCache`/`events` tests from story 006; this story only adds a new _consumer_ of that existing capability.

## Out of scope (explicitly deferred)

- Idle-gap detail (list of gaps, longest-5) — story 102.
- Cross-fight aggregation — story 702.
- User-configurable thresholds — story 802.
