# Design: Story 201 — LB3 uptime per target

Backlog: `docs/backlog.md` § 201.

> I want per-target uptime of 3-stack Lifebloom on my maintained targets, so that I can verify my core job: keeping LB3 rolling on tanks.

## Data flow

1. **Ability resolution (report-scoped, fetched once per report):**
   - Extend `DruidDetector` with a new optional prop `onEntriesLoaded?: (entries: CastTableEntry[]) => void`, called with the raw `CastTableEntry[]` it already fetches via `fetchCastsTable` (currently only used to derive druid candidates, discarding the rest). `App.tsx` uses this to build an `id → name` map (`Map<number, string>`) for target-name display — no extra API call.
   - Add a new component `AbilityResolver` (same shape/lifecycle as `DruidDetector`): calls `fetchMasterDataAbilities(accessToken, reportCode)` once when a report loads, runs `resolveAbilities`, and lifts the resulting `Map<number, ResolvedAbility>` to `App.tsx` state via `onResolved`.
2. **Per fight:** `LB3UptimeCard` fetches `Buffs` events for the fight through the existing `eventFetcher.fetchEvents` cache (same mechanism `GCDUtilizationCard`/`IdleGapsCard` use for `Casts`), and computes the metric client-side.

## Ability ID lookup helper

Add to `src/abilities/resolveAbilities.ts`:

```ts
export function resolveSpellAbilityIds(
  resolved: Map<number, ResolvedAbility>,
  spell: DruidHealingSpell,
): Set<number>;
```

Returns every gameID resolved to that spell (rank known or `null`). Used here for `"Lifebloom"`; reusable as-is by stories 202–205, which the backlog notes build on 201's stack reconstruction.

## Metric: `src/metrics/lb3Uptime.ts`

Verified against real WCL data (report `4GYHZRdtL3bvhpc8`, fight 6): Lifebloom buff events observed are `applybuff` (implicit stack 1), `applybuffstack` (carries a `stack` field, 2 or 3), `refreshbuff` (fired alongside `applybuffstack`, or alone when refreshed without a stack change), and `removebuff`. `WclEvent` gains an optional `stack?: number` field for this.

```ts
export interface Lb3TargetResult {
  targetId: number;
  lbUptimePct: number; // any-stack uptime / fight duration — the 30% "maintained" gate
  lb3UptimeMs: number;
  windowMs: number; // fightEnd - (first time this target reached 3 stacks)
  lb3UptimePct: number; // lb3UptimeMs / windowMs
  judgement: Judgement;
}

export interface Lb3UptimeResult {
  targets: Lb3TargetResult[]; // maintained targets only, chronological by first LB application
}

export function computeLb3Uptime(
  events: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): Lb3UptimeResult;
```

**Algorithm**

1. Filter events to `sourceID === druidId` and `abilityGameID ∈ lifebloomAbilityIds`, and group by `targetID`, preserving arrival order (events already arrive timestamp-ordered from the API).
2. Per target, walk events tracking `currentStack` and `openAt` (timestamp the current application opened):
   - `applybuff`: `openAt = timestamp`, `currentStack = 1`.
   - `applybuffstack`: `currentStack = event.stack`. If this is the first time `currentStack` reaches 3 for this target (fight-wide), record `firstReached3At = timestamp` and start a 3-stack sub-interval (`stack3OpenAt = timestamp`). If already inside a 3-stack sub-interval and stack drops below 3 (shouldn't happen via `applybuffstack` alone, but guard anyway), close it.
   - `refreshbuff`: no stack change; ignored for stack bookkeeping.
   - `removebuff`: close the any-stack interval (`openAt → timestamp`) into the target's total any-stack time. If a 3-stack sub-interval is open, close it too (`stack3OpenAt → timestamp`). Reset `currentStack = 0`, `openAt = undefined`.
3. After the event walk, if a target still has an open interval (no closing `removebuff` before `fightEnd`), close both the any-stack interval and any open 3-stack sub-interval at `fightEnd`. This does not assume WCL always emits a boundary `removebuff`.
4. Compute `lbUptimePct = totalAnyStackMs / (fightEnd - fightStart) * 100`. Drop targets below 30% (backlog: "filters out one-off casts").
5. For remaining (maintained) targets:
   - If `firstReached3At` is unset (target maintained ≥30% uptime but never reached 3 stacks): `lb3UptimeMs = 0`, `windowMs = fightEnd - fightStart`, `lb3UptimePct = 0` (red).
   - Else: `windowMs = fightEnd - firstReached3At`, `lb3UptimeMs` = sum of all 3-stack sub-interval durations (cumulative across the whole fight, not just the first application — a target can drop to 0 stacks and be re-ramped later; per the backlog wording ("measured from first reaching 3 stacks") only the initial ramp is excluded, not subsequent ones), `lb3UptimePct = lb3UptimeMs / windowMs * 100`.
6. Judgement via `judgeThreshold` (higher-is-better): green ≥ 90%, orange 75–90%, red < 75% (backlog story 201).
7. Return targets in chronological order of first Lifebloom application.

## UI: `src/app/components/LB3UptimeCard`

Mirrors `IdleGapsCard`/`GCDUtilizationCard`'s structure (props: `accessToken`, `reportCode`, `fight`, `druidId`, `fetchEvents`, plus new `lifebloomAbilityIds: Set<number>` and `targetNames: Map<number, string>`; same `Calculating…`/error/result states keyed on `accessToken`).

Renders one row per maintained target: name via `targetNames.get(targetId) ?? \`Target #${targetId}\``, LB3 uptime %, R/O/G label. Zero maintained targets renders a "No maintained targets" message (e.g. a fight with no sustained LB3 usage).

Wired into `App.tsx` next to the existing two cards, gated on `AbilityResolver` having resolved abilities (so `lifebloomAbilityIds` is available) in addition to the existing gating conditions.

## Testing

- **Unit (`lb3Uptime.test.ts`):** new buff-event factories in `factories.ts` (`anApplyBuffEvent`, `anApplyBuffStackEvent`, `aRefreshBuffEvent`, `aRemoveBuffEvent`). Cases: ramp-up excluded from the 3-stack window; multiple targets; sub-30%-uptime target filtered out; interval still open at `fightEnd` closes correctly; a target that reaches 3 stacks, drops, and re-ramps (cumulative 3-stack time across both); each R/O/G band; a maintained target that never reaches 3 stacks.
- **Unit (`resolveAbilities.test.ts`):** `resolveSpellAbilityIds` returns the right gameID set, including rank-`null` fallback entries.
- **Component:** `LB3UptimeCard` loading/error/success rendering (including the "no maintained targets" case); `DruidDetector`'s new `onEntriesLoaded` callback firing with the raw entries.

## Out of scope (deferred to later Epic C stories per backlog)

- Refresh cadence histogram (202), accidental bloom detection (203), re-stack tax (204), concurrent-target timeline (205) — these reuse this story's stack reconstruction but are separate acceptance criteria.
