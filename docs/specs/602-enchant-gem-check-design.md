# Story 602 — Enchant & gem check — design

## Story

> I want each of my enchantable gear slots checked for a recognized healer-appropriate permanent
> enchant, and each socketed gem checked for a recognized healer-appropriate stat, at pull, so
> that gaps in gearing prep are caught the same way missing flask/food/weapon-oil already are by
> story 601.

Epic G (prep hygiene), second story — extends 601's `computePrepHygiene` rather than adding a new
epic/card. 601 is done; its `gear` array is already fetched via the same `CombatantInfo` event
this story reads further into.

**Acceptance criteria** (`docs/backlog.md` story 602) — see that entry for the full text,
including the live-confirmed `gear` shape. Summarized here:

- ID-matched (never name-matched), reusing `computePrepHygiene`'s existing fetch/match pattern —
  no new WCL query.
- Enchant coverage judged on 9 slots: Head, Shoulder, Back, Chest, Wrist, Hands, Legs, Feet,
  MainHand (permanent enchant — new scope, distinct from 601's existing MainHand _temporary_
  weapon-oil check at the same index).
- Gem judgement scoped to _only the gems actually present_ — WCL's `CombatantInfo` gear entries
  cannot distinguish an empty socket from no socket at all (confirmed live: `gems` key is either
  absent or non-empty, never `[]`).
- Meta gem gets its own recognized-good check, scoped to "is a good meta ID present," not whether
  its activation bonus is met (also invisible in this data).
- Two open questions left to this spec, both resolved below: rep/profession-gated slot handling,
  and the exact good/fair/bad count thresholds — **revised after direct discussion of specific
  cases** (the Aldor Honored/Exalted shoulder enchant) into a tiered model rather than a strict
  binary recognized/not check.

## Judgement calls resolved during design

