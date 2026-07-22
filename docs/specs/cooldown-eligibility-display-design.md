# Hide talent-ineligible cooldown rows in Death forensics / Crisis response

## Problem

`DeathForensicsCard` (Death forensics) and `NearDeathResponseCard` (Crisis
response) both display a per-Swiftmend and per-Nature's-Swiftness "ready /
on cooldown" row for every death/crisis, via the shared-shape `DeathCard`
and `CrisisCard` UI components (`src/app/components/ui/DeathCard`,
`src/app/components/ui/CrisisCard`):

```
["Swiftmend available", swiftmendReady ? "Ready" : "On cooldown"],
["Nature's Swiftness available", nsReady ? "Ready" : "On cooldown"],
```

`swiftmendReady`/`nsReady` are `false` in two completely different
situations that this text collapses into one:

1. The druid has the ability and it's genuinely on cooldown.
2. The druid's talent build can never reach the ability at all (e.g. a
   Dreamstate build below Swiftmend's 30-Restoration requirement).

Story 903c already fixed the _judgement_ math for this: `swiftmendReady`
and `nsReady` are computed as `hasSwiftmend && isReady(...)` /
`hasNaturesSwiftness && isReady(...)` in both
`computeDeathForensics` (`src/metrics/deathForensics.ts`) and
`computeNearDeathResponse` (`src/metrics/nearDeathResponse.ts`), so an
ineligible resource is correctly never counted in `unspentCount`. What's
left is purely a display bug: the row still renders "On cooldown" for a
resource the build can never have, reading as a real missed opportunity
that never existed.

Confirmed independently gated, not archetype-bucketed: Nature's Swiftness
requires 20 Restoration, Swiftmend requires 30
(`NATURES_SWIFTNESS_MIN_RESTORATION`, `SWIFTMEND_MIN_RESTORATION` in
`src/report/archetypeDetection.ts`). A Dreamstate build can land anywhere
from 0-29 Restoration points, so a real Dreamstate druid (e.g. 35/0/26) can
have Nature's Swiftness without Swiftmend. The fix must treat the two
resources independently in every case, never assume "Dreamstate implies
neither."

## Scope

Display-only. No changes to:

- `src/metrics/deathForensics.ts` / `src/metrics/nearDeathResponse.ts` —
  `judgeDeathReadiness`, `unspentCount`, and all threshold values are
  already correct per 903c.
- `scripts/lib/calibrateReport.ts` — it consumes `DeathForensicsResult`
  for its numeric fields only; nothing here changes that shape.
- `docs/thresholds.md` — no threshold or formula changes; nothing to
  record there.

Everything changes in the two Card components and the two shared display
components they render.

## Design

### Threading eligibility to the display layer

`DeathForensicsCard` and `NearDeathResponseCard` already compute both
eligibility booleans locally, once per fight, right before calling their
respective `compute*` function:

```ts
const talents = parseTalentPoints(combatantInfoEvents, druidId);
const restoration = talents === null ? 0 : talents[2];
// ... restoration >= SWIFTMEND_MIN_RESTORATION
// ... restoration >= NATURES_SWIFTNESS_MIN_RESTORATION
```

Rather than growing `DeathForensicsResult`/`NearDeathResponseResult`'s
public shape (and therefore `scripts/lib/calibrateReport.ts`'s contract)
for a value that's only needed for display, both Cards carry these two
booleans in their own local fetch-result state alongside the existing
`result`, and pass them straight through as two new props —
`hasSwiftmend: boolean`, `hasNaturesSwiftness: boolean` — to every
`DeathCard`/`CrisisCard` instance they render for that fight. The value is
the same for every death/crisis in a given fight (it depends only on the
druid's talents that fight), so it's passed once per Card render, not
derived per-item.

### DeathCard / CrisisCard changes

Both components gain `hasSwiftmend`/`hasNaturesSwiftness` props. Row
construction becomes conditional:

- `DeathCard`: the "Swiftmend available" row is included only if
  `hasSwiftmend`; the "Nature's Swiftness available" row only if
  `hasNaturesSwiftness`. The LB3, target, and idle-preceding rows are
  unaffected.
- `CrisisCard`: same two rows, same conditions, nested inside the
  existing `if (!responded)` block that already gates whether cooldown
  rows show at all for a given crisis.

When both are ineligible, only the rows unrelated to talent-gated
cooldowns remain (target/LB3/idle for `DeathCard`; HP/maintained/responded/
idle for `CrisisCard`). No row ever reads "On cooldown" for a resource the
build cannot reach.

### Card-level explanatory note

Because eligibility is constant for the whole fight, repeating a caveat on
every single death/crisis row would be noisy. Instead, `DeathForensicsCard`
and `NearDeathResponseCard` each render one additional
`<Alert tone="warning">`, alongside their existing warning alert, only
when at least one resource is ineligible for that fight's druid. Composed
dynamically since the two gate independently:

- both missing: "This build's talents can't reach Swiftmend or Nature's
  Swiftness; those rows aren't shown."
- Swiftmend only: "This build's talents can't reach Swiftmend; that row
  isn't shown."
- Nature's Swiftness only: "This build's talents can't reach Nature's
  Swiftness; that row isn't shown."
- neither missing (the common case): no note rendered at all.

This note renders unconditionally once the fight's data has loaded (no
fetch/compute error), the same way the two Cards' existing caveat `Alert`
already renders regardless of whether that fight had any deaths/crises at
all.

## Testing

- `DeathForensicsCard`/`index.test.tsx` and
  `NearDeathResponseCard`/index.test.tsx already have a fixture using a
  26-Restoration `CombatantInfo` talent shape (the real Dreamstate case:
  below Swiftmend's 30, at/above Nature's Swiftness's 20). Extend those
  tests to assert:
  - The Swiftmend row is absent from the rendered death/crisis card.
  - The Nature's Swiftness row is still present and shows Ready/On
    cooldown normally.
  - The new note reads the Swiftmend-only variant.
- Add a fixture for full ineligibility (e.g. 0 Restoration) asserting both
  rows are absent and the note reads the combined variant.
- Add/confirm a fixture for full eligibility (Restoration >= 30) asserting
  both rows render and no note appears.
- No changes needed to `deathForensics.test.ts`/`nearDeathResponse.test.ts`
  (metrics-layer unit tests) — this is UI-layer behavior only.

## Out of scope

- Any change to which resources count toward `unspentCount` or to
  `judgeDeathReadiness`'s bands — already correct per 903c.
- Archetype-bucket-based gating (`useArchetypeBucket`) — eligibility here
  is derived directly from the fight's own real talent points, same as
  the existing code already does, not from the coarser archetype bucket.
- `docs/thresholds.md` updates — no threshold changed.
