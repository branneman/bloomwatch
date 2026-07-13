# Design: Story 303 — Downranking discipline

## Summary

A per-rank breakdown of the druid's direct-heal-bearing casts (Rejuvenation, Regrowth, Healing
Touch), so a resto druid can see whether they're using cheap ranks for routine healing and
saving max rank for when it's actually needed. Regrowth and Healing Touch get a judged "flag" on
wasteful max-rank casts; Rejuvenation is included for visibility only, with no flag.

## Scope decision: why Rejuvenation is informational-only, not flagged

`docs/backlog.md` story 303 as originally written scopes the flag to "direct heals (Regrowth,
Healing Touch)" only. In design review, the user (a practicing TBC resto druid) pointed out this
missed the rank they downrank most in real play — Rejuvenation (3 ranks in active rotation,
vs. 2 for Regrowth) — specifically for mana conservation and, situationally, for threat
management (e.g. Morogrim's murloc add-wave, where low-rank Rejuv reduces healing threat while a
tank gathers adds).

Rejuvenation has no direct-heal component at all (100% HoT), so the existing acceptance
criteria's flag mechanism — "> 50% overheal on a max-rank direct heal" — doesn't transfer
cleanly to it. HoT-tick overheal is a much noisier signal than direct-heal overheal: it's
entangled with raid-wide overlapping heals and, per the Morogrim example, with threat
management decisions logs can't see. This is the same reasoning story 404 (not yet built) will
use to treat HoT-tick overheal leniently/informationally, distinct from direct-heal overheal
thresholds — see `docs/backlog.md`'s roadmap principle 5 ("Honest about limits") and story 404's
acceptance criteria.

**Resolution:** Rejuvenation is added to the per-rank table for visibility (casts, avg effective
heal, overheal %) but is never flagged and never affects this card's judgement. The flag stays
scoped to Regrowth and Healing Touch, matching the original acceptance criteria.

## Flag-count thresholds

The flag count can only be 0, 1, or 2 (only two flaggable spells, one max-rank group each).
Per user decision: **green = 0 flags, orange = 1 or 2 flags, red = never.** Any flagging is
worth a look, but doesn't warrant the same severity as e.g. accidental Lifebloom blooms (story
203), whose red band reflects a more clear-cut process error.

## Data flow

Reuses events already fetched elsewhere in the Spell discipline epic — no new WCL query shapes:

- `Casts` events for the fight (druid's own casts).
- `Healing` events for the fight, `includeResources: true` (same params `SwiftmendAuditCard`
  and `useSpellDisciplineSummary` already request — the event cache dedupes on
  `(reportCode, fightId, dataType, includeResources)`, so no extra request fires).
- `resolvedAbilities: Map<number, ResolvedAbility>` — already threaded into
  `SpellDisciplineContent` for `NaturesSwiftnessCard`. No new `Set<number>` ability-ID props are
  added anywhere; this metric identifies its three tracked spells (and their ranks) purely via
  this map, unlike `hotClipDetection`/`swiftmendAudit`, which take explicit ability-ID sets.

## Metric logic (`src/metrics/downrankingDiscipline.ts`)

1. Filter the druid's `cast` events to those whose `abilityGameID` resolves (via
   `resolvedAbilities`) to a `spell` of `"Rejuvenation"`, `"Regrowth"`, or `"Healing Touch"`.
2. For each such cast, find its direct heal event: a `heal` event on the same `targetID`, same
   `abilityGameID`, `tick` not `true`, landing at or after the cast's timestamp within a
   `DIRECT_HEAL_MATCH_TOLERANCE_MS` window. Mirrors `swiftmendAudit.ts`'s existing
   `SWIFTMEND_MATCH_TOLERANCE_MS` match pattern (50ms).
   - Live-validated against report `4GYHZRdtL3bvhpc8`, fight 6 (Dassz): Regrowth's direct heal
     shares its `abilityGameID` with its own periodic ticks — distinguished only by `tick: true`
     on ticks — and the direct heal lands 0–3ms after the `cast` event (6 of 6 casts matched
     cleanly). Healing Touch is assumed to behave the same way (single instant heal fired on
     cast completion, no tick concept at all) since it wasn't observed in this druid's logs to
     confirm directly — reasonable given it's structurally identical to Swiftmend and Regrowth's
     direct component, both already confirmed. Document this new fact in `docs/testing.md`'s
     known-reports table.
   - A cast with no matching heal event is skipped (interrupted/no data), same rationale as
     `swiftmendAudit.ts`'s existing "skip rather than guess" comment.
3. Group matched casts by `(spell, rank)`. `rank` may be `null` (ability ID not confidently
   mapped to a rank, see `resolveAbilities.ts`'s comment on IDs like Healing Touch's `29339`) —
   these form their own group, displayed as "Rank —", never eligible for the max-rank flag.
