# Refine crisis response's good/fair judgement criteria — design

Source: `docs/backlog.md` story 1002.

## Problem

Story 1001's crisis response audit (`computeNearDeathResponse`,
`src/metrics/nearDeathResponse.ts`) already judges every crisis on a
maintained target (or every crisis at all, with no clear tank assignment)
as a blunt responded/not-responded split: any single reactive heal from
`HEALING_SPELLS_FOR_RESPONSE` landing in the window reads "good", unconditionally,
with no distinction between a routine heal happening to land and a clearly
deliberate burst save. Separately, a crisis on a target outside the druid's
maintained assignment is entirely unjudged today, even when the druid
plainly had the resources to help (Swiftmend and/or Nature's Swiftness
ready).

This story sharpens both: a distinguishable "clear save" tier within "good",
and a new "fair" tier for the unmaintained-but-resourced case.

## Prerequisite: crisis response is missing from calibration tooling

`scripts/lib/calibrateReport.ts`'s per-fight output currently has 6 epics
(`gcdEconomy`, `lifebloomDiscipline`, `spellDiscipline`, `manaEconomy`,
`deathForensics`, `prepHygiene`) — crisis response (epic J, story 1001) was
never wired in. Every acceptance criterion in this story depends on citing
real corpus examples, so fixing this gap is part of the work, not a
tooling detour:

- Add a `crisisResponse` field to the per-fight epic output in
  `calibrateReport.ts`, following the same shape/pooling conventions as
  the existing 6 (pooled counts by judgement bucket, flagged-crisis
  detail sufficient to identify a specific report/fight/target/timestamp
  for citation).
- Extend `scripts/lib/rollup.ts`'s pooling to include it, matching how the
  other epics are pooled across the corpus.
- Run `npm run calibrate` across the full local `calibration-data/`
  corpus (grown to 120 reports per story 802/914's most recent pass) to
  produce real crisis episodes to inspect.

This is additive to the existing calibration output shape — no existing
field changes.

## Data model

`CrisisEvent` (`src/metrics/nearDeathResponse.ts`) gains two fields:

```ts
export interface CrisisEvent {
  // ...existing fields unchanged...
  clearSave: boolean; // true only when judgement === "good"
  saveKind: "natures-swiftness-combo" | "swiftmend-hot-consume" | null;
}
```

`saveKind` is `null` whenever `clearSave` is false. Both fields are additive;
no existing field is removed or renamed. `judgement`'s type (`Judgement`,
`"good" | "fair" | "bad"`) is untouched — a clear save is still, structurally,
a "good" judgement, per principle 3's closed threshold vocabulary. The
distinction lives alongside it, not inside it.

`computeNearDeathResponse`'s signature gains whatever additional ability-ID
sets are needed to detect the combos below — at minimum Rejuvenation ability
IDs (to confirm what a reactive Swiftmend consumed) and Healing
Touch/Regrowth ability IDs are already reachable via the existing
`healingAbilityIds` set, so a Nature's Swiftness follow-up cast only needs
its `abilityGameID` checked against the relevant subset. The exact new
parameter list is an implementation-time detail, resolved when the plan is
written.

## Clear-save detection

Two combos are named directly in the backlog story; a real-corpus check
(via the calibration extension above) confirms whether any other combo is
common enough to warrant inclusion before shipping — if none is found, only
these two ship:

1. **`natures-swiftness-combo`**: a Nature's Swiftness cast by the druid,
   followed by a Healing Touch or Regrowth cast by the same druid on the
   same crisis target, within a real time window derived from the corpus
   check (Nature's Swiftness makes the next cast instant, so real gaps
   should cluster tightly — the exact ms cutoff is picked from that data,
   not guessed).
2. **`swiftmend-hot-consume`**: the reactive cast satisfying `responded` is
   Swiftmend, and it consumed a Rejuvenation specifically (not Regrowth) —
   detected by reusing/extending `swiftmendAudit.ts`'s existing HoT-removal
   matching (`trackHotRemovals`/`findConsumedHot`, currently private to that
   module) rather than re-deriving equivalent logic. Whether these two
   helpers get exported as-is or a small shared module is split out is an
   implementation-time decision.

A crisis can only be `clearSave: true` when it was already `judgement ===
"good"` under the existing `responded` logic (1001's shape) — this story
narrows within "good", it never expands what counts as responded.

## Unmaintained-crisis "fair" tier

Confirmed with the user: the fair tier applies whenever _either_ Swiftmend
or Nature's Swiftness was ready (not only when both are), since any real
unspent resource on an unmaintained target is worth surfacing:

```
judged = maintained
      || !hasClearAssignment
      || swiftmendReady
      || nsReady
```

For a crisis that's judged solely via this new rule (unmaintained target,
clear assignment elsewhere, at least one resource ready, and no reactive
heal landed — if a reactive heal did land it's still "good"/"clear save"
under the existing/new good-tier logic above), the judgement is `"fair"`,
never `"good"` or `"bad"` — this tier exists to surface "you could have
helped," not to grade the miss further. A crisis with neither resource
ready on an unmaintained target remains context-only (`judged: false`,
`judgement: null`), exactly as today.

## UI / copy

- `CrisisCard` (`src/app/components/ui/CrisisCard`) renders a small distinct
  badge when `clearSave` is true, labeling the specific combo in plain
  user-facing language (no "epic"/"story" vocabulary, no em dash), e.g.
  "Clear save: Nature's Swiftness into Regrowth" / "Clear save: Swiftmend
  off a Rejuvenation". Exact copy is finalized during implementation.
- `NearDeathResponseCard`'s `THRESHOLD` explainer string and
  `docs/thresholds.md`'s Crisis response section are both rewritten to
  describe the full refined matrix: clear save vs. plain responded vs.
  unmaintained-but-resourced fair vs. unspent-resource tally vs.
  context-only.

## Testing

- `nearDeathResponse.test.ts`: new cases for each clear-save combo, the new
  unmaintained-fair tier (both single-resource-ready variants and the
  neither-ready context-only case, to pin the boundary), and confirmation
  that `clearSave`/`saveKind` stay `false`/`null` on every other judgement
  path. Existing cases updated only where the new fields need asserting,
  not where behavior changed.
- Real crisis examples pulled from the calibration corpus run (via the
  extended `calibrateReport.ts`) back each new distinction with a cited
  report/fight/target/timestamp, per this repo's existing convention
  (e.g. the citations already in `nearDeathResponse.ts`'s own comments).
- `NearDeathResponseCard`/`CrisisCard` component tests cover the new badge
  rendering.
- `scripts/lib/calibrateReport.test.ts` / `rollup.test.ts` (or their
  equivalents) get coverage for the new `crisisResponse` epic field.

## Out of scope

- No change to `CRISIS_THRESHOLD_PCT`, the crisis-window detection logic,
  or the existing `hasClearAssignment`/maintained-target definitions.
- No change to how crisis response folds into 904's whole-report rollup
  (`weightedMedianJudgement`) — the new "fair" tier and clear-save flag
  both flow through the existing `judgement` field and `flaggedCount`
  unchanged.
- Story 917 (Faerie Fire raid-assignment drag) is unrelated and untouched.
