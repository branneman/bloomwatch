# Story 501 — Per-death resource audit — design

## Story

> I want an audit for every friendly death (with emphasis on my maintained tank targets): did
> the target have my LB3 rolling, and did I have Swiftmend / Nature's Swiftness / a GCD available
> in the 5s before death, so that deaths with unspent emergency resources are exposed as process
> failures.

**Acceptance criteria** (`docs/backlog.md`):

- For each death: target, time, my LB3 status on that target, Swiftmend CD state, NS CD state,
  whether I was idle in the preceding 5s.
- R/O/G per death: red if ≥ 2 unspent resources on a maintained target's death; summarized per
  fight.
- Clearly labeled caveat: a death is not automatically the druid's fault; this audits _your_
  readiness only.

This is epic F, the last epic that hasn't been wired into the Scorecard yet (`"death"` currently
sits in `Scorecard/index.tsx`'s `DISABLED_EPICS`). Depends on 302 (Swiftmend) and 304 (Nature's
Swiftness) per `docs/backlog.md`'s ordering note — both are done, and this design reuses their
cooldown constants rather than re-deriving them.

## Judgement calls resolved during brainstorming

1. **Per-death judgement is 3-tier**, not just "red or nothing": 0 unspent resources → green, 1 →
   orange, 2–3 → red. The backlog text only states the red condition explicitly, but every other
   judged metric in the app uses green/orange/red, and a binary red/green would be an unexplained
   inconsistency.
