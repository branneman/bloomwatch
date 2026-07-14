# Design: HoT-aware overheal table (story 404)

## Summary

Story 404 (`docs/backlog.md`, Epic E — Mana economy): a per-spell overheal table judged
against spell-appropriate thresholds, so HoT overheal (inherent to the spell type) isn't
punished the same as wasteful direct-heal overheal.

Implemented as story 404 directly, skipping 403 (Innervate audit, not yet built) — the
backlog's ordering note says 402-404 all build on 401's resource-data plumbing, not on each
other in sequence, and 404 has no dependency on Innervate-cast logic.

A high-fidelity design reference already exists at `docs/design_v2/source/epic-e.jsx`
(`EpicEContent`'s fourth `MetricCard`, "HoT-aware overheal table") — colors/copy/table shape
are drawn from there; mock data is illustrative only.

## Acceptance criteria (from docs/backlog.md)

- Separate thresholds: HoT ticks (lenient — informational only), Lifebloom blooms, direct
  heals (strict).
- Bloom overheal R/O/G: green < 40%, orange 40–70%, red > 70%.
- Direct heal (Regrowth direct, Healing Touch, Swiftmend) R/O/G: green < 30%, orange 30–50%,
  red > 50%.

## Categorization

One pass over `Healing`-type events sourced by the druid, resolved via the existing
`resolvedAbilities: Map<number, ResolvedAbility>` (the same lookup `downrankingDiscipline.ts`
uses — no separate per-spell ability-ID-set props are needed for this metric).

| Category | Spell(s)                  | Event filter                                                                             | Row label                |
| -------- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| HoT tick | Rejuvenation              | `tick === true`                                                                          | "Rejuvenation"           |
| HoT tick | Regrowth (HoT portion)    | `tick === true`                                                                          | "Regrowth (HoT portion)" |
| Bloom    | Lifebloom                 | `tick !== true` (the bloom finisher — same detection `accidentalBlooms.ts` already uses) | "Lifebloom"              |
| Direct   | Regrowth (direct portion) | `tick !== true`                                                                          | "Regrowth (direct)"      |
| Direct   | Healing Touch             | all heal events (never ticks)                                                            | "Healing Touch"          |
| Direct   | Swiftmend                 | all heal events (never ticks)                                                            | "Swiftmend"              |

Nature's Swiftness / Innervate / Tranquility heal events are ignored — out of scope for this
table. Lifebloom's own periodic ticks are not reported (no row for them) — matching the
design reference, which shows Lifebloom only under Bloom.

Only rows for spells actually observed (≥ 1 matching heal event) this fight are included, same
convention as `downrankingDiscipline.ts`'s per-rank breakdown. Fixed sort order: HoT tick rows
first (Rejuvenation, then Regrowth-HoT), then Bloom (Lifebloom), then Direct (Regrowth-direct,
Healing Touch, Swiftmend) — matching the design reference's row order.

## Computation

Per row: sum `amount` and `overheal` across its matching events;
`overhealPct = overheal / (amount + overheal) * 100` (0 when both are 0, same guard as
`downrankingDiscipline.ts`).

## Judging

- HoT tick rows: `judgement: null` (informational, renders `—` in the Judgement column, no
  chip).
- Bloom row: `judgeThresholdBelow(overhealPct, { greenMax: 40, orangeMax: 70 })`.
- Direct rows: `judgeThresholdBelow(overhealPct, { greenMax: 30, orangeMax: 50 })`.
- Overall card judgement: `worstJudgement` of Bloom + Direct row judgements only (HoT-tick
  rows excluded from the calc, mirroring how Regrowth's clip rate stays informational-only in
  `hotClipDetection.ts`). If no Bloom/Direct rows exist this fight, `worstJudgement([])`
  defaults to `"green"` (existing helper behavior) — same as an empty-but-valid result
  elsewhere in the codebase.

## Module & component shapes

- `src/metrics/overhealTable.ts` — exports `computeOverhealTable(healingEvents, druidId,
resolvedAbilities)` returning `OverhealTableResult { rows: OverhealRow[]; judgement:
Judgement }`, where `OverhealRow { category: "hot-tick" | "bloom" | "direct"; spell: string;
amount: number; overheal: number; overhealPct: number; judgement: Judgement | null }`.
- `src/app/components/OverhealTableCard/index.tsx` — same shape as
  `DownrankingDisciplineCard`/`ConsumableThroughputCard`: fetches `Healing` with
  `includeResources: true` (reuses the cache entry other Epic D/E cards already populate via
  the same `(dataType, includeResources)` cache key), `MetricCard` icon
  `spell_nature_lightningoverload`, threshold text drawn from the acceptance criteria above. If
  `rows.length === 0`, render a "No heals to report" message instead of the table (same
  `DownrankingDisciplineCard` convention), still passing the (green-default) judgement to
  `MetricCard`.
- `DataTable` columns: `Category`, `Spell`, `Overheal %`, `Judgement` — category cell reads
  "HoT tick (informational)" / "Bloom" / "Direct" per the design reference; Judgement cell is
  `—` for HoT-tick rows, a `JudgementChip` otherwise.

## Wiring

- `ManaEconomyContent` gains a third card, appended after `ConsumableThroughputCard` (Innervate
  audit, story 403, isn't built yet, so this table is the last card for now).
- `useManaEconomySummary.ts` fetches/computes the new result alongside mana curve and
  consumable throughput, and `epicSummary.summarizeManaEconomy` takes it as a third parameter,
  folding its judgement into the mana-economy widget's worst-of. No new dashboard stat line —
  the widget stays capped at its existing 2 stats (ending mana, consumables), the same
  precedent as Downranking Discipline joining Spell Discipline's worst-of without its own stat
  line.

## Testing (per docs/testing.md)

- **Tier 1** (`src/metrics/overhealTable.test.ts`): categorization per spell/tick-flag,
  overheal% math, per-category thresholds, row exclusion when a spell wasn't cast, sort order,
  overall worst-of judgement, empty-result default.
- **Tier 3** (`OverhealTableCard/index.test.tsx`): loading/error/empty/populated states,
  correct columns and chip/dash rendering, mirroring `DownrankingDisciplineCard`'s test file.
- Existing tests to update for the new third argument: `ManaEconomyContent/index.test.tsx`,
  `Scorecard/useManaEconomySummary.test.ts`, `epicSummary.test.ts`.

## Out of scope

- Story 403 (Innervate audit) — not part of this story.
- Lifebloom periodic-tick overheal as its own row — not shown per the design reference.
- Any change to existing metrics' thresholds or behavior.