4. Per group: `castCount`, `avgEffectiveHeal = totalAmount / castCount`,
   `directOverhealPct = totalOverheal / (totalAmount + totalOverheal) * 100` (0 if both are 0).
5. `isMaxRank = rank !== null && rank === getMaxRank(spell)`.
6. `flagged = isMaxRank && directOverhealPct > 50 && spell !== "Rejuvenation"`.
7. `judgement`: green if the total flagged-group count is 0, orange if ≥ 1.

### New helper: `getMaxRank` (`src/abilities/resolveAbilities.ts`)

```ts
export function getMaxRank(spell: DruidHealingSpell): number | null;
```

Derived from the existing `SPELL_RANKS` table (max rank number seen for that spell) — avoids a
second hardcoded rank-ceiling list that could drift from the resolution table.

## UI (`src/app/components/DownrankingDisciplineCard`)

Same shape as `SwiftmendAuditCard`/`HotClipDetectionCard`: fetch-on-mount with
loading/error/ready states keyed by `accessToken` (handles fight/druid changes and stale
responses the same way every other card in this epic does).

- `MetricCard`, icon `https://wow.zamimg.com/images/wow/icons/large/spell_nature_resistnature.jpg`
  (per `docs/design_v2`), title "Downranking discipline", `value` = flagged-group count summary,
  `judgement` from the metric result.
- Body: `DataTable` — columns Spell / Rank / Casts / Avg effective heal / Direct overheal % / (flag
  tag column). Rows ordered Rejuvenation → Regrowth → Healing Touch, ranks within a spell sorted
  high → low, "Rank —" group(s) last. Flagged rows get `<ClassTag tone="flagged">Flagged</ClassTag>`
  in the last column; unflagged rows get an empty cell (matches the design_v2 mockup).
- Threshold disclosure text explains: the flag definition, that it's scoped to Regrowth/Healing
  Touch only, and why Rejuvenation is shown informationally without a flag (short version of the
  scope-decision rationale above, in the same style as `HotClipDetectionCard`'s existing
  Regrowth-is-informational explanation).

### `ClassTag` — new `"flagged"` tone

Add `"flagged"` to `ClassTagProps.tone` and its CSS module, styled identically to the existing
`"wasteful"` tone (red) — matches `docs/design_v2/source/shared.jsx`'s `CLASS_TONE.flagged`
definition.

## Wiring changes

- `SpellDisciplineContent`: add `DownrankingDisciplineCard` between `SwiftmendAuditCard` and
  `NaturesSwiftnessCard` (backlog order 301 → 302 → 303 → 304; matches the design_v2 mockup
  order). No new props needed beyond what it already receives (`resolvedAbilities` is already
  passed through for `NaturesSwiftnessCard`).
- `src/metrics/epicSummary.ts`: `summarizeSpellDiscipline` gains a `downranking` parameter; its
  judgement joins the existing worst-of calc (`hotClips.rejuvenation.judgement`,
  `swiftmendAudit.judgement`) — same precedent as story 203's accidental-blooms judgement
  rolling into the Lifebloom epic summary. The `stats` array is unchanged (still the existing two
  lines) — story 701's acceptance criteria caps a dashboard widget at "1–2 key stats", so a third
  line isn't added; the judgement still moves the widget's worst-of chip even without its own
  stat line.
- `src/app/components/Scorecard/useSpellDisciplineSummary.ts`: gains a `resolvedAbilities`
  parameter (Scorecard already has this in scope — no new prop threading above Scorecard),
  computes `computeDownrankingDiscipline`, passes it to `summarizeSpellDiscipline`.

## Testing

- **Tier 1** (`src/metrics/downrankingDiscipline.test.ts`): grouping by spell/rank, the
  match-tolerance window, max-rank + overheal flag logic, Rejuvenation never flagging even at
  high overheal/max rank, unresolved-rank casts grouped separately and never flagged, judgement
  thresholds (0 → green, 1 → orange, 2 → orange). Plus a couple of cases in
  `resolveAbilities.test.ts` for `getMaxRank`.
- **Tier 3** (`src/app/components/DownrankingDisciplineCard/index.test.tsx`): loading, error, and
  populated states; flagged row renders the tag, unflagged doesn't — mirrors
  `SwiftmendAuditCard/index.test.tsx`'s existing shape.

## Non-goals

- No change to Healing Touch's or Rejuvenation's treatment elsewhere (story 301's HoT clip
  detection, story 302's Swiftmend audit) — this story only adds the new per-rank breakdown card.
- Does not attempt to judge _why_ a low rank was chosen (mana conservation vs. threat vs.
  laziness) — logs can't distinguish these, consistent with the roadmap's "honest about limits"
  principle. The card reports the pattern; the druid supplies the judgment call for anything the
  overheal-flag doesn't already cover.