2. **The "≥2 unspent resources" tally counts exactly three flags**: Swiftmend ready, Nature's
   Swiftness ready, idle-with-a-GCD-available-in-the-preceding-5s. LB3-rolling status is displayed
   on the card as context but does **not** count toward the tally. This matches the design mockup
   (`docs/design_v2/source/epic-f.jsx`) exactly: its flagged example has all three of those true
   (LB3 is false, but that isn't what triggers red); its unflagged example has LB3 false too but
   only 1 of the three counted flags true, and renders "Not judged" because the target isn't
   maintained — not because the tally is low.

## Live WCL validation

No fixture existed yet for the `Deaths` event `dataType` (it's declared in
`src/wcl/events.ts`'s `WclEventDataType` per story 006 but never queried by any shipped story).
Queried live against report `4GYHZRdtL3bvhpc8`, fight 6 (The Lurker Below, a kill):

```
events(fightIDs: [6], dataType: Deaths, startTime: 1879119, endTime: 2036920, includeResources: true)
```

Returned events shaped as:

```json
{
  "timestamp": 1926404,
  "type": "death",
  "sourceID": -1,
  "targetID": 37,
  "abilityGameID": 0,
  "fight": 6,
  "killerID": 56,
  "killerInstance": 7,
  "killingAbilityGameID": 1
}
```

Confirmed via `masterData.actors(type: "Player")` that `targetID` values (37, 4, 3 in this
fight) resolve to real player actors (Elydemb-Priest, Maoqi-Druid, Yaz-Hunter) — i.e. `Deaths`
already scopes to friendly deaths only; no client-side hostility filtering is needed.
`includeResources: true` adds no extra fields to this event type (no `hitPoints`, unlike
`Healing` events) — target HP at death isn't part of this story's acceptance criteria anyway, so
that's fine. `sourceID` is always `-1` on a death event (the death itself has no "source" actor;
`killerID` is the separate field for who/what landed the killing blow, and isn't needed by this
story either). This will be captured as a new Tier 2 fixture
(`test/integration/fixtures/events-deaths.json`) and documented in `docs/testing.md`'s known
reports table.

## Metric module — `src/metrics/deathForensics.ts`

```ts
export interface DeathAudit {
  timestampMs: number;
  targetId: number;
  maintained: boolean;
  lb3Rolling: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  unspentCount: number;
  judgement: Judgement | null; // null when !maintained — "not judged"
}

export interface DeathForensicsResult {
  deaths: DeathAudit[];
  flaggedCount: number; // deaths.filter(d => d.judgement === "red").length
  judgement: Judgement; // worstJudgement of all non-null per-death judgements
}

export function computeDeathForensics(
  deathEvents: WclEvent[],
  castEvents: WclEvent[],
  buffEvents: WclEvent[],
  druidId: number,
  swiftmendAbilityIds: Set<number>,
  naturesSwiftnessAbilityIds: Set<number>,
  lifebloomAbilityIds: Set<number>,
  fightStart: number,
  fightEnd: number,
): DeathForensicsResult;
```

**New shared constant, one small breaking-free export change each** (no output-shape changes to
any shipped story, purely making an already-computed private constant reusable):

- `lb3Uptime.ts`: export `MAINTAINED_MIN_UPTIME_PCT` (currently private) so 501 uses the exact
  same "maintained target" definition as 201, from one place.
- `naturesSwiftnessAudit.ts`: export `NATURES_SWIFTNESS_COOLDOWN_MS` (currently private).
- `swiftmendAudit.ts`: promote the inline `15_000` literal (currently only used for
  `availableWindows`) to a named, exported `SWIFTMEND_COOLDOWN_MS`.
- New local constant in `deathForensics.ts`: `DEATH_IDLE_WINDOW_MS = 5000` — sourced directly to
  this story's own acceptance criteria (no prior story defines a 5s window).

**Per-death derivation, using building blocks already proven by 201/202/205, 301/302, and 304**
(no new event-parsing techniques — this module is pure composition):

- **LB3 rolling / maintained**: call `reconstructLifebloomTimelines` +
  `deriveLifebloomTargetState` (from `lifebloomStacks.ts`, already exported and used by
  `lb3Uptime.ts`, `refreshCadence.ts`, `concurrentLb3Targets.ts`) directly, once per fight, for
  all targets. For a death on `targetId`: `maintained` = that target's
  `totalAnyStackMs / fightDurationMs >= MAINTAINED_MIN_UPTIME_PCT` (fight-wide %, same as 201 —
  not truncated at the death timestamp, so "maintained" means the same thing everywhere in the
  app). `lb3Rolling` = the death timestamp falls inside one of that target's `stack3Intervals`.
  A target with no Lifebloom timeline at all (never LB'd) has both `maintained` and `lb3Rolling`
  false.
- **Swiftmend / NS ready**: find the druid's own casts matching each ability-ID set, sorted; for
  a given death timestamp, find the latest such cast strictly before it. `ready` = no such cast
  this fight, or `deathTimestamp - lastCastTimestamp >= cooldownMs`. (No prior-fight state — CDs
  don't carry across fights in this app's model, consistent with 302/304's own
  `availableWindows` calculations resetting per fight.)
- **Idle preceding 5s**: call `computeCastIntervals` (from `castIntervals.ts`) once for the
  druid. Find the latest interval starting at or before the death. If that interval is still
  open at the death (its end is after the death timestamp), the druid was mid-cast at the moment
  of death, so `idlePreceding` is `false` (a GCD was in use, not available). Otherwise
  `idlePreceding` is `true` when the gap from that interval's end to the death is at least
  `DEATH_IDLE_WINDOW_MS`. If there's no prior interval at all (death before the druid's first
  cast), the gap is measured from the fight's start instead.
- **Judgement**: `unspentCount = [swiftmendReady, nsReady, idlePreceding].filter(Boolean).length`.
  `judgement = maintained ? judgeDeathReadiness(unspentCount) : null`, where
  `judgeDeathReadiness` is a small bespoke function (same shape as `swiftmendAudit.ts`'s
  `judgeWastefulShare`): 0 → green, 1 → orange, ≥2 → red.

**Fight-level rollup**: `judgement` = `worstJudgement(deaths.map(d => d.judgement))` (the existing
helper already filters `null`s, so unmaintained deaths and the zero-deaths case both correctly
fall through to green). `flaggedCount` = count of `judgement === "red"`.

## UI components

Follows the exact structure every prior epic uses (`src/app/components/*Card`,
`*Content`, `Scorecard/use*Summary.ts`, `metrics/epicSummary.ts`).

### `src/app/components/ui/DeathCard`

New presentational primitive (peer of `ClassTag`, `Histogram`, `StackedBar` — small,
data-in/JSX-out, no fetching). Matches `docs/design_v2/source/shared.jsx`'s `DeathCard` layout:
header row (target name + formatted time, right-aligned `JudgementChip` or italic "Not judged"),
then a 2-column grid of four label/value rows (LB3 rolling on target, Swiftmend available,
Nature's Swiftness available, idle in preceding 5s) — value strings exactly as the mockup:
`"Yes"/"No"` for LB3 when maintained else `"n/a — not maintained"`, `"Ready"/"On cooldown"` for
the two CDs, `"Yes"/"No"` for idle.

```ts
export interface DeathCardProps {
  target: string;
  time: string; // pre-formatted, e.g. via formatDuration + buildFightTimeUrl for the link
  maintained: boolean;
  lb3: boolean;
  swiftmendReady: boolean;
  nsReady: boolean;
  idlePreceding: boolean;
  judgement: Judgement | null;
}
```

Time is rendered as a link to the death's moment in the WCL report (`buildFightTimeUrl`), same
convention as the idle-gap list (102) and Swiftmend log (302).

### `src/app/components/DeathForensicsCard`

Fetches `Deaths`, `Casts`, `Buffs` for the fight (`Promise.all`, same pattern as
`useSpellDisciplineSummary`), calls `computeDeathForensics`, renders one `MetricCard`:

- `icon`: reuses the epic-level icon (`spell_shadow_deathscream`) — the design mockup's single
  `MetricCard` for this epic omits an `icon` prop entirely, but every other shipped card passes
  one and there's no second icon documented for this epic in `docs/design_v2/README.md`, so
  reusing the epic icon keeps the card visually consistent with the rest of the app rather than
  introducing the one icon-less card.
- `value`: `"${flaggedCount} of ${deaths.length} deaths flagged"`, or `"No friendly deaths"` when
  `deaths.length === 0`.
- `judgement`: the fight-level rollup.
- `threshold`: states the red rule verbatim from the backlog, plus the 3-tier
  green/orange/red breakdown this design adds, since principle 3 requires every threshold to be
  documented and sourced.
- children: one `DeathCard` per death (empty state: a plain "No friendly deaths this fight."
  paragraph, same style as `NaturesSwiftnessCard`'s zero-casts empty state), followed by the
  `Alert tone="warning"` caveat ("A death is not automatically the druid's fault...").

### `src/app/components/DeathForensicsContent`

Thin wrapper mirroring `LifebloomDisciplineContent` — mounts `DeathForensicsCard` with the props
threaded down from `Scorecard`.

### `Scorecard/useDeathForensicsSummary.ts` + `summarizeDeathForensics`

Same shape as `useSpellDisciplineSummary` / `summarizeSpellDiscipline`: fetches the three event
types, computes the result, returns `EpicSummaryStatus`. `summarizeDeathForensics` stat lines:
`"Deaths: ${deaths.length}"` and `"Flagged: ${flaggedCount}"` (or a single
`"No friendly deaths"` stat when there were none, matching `formatLb3UptimeStat`'s style of
special-casing the empty case into readable prose instead of "Flagged: 0" every time).

### `Scorecard/index.tsx`

Move the `"death"` entry out of `DISABLED_EPICS` into a real wired epic, exactly parallel to how
`"spell"` is wired: add `deathSummary = useDeathForensicsSummary(...)`, a `Widget` using it, and
an `activeEpic === "death"` detail block rendering `DeathForensicsContent`. `naturesSwiftnessAbilityIds`
and `lifebloomAbilityIds` are already threaded through `Scorecard`'s props (used by
`SpellDisciplineContent` / `LifebloomDisciplineContent` already) — no new prop plumbing needed
above `Scorecard` itself.

## Testing

- **Tier 1** (`src/metrics/deathForensics.test.ts`): pure-function tests covering: maintained vs.
  not; LB3 rolling true/false at the death instant (including a death that lands exactly on a
  stack-3→stack-2 transition); Swiftmend/NS ready when never cast, ready after CD elapsed, not
  ready mid-CD; idle-preceding true/false/mid-cast-at-death; the 0/1/2/3-unspent →
  green/orange/red/red judgement mapping; a maintained death with judgement vs. an
  unmaintained death with `judgement: null`; zero-deaths fight-level rollup resolves to green.
  New `aDeathEvent` factory added to `src/testUtils/factories.ts` (shape per the Live WCL
  Validation section above).
- **Tier 2**: capture the real `Deaths` response above into
  `test/integration/fixtures/events-deaths.json`; no new client code needs a dedicated
  integration test beyond what `eventCache.ts`'s existing tests already cover (`Deaths` is just
  another `WclEventDataType` value, already handled generically) — the fixture exists primarily
  to keep a real payload in the repo for future regression checks, per `docs/testing.md`'s Tier 2
  charter.
- **Tier 3** (`DeathForensicsCard`, `DeathCard`): component tests per
  `docs/testing.md` Tier 3 conventions — loading/error/empty/populated states for the card,
  rendering + judgement-chip-vs-"Not judged" branching for `DeathCard`.

## Docs to update on completion (per `CLAUDE.md`'s "paperwork" rule)

- Mark 501 `✅ Done` in `docs/backlog.md`.
- Delete this spec and its paired plan.
- Add the new `Deaths` event shape + friendly-only confirmation to `docs/testing.md`'s known
  reports table (report `4GYHZRdtL3bvhpc8` row already exists — extend its "Notable for" cell
  rather than adding a new row, consistent with how every other story's live-validated fact was
  appended there).
- Update `CLAUDE.md`'s "Repo state" paragraph to include 501 in the completed-stories list.