1. **Rep/profession-gated slots (Head needs Sha'tar exalted, Legs needs Tailoring) are judged
   identically to every other slot** — an unenchanted Head or Legs slot counts as a genuine miss
   toward `enchantCoverage`, not an exemption. Rationale: an unenchanted slot is real lost
   throughput regardless of _why_ it's unenchanted, and 601 already sets the precedent of judging
   plain presence/absence (food, oil) with no situational carve-outs. The one concession is a UI
   copy difference (see below) acknowledging the gate for these two specific slots, so the verdict
   doesn't read as "you forgot" when the real barrier might be "you haven't unlocked this yet" —
   text, not judgement logic.
2. **Enchant and gem recognition is tiered (`bis` / `acceptable` / `missing`), not a strict
   binary.** Prompted directly by a real case: the Aldor faction's shoulder enchant has two
   legitimate rungs — Honored (_Inscription of Faith_, +29 healing) and Exalted (_Greater
   Inscription of Faith_, +33 healing +4 mp5) — and a strict single-ID check would wrongly read
   Honored as "missing." The same shape recurs elsewhere (e.g. Legs: Golden vs. Silver
   Spellthread as a genuine budget-but-legitimate choice; gems: a hybrid stat gem that
   legitimately beats a socket-bonus's math). `bis` = the top recognized choice for that slot;
   `acceptable` = a legitimate lesser/alternate choice — **counts as fully covered, does not
   degrade the judgement at all**; `missing` = no enchant/gem present, or present but matches
   neither list. Only `missing` counts toward the count-based bands below — an all-Honored-tier
   druid reads identically to an all-Exalted one.
3. **Enchant coverage bands (of 9 judged slots, counting only `missing`): good = 0, fair = 1–3,
   bad = 4+.** Deliberately wide, per direct request — with tiering already absorbing legitimate
   lesser choices, only real, unambiguous gaps count against the band at all, so the remaining
   count only needs to separate "basically prepped" from "meaningfully under-enchanted." No
   exemplar data exists yet for this metric (unlike Lifebloom/mana/GCD, which went through Epic I
   calibration passes against real corpora) — this is a reasoned initial default, not a calibrated
   one, and is marked provisional in `docs/thresholds.md` pending a future calibration pass, the
   same posture Swiftmend utilization shipped with initially (story 802/909's note).
4. **Gem coverage folds "wrong/unrecognized colored gem" and "unrecognized/missing meta" into one
   combined count**, rather than two separate judged rows, to keep Prep Hygiene's row count from
   growing past what `MetricCard`/the overview widget can reasonably summarize. Bands: good = 0,
   fair = 1–2, bad = 3+ — proportionally similar width to the enchant band above, narrower in
   absolute terms only because a typical geared druid has fewer gem sockets (~8-9) than judged
   enchant slots. Same tiering (`bis`/`acceptable`/`missing`) and same provisional status as (3).
5. **Meta-gem detection is simplified to ID-membership on the Head slot's `gems` array only**
   (WoW always places the meta socket in Head), checked against a small recognized-meta tier list
   (again `bis`/`acceptable` — e.g. Insightful vs. Bracing Earthstorm Diamond may both be
   legitimate depending on mana-vs-throughput preference; exact membership is an implementation
   research question, not decided here). This can't distinguish "no meta socket on this item" from
   "meta socket present but empty or wrong" — same category of limitation as the general
   empty-socket gap already documented in the backlog story. Any Head-slot gem ID that isn't in
   the recognized meta tier list is treated as "meta not recognized," which is a real, accepted
   false-positive risk for players on a headpiece with no meta socket at all wearing only a color
   gem there. Flagged here rather than solved — a candidate for a future refinement once real gear
   data shows how often this actually misfires (same "flag now, revisit with real data" pattern as
   903's restokin note).
6. **`acceptable`-tier items get a soft, informational-only UI note** ("could upgrade") rather
   than being rendered identically to `bis` — see UI section below. This is purely descriptive
   copy; it does not change `enchantCoverage.judgement`/`gemCoverage.judgement`, which only ever
   look at the `missing` count.
7. **The overview widget's two existing stat lines (`flaskOrElixirStat`, `foodOilStat` in
   `summarizePrepHygiene`) are left unchanged.** Story 701 caps a widget at 1–2 stat lines, both
   slots are already spent, and mana economy already sets the precedent of an epic with more
   sub-metrics than stat-line slots (`docs/specs` — see the completed 402 spec, now deleted, for
   that call). The overall `judgement` chip already reflects the new rows via `mixedJudgement`
   (extended to 5 inputs) — drilling into the full `PrepHygieneCard` is how a user sees the
   enchant/gem detail, exactly like today's flask/food/oil rows.

## ID compilation (deferred to implementation, method fixed here)

No enchant/gem IDs are hardcoded in this spec. Per this repo's own established sourcing
discipline (story 906's locale work, 601's `SUPERIOR_WIZARD_OIL_ENCHANT_ID`), guessed numeric IDs
are not acceptable — every ID must be cross-checked against real data before being committed. This
session's own research already confirms the _shape_ of the problem (real bis/acceptable rungs
exist — Aldor Honored vs. Exalted shoulder, per a live search this session; Golden vs. Silver Leg
Spellthread, per the same search) but not yet exact numeric IDs, which a single AI web-summary
tool is not a reliable enough source for on its own (this session's own Icy Veins fetch returned
at least one claim — "Glyph of Renewal from Thrallmar/Honor Hold rep" — that doesn't match this
project's own prior knowledge of that enchant's actual source, and is exactly the kind of
single-source error story 906 already found once with wowhead's Italian pages). The implementation
plan's first task compiles two-tier (`bis`/`acceptable`) tables for `SLOT_ENCHANT_IDS`,
`COLOR_GEM_IDS`, and `META_GEM_IDS` by:

1. Sourcing candidate names _and_ their tier (bis vs. a genuinely legitimate lesser alternative,
   not just "any other option") from at least two independent TBC Classic resto-druid healer
   prep/BiS guides (e.g. Wowhead and Icy Veins, cross-checked against each other) — matching 601's
   own sourcing for its flask/elixir names, but with the two-source cross-check story 906's
   Italian-wowhead finding shows is worth the extra step here.
2. Resolving each candidate to a numeric enchant/gem ID via Wowhead's TBC-Classic item/enchant
   pages (item/enchant detail pages carry the numeric ID directly).
3. Cross-checking against at least one real live `CombatantInfo` capture (`npm run wcl:query`
   against a `docs/testing.md`-listed report with a known well-geared druid, e.g.
   `4GYHZRdtL3bvhpc8`) — the same live-validation step this session already used to confirm the
   `gear` array's shape, and the same method `SUPERIOR_WIZARD_OIL_ENCHANT_ID`'s comment cites. A
   real geared druid's report is also the fastest way to discover additional legitimate
   `acceptable`-tier alternates this spec hasn't anticipated (e.g. a prior content phase's version
   of an enchant) — worth scanning a couple of real reports' gear, not just the guide text.
4. Each table entry gets a source comment, per principle 3 (mirrors `BATTLE_ELIXIR_NAMES` etc.'s
   existing comment style in `prepHygiene.ts`), explicitly noting which tier it belongs to and why.

## Metric module — `src/metrics/prepHygiene.ts` (extended in place)

```ts
export type EnchantableSlot =
  | "Head"
  | "Shoulder"
  | "Back"
  | "Chest"
  | "Wrist"
  | "Hands"
  | "Legs"
  | "Feet"
  | "MainHand";

// WoW's fixed 19-slot equipment order — same convention MAIN_HAND_GEAR_INDEX already
// documents. Ring/Neck/Waist/Trinket/OffHand/Ranged/Tabard are never enchantable in TBC
// (or not relevant for a healer) and are excluded.
export const ENCHANTABLE_SLOT_INDEXES: Record<EnchantableSlot, number> = {
  Head: 0,
  Shoulder: 2,
  Back: 14,
  Chest: 4,
  Wrist: 8,
  Hands: 9,
  Legs: 6,
  Feet: 7,
  MainHand: 15, // permanent enchant; distinct from the existing temporaryEnchant check
};

export type GearTier = "bis" | "acceptable";

// Sourced from at least two independent TBC Classic resto-druid prep guides,
// cross-checked against each other and against live CombatantInfo captures
// (see docs/testing.md). Filled in during implementation — see
// docs/specs/602-enchant-gem-check-design.md's "ID compilation" section. Each
// entry records its tier and a source comment per principle 3.
export const SLOT_ENCHANT_IDS: Record<
  EnchantableSlot,
  Partial<Record<number, GearTier>>
> = {
  /* e.g. Shoulder: { [GREATER_INSCRIPTION_OF_FAITH_ID]: "bis", [INSCRIPTION_OF_FAITH_ID]: "acceptable" } */
};
export const COLOR_GEM_IDS: Partial<Record<number, GearTier>> = {/* ... */};
export const META_GEM_IDS: Partial<Record<number, GearTier>> = {/* ... */};

interface CombatantGearEntry {
  temporaryEnchant?: number;
  permanentEnchant?: number;
  gems?: { id: number }[];
}

export interface EnchantCoverageResult {
  missingSlots: EnchantableSlot[]; // slots with no recognized (bis or acceptable) enchant
  acceptableSlots: EnchantableSlot[]; // slots on the acceptable tier — informational only, doesn't affect judgement
  judgement: Judgement;
}

export interface GemCoverageResult {
  missingOrWrongCount: number; // unrecognized colored gems + (1 if meta not recognized, else 0)
  acceptableCount: number; // gems present on the acceptable tier — informational only
  metaGemRecognized: boolean; // false covers both "wrong/unrecognized meta" and "no gem in Head's meta slot"
  metaGemTier: GearTier | null; // null when metaGemRecognized is false
  judgement: Judgement;
}

export interface PrepHygieneResult {
  flaskOrElixir: FlaskOrElixirResult;
  foodBuffPresent: boolean;
  weaponOilPresent: boolean;
  enchantCoverage: EnchantCoverageResult;
  gemCoverage: GemCoverageResult;
  judgement: Judgement;
}
```

- **`computeEnchantCoverage(gear: CombatantGearEntry[]): EnchantCoverageResult`** — for each of
  the 9 `ENCHANTABLE_SLOT_INDEXES` entries, reads `gear[index]?.permanentEnchant` and looks up its
  tier in that slot's `SLOT_ENCHANT_IDS`; `"bis"` or `"acceptable"` both count as covered (the
  latter also recorded in `acceptableSlots`), absent-or-unrecognized counts as missing.
  `judgeEnchantCoverage(missingSlots.length)`: good `=== 0`, fair `1–3`, bad `>= 4` (judgement
  call 3).
- **`computeGemCoverage(gear: CombatantGearEntry[]): GemCoverageResult`** — iterates every gear
  entry's `gems` array (not slot-restricted, since any slot can carry color gems); each gem `id`
  looked up in `COLOR_GEM_IDS` — `"bis"`/`"acceptable"` both count as covered (`acceptable`
  increments `acceptableCount`), unrecognized increments the wrong count. Separately checks
  `gear[ENCHANTABLE_SLOT_INDEXES.Head]?.gems` for `META_GEM_IDS` membership to set
  `metaGemRecognized`/`metaGemTier` (judgement call 5). `missingOrWrongCount = wrongColorGemCount +
(metaGemRecognized ? 0 : 1)`. `judgeGemCoverage`: good `=== 0`, fair `1–2`, bad `>= 3` (judgement
  call 4).
- **`computePrepHygiene`** gains the two new fields; its `mixedJudgement` call grows from 3 to 5
  inputs: `[flaskOrElixirJudgement, foodBuffPresent ? "good" : "bad", weaponOilPresent ? "good" :
"bad", enchantCoverage.judgement, gemCoverage.judgement]`. Signature is unchanged
  (`combatantInfoEvents, druidId`) — no call-site changes needed anywhere `computePrepHygiene` is
  already invoked (per `CLAUDE.md`'s note on this function's two independent consumers,
  `scripts/lib/calibrateReport.ts` picks up the new fields automatically).

## UI components

### `src/app/components/PrepHygieneCard/index.tsx`

Two new rows, same `flaskRow`-style structure (`JudgementChip` + descriptive `<span>`, not
`ChecklistRow`, since these summarize a count across multiple slots rather than one boolean):

```tsx
<div className={styles.flaskRow}>
  <JudgementChip judgement={enchantCoverage.judgement} />
  <span>
    {enchantCoverage.missingSlots.length === 0
      ? "All 9 enchantable slots enchanted"
      : `Missing/unrecognized enchant: ${enchantCoverage.missingSlots.join(", ")}`}
    {enchantCoverage.acceptableSlots.length > 0 && (
      <em className={styles.upgradeNote}>
        {" "}
        (upgrade available: {enchantCoverage.acceptableSlots.join(", ")})
      </em>
    )}
  </span>
</div>
<div className={styles.flaskRow}>
  <JudgementChip judgement={gemCoverage.judgement} />
  <span>
    {gemCoverage.missingOrWrongCount === 0
      ? "All gems recognized, meta gem correct"
      : `${gemCoverage.missingOrWrongCount} gem(s) wrong or unrecognized${gemCoverage.metaGemRecognized ? "" : " (including meta)"}`}
    {gemCoverage.acceptableCount > 0 && (
      <em className={styles.upgradeNote}>
        {" "}
        ({gemCoverage.acceptableCount} on an upgradeable tier)
      </em>
    )}
  </span>
</div>
```

`styles.upgradeNote` is purely visual de-emphasis (e.g. muted color, matching how the app already
de-emphasizes secondary context elsewhere) — it carries no judgement weight of its own (judgement
call 6); it renders only when `acceptableSlots`/`acceptableCount` is non-empty, so a fully-BiS
druid never sees it.

`THRESHOLD` copy gains sentences covering the new rows' rules (the bis/acceptable tiering and
that only `missing` counts against the good/fair/bad bands, the 9-slot list, and — per judgement
call 1 — an explicit note that Head/Legs are judged the same as any other slot even though they're
rep/profession-gated) and a caveat sentence about the empty-socket detection limitation (judgement
calls 4/5), matching principle 3's "every threshold documented, with a source pointer"
requirement. No other prop or behavior changes — same fetch-once-on-mount, same
`Calculating…`/error branches.

