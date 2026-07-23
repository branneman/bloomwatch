# Exclude Lifebloom Discipline from judgement when zero Lifebloom casts occur

## Problem

Some fights are pure raid-healing pulls with no tank-maintenance component (e.g. a
tank-less Solarian phase). On these fights the druid never casts Lifebloom at all, yet
the Lifebloom Discipline epic still renders a "Good" verdict:

- `computeLb3Uptime`, `computeRefreshCadence`, and `computeConcurrentLb3Targets`
  correctly report no signal (empty targets / `null` judgement) when there's no
  Lifebloom activity, and `mixedJudgement`/`weightedMedianJudgement` already filter
  `null` inputs out.
- `computeAccidentalBlooms` and `computeRestackTax` do not distinguish "no Lifebloom
  activity" from "clean Lifebloom activity" — both treat a literal `0` as passing their
  good/fair/bad threshold (0 accidental blooms = good, 0 re-stack casts = good).

So a fight with zero Lifebloom casts ends up with two real "Good" judgements
(Accidental blooms, Re-stack tax) and three excluded ones, and `mixedJudgement`
folds that into an overall "Good" epic verdict — a fight the druid did nothing
Lifebloom-related in reads as their best possible Lifebloom performance. The other six
epics (GCD economy, Spell discipline, Mana economy, Death forensics, Crisis response,
Prep hygiene) are unaffected and should keep being judged normally on these fights.

## Trigger

A fight is excluded from Lifebloom Discipline judgement when the druid cast zero
Lifebloom-family spells in that fight, based on `cast`-type WCL events — a simple,
unambiguous fact independent of buff-timeline reconstruction or carry-in resolution.
(A target whose Lifebloom carried in from the previous pull and was never recast this
fight is still excluded under this rule, since no discipline was exercised _this_
fight; whatever's ticking is a byproduct already judged on the fight it was cast in.)

A new pure helper captures this:

```ts
// src/metrics/lifebloomStacks.ts
export function hasLifebloomCast(
  castEvents: WclEvent[],
  druidId: number,
  lifebloomAbilityIds: Set<number>,
): boolean {
  return castEvents.some(
    (event) =>
      event.type === "cast" &&
      event.sourceID === druidId &&
      event.abilityGameID !== undefined &&
      lifebloomAbilityIds.has(event.abilityGameID),
  );
}
```

Both call sites that build a Lifebloom Discipline summary already fetch cast events
for `computeRestackTax`, so this costs no new WCL request — each just calls the helper
once on the events it already has and passes the boolean through.

## Epic-level short-circuit

`summarizeLifebloomDiscipline` (`src/metrics/epicSummary.ts`) gains a 6th parameter,
`hasLifebloomCast: boolean`. When false, it returns immediately:

```ts
if (!hasLifebloomCast) {
  return { judgement: null, stats: ["No Lifebloom casts this fight"] };
}
```

...skipping the `mixedJudgement` combination of its five sibling metrics entirely.
The sub-metrics are still computed as before (their own cards, when shown, need them),
but their judgements are never consulted when the fight is excluded.

`computeAccidentalBlooms` and `computeRestackTax` are **not** modified — their
misleading "Good" outputs simply never reach the epic verdict or the screen, because
(see below) their cards don't mount on an excluded fight.

`EpicSummary.judgement` widens from `Judgement` to `Judgement | null` to allow this.
Every other `summarize*` function keeps returning a plain `Judgement`, which still
satisfies the wider type unchanged — no other epic's behavior changes.

## Type ripple (mechanical, not behavioral)

`EpicSummary.judgement`'s widening surfaces in two more shared generic types, each
already used identically by all 7 epics:

- App: `EpicSummaryStatus`'s `"ready"` variant (`src/app/components/Scorecard/epicSummaryStatus.ts`)
  → `judgement: Judgement | null`.
- CLI: `EpicResult<M>`'s `"ready"` variant (`scripts/lib/types.ts`) → same.

That forces small, non-behavioral edits everywhere these unions are consumed
generically, since TypeScript can no longer assume `judgement` is non-null even though
6 of 7 epics never actually produce `null`:

- `rollupEpicJudgement` (`src/metrics/reportAggregation.ts`) and `epicRollupBase`
  (`scripts/lib/rollup.ts`) each add one filter line excluding `null`-judgement fights
  before computing the weighted-median/breakdown. This is what makes an excluded fight
  simply not count toward the Lifebloom Discipline column's rollup, the same way a
  still-loading or errored fight already doesn't count — no new UI, no new bucket.
  `combineFightEpicStatus` needs no change; `worstJudgement` already tolerates `null`
  entries, so a fight's own overall row chip is unaffected (it reflects the other six
  epics as if Lifebloom Discipline weren't judged at all).
- `Scorecard/index.tsx`'s 7 `Widget` declarations and 7 detail-header `JudgementChip`
  renders each need a one-token null-guard/coalesce so they keep compiling; only the
  Lifebloom block's rendered output actually changes.

Known pre-existing edge case, not addressed here: if literally every fight in a report
excluded Lifebloom Discipline, `rollupEpicJudgement`'s "no ready entries yet" early
return would make that column show "Calculating…" forever rather than a settled empty
state. This already happens today for any epic with zero resolved fights; not new.

## UI

- **Overview grid tile** (Widget): no chip; the stats area is replaced by the note
  "No Lifebloom casts this fight" (the same visual slot `Widget` already uses for
  "Calculating…"/error text).
- **Detail page header**: no `JudgementChip` (falls out of the same null check).
- **Detail page body**: `LifebloomDisciplineContent` gains a `showCards: boolean`
  prop. `Scorecard` passes `false` only once it positively knows the epic resolved to
  `null` (`lifebloomSummary.status === "ready" && lifebloomSummary.judgement === null`);
  loading/error states default to `true`, preserving today's behavior exactly while the
  hook is still resolving. When `false`, `LifebloomDisciplineContent` renders one
  explanatory line instead of mounting `LB3UptimeCard`, `RefreshCadenceCard`,
  `AccidentalBloomsCard`, `RestackTaxCard`, and `ConcurrentTargetsCard` — so none of
  those five components fetches, computes, or renders a chip for an excluded fight.

## Explicitly out of scope

- `computeAccidentalBlooms` / `computeRestackTax` themselves, and their card
  components — untouched; excluding them from mounting makes fixing their own
  judgement fields unnecessary for this problem.
- The whole-report rollup breakdown does not gain a visible "excluded" count; excluded
  fights are silently dropped from the good/fair/bad tally, matching how still-loading
  and errored fights are already handled.
- Carry-in-only fights (Lifebloom ticking from a prior pull, never recast this fight)
  are excluded under this rule too, per the Trigger section above; not treated as a
  separate case.

## Testing

- `hasLifebloomCast`: unit tests for zero casts, one cast, casts by another player,
  casts of a non-Lifebloom ability.
- `summarizeLifebloomDiscipline`: unit test asserting `judgement: null` and the
  single-line stats array when `hasLifebloomCast` is false, and that existing
  behavior is unchanged when true.
- `rollupEpicJudgement` / `epicRollupBase`: unit test asserting a `null`-judgement
  entry is excluded from the median/breakdown but doesn't block other fights' entries
  from rolling up normally.
- `LifebloomDisciplineContent`: test asserting `showCards={false}` renders the
  explanatory line and mounts none of the five child cards.
- `Scorecard`: integration-level test (existing `index.test.tsx` patterns) covering a
  fight with zero Lifebloom casts end-to-end — grid tile shows no chip, detail page
  shows no chip and no per-metric cards.
