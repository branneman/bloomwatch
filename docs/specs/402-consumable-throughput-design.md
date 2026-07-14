# Story 402 — Consumable throughput — design

## Story

> I want counts of mana potions and Dark/Demonic Runes used vs. the expected floor for the fight
> length (separate 2-minute cooldowns each), so that unused consumable cooldowns become visible.

**Acceptance criteria** (`docs/backlog.md`):

- Expected floor per consumable = ⌊fight duration / 120 s⌋ for fights where mana dropped below
  70% at any point; fights that never did are exempt.
- R/O/G per consumable: green ≥ floor, orange = floor − 1, red ≤ floor − 2.

Epic E (mana economy), second story. Depends on 401's resource-data plumbing per
`docs/backlog.md`'s ordering note ("402–404 reuse 401's resource-data plumbing") — 401 is done.

## Judgement calls resolved during brainstorming

1. **Dark Rune and Demonic Rune are combined into one "Rune" row**, not tracked/judged as two
   independent consumables. They share one in-game cooldown (using either puts both on
   cooldown), so counting them separately would double-count what is really one resource slot.
   "Separate 2-minute cooldowns each" in the story text means _potions_ and _runes_ are separate
   cooldown categories from each other — not that Dark and Demonic Runes are separate from one
   another. The design mockup (`docs/design_v2/source/epic-e.jsx`) shows a lone "Dark Rune" row,
   but that's illustrative sample data only (per the handoff's own fidelity note), not a literal
   spec for the row set.
2. **No kill restriction**, unlike 401's mana-curve judgement. The acceptance criteria gates
   solely on "mana dropped below 70% at any point" — nothing about kills vs. wipes. A wipe where
   the druid ran the mana tank dry is exactly the kind of fight this metric should still judge.

## Metric module — `src/metrics/consumableThroughput.ts`

```ts
export type ConsumableLabel = "Mana Potion" | "Rune";

export interface ConsumableRow {
  label: ConsumableLabel;
  used: number;
  expectedFloor: number;
  judgement: Judgement;
}

export interface ConsumableThroughputResult {
  exempt: boolean; // mana never dropped below 70% — informational only
  rows: ConsumableRow[]; // empty when exempt
  judgement: Judgement | null; // null when exempt
}

export function computeConsumableThroughput(
  castEvents: WclEvent[],
  druidId: number,
  resolvedAbilities: Map<number, ResolvedAbility>,
  fightDurationMs: number,
): ConsumableThroughputResult;
```

- **Mana-drop check**: reuse `extractManaSamples(castEvents, druidId)` (401's plumbing, same
  `Casts` events with `includeResources: true` a card already fetches) and test whether any
  sample's `currentMana / maxMana * 100 < 70`. If not, return `{ exempt: true, rows: [],
judgement: null }` immediately — no floor is computed, matching 401's own "no data" shape
  (`endingPct: null`) for the not-applicable case.
- **Floor**: `Math.floor(fightDurationMs / 120_000)`. A fight under 2 minutes yields floor 0,
  which is still meaningful — 0 used trivially satisfies green rather than being a separate
  special case.
- **Counts**: filter `castEvents` to `sourceID === druidId && type === "cast"`, resolve each via
  `resolvedAbilities.get(abilityGameID)`, keep entries where `kind === "consumable"`. `item ===
