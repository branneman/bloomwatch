# Design: Story 401 — Mana curve & ending mana

Epic E (Mana economy), first story. Establishes the resource-data plumbing that
402 (consumable throughput) and 403 (Innervate audit) will reuse — 404 (HoT-aware
overheal) does not depend on it (overheal comes from Healing events, not resource
data).

## Backlog acceptance criteria (story 401)

> I want my mana-over-time curve with fight-end mana highlighted, so that I can
> see whether I hoarded mana (should have cast more Regrowths) or ran dry too
> early.
>
> - Curve rendered per fight from resource data; ending mana % shown as a number.
> - R/O/G (kills only): green 5–40% ending mana, orange 40–70% or 0–5%, red > 70%
>   (hoarding) — with an explicit note that short/easy fights make this metric
>   moot (auto-downgrade to informational for fights < 90 s).

## Data source (live-validated)

WCL's combat log does not emit an event for mana _spent_ on a cast — only mana
_gained_ (regen ticks, potions, runes) appears in the dedicated `Resources`
event stream. The mana-spend side has to come from elsewhere.

Live-probed against report `4GYHZRdtL3bvhpc8`, fight 6 (Dassz, the canonical
Tier 2/4/5 fixture druid — see `docs/testing.md`):

- `Casts` events fetched with `includeResources: true` carry a `classResources`
  array. Its field names are misleading relative to their actual content:
  - `classResources[0].type` is the **current** resource amount at the time of
    the cast (empirically: a steadily-decreasing value across Dassz's casts,
    9815 → 4536 over the fight, with small upward jumps consistent with regen
    during gaps between casts).
  - `classResources[0].amount` is the **max** resource pool (constant per
    character for the fight — confirmed both against `maxResourceAmount` on
    Dassz's own `Resources`-dataType regen-gain events, which independently
    read 9815, and against a warrior in the same fight whose `amount` was a
    constant `1000` — the internal 0–1000 scale WoW uses for rage, confirming
    this is a max-pool value, not an enum).
  - `classResources[0].max` and `.cost` do not have a reliable interpretation
    for our purposes (the `cost` field, in particular, does not match the
    actual mana delta between consecutive same-ability casts) and are not used.
  - Some `Casts` events lack `classResources` entirely (observed on a handful
    of Regrowth casts) — these are skipped, not treated as zero.
- `resourceActor` gates whose resource state is attached, same convention
  `docs/testing.md` already documents for `hitPoints`: **`Casts` events always
  attach the source's (caster's) own resource state** (`resourceActor: 1` on
  every sampled Dassz cast). **`Healing` events always attach the target's**
  (`resourceActor: 2` on all 43 of Dassz's own outgoing heal-tick events
  sampled) — i.e. Healing events with `includeResources` tell us about the
  _healed target's_ mana, never the healer's. This was the reason an earlier
  version of this design (sampling both Casts and Healing events for a denser
  curve) was corrected: Healing events cannot be used for the druid's own mana
  at all.

**Conclusion:** the druid's own mana can only be sampled from his own `Casts`
events (`sourceID === druidId`, `resourceActor === 1`). This is sparser than
hoped (no samples during any stretch without a cast) but still dense in
practice — roughly one sample every 2.3 s in the validated fight — and requires
no new dataType or query shape, only `includeResources: true` on a `Casts`
fetch, which `eventCache.ts` already supports as a cache-key dimension.

**Known limitation, accepted by design:** "ending mana" is the last such
sample, not a snapshot at the literal instant the fight ends. If the druid's
last cast lands meaningfully before the kill, the reported ending mana can be
stale relative to the true final value. This is called out in the card's
"why this threshold?" explainer rather than solved with additional fetches —
solving it precisely would require pulling the `Resources` gain-event stream
too and reconstructing forward from the last sample, which adds a second
dataType and reconstruction logic whose correctness could not be as cleanly
live-validated as the approach above.

This finding gets added to `docs/testing.md`'s "known real test reports" table
entry for `4GYHZRdtL3bvhpc8`, alongside the fight/actor IDs used, so the next
story that needs mana data (403) doesn't have to re-derive it.

## New shared module — `src/metrics/manaSamples.ts`

```ts
export interface ManaSample {
  timestampMs: number;
  currentMana: number;
  maxMana: number;
}

export function extractManaSamples(
  castEvents: WclEvent[],
  druidId: number,
): ManaSample[];
```

Filters `castEvents` to `sourceID === druidId`, `type === "cast"`,
`resourceActor === 1`, and a well-formed `classResources[0]` (both `type` and
`amount` present and numeric) — skipping anything else. Sorted ascending by
timestamp. Pure logic, no I/O — Tier 1 unit-tested with factory-built cast
events (`aCastEvent(...)` extended with `resourceActor`/`classResources`
overrides as needed).

This is the piece 403 (Innervate audit) will import later to read "own mana %
at cast" for the Innervate cast event specifically — no changes anticipated to
this module's shape when that happens, just a new caller.

## New metric — `src/metrics/manaCurve.ts`

```ts
export interface ManaCurvePoint {
  timestampMs: number;
  pct: number; // currentMana / maxMana * 100
}

export interface ManaCurveResult {
  points: ManaCurvePoint[];
  endingPct: number | null; // null when there are zero qualifying samples
  judgement: Judgement | null; // null when informational (see below)
}

export function computeManaCurve(
  castEvents: WclEvent[],
  druidId: number,
  isKill: boolean,
  fightDurationMs: number,
): ManaCurveResult;
```

- Calls `extractManaSamples`, maps to `{ timestampMs, pct }`.
- `endingPct` = last point's `pct`, or `null` if `points` is empty (e.g. druid
  never cast — card should say "no data" rather than imply 0%).
