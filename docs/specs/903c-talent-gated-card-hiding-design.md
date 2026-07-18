# Story 903c — Hide metrics whose prerequisite talent is unreachable (app): design

Spec for `docs/backlog.md` story 903c. Full acceptance criteria live there; this doc is the implementation design.

## Problem

`SwiftmendAuditCard` and `NaturesSwiftnessCard` both compute their metrics unconditionally, regardless of whether the selected druid's build can even reach the underlying talent. For a druid below Swiftmend's 30-point Restoration requirement, `SwiftmendAuditCard` renders "0 wasteful of 0 (0%)" with a **green** judgement — not because the druid played well, but because the spell was never available to cast in the first place. The same distortion applies to `NaturesSwiftnessCard`'s "usage vs. availability windows" count (informational, no judgement, but still a fabricated number), and to `DeathForensicsCard`'s `unspentCount` tally, which currently treats "no Swiftmend/Nature's Swiftness cast recorded before this death" as "the resource was ready and unused" — indistinguishable from "the druid never had this resource at all," a gap explicitly flagged (not fixed) during story 011 and recorded in `docs/backlog.md`'s notes on stories 302 and 501.

Story 903a's per-fight talent-archetype detection now makes the missing ingredient — real Restoration point counts, per fight — available. This story spends it to fix all three symptoms above, scoped to what a live user actually sees (the CLI calibration tool's separate pooling is out of scope — filed as story 907).

## Talent-threshold inventory

Researched and cross-validated against this repo's own already-verified talent-bucket facts (Swiftmend at 30 points, Tree of Life at 41 points — both already documented in `docs/backlog.md`). TBC's talent trees unlock one new tier every 5 points spent, uniformly across every class/tree — a well-established, uncontested game mechanic, not something specific to this research. Applying that rule: Swiftmend sits at tier 7 (→ 30 points, matching this repo's existing figure exactly) and Tree of Life at tier 9 (→ 40 points to unlock the tier, +1 spent on the capstone itself = 41, again matching this repo's existing figure exactly). This internal consistency is the confirmation basis for Nature's Swiftness's own tier: tier 5 → **20 points**.

- **Swiftmend quality audit** (story 302): Restoration ≥ 30.
- **Nature's Swiftness card**: Restoration ≥ 20.
- **Innervate audit** (story 403): not gated. Innervate is a base trainable spell available to every druid spec regardless of talent investment — confirmed via live research, no talent tree involvement at all.

No other card in the app has a talent prerequisite (the rest of Epic B-G's metrics — GCD economy, Lifebloom discipline, mana economy, prep hygiene, death forensics' own non-CD-readiness checks — all key off spells every resto build has by default).

## Architecture

### `src/report/archetypeDetection.ts`

Two new exported constants, alongside the existing `parseTalentPoints`:

```ts
// Sourced from TBC's universal 5-points-per-talent-tier rule applied to
// Nature's Swiftness's tier-5 placement (tier N unlocks at 5*(N-1) points) —
// cross-validated against this file's own already-verified figures:
// Swiftmend (tier 7 -> 30 points) and Tree of Life (tier 9 -> 40 points to
// unlock + 1 spent on the capstone = 41) both match this repo's existing,
// live-data-confirmed thresholds exactly.
export const NATURES_SWIFTNESS_MIN_RESTORATION = 20;
export const SWIFTMEND_MIN_RESTORATION = 30; // tier 7; already used informally elsewhere in docs/backlog.md, now a real exported constant
```

### `useArchetypeBucket` extension

`ArchetypeBucketStatus`'s ready variant gains a `restoration: number` field — the raw point count `parseTalentPoints` already computes internally but currently discards after classification. Purely additive: existing consumers (`Scorecard`'s archetype line) are unaffected. `restoration` defaults to `0` when talents can't be read (`unknown-no-talent-data` bucket) — the conservative choice, since `0` fails every gate, hiding a card rather than showing a possibly-wrong judgement when eligibility itself is uncertain.

### Cards without their own talent fetch: `SwiftmendAuditCard`, `NaturesSwiftnessCard`

Both call `useArchetypeBucket` in addition to their existing fetch. Render `Calculating…` until _both_ the card's own data and archetype status resolve; once both are ready, render the placeholder instead of real content when `restoration` is below that card's threshold:

```tsx
<MetricCard icon={ICON} title="Swiftmend quality audit" threshold={THRESHOLD}>
  <p>
    Not shown — this build can't take Swiftmend (needs{" "}
    {SWIFTMEND_MIN_RESTORATION}+ Restoration points; this fight's build has{" "}
    {archetypeStatus.restoration}).
  </p>
</MetricCard>
```