### `src/metrics/epicSummary.ts` — `summarizePrepHygiene`

No signature change (still takes the one `PrepHygieneResult`). No new stat line (judgement call 7) — `judgement` is recomputed for free since it's read straight from `prep.judgement`, which
`computePrepHygiene` already extended.

## Testing

- **Tier 1** (`src/metrics/prepHygiene.test.ts`, extending the existing file):
  `computeEnchantCoverage` — 0/1–3/4+ missing slots hit good/fair/bad; a slot on the `acceptable`
  tier counts as fully covered (not missing, appears in `acceptableSlots`, does not move the
  judgement) — a dedicated test asserts an all-`acceptable` druid (e.g. every slot at Honored
  rather than Exalted) still reads `good`, the exact case that prompted the tiered design; a slot
  with an unrecognized (neither-tier) enchant ID counts the same as a slot with none; MainHand's
  _permanent_ enchant is read independently of its existing _temporary_ weapon-oil check (a
  MainHand with the right oil but no permanent enchant still counts as a missing MainHand enchant
  slot).
  `computeGemCoverage` — 0/1–2/3+ missing-or-wrong hits good/fair/bad; an `acceptable`-tier gem
  counts as covered (increments `acceptableCount`, not `missingOrWrongCount`); a recognized color
  gem in a non-enchantable slot (e.g. a ring) still counts toward coverage since gem-checking
  isn't slot-restricted; meta recognized vs. not (both `bis` and `acceptable` meta tiers), including
  the "no gems on Head at all" case (treated as meta-not-recognized, per judgement call 5's
  accepted limitation — worth a comment in the test itself since it documents a real false-positive
  risk, not just expected behavior).
  `computePrepHygiene`'s overall `judgement` reflects a bad enchant or gem row via the extended
  `mixedJudgement` call the same way an existing bad flask/food/oil row already does.
