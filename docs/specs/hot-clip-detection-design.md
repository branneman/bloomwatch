# HoT Clip Detection (Story 301) — Design

Ships backlog story 301: a count of Rejuvenation/Regrowth refreshes that clipped remaining
ticks, graded independently per spell, surfaced as a new "HoT clip detection" card under a
newly-enabled "Spell discipline" epic tile.

## Background

`docs/design_v2` is an existing, already-adopted design handoff (the current `Scorecard`
already implements its dashboard/drill-down shape 1:1, including the `spell` epic's icon and
placement in `DISABLED_EPICS`). Its `source/epic-d.jsx` mockup defines the UI shape for this
card exactly: one `MetricCard` titled "HoT clip detection" with a two-row `DataTable`
(`Spell | Casts | Clips | Clip %`) and prose above it. That mockup hardcodes illustrative
numbers only — the metric computation and its underlying data model are this story's actual
design work.

## Real-data validation

Pulled live via the WCL API (`4GYHZRdtL3bvhpc8`, fight 34 — Lady Vashj, Dassz, added to
`docs/testing.md`'s known-reports table) to ground the duration constants and confirm event
shapes, since the app's own client-side event filtering (`event.sourceID !== druidId`, no
server-side query filter — see `lifebloomStacks.ts`/`restackTax.ts`) is what matters, not the
WCL GraphQL query-arg semantics used for this ad hoc investigation:

- **Rejuvenation** (`26982`, self-cast on Dassz): 6 natural full-duration instances observed
  (apply → remove with no intervening refresh), all 12006–12023ms. Duration = **12000ms**,
  consistent across all ranks (only mana cost/heal-per-tick scale by rank in TBC, never
  duration).
- **Regrowth** HoT component (`26980`, cast on raid members): 4 natural full-duration
  instances, all 26971–27009ms. Duration = **27000ms** (9 ticks). Cross-checked against
  `Healing` event tick timestamps for one instance (target 37, applied 4264944): 9 periodic
  ticks at ~3000ms spacing, last tick's timestamp exactly matching the `removebuff` timestamp
  (4291950) — confirms both the 3s tick interval the acceptance criteria's ">1 tick (>3s)"
  language assumes, and the 27000ms total duration.
- **Swiftmend consumption is structurally distinct from a refresh.** Swiftmend cast at
  `2024118` (fight 6, same report) lines up with a HoT `removebuff` at `2024119` — Swiftmend
  removes the aura, it never fires `refreshbuff`. Since clip detection only triggers on
  `refreshbuff`, Swiftmend-consumed HoTs are excluded with no special-case code, satisfying the
  acceptance criteria's explicit "clips consumed by Swiftmend are excluded" note as a natural
  consequence of the event model rather than a rule to implement.