### Hooks/cards with their own multi-dataType fetch: `useSpellDisciplineSummary`, `useDeathForensicsSummary`, `DeathForensicsCard`

Each adds `"CombatantInfo"` to its existing `Promise.all` and calls `parseTalentPoints` (the plain function, not the hook — these already have their own async boundary, so nesting a second hook would mean coordinating two independent resolution lifecycles for no benefit) inside the existing `.then`.

- `useSpellDisciplineSummary` computes `hasSwiftmend = restoration >= SWIFTMEND_MIN_RESTORATION` and passes it to `summarizeSpellDiscipline(hotClips, swiftmendAudit, downranking, hasSwiftmend)`.
- `useDeathForensicsSummary` and `DeathForensicsCard` each compute `hasSwiftmend`/`hasNaturesSwiftness` and pass both as two new parameters to `computeDeathForensics(...)`.

### `summarizeSpellDiscipline` (`src/metrics/epicSummary.ts`)

Gains a `hasSwiftmend: boolean` parameter. When `false`, Swiftmend's judgement is excluded from the `worstJudgement([...])` pool and its stat line is omitted from the returned `stats` array — the pooled "Spell discipline" epic judgement (shown on both `Scorecard`'s overview widget and `ReportDashboard`'s whole-report rollup, since both consume `useSpellDisciplineSummary`) treats a talent-unreachable Swiftmend as absent, not a spurious green. Nature's Swiftness never entered this pool (it carries no judgement of its own today) — no change needed there.

### `computeDeathForensics` (`src/metrics/deathForensics.ts`)

Gains two new boolean parameters, `hasSwiftmend` and `hasNaturesSwiftness`. `swiftmendReady`/`nsReady` become:

```ts
const swiftmendReady =
  hasSwiftmend && isReady(swiftmendCasts, timestampMs, SWIFTMEND_COOLDOWN_MS);
const nsReady =
  hasNaturesSwiftness &&
  isReady(nsCasts, timestampMs, NATURES_SWIFTNESS_COOLDOWN_MS);
```

Both call sites (`useDeathForensicsSummary`, `DeathForensicsCard`) must pass the two new booleans in the same order — flagged explicitly since `CLAUDE.md` calls out same-typed-parameter reordering as the one class of bug `npm run typecheck` won't catch.

Story 302's own Swiftmend-availability note (its "usage vs. availability windows" informational text reading as missed opportunities that were never available) is resolved as a side effect of hiding the whole card — no separate fix needed there.

## Out of scope

- `scripts/lib/rollup.ts` / `scripts/calibrate.ts`'s own talent-aware pooling — filed as story 907, a separate vertical slice (the CLI tool doesn't fetch talent data at all today; adding that is its own integration point, independent of this story's app-side work).
- Story 903d (onboarding notice) and any healing-role-based gating (903b's mechanism — different reason for hiding/excluding, already shipped).
- Any new talent-gated card beyond the three identified above — the inventory in this doc is exhaustive for the app as it exists today.

## Testing

- `src/report/archetypeDetection.test.ts` — no new tests needed for the two new plain constants themselves (nothing to unit-test about a literal number); their correctness is exercised through every consumer below.
- `useArchetypeBucket.test.ts` — update existing exact-match (`toEqual`) assertions to include the new `restoration` field; add a case confirming `restoration` reads `0` for the `unknown-no-talent-data` path.
- `SwiftmendAuditCard.test.tsx` / `NaturesSwiftnessCard.test.tsx` — new cases: placeholder renders at Restoration one point below threshold (29 / 19), real content renders at exactly the threshold (30 / 20) and above.
- `deathForensics.test.ts` — new cases proving `swiftmendReady`/`nsReady` are forced `false` when `hasSwiftmend`/`hasNaturesSwiftness` is `false`, even with zero prior casts of that ability recorded (the exact inflation bug being fixed) — and unchanged (`true` when actually ready) when the corresponding flag is `true`.
- `useSpellDisciplineSummary.test.ts` — new case: a Swiftmend-ineligible fixture whose Swiftmend sub-metric would otherwise read green/wasteful-0% doesn't appear in the pooled judgement or stats.
- `useDeathForensicsSummary.test.ts` / `DeathForensicsCard.test.tsx` — new case: a Swiftmend-ineligible druid's death-readiness tally doesn't count Swiftmend as an unspent resource.
- Real-data spot-check: `bKRZ68XqgwYkxtzm` (Neepzendruid, 26 Restoration, already in `docs/testing.md`) — Swiftmend quality audit hidden (26 < 30), Nature's Swiftness card visible (26 ≥ 20). `4GYHZRdtL3bvhpc8` (Dassz, 49 Restoration, deep-resto) — both cards render normally, as a control.
