# Accidental bloom counter — design

Implements backlog story 203.

## Problem

Lifebloom "blooms" when its stacks fall off, delivering a burst heal. A bloom
is expected and fine when the druid deliberately lets a target's stack lapse
(e.g. target no longer needs it). It's a mistake when the druid immediately
rebuilds the stack on the same target — that's a dropped stack, not a choice.
Story 203 makes that distinction visible: count "accidental" blooms
(bloom + immediate re-application) separately from the rest.

## Data

Two WCL event streams are needed for the same fight, both already fetchable
via the existing `fetchEvents(accessToken, reportCode, fight, dataType)`
signature (the event cache keys by `dataType`, so fetching `"Buffs"` and
`"Healing"` for one fight is two independent, cacheable calls):

- **`Healing`** — bloom detection. Confirmed live against report
  `4GYHZRdtL3bvhpc8` fight 6 (Dassz): Lifebloom's periodic tick and its bloom
  finisher arrive as `heal` events on _different_ `abilityGameID`s (in that
  fixture, periodic ticks were all `33763` with `tick: true`; the bloom
  finisher was all `33778` with no `tick` field at all). Rather than hardcode
  which of the two known Lifebloom gameIDs is "the bloom one" (CLAUDE.md bans
  hardcoded spell IDs), detection is generic: any `heal` event sourced from
  the druid on an ability in `lifebloomAbilityIds` where `tick !== true` is a
  bloom. This also holds if a future rank introduces new gameIDs.
- **`Buffs`** — re-application detection. A bloom always co-fires with a
  `removebuff` at the same timestamp (confirmed in the same live pull). A
  fresh `applybuff` on that target afterward is a new ramp; if it lands
  within 3s of the bloom, the heuristic calls it a rebuild rather than a
  deliberate new application.

## Algorithm (`src/metrics/accidentalBlooms.ts`)

```
computeAccidentalBlooms(buffEvents, healEvents, druidId, lifebloomAbilityIds):
  blooms = healEvents where sourceID == druidId
                        and abilityGameID in lifebloomAbilityIds
                        and tick !== true
         sorted by timestamp

  reapplications = buffEvents where sourceID == druidId
                               and abilityGameID in lifebloomAbilityIds
                               and type == "applybuff"

  for each bloom:
    accidental = exists a reapplication on the same targetID with
                 0 < (reapplication.timestamp - bloom.timestamp) <= 3000

  accidentalBlooms = blooms filtered to accidental, each as
    { timestampMs, targetId }

  judgement = green if count == 0, orange if 1-2, red if >= 3
              (reuse judgeThresholdBelow(count, { greenMax: 1, orangeMax: 2 }))

  return { accidentalBlooms, count: accidentalBlooms.length, judgement }
```

Notes:

- Strictly greater-than on the lower bound: a reapplication at the exact
  bloom timestamp isn't meaningful (blooms don't reapply themselves), but in
  practice this only guards against a same-timestamp coincidence.
- No timeline reconstruction needed here (unlike `lb3Uptime`/`refreshCadence`)
  — bloom and reapplication are both single event lookups, not stack state.
- A bloom with no later events at all (fight ends right after) is correctly
  "not accidental" — there's simply no reapplication event to find.

## Card (`AccidentalBloomsCard`)

Currently a static placeholder wired into `Scorecard`. Follows the same
before/after pattern as `RefreshCadenceCard` (story 202): add real props,
fetch both event types via `Promise.all`, compute, render.

Props: `accessToken, reportCode, fight, druidId, lifebloomAbilityIds,
targetNames, fetchEvents` — same shape as `LB3UptimeCard` plus
`lifebloomAbilityIds`.

Render states: calculating / error / "No accidental blooms this fight." /
populated (count + judgement chip in the `MetricCard` header, plus a list —
one line per accidental bloom, `formatDuration(timestampMs - fight.startTime)
— targetName`, each linking out via `buildFightTimeUrl`, matching
`IdleGapsCard`'s list pattern). List shows accidental blooms only, per the
AC's "each accidental bloom lists timestamp + target" — not all blooms.

`Scorecard` passes the same `lifebloomAbilityIds`, `targetNames`,
`fetchEvents` it already threads to `LB3UptimeCard`/`RefreshCadenceCard`.

## Testing

- `src/metrics/accidentalBlooms.test.ts`: no blooms; bloom with late/no
  reapplication (not accidental); bloom with reapplication just inside 3s
  (accidental) and just outside (not); reapplication on a _different_ target
  (not accidental); multiple targets/blooms in one fight; R/O/G boundaries
  (0/1/2/3 count).
- `src/testUtils/factories.ts`: add `aHealEvent` factory (mirrors
  `aCastEvent`'s shape; supports `tick` override).
- `AccidentalBloomsCard/index.test.tsx`: rewritten like
  `RefreshCadenceCard/index.test.tsx` — loading, error, empty, and populated
  (with a real accidental bloom) states. Replaces the current
  mock-content-only test.

## Out of scope

- Stories 204 (re-stack tax) and 205 (concurrent LB3 targets) — their cards
  stay as placeholders.
- Any UI for non-accidental (intentional) blooms.
