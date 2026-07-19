# Near-death response audit design (story 1001, Epic J)

Backlog story 1001. A new metric card auditing whether the druid reacted to raid-wide near-death moments — the survival mirror of story 501's per-death readiness audit.

## Origin and reframing

A fellow druid (creator of the community "LB3 Calculator" tool) described a "clutch save" idea: find near-death moments raid-wide, then credit every healer who landed a heal on that target in the gap between the two damage hits. His stated pain point was that this is expensive to compute on his architecture — an older WCL API version that only exposes HP as percentage _deltas_, forcing him to hand-reconstruct each raider's absolute max HP from observed damage before he could tell whether a hit "should have" killed them.

Two things don't carry over to this app unchanged:

1. **The credit-everyone/leaderboard framing is output-flavored**, not process — it scores the whole raid's outcome, not the druid's own readiness. That conflicts with principle 1 (process over output) and with story 803's precedent (multi-druid/raid-wide comparison removed from this backlog as out of scope). This story keeps the underlying _signal_ (near-death moments are interesting) but only judges the druid's own reaction, exactly as 501 already does for actual deaths.
2. **The reconstruction problem doesn't exist on our data.** Confirmed live against `4GYHZRdtL3bvhpc8` fight 6 during this story's design: `DamageTaken` events, like the already-validated `Healing` events (`docs/testing.md`), carry real `hitPoints`/`maxHitPoints` percentages when fetched with `includeResources: true` — the actual simulated post-hit HP%, not a delta. There is nothing to reconstruct; a raider's near-death state is read directly off the event stream.

## Why this is cheap on this app's architecture

The friend's "heavy search... probably good as a stand-alone thing" caveat doesn't apply here. Every card on a fight's `Scorecard` shares one cache-backed `fetchEvents` closure (`src/wcl/eventCache.ts`), keyed by `reportCode:fightId:dataType:includeResources`. `Casts` (with `includeResources: true`), `Buffs`, `Deaths`, and `CombatantInfo` are already fetched fight-wide (unfiltered by player) by `DeathForensicsCard` and others — this story's card reuses those exact cache entries when rendered alongside them. The only genuinely new fetch is `DamageTaken`, which doesn't exist as a `WclEventDataType` today.

Live volume check (same fight, full 25-man raid, 158s, `The Lurker Below`): **353 `DamageTaken` events, one page, no pagination.** Confirms this is a normal-sized fetch, not the standalone-because-expensive concern the friend flagged on his own architecture.

## Data flow