Both durations are fixed per-report constants, hardcoded with a citation comment (same
precedent as `restackTax.ts`'s `LIFEBLOOM_MANA_COST`) rather than derived empirically per
report: a skilled druid may never let a HoT expire naturally within a given fight, making
per-report derivation unreliable, whereas TBC's HoT durations are engine constants that don't
vary by rank or gear.

## Metric module — `src/metrics/hotClipDetection.ts`

Mirrors `restackTax.ts`'s shape (buff + cast events in, per-spell result out), but per-spell
rather than per-target, and duration-based rather than stack-based (no shared timeline
reconstruction needed — Rejuvenation/Regrowth aren't stacking buffs, so `lifebloomStacks.ts`
doesn't apply here).

```ts
const REJUVENATION_DURATION_MS = 12_000; // see docs/specs/hot-clip-detection-design.md
const REGROWTH_DURATION_MS = 27_000; // (live-validated against 4GYHZRdtL3bvhpc8 fight 34)
const CLIP_THRESHOLD_MS = 3_000; // "> 1 tick (> 3s) remaining" per docs/backlog.md story 301

export interface HotClipEvent {
  timestampMs: number;
  targetId: number;
  spell: "Rejuvenation" | "Regrowth";
}

export interface HotClipSpellResult {
  spell: "Rejuvenation" | "Regrowth";
  castCount: number;
  clipCount: number;
  clipPct: number;
  judgement: Judgement;
}

export interface HotClipDetectionResult {
  rejuvenation: HotClipSpellResult;
  regrowth: HotClipSpellResult;
  clipEvents: HotClipEvent[]; // merged, time-sorted, for the deep-link list
}

export function computeHotClipDetection(
  buffEvents: WclEvent[],
  castEvents: WclEvent[],
  druidId: number,
  rejuvenationAbilityIds: Set<number>,
  regrowthAbilityIds: Set<number>,
): HotClipDetectionResult;
```

Algorithm, run once per spell (parameterized by ability-ID set + duration constant), then
merged:

1. Filter `buffEvents` to `sourceID === druidId` and `abilityGameID` in the spell's ability-ID
   set. Group by `targetId`.
2. Walk each target's timeline in timestamp order, tracking `expiryMs: number | null`:
   - `applybuff` → `expiryMs = timestamp + duration`.
   - `refreshbuff` → if `expiryMs !== null && expiryMs - timestamp > CLIP_THRESHOLD_MS`, record
     a clip event at this timestamp/target/spell. Then reset `expiryMs = timestamp + duration`
     regardless (the refresh always sets a fresh full-duration aura, clip or not).
   - `removebuff` → `expiryMs = null` (covers both natural expiry and Swiftmend consumption —
     either way there's nothing to clip against until the next `applybuff`).
3. `castCount` per spell = count of `cast`-type `castEvents` with `sourceID === druidId` and
   `abilityGameID` in that spell's ability-ID set (matches `restackTax.ts`'s cast-counting
   filter, which already excludes `begincast`).
4. `clipPct = clipCount / castCount * 100` (0 if `castCount === 0`); judgement via
   `judgeThresholdBelow(clipPct, { greenMax: 5, orangeMax: 15 })` — green <5%, orange 5–15%,
   red >15%, per story 301's acceptance criteria.
5. `clipEvents` = both spells' clip events merged and sorted by timestamp, for the card's
   deep-link list.

No mana estimate (unlike `restackTax.ts`) — not part of this story's acceptance criteria.

## `epicSummary.ts` addition

```ts
export function summarizeSpellDiscipline(
  hotClips: HotClipDetectionResult,
): EpicSummary {
  const judgement = worstJudgement([
    hotClips.rejuvenation.judgement,
    hotClips.regrowth.judgement,
  ]);
  return {
    judgement,
    stats: [
      `Rejuvenation clips: ${hotClips.rejuvenation.clipPct.toFixed(1)}%`,
      `Regrowth clips: ${hotClips.regrowth.clipPct.toFixed(1)}%`,
    ],
  };
}
```

## New shared UI primitive — `src/app/components/ui/DataTable`

Plain bordered table per `docs/design_v2/source/shared.jsx`'s `DataTable`, rebuilt as a real
TypeScript component with a CSS module (matching `StackedBar`/`Card`/etc.'s convention — no
inline styles in the `ui/` layer):

```ts
export interface DataTableProps {
  columns: string[];
  rows: ReactNode[][];
}
export function DataTable({ columns, rows }: DataTableProps);
```

Generic and reusable — the design doc calls it out as shared across the Swiftmend log (302),
downranking table (303), and consumable/overheal tables (401/601), so it's real infrastructure
for this epic, not speculative scope for this story.

## New card — `src/app/components/HotClipDetectionCard`

Follows `RestackTaxCard`'s structure exactly (fetch `Buffs` + `Casts`, compute, render
`MetricCard`):

- Icon: `https://wow.zamimg.com/images/wow/icons/large/ability_druid_empoweredrejuvination.jpg`
  (hotlinked constant, same pattern as `Scorecard/index.tsx`'s `GCD_ECONOMY_ICON` — per
  `docs/design_v2`'s icon convention, nothing here is a local asset).
- Header judgement = worst of the two spells' judgements (reuse `worstJudgement`).
- Body: a `DataTable` with columns `Spell | Casts | Clips | Clip %`, one row per spell
  (`Rejuvenation`, `Regrowth`), each row's Clip % cell paired with a small `JudgementChip` for
  that spell's own verdict.
- Below the table: a time-sorted `<ul>` of `clipEvents`, each linking to that moment in WCL via
  `buildFightTimeUrl` (same pattern as `RestackTaxCard`/`AccidentalBloomsCard`), labeled with
  spell name, formatted time, and target name (`targetNames.get(...)` fallback to
  `Target #<id>`).
- Threshold text: explains the >1-tick/>3s clip rule, the Swiftmend exclusion, and the
  green<5%/orange5–15%/red>15% bands (mirrors `docs/design_v2`'s mockup copy).

## Epic wiring

- **`src/app/components/SpellDisciplineContent`** — parallel to `LifebloomDisciplineContent`,
  currently mounting just `HotClipDetectionCard` (302–304 will add cards here later).
- **`src/app/components/Scorecard/useSpellDisciplineSummary.ts`** — parallel to
  `useLifebloomDisciplineSummary.ts`, fetches `Buffs`+`Casts`, calls
  `computeHotClipDetection` + `summarizeSpellDiscipline`.
- **`Scorecard/index.tsx`**: move `"spell"` out of `DISABLED_EPICS` into a real `Widget` +
  `activeEpic === "spell"` detail block (same shape as the existing `"lifebloom"` block), using
  icon `spell_nature_ravenform` (already the icon used for the disabled tile today, per
  `docs/design_v2`'s epic-icon table — unchanged, just enabled).
- **`App.tsx`**: add `rejuvenationAbilityIds`/`regrowthAbilityIds` via
  `resolveSpellAbilityIds(resolvedAbilities, "Rejuvenation" | "Regrowth")`, threaded through
  `canGetScorecard`'s readiness check and down into `Scorecard`.

## Testing

Per `docs/testing.md`'s tiers: unit tests for `computeHotClipDetection` (Tier 1, synthetic
buff/cast event fixtures covering: a clean clip, a legitimate late refresh with <1 tick left,
Swiftmend consumption _not_ counted as a clip, zero-cast spell producing 0% not `NaN`), a
component test for `HotClipDetectionCard` and the new `DataTable` (Tier 3), and
`epicSummary.test.ts` coverage for `summarizeSpellDiscipline`'s worst-of logic. No new Tier 2
fixture capture needed — the live queries above were exploratory validation, not fixture
capture (existing `Buffs`/`Casts` fixtures already cover the event shapes involved).

## Docs housekeeping

- Add report `4GYHZRdtL3bvhpc8` fight 34 (Lady Vashj) to `docs/testing.md`'s known-reports
  table, noting what it validated (Rejuvenation/Regrowth HoT durations, Swiftmend-vs-refresh
  event distinction).
- Mark story 301 `✅ Done` in `docs/backlog.md` and delete this spec file (and the
  implementation plan file) once shipped, per CLAUDE.md's paperwork convention.