- `judgement`: computed via a local, non-exported `judgeManaBand(pct)` —

  ```ts
  function judgeManaBand(pct: number): Judgement {
    if (pct > 70) return "red";
    if (pct >= 5 && pct <= 40) return "green";
    return "orange"; // 40 < pct <= 70, or 0 <= pct < 5
  }
  ```

  — only when `isKill && fightDurationMs >= 90_000` and `endingPct !== null`;
  `null` otherwise (wipe, short fight, or no samples). This band shape (green
  in the middle, orange on both sides, red only at one extreme) doesn't fit
  either existing `judgeThreshold`/`judgeThresholdBelow` helper in
  `src/metrics/judgement.ts`, so it stays local — same precedent as
  `swiftmendAudit.ts`'s `judgeWastefulShare`.

Unit tests cover: band boundaries (exactly 5%, 40%, 70%), wipe → `null`,
<90 s kill → `null`, ≥90 s kill → real judgement, zero-samples → `endingPct:
null` and `judgement: null`.

## New UI primitive — `src/app/components/ui/ManaCurve/`

Ported from `docs/design_v2/source/shared.jsx`'s `ManaCurve` component: an SVG
area+line chart.

```ts
export interface ManaCurveProps {
  points: { timestampMs: number; pct: number }[];
  fightStartMs: number;
  fightEndMs: number;
  endingPct: number;
}
```

Normalizes each point's `timestampMs` to a `0–1` fraction of
`[fightStartMs, fightEndMs]` internally (the metric module stays unit-agnostic
in real timestamps; only this presentational component knows about the fight
window), builds the same `M/L` path + area-fill + ending-mana marker circle as
the design reference. No `innervateAt` prop yet — the design handoff documents
it as part of the eventual shared contract, but 403 doesn't exist yet, so it's
deferred rather than added unused now; adding it later is a one-line, additive
change to this component.

Styled per the design system's existing tokens (`--accent`, `--accent-bg`,
`--text-h`), matching `Histogram`/`StackedBar`'s existing pattern of a small
presentational `ui/` component with its own `index.module.css`.

## New card — `src/app/components/ManaCurveCard/`

Mirrors `GCDUtilizationCard`'s shape exactly: fetches `Casts` events with
`includeResources: true` in a `useEffect`, calls `computeManaCurve`, renders a
`MetricCard` (icon `inv_elemental_primal_mana`, title "Mana curve & ending
mana") with:

- `value`: `` `Ending mana: ${Math.round(endingPct)}%` `` or "No mana data"
  when `endingPct === null`.
- `judgement`: from the result (may be `null` → shows an informational note
  instead of a chip, same `MetricCard` behavior already used by Downranking's
  card).
- `threshold` text: the R/O/G bands, the kills-only/duration-90s caveat, and
  the "ending mana may be stale if the last cast wasn't near the kill" caveat.
- Body: the `ManaCurve` chart (only rendered when `points.length > 0`).

## New content wrapper — `src/app/components/ManaEconomyContent/`

Mirrors `SpellDisciplineContent`: a thin wrapper with no heading of its own,
holding just `ManaCurveCard` for now. 402–404 add their cards to this same
component later.

## Wiring — `epicSummary.ts` + `Scorecard`

- `epicSummary.ts` gets `summarizeManaEconomy(manaCurve: ManaCurveResult):
EpicSummary` — `judgement` is the mana curve's own judgement (worst-of is a
  no-op with a single metric, but keeps the shape consistent for 402–404 to
  extend), one stat line (`` `Ending mana: ${pct}%` `` or `"Ending mana: no
data"`).
- New `Scorecard/useManaEconomySummary.ts` hook, same shape as
  `useGcdEconomySummary.ts` (fetches `Casts` with `includeResources: true`,
  computes, wraps in `EpicSummaryStatus`).
- `Scorecard/index.tsx`: removes `"mana"` from `DISABLED_EPICS`, adds a real
  `Widget` (same icon already used in `DISABLED_EPICS`:
  `inv_potion_137`) wired to `useManaEconomySummary`, and an `activeEpic ===
"mana"` detail block rendering `ManaEconomyContent`, following the exact
  pattern already used for `gcd`/`lifebloom`/`spell`.

## Testing plan

- **Tier 1** (Vitest, co-located):
  - `src/metrics/manaSamples.test.ts` — extraction filtering (wrong source,
    wrong `resourceActor`, missing/malformed `classResources`), sort order.
  - `src/metrics/manaCurve.test.ts` — band boundaries, kills-only gating,
    <90 s downgrade, zero-samples case.
- **Tier 3** (Vitest + RTL, co-located):
  - `ManaCurveCard/index.test.tsx` — loading/error/ready states, judgement
    chip vs. informational note, "no data" case.
  - `ui/ManaCurve/index.test.tsx` — renders expected path/marker for a small
    fixed point set (behavior-focused: presence of the ending marker, not
    pixel-exact path assertions).
- **Docs:** `docs/testing.md`'s `4GYHZRdtL3bvhpc8` row gets a new sentence
  documenting the `classResources`/`resourceActor` finding above, so 403 can
  cite it instead of re-probing the live API.

## Out of scope (explicitly deferred to later stories)

- 402 (consumable throughput), 403 (Innervate audit), 404 (HoT-aware overheal)
  — not implemented here. `manaSamples.ts` is built now per explicit request so
  403 doesn't re-derive the `classResources` quirk, but its only caller today
  is `manaCurve.ts`.
- `innervateAt` marker on the `ManaCurve` UI component (403's concern).
- Any refinement of "ending mana" using the `Resources` gain-event stream.