"Mana Potion"` increments the potion count; `item === "Dark Rune"` or `"Demonic Rune"` both
  increment the single rune count (per judgement call 1).
- **Per-row judgement**: `judgeAgainstFloor(used, floor)` — green `used >= floor`, orange `used
=== floor - 1`, red otherwise (`used <= floor - 2`, per `docs/backlog.md` story 402). This isn't
  `judgeThreshold`/`judgeThresholdBelow` from `judgement.ts` (those are two-cutoff monotonic
  bands); it's its own small function, same precedent as `manaCurve.ts`'s `judgeManaBand`.
- **Row-level result** is always two rows (Mana Potion, Rune) when not exempt, in that fixed
  order — even a fight with 0 floor and 0 used still shows both rows as green, so the card always
  has a consistent shape.
- **Fight-level judgement**: `worstJudgement(rows.map((r) => r.judgement))`.

## UI components

Follows the exact structure every prior epic story uses
(`src/app/components/*Card`, `Scorecard/use*Summary.ts`, `metrics/epicSummary.ts`).

### `src/app/components/ConsumableThroughputCard`

Same fetch/render shape as `ManaCurveCard` and `DownrankingDisciplineCard`: fetches `Casts`
events (`includeResources: true`) via the `fetchEvents` prop (the same events `extractManaSamples`
and the potion/rune counts both need — one fetch, deduplicated further by story 006's event
cache if `ManaCurveCard` already requested the same fight's `Casts`), calls
`computeConsumableThroughput`, renders one `MetricCard`.

```ts
export interface ConsumableThroughputCardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  resolvedAbilities: Map<number, ResolvedAbility>;
  fetchEvents: (...) => Promise<WclEvent[]>;
}
```

- `icon`: `spell_shadow_sealofkings` (per `docs/design_v2/README.md`'s icon assignment for this
  card).
- `threshold`: states the floor formula and the green/orange/red rule verbatim from the backlog,
  plus a note that Dark and Demonic Runes are counted together (principle 3 requires every
  threshold to be documented and sourced, and this is a judgement call this design makes beyond
  the literal backlog text, so it needs to be visible on the card too).
- **Exempt state**: `value` omitted, `note="Informational — mana never dropped below 70%"` (same
  `note`-prop pattern `ManaCurveCard` uses for its own informational states), body text explains
  why, no table.
- **Judged state**: `value` = worst-of judgement chip is already shown by `MetricCard`'s own
  `judgement` prop; body renders a `DataTable` (`Consumable | Used | Expected floor | Judgement`,
  `JudgementChip` per row) — same column shape as the design mockup.
- Loading/error states follow the identical two-branch pattern every existing card uses
  (`Calculating…` / `role="alert"` error paragraph).

### `src/app/components/ManaEconomyContent`

Gains a `resolvedAbilities: Map<number, ResolvedAbility>` prop and mounts
`ConsumableThroughputCard` after `ManaCurveCard`, passing it through.

### `src/metrics/epicSummary.ts`

`summarizeManaEconomy` gains a second parameter:

```ts
export function summarizeManaEconomy(
  manaCurve: ManaCurveResult,
  consumableThroughput: ConsumableThroughputResult,
): EpicSummary {
  return {
    judgement: worstJudgement([
      manaCurve.judgement,
      consumableThroughput.judgement,
    ]),
    stats: [
      manaCurve.endingPct === null
        ? "Ending mana: no data"
        : `Ending mana: ${Math.round(manaCurve.endingPct)}%`,
      consumableThroughput.exempt
        ? "Consumables: not mana-constrained"
        : consumableThroughput.rows
            .map(
              (r) =>
                `${r.label === "Mana Potion" ? "Potions" : "Runes"}: ${r.used}/${r.expectedFloor}`,
            )
            .join(", "),
    ],
  };
}
```

This uses the widget's second stat-line slot, which was unused until now (`docs/backlog.md`
story 701 caps a dashboard widget at 1-2 stats; mana economy only had 1 before this story).

### `Scorecard/useManaEconomySummary.ts`

Gains a `resolvedAbilities` parameter (same position/shape `useSpellDisciplineSummary` already
takes it), fetches the same `Casts` events already being fetched for the mana curve (one
`fetchEvents` call reused for both `computeManaCurve` and `computeConsumableThroughput` — no
second network-shaped call, just two pure functions over the same event array), and passes both
results into `summarizeManaEconomy`.

### `Scorecard/index.tsx`

`resolvedAbilities` is already threaded through `Scorecard`'s props (used by
`SpellDisciplineContent` already) — no new prop plumbing needed above `Scorecard` itself. Two
call sites change:

- `useManaEconomySummary(...)` call gains `resolvedAbilities` as an argument.
- The `activeEpic === "mana"` block's `<ManaEconomyContent ... />` gains `resolvedAbilities=
{resolvedAbilities}`.

## Testing

- **Tier 1** (`src/metrics/consumableThroughput.test.ts`): exemption when mana never drops below
  70% (returns `exempt: true`, empty rows, `null` judgement); floor arithmetic at duration
  boundaries (exactly 120s, 119s, 241s); Dark Rune and Demonic Rune both incrementing the same
  rune count; each of green/orange/red for both rows independently; a wipe fight still judged
  normally when the mana-drop condition is met (no kill filtering); non-druid casts and
  non-consumable casts ignored.
- **Tier 3**:
  - `ConsumableThroughputCard`: loading, error, exempt (informational note, no table), and
    judged (table with correct rows/chips) states.
  - `ManaEconomyContent`: renders both `ManaCurveCard` and `ConsumableThroughputCard`.
  - `epicSummary.test.ts`: `summarizeManaEconomy`'s new second stat line and worst-of judgement
    across both metrics.
  - `useManaEconomySummary.test.ts`: both metrics computed from one fetch, `resolvedAbilities`
    threaded through.

No new WCL event shapes are introduced — `Casts` with `includeResources: true` is already
fetched and fixture-covered by story 401's Tier 2 work, and mana-potion/rune ability resolution
already exists in `resolveAbilities.ts` (story 007). No new live WCL validation or fixtures are
needed for this story.

## Docs to update on completion (per `CLAUDE.md`'s "paperwork" rule)

- Mark 402 `✅ Done` in `docs/backlog.md`.
- Delete this spec and its paired plan.
- Update `CLAUDE.md`'s "Repo state" paragraph to include 402 in the completed-stories list.