- **Tier 3**: `PrepHygieneCard`'s two new rows render correctly for a fully-prepped combatant
  (factory default extended with recognized IDs) and for a combatant with gaps in each row
  independently; `usePrepHygieneSummary`'s existing tests need no new assertions (signature/stat
  lines unchanged) beyond confirming the overall status still resolves correctly.
- `src/testUtils/factories.ts`'s `aCombatantInfoEvent` gains realistic `permanentEnchant`/`gems`
  values on its default (currently all-empty `{}` gear entries per slot) once the real IDs are
  compiled, so every existing Prep Hygiene test that doesn't override `gear` keeps passing without
  every call site needing to opt in to the new fields.

No new WCL event shapes or queries are introduced — `CombatantInfo` events are already fetched by
601/903a, and this story's live confirmation of the `gear` array's `permanentEnchant`/`gems`/
`setID` fields (this session, report `4GYHZRdtL3bvhpc8`) is the validation `docs/testing.md`'s
existing entry for that report should be extended with once implemented.

## Docs to update on completion (per `CLAUDE.md`'s "paperwork" rule)

- Mark 602 `✅ Done` in `docs/backlog.md`.
- Delete this spec and its paired plan.
- Add the two new Prep Hygiene rows to `docs/thresholds.md`'s existing table, marked provisional
  per judgement calls 3/4.
- Extend `docs/testing.md`'s `4GYHZRdtL3bvhpc8` entry with the `permanentEnchant`/`gems`/`setID`
  confirmation from this session (currently only documents `temporaryEnchant`).
- Update `CLAUDE.md`'s "Repo state" paragraph to include 602 in the completed-stories list.