1. **`src/wcl/events.ts`**: add `"DamageTaken"` to `WclEventDataType`. No other change needed — `fetchEventsPage`/`fetchAllPages` are already data-type-agnostic.
2. **`NearDeathResponseCard`** (new, under `src/app/components/`, mirrors `DeathForensicsCard`'s structure): on mount, fetches (all via the shared `fetchEvents`, so cache-shared with other cards already on screen):
   - `DamageTaken`, `includeResources: true` (new)
   - `Deaths` (already fetched by `DeathForensicsCard` — shared cache entry)
   - `Casts`, `includeResources: true` (already fetched by `DeathForensicsCard`)
   - `Buffs` (already fetched by `DeathForensicsCard`, needed here for the same Lifebloom-timeline reconstruction that determines "maintained targets")
   - `CombatantInfo` (already fetched by `DeathForensicsCard`, for talent-gated Swiftmend/NS eligibility)
3. **`src/metrics/nearDeathResponse.ts`** (new, pure function `computeNearDeathResponse`, unit-tested per `docs/testing.md` Tier 1): the core logic, detailed below.

## Crisis detection

**Per-target HP timeline:** for each target, merge `DamageTaken` and `Healing` events that carry `hitPoints` (some do not — e.g. a fully-avoided hit carries no resource snapshot, confirmed live) into one timestamp-sorted sequence of HP% readings, with that target's `Deaths` events merged in as explicit terminal death markers at their own timestamps (not inferred from timestamp proximity to a damage event).

This explicit-death-marker approach is necessary, not just tidy: a live check during this design (report `4GYHZRdtL3bvhpc8`, fight 6, target 37, who dies twice in the same fight via a battle-rez in between) found the fatal hit reads `hitPoints: 0`, the `Deaths` event fires ~25-59ms later, and the target's next recorded `DamageTaken` reading — a healthy 81% — doesn't appear until roughly 90 seconds afterward (their rez). A naive rule ("crisis ends when HP next reads above threshold") would misread that 90-second death-then-rez gap as one long survived crisis and wrongly credit any heal that happened to land in it. Merging deaths into the timeline as their own terminal event removes that failure mode without needing a timestamp-tolerance guess.

Walking each target's merged timeline in order, tracking whether a crisis is currently open:

- Not in crisis, reading `<= CRISIS_THRESHOLD_PCT`: **opens** a crisis at this timestamp.
- In crisis, next timeline entry is a **death marker**: this episode is a death, not a survived crisis — excluded entirely (story 501's territory), crisis state resets to closed. (Any later events for the same target — e.g. after a battle-rez — are processed as fresh, independent episodes.)
- In crisis, next timeline entry is a damage/heal reading `> CRISIS_THRESHOLD_PCT`: **closes** the crisis as **survived**, window = `[crisisStart, thisTimestamp]`.
- In crisis, next timeline entry is a damage/heal reading still `<= CRISIS_THRESHOLD_PCT`: crisis remains open, no new window.
- In crisis when the target's timeline runs out (no more events, no death): **closes** the crisis as **survived, unresolved by fight end**, window = `[crisisStart, fightEnd]` — e.g. a raider left critically low through an execute-phase kill.

`CRISIS_THRESHOLD_PCT = 15` is a **provisional, sourced-by-reasoning value** (documented in a code comment pointing here, per principle 3), not yet calibrated against real exemplar data — flagged for a follow-up calibration story in the same style as backlog stories 909-913, once this ships and a corpus of real crisis events exists to pool.

**Responded:** a `Casts` event (`sourceID` = the druid, a recognized healing-spell `abilityGameID`, resolved via the existing `resolveAbilities.ts` tables — no hardcoded IDs) with a timestamp inside the window, targeting that raider. A HoT tick landing in the window from a cast made _before_ the window started does not count — `Casts` events only fire once per cast (unlike `Healing` events, which also carry periodic `tick: true` entries), so filtering to `Casts` naturally excludes passive pre-existing HoTs without extra logic.

## Scope and the tank-assignment exemption

Reuse `lifebloomStacks.ts`'s existing timeline reconstruction and `lb3Uptime.ts`'s `MAINTAINED_MIN_UPTIME_PCT` (30%, already the definition story 201/501 use for "maintained") to compute the same maintained-target set this report already computes elsewhere.

- If the druid has 1-2 maintained targets (a clear, recognizable tank-healing assignment), crises on any _other_ raider are included in the output for context (shown in the card) but excluded from judgement (`judgement: null`, same convention `deathForensics.ts` already uses for non-maintained-target deaths).
- If the druid has 0 maintained targets (no clear tank assignment — raid-healing-style play), every raider's crisis is judged normally, since there's no narrower assignment to defer to.
- Crises on maintained targets are always judged, regardless of the above.

## Judgement

Mirrors `deathForensics.ts`'s `judgeDeathReadiness` shape exactly, reusing its same building blocks (`isReady` against Swiftmend/NS cooldowns, gated by 903c's talent-eligibility check; `wasIdlePreceding` for GCD availability):

- **Responded** (a reactive cast landed in the window): green, unconditionally — responding is good process regardless of the unspent-resource tally.
- **Not responded**: judged by the same 0/1/≥2 unspent-resource tally 501 uses (Swiftmend ready, NS ready, idle-with-a-GCD-available in the 5s before the crisis) → green/orange/red. A raider surviving without the druid's help (another healer saved them, or they simply lived) doesn't change this — the audit is the druid's readiness and reaction, not the outcome.

## UI

New `MetricCard` (title: "Near-death response"), same visual pattern as `DeathForensicsCard`: one row per crisis (time deep-link via `buildFightTimeUrl`, target name, maintained/context badge, responded badge, unspent-resource badges when not responded, judgement chip), an aggregate `value` summary (e.g. "N of M crises unanswered"), and the same kind of `Alert` caveat 501 already shows, reworded for this metric: _"A survived crisis is not automatically good or bad process by itself; this audits your readiness and reaction only — not assignments or positioning, and not whether anyone else's response was enough."_

Folds into 702's whole-report rollup the same way every other judged metric does, via 904's existing `weightedMedianJudgement`/`judgementBreakdown` machinery in `src/metrics/reportAggregation.ts` — no new aggregation policy needed.

## Testing approach

- **Tier 1 (unit)**: `src/metrics/nearDeathResponse.test.ts` — crisis detection, window boundaries (recovery / death / fight-end), the responded-vs-not-responded split, the maintained-vs-context judgement gating, and the 0/1/≥2 unspent tally, using synthetic `WclEvent[]` fixtures in the same style as `deathForensics.test.ts`.
- **Tier 3 (component)**: `NearDeathResponseCard`'s render states (loading, error, empty, populated with a mix of judged/context-only rows), same pattern as `DeathForensicsCard`'s existing tests.
- No new Tier 2 fixture is strictly required (no new WCL client-layer parsing logic — `DamageTaken` reuses `fetchEventsPage`'s existing generic path), but the live spot-check performed during this design (report `4GYHZRdtL3bvhpc8`, fight 6) is worth recording in `docs/testing.md`'s known-reports table as confirmation that `DamageTaken` + `includeResources: true` carries `hitPoints`/`maxHitPoints` percentages, the same way Healing events were documented there for story 302.

## Documentation updates (part of implementation, not yet applied)

- `docs/thresholds.md`: new "Crisis response (epic J)" section, `CRISIS_THRESHOLD_PCT` row, sourced to this story, explicitly marked provisional pending a future calibration story.
- `docs/testing.md`: extend the `4GYHZRdtL3bvhpc8` row with the `DamageTaken`/`hitPoints` confirmation noted above.
- `CLAUDE.md`'s repo-state paragraph: append story 1001 once shipped, per this repo's existing convention.
- `docs/backlog.md`: mark 1001 `✅ Done`, and this spec + its implementation plan get deleted in the same commit per this repo's "a story isn't done until its paperwork is retired" convention.

## Explicitly out of scope

- Crediting or listing _other_ healers who responded to a crisis — that's the output/leaderboard framing this design deliberately reframed away from. The card may show _that_ the target recovered, but not _who_ healed them if it wasn't the druid.
- A delta-based "took a scary hit" alternative detection (flagging a big HP drop over a short window even without crossing the flat floor threshold) — a reasonable future extension, not needed for v1; YAGNI until real data shows the flat-floor definition misses meaningful moments.
- Any change to story 501 itself — this is a new, independent metric that happens to reuse 501's helper functions, not a modification of 501's own behavior or thresholds.
