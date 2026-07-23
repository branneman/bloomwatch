# Faerie Fire duty detection and empirical metric-drag check (story 917, phase 1)

## Problem

Story 917 asks for two things that can't honestly be designed in one pass: (1) detect when a Balance-leaning healer is genuinely carrying Faerie Fire duty on the boss, then (2) mitigate whichever existing metrics that duty measurably drags down. The mitigation's exact mechanism can't be chosen before real data shows which metrics are actually affected — the story's own acceptance criteria says as much ("an implementation-time design decision, not predetermined here", "a metric that shows no real effect is recorded as checked, no mitigation needed").

This spec covers phase 1 only: build the Faerie Fire ability resolution, the FF-duty detector, and run the empirical corpus check the story calls for, ending in a findings write-up. A second spec (phase 2, written after these findings exist) designs and implements whatever mitigation is actually justified. Story 917 stays `🔲 Todo` until phase 2 lands too — only its own acceptance criteria being fully met marks it done, matching this repo's existing precedent (story 914 accumulated per-bullet "Resolved" findings across multiple sessions before being marked `✅ Done`).

## Research done during scoping (informs every design choice below)

All confirmed live against the real local corpus and WCL API this session:

- **Faerie Fire's real gameID is `26993`** (confirmed stable across two different reports' `masterData.abilities`). `27011` is "Faerie Fire (Feral)" — a separate, lesser ability Feral druids get for free in shapeshifted form, not the spell Improved Faerie Fire modifies. Only `26993`'s family counts.
- **WCL's `masterData.actors` (type: "NPC") carries `subType: "Boss"`** for real boss-tier enemies, confirmed live. Council fights carry multiple simultaneous `Boss`-tagged actors: Fathom-Lord Karathress + Fathom-Guards Caribdis/Sharkkis/Tidalvess (4 total), High King Maulgar + Blindeye the Seer/Krosh Firehand/Kiggler the Crazed/Olm the Summoner (5 total). Ordinary trash/adds spawned mid-encounter (Enchanted Elementals, Coilfang Guardians, etc.) are never `Boss`-tagged.
- **The existing `docs/calibration-archetypes.json` tagging has a real gap**: it buckets druids by talent points alone, with no check for whether that druid was actually healing. Found live: `mtRh3kJ9YMLazyvQ:Serpentx` (Balance 48, tagged `likely-dreamstate-full`) has `isRestoSpec: false` and only 26 total healing casts across 12 fights in the cached `calibration-data/mtRh3kJ9YMLazyvQ.json` — a pure Boomkin alt, not a healer at all. A second case, `JmpKPbvB3jRz9DdV:Toxickn` (11 total healing casts), shows the identical pattern. Both must be excluded from any "real Dreamstate healer" corpus query by filtering on healing participation (`healingCastCount`), not `isRestoSpec` (which is always `false` for a Balance-heavy build regardless of real healing role — WCL's own nominal spec label, not a role detector) and not talent points alone.
- **Real per-fight cast cadence** (41 genuinely-healing `likely-dreamstate-full` report:druid pairs sampled): single-boss fights show real refresh cadence clustering 20-37s (close to FF's own debuff duration), with cast-span coverage typically 60-96% of fight duration (min observed 41% in a legitimate case). Council fights break a combined single-cadence measurement entirely: casts interleave across multiple simultaneous boss targets, collapsing the apparent median interval to 1-7s — this is an artifact of mixing targets, not fast refreshing.
- **A confirmed one-off/incidental case**: `t3qNHgVKd46YDaj9` fight 12 (Fathom-Lord Karathress, 46s), druid Oxtaled — exactly 1 Faerie Fire cast, 36s into the pull, never repeated. Not FF duty by any reasonable definition.
- **A confirmed genuine-excellence case**: `gNYhK1ZAP7RQz2pa` fight 18 (Morogrim Tidewalker, 199s), druid Cowpop — real Debuff-event uptime tracking (not cast count) shows 98.5% uptime, applied 2.9s into the pull and refreshed every ~34-39s with zero gaps for the entire fight.
- **A confirmed council-fight reality check**: real per-target Debuff uptime on the 4 highest-cast-count Fathom-Lord Karathress fights in the corpus all show the same shape — the main boss gets 85-94% uptime, but all three Fathom-Guards get only 16-50% uptime each. Nobody in the corpus maintains FF across all 4 simultaneous council targets at once. This doesn't block phase 1 (the detector only needs a boolean "on duty" signal, not per-target uptime), but it's now documented on story 918's backlog entry as a hard constraint on that future metric's threshold calibration.
- **`fetchMasterDataAbilities` (`src/wcl/client.ts`) currently fetches only `masterData.abilities`** in its one query — no `actors` field at all. Extending it to also request `actors(type: "NPC") { id subType }` costs no extra WCL request (same round trip), consistent with story 010's no-redundant-queries precedent.
- **`calibration-data/*.json` already caches rich per-fight numeric detail** for every phase-1 candidate metric (`lifebloomDiscipline.refreshCadence`, `.accidentalBlooms`, `.restackTax`, and `manaEconomy`'s consumable-throughput/mana-curve figures) — no need to refetch any of that for the empirical check. Only FF-duty classification is new data.

## Scope

In scope:

- Faerie Fire ability resolution (own path, not `DruidHealingSpell`).
- Boss-tier NPC actor ID resolution, added to the existing single-request `masterData` fetch.
- A pure `computeFaerieFireDuty`-style detector (`src/metrics/*.ts`), unit-tested like every other metric in this codebase.
- Extending `scripts/lib/calibrateReport.ts` to compute FF-duty per fight for every corpus druid, cached into the existing `calibration-data/*.json` shape (so story 918 can reuse it later without redoing this work).
- A study comparing FF-duty vs. non-FF-duty fights (within the same archetype bucket) across the 4 candidate metrics named in story 917: LB3 refresh cadence (202), accidental blooms (203), re-stack tax (204), and mana curve / consumable throughput (401/402).
- A "Findings so far" paragraph added to story 917's own backlog entry, plus a dated section in `docs/thresholds.md`, per this repo's established calibration-write-up convention.

Out of scope (explicitly deferred):

- Any mitigation implementation for whichever metrics the findings show are dragged — that's phase 2, a separate spec written once these findings exist.
- Wiring the FF-duty detector into the live app's UI (no card, no judgement change to any existing metric happens in this phase).
- Story 918 (the Faerie Fire boss-uptime credit metric) — backlog entry already written, no design/implementation here.
- Fixing `docs/calibration-archetypes.json`'s tagging gap (healing-participation filtering) as a permanent, generalized change to the tagging pipeline itself — this phase works around it locally (filtering by `healingCastCount` at query time in the new analysis code) rather than rewriting `scripts/tagArchetypes.ts`. Worth a small future cleanup, not blocking here.

## Design

### 1. Faerie Fire ability resolution

New file `src/abilities/resolveFaerieFireAbilityIds.ts`, following story 906's gameID-first pattern (mirroring `resolveAbilities.ts`'s `SPELL_RANKS` table shape, but standalone since Faerie Fire is a debuff and explicitly excluded from `DruidHealingSpell`):

```ts
// gameID -> confirmed real "Faerie Fire" (not "Faerie Fire (Feral)") rank,
// sourced from wowhead's TBC Classic spell-family listing and cross-checked
// against live masterData.abilities pulls. 26993 is live-confirmed (this
// story's own scoping session, two different reports) as the rank showing
// up for a level-70 raider; lower ranks are filled in from wowhead alone
// pending a live sighting, following story 906's precedent for entries not
// yet confirmed against a real report.
const FAERIE_FIRE_GAME_IDS: ReadonlySet<number> = new Set([
  26993,
  // ...additional lower ranks compiled during implementation.
]);

// "Faerie Fire (Feral)" (gameID 27011, live-confirmed) is a separate,
// lesser ability Feral druids get for free in shapeshifted form -- not the
// spell Improved Faerie Fire modifies. Explicitly excluded, never counted.
const FAERIE_FIRE_FERAL_NAME = "Faerie Fire (Feral)";

export function resolveFaerieFireAbilityIds(
  reportAbilities: ReportAbility[],
): Set<number> {
  const ids = new Set<number>();
  for (const ability of reportAbilities) {
    if (FAERIE_FIRE_GAME_IDS.has(ability.gameID)) {
      ids.add(ability.gameID);
      continue;
    }
    if (
      ability.name === "Faerie Fire" &&
      ability.name !== FAERIE_FIRE_FERAL_NAME
    ) {
      ids.add(ability.gameID);
    }
  }
  return ids;
}
```

The exact lower-rank gameID list is compiled during implementation from wowhead, matching how every other spell table in this codebase was built (e.g. story 602's enchant/gem tables) — not enumerated here.

### 2. Boss-tier NPC resolution

Extend `fetchMasterDataAbilities` in `src/wcl/client.ts` to also request `actors(type: "NPC") { id subType }` in the same query (no extra WCL request). New exported function:

```ts
export interface ReportMasterData {
  abilities: ReportAbility[];
  bossActorIds: Set<number>;
}

export async function fetchMasterData(
  accessToken: string,
  reportCode: string,
  signal?: AbortSignal,
  host: Host = "fresh",
): Promise<ReportMasterData>;
```

(Exact name/shape decided during implementation — may keep `fetchMasterDataAbilities`'s existing name and signature and just widen its return type, to avoid touching every existing call site's name; a plan-time decision, not fixed here.) Filters `actors` to `subType === "Boss"` and returns the ID set. No per-fight enemy-list lookup is needed: a boss ID not present as a target in a given fight's own Casts/Debuffs events simply never matches, so the same report-wide set works correctly across every fight, including council fights with multiple simultaneous boss-tagged targets.

### 3. The FF-duty detector

New file `src/metrics/faerieFireDuty.ts`, a pure function following this codebase's `compute*` convention:

```ts
export interface FaerieFireDutyResult {
  onDuty: boolean;
  bossCastCount: number;
  castSpanMs: number;
}

export function computeFaerieFireDuty(
  castEvents: WclEvent[],
  druidId: number,
  faerieFireAbilityIds: Set<number>,
  bossActorIds: Set<number>,
  fightDurationMs: number,
): FaerieFireDutyResult;
```

Filters the druid's Faerie Fire casts to `targetID ∈ bossActorIds` (any boss-tier target, deliberately not "the" single boss — a council fight's guards all count). Provisional thresholds, sourced from this session's real corpus sampling above, both explicitly marked provisional pending a look during the empirical study itself:

- `onDuty` is `true` when `bossCastCount >= Math.max(2, Math.ceil(fightDurationMs / 80_000))` **and** `castSpanMs >= fightDurationMs * 0.5`.
- Otherwise `false`.

This deliberately does not attempt per-target cadence or uptime — the council-fight cadence-collapse problem found this session means a real per-target quality measurement needs the full Debuff-uptime tracking story 918 owns. Phase 1 only needs a boolean "did this druid genuinely carry FF duty this fight," which cast-count-and-span answers well enough (validated against both the confirmed one-off case and every genuine-duty case sampled this session).

Talent-bucket gating (`likely-dreamstate-full`, `likely-dreamstate-partial`, `mostly-balance` — `restokin-shaped` is currently unreachable per `classifyBucket`) happens at the call site (the calibration script for this phase; a future hook/card for phase 2), not inside this pure function — mirrors how `hasSwiftmend`/`hasNaturesSwiftness` gating is threaded into `deathForensics.ts`'s callers rather than baked into the compute function itself.

### 4. Empirical corpus study

Extend `scripts/lib/calibrateReport.ts` to, for each druid in a Balance-leaning bucket (per `classifyBucket`, gated additionally on `healingCastCount` exceeding a real-participation floor — this session's Serpentx/Toxickn correction), fetch that druid's Faerie Fire casts and the report's boss actor IDs, then compute `computeFaerieFireDuty` per fight and store the result alongside each fight's existing cached epic data in `calibration-data/*.json` (adding a sibling field to the existing per-fight object, not touching any existing field).

A small new analysis script (or an extension of an existing `scripts/lib/` module — plan-time decision) then, per candidate metric (refresh cadence median, accidental bloom count, re-stack tax count, ending mana % / consumable floor delta), splits each Balance-leaning-bucket druid's own fights into FF-duty vs. non-FF-duty groups and compares — a within-druid, within-bucket comparison (controls for skill and build, the same rigor this repo's other calibration stories, e.g. 909-911, already apply), reporting real percentile/median figures for each, not a pass/fail glance.

### 5. Output

- Story 917's own `docs/backlog.md` entry gains a "Findings so far" paragraph (matching story 914's incremental-resolution precedent) summarizing, per candidate metric, whether FF duty measurably drags the score — with real numbers, not an impression.
- `docs/thresholds.md` gains a dated section under wherever these metrics already live, documenting the same findings — same convention as every other Epic I calibration write-up.
- No metric's actual threshold or judgement logic changes in this phase — that's phase 2's job, informed by these findings.

## Testing

- `src/abilities/resolveFaerieFireAbilityIds.test.ts` (Tier 1): confirms `26993`-family IDs resolve, confirms `27011`/"Faerie Fire (Feral)" is never included even if present in the same report's abilities list, confirms an unrecognized gameID with the exact name "Faerie Fire" still resolves via the fallback.
- `src/metrics/faerieFireDuty.test.ts` (Tier 1): fixtures for (a) the confirmed one-off case shape (1 cast, short fight) → `onDuty: false`; (b) sustained single-target casting meeting both thresholds → `onDuty: true`; (c) casts on a non-boss target only → `onDuty: false` regardless of count; (d) casts split across multiple boss-tagged targets (council-fight shape) still correctly counted toward the combined `bossCastCount`/`castSpanMs`.
- `test/integration/client.test.ts` (Tier 2, MSW-mocked) additions for the widened `fetchMasterDataAbilities`/`fetchMasterData`: confirms `bossActorIds` filters correctly on `subType`, using an extended `test/integration/fixtures/masterdata-abilities.json` (its existing fixture already backs this same function's ability-resolution tests).
- No test changes needed for `calibration-data/*.json` consumers outside the calibration script itself — this phase adds no new UI-facing behavior.

## Out of scope (restated)

- Mitigation design/implementation for any metric (phase 2).
- Story 918 implementation.
- `docs/calibration-archetypes.json`'s tagging pipeline itself (worked around locally this phase, not fixed generally).
