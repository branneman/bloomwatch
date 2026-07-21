# Story 602 (Enchant & Gem Check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Prep Hygiene (story 601) with two new judged rows — permanent-enchant coverage
across 9 gear slots, and gem/meta-gem recognition — using a tiered `bis`/`acceptable`/`missing`
classification so legitimate lesser-but-real choices (e.g. an Aldor Honored-tier enchant before
reaching Exalted) don't read as a gap.

**Architecture:** `src/metrics/prepHygiene.ts` (extended in place, not a new file/epic) gains two
new pure functions, `computeEnchantCoverage` and `computeGemCoverage`, each driven by a
module-level ID-recognition table compiled from real research (Task 1) rather than guessed.
`computePrepHygiene`'s existing `mixedJudgement` call grows from 3 to 5 inputs. `PrepHygieneCard`
gains two new rows. No new WCL query, no new epic/card, no signature changes to any existing
function's public parameters.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library — matches the rest of the repo
(no new dependencies).

## Global Constraints

- No enchant/gem numeric ID may be invented — every ID in Task 1's tables must trace to (a) a
  named guide source and (b) either a Wowhead TBC-Classic item/enchant page or a live
  `CombatantInfo` capture, per principle 3 and this repo's established sourcing discipline (story
  906, 601's `SUPERIOR_WIZARD_OIL_ENCHANT_ID`). Do not proceed past Task 1 with placeholder IDs
  left in application code.
- The `bis`/`acceptable`/`missing` tiering from `docs/specs/602-enchant-gem-check-design.md`
  (judgement calls 2-6) is load-bearing — do not collapse it back to a strict binary "recognized
  or not" check; that was explicitly rejected during design because it misjudges real, legitimate
  gear choices (Aldor Honored vs. Exalted).
- Full-project `npm run typecheck && npm run lint && npm run format:check` must pass before each
  commit (enforced by the pre-commit hook — do not bypass it).
- Design spec: `docs/specs/602-enchant-gem-check-design.md` — read it before starting; it resolves
  every judgement call this plan's code depends on (gated-slot handling, band widths, tiering,
  meta-gem simplification, UI treatment).

---

### Task 1: Research and compile enchant/gem/meta-gem recognition tables

This is a research task, not a code-first TDD task — its deliverable is verified data, not
behavior. **Do not write any application code in this task.**

**Files:**

- Produces (for Task 2 to consume verbatim): a documented list of named `const ..._ID = <number>;`
  declarations, one per recognized enchant/gem choice, each tagged `bis` or `acceptable` with an
  inline source comment — ready to paste into `src/metrics/prepHygiene.ts`.

**Method** (per the spec's "ID compilation" section):

- [ ] **Step 1: Gather candidates from two independent guides**

For each of the 9 enchantable slots (Head, Shoulder, Back, Chest, Wrist, Hands, Legs, Feet,
MainHand-permanent — distinct from the existing MainHand temporary weapon-oil enchant) and for
gems (colored + meta), search at least two independent TBC Classic resto-druid healer
prep/enchant/gem guides (e.g. Wowhead's guide, Icy Veins, Warcraft Tavern). For each slot, record:
the `bis` choice, and any genuinely legitimate `acceptable` alternate (a real lower-rep-tier or
budget option that both sources treat as a reasonable interim choice — not just "any other item
that fits the slot"). Where the two sources disagree or only one mentions a claim, do not include
it without independent corroboration — this session's own Icy Veins auto-fetch already produced
one unverifiable/likely-wrong claim (a rep-source attribution for Glyph of Renewal), which is
exactly the failure mode to guard against here.

- [ ] **Step 2: Resolve each candidate to a numeric ID via Wowhead**

Wowhead's TBC-Classic item/enchant/spell detail pages carry the numeric ID directly (in the URL
and/or page contents, e.g. `.../tbc/spell=<id>/<name>` or `.../tbc/item=<id>/<name>`). Resolve
every candidate name from Step 1 to its numeric ID this way. A permanent-enchant ID is the
_spell/effect_ ID (same kind of ID as `SUPERIOR_WIZARD_OIL_ENCHANT_ID`, not an item ID); a gem ID
is the _item_ ID for the gem itself.

- [ ] **Step 3: Cross-check against live `CombatantInfo` data**

Run `npm run wcl:query` (per `CLAUDE.md`'s guidance, `$WCL_TEST_ACCESS_TOKEN` referenced only as
an env var, never inlined) against `events(dataType: CombatantInfo)` for at least one
`docs/testing.md`-listed report with a known well-geared druid (`4GYHZRdtL3bvhpc8` fight 6 is
already confirmed this session to expose `permanentEnchant`/`gems`/`setID` on its `gear` array —
reuse it as the primary check; scan a second report too if time allows, since a real geared
druid's report is also the fastest way to surface additional legitimate `acceptable`-tier
alternates the guides didn't mention). For each candidate ID from Step 2, check whether it
actually appears as a `permanentEnchant`/`gems[].id` value on a real druid in the capture — a
match is strong positive confirmation; absence is not disqualifying on its own (a real player may
not be full BiS) but should prompt a second look at the guide sourcing before trusting an
unconfirmed ID.

- [ ] **Step 4: Write the final constant list**

Produce named constants, each with a one-line source comment (guide name(s) + tier), e.g.:

```ts
// Aldor Exalted shoulder enchant — 33 healing + 4 mp5 (Wowhead + Icy Veins, cross-checked).
const GREATER_INSCRIPTION_OF_FAITH_ID = 0; // REPLACE with real researched ID
// Aldor Honored shoulder enchant — 29 healing, legitimate pre-Exalted choice (same sources).
const INSCRIPTION_OF_FAITH_ID = 0; // REPLACE with real researched ID
```

Cover all 9 enchant slots (at least a `bis` entry each; `acceptable` entries only where a real
one was found and confirmed), the colored-gem tier list (healing-focused gems, `bis`/`acceptable`
as applicable), and the meta-gem tier list (e.g. a mana-focused vs. throughput-focused meta may
both be `bis`-equivalent per player preference — the spec allows this ambiguity, record it
faithfully rather than forcing an artificial single winner).

- [ ] **Step 5: Sanity-check for internal consistency**

No numeric ID should appear in more than one tier or more than one slot's list (a real, distinct
game object has exactly one ID). Every constant has a non-empty source comment. Flag (in the task
notes, not silently) any slot where no `acceptable` tier could be confirmed — an enchant-only
`bis`-tier slot is a valid outcome, not an error.

No commit for this task alone — its output (the constant list) is pasted directly into Task 2's
implementation step.

---

### Task 2: Metric module — `computeEnchantCoverage`, `computeGemCoverage`, extend `computePrepHygiene`

**Files:**

- Modify: `src/metrics/prepHygiene.ts`
- Modify: `src/metrics/prepHygiene.test.ts`

**Interfaces:**

- Consumes: Task 1's compiled ID constants; existing `Judgement`/`mixedJudgement` from
  `./judgement` (unchanged).
- Produces: `EnchantableSlot`, `GearTier`, `EnchantCoverageResult`, `GemCoverageResult` types;
  `computeEnchantCoverage(gear)`, `computeGemCoverage(gear)` functions; `PrepHygieneResult` gains
  `enchantCoverage`/`gemCoverage` fields — consumed by Task 3 (`PrepHygieneCard`) and picked up
  automatically by `scripts/lib/calibrateReport.ts` and `usePrepHygieneSummary.ts` (no call-site
  changes needed there, per `computePrepHygiene`'s unchanged signature).

- [ ] **Step 1: Write the failing tests**

Add to `src/metrics/prepHygiene.test.ts` (alongside the existing `describe("computePrepHygiene",
...)` block — import the new functions/constants at the top of the file):

```ts
import {
  computeEnchantCoverage,
  computeGemCoverage,
  ENCHANTABLE_SLOT_INDEXES,
  MAIN_HAND_GEAR_INDEX,
} from "./prepHygiene";
```

```ts
describe("computeEnchantCoverage", () => {
  function gearWithEnchants(
    entries: Partial<Record<number, number>>, // slot index -> permanentEnchant id
  ) {
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { permanentEnchant?: number },
    );
    for (const [index, id] of Object.entries(entries)) {
      gear[Number(index)] = { permanentEnchant: id };
    }
    return gear;
  }

  function fullyBisGear() {
    const entries: Record<number, number> = {};
    for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES)) {
      // BIS_ID_BY_SLOT is a test-local map built from Task 1's real bis constants,
      // one per slot in ENCHANTABLE_SLOT_INDEXES.
      entries[index] =
        BIS_ID_BY_SLOT[slot as keyof typeof ENCHANTABLE_SLOT_INDEXES];
    }
    return gearWithEnchants(entries);
  }

  it("reads good with 0 missing slots when every slot has a bis enchant", () => {
    const result = computeEnchantCoverage(fullyBisGear());
    expect(result.missingSlots).toEqual([]);
    expect(result.judgement).toBe("good");
  });

  it("still reads good when every slot is on the acceptable tier, not bis", () => {
    // The exact case that prompted the tiered design (Aldor Honored vs Exalted) —
    // an all-acceptable druid must not be judged worse than an all-bis one.
    const entries: Record<number, number> = {};
    for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES)) {
      entries[index] =
        ACCEPTABLE_ID_BY_SLOT[slot as keyof typeof ENCHANTABLE_SLOT_INDEXES] ??
        BIS_ID_BY_SLOT[slot as keyof typeof ENCHANTABLE_SLOT_INDEXES];
    }
    const result = computeEnchantCoverage(gearWithEnchants(entries));
    expect(result.missingSlots).toEqual([]);
    expect(result.acceptableSlots.length).toBeGreaterThan(0);
    expect(result.judgement).toBe("good");
  });

  it("counts an unrecognized enchant id the same as no enchant at all", () => {
    const gear = fullyBisGear();
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = { permanentEnchant: 999999 }; // not in any tier
    const result = computeEnchantCoverage(gear);
    expect(result.missingSlots).toEqual(["Head"]);
  });

  it("bands: good=0, fair=1-3, bad=4+ missing slots", () => {
    const base = fullyBisGear();
    const missOne = [...base];
    missOne[ENCHANTABLE_SLOT_INDEXES.Head] = {};
    expect(computeEnchantCoverage(missOne).judgement).toBe("fair");

    const missThree = [...base];
    missThree[ENCHANTABLE_SLOT_INDEXES.Head] = {};
    missThree[ENCHANTABLE_SLOT_INDEXES.Shoulder] = {};
    missThree[ENCHANTABLE_SLOT_INDEXES.Chest] = {};
    expect(computeEnchantCoverage(missThree).judgement).toBe("fair");

    const missFour = [...missThree];
    missFour[ENCHANTABLE_SLOT_INDEXES.Legs] = {};
    expect(computeEnchantCoverage(missFour).judgement).toBe("bad");
  });

  it("checks MainHand's permanent enchant independently of the existing temporary weapon-oil check", () => {
    const gear = fullyBisGear();
    // Right weapon oil, but no permanent enchant on the same slot.
    gear[MAIN_HAND_GEAR_INDEX] = { temporaryEnchant: 2678 };
    const result = computeEnchantCoverage(gear);
    expect(result.missingSlots).toContain("MainHand");
  });
});

describe("computeGemCoverage", () => {
  it("reads good with 0 wrong/missing when all present gems and the meta are recognized", () => {
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = { gems: [{ id: BIS_META_GEM_ID }] };
    gear[ENCHANTABLE_SLOT_INDEXES.Chest] = { gems: [{ id: BIS_COLOR_GEM_ID }] };
    const result = computeGemCoverage(gear);
    expect(result.missingOrWrongCount).toBe(0);
    expect(result.metaGemRecognized).toBe(true);
    expect(result.judgement).toBe("good");
  });

  it("counts an acceptable-tier gem as covered, not wrong", () => {
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = { gems: [{ id: BIS_META_GEM_ID }] };
    gear[ENCHANTABLE_SLOT_INDEXES.Chest] = {
      gems: [{ id: ACCEPTABLE_COLOR_GEM_ID }],
    };
    const result = computeGemCoverage(gear);
    expect(result.missingOrWrongCount).toBe(0);
    expect(result.acceptableCount).toBe(1);
    expect(result.judgement).toBe("good");
  });

  it("treats a Head slot with no gems at all as meta-not-recognized (documented limitation)", () => {
    // Can't distinguish "no meta socket on this item" from "empty/wrong meta socket" —
    // see docs/specs/602-enchant-gem-check-design.md judgement call 5.
    const gear = Array.from(
      { length: 19 },
      () => ({}) as { gems?: { id: number }[] },
    );
    const result = computeGemCoverage(gear);
    expect(result.metaGemRecognized).toBe(false);
    expect(result.missingOrWrongCount).toBeGreaterThanOrEqual(1);
  });

  it("bands: good=0, fair=1-2, bad=3+ missing-or-wrong", () => {
    const gearWithWrongGems = (count: number) => {
      const gear = Array.from(
        { length: 19 },
        () => ({}) as { gems?: { id: number }[] },
      );
      gear[ENCHANTABLE_SLOT_INDEXES.Head] = { gems: [{ id: BIS_META_GEM_ID }] };
      for (let i = 0; i < count; i++) {
        gear[
          i === 0
            ? ENCHANTABLE_SLOT_INDEXES.Chest
            : ENCHANTABLE_SLOT_INDEXES.Legs + i
        ] = {
          gems: [{ id: 999999 }],
        };
      }
      return gear;
    };
    expect(computeGemCoverage(gearWithWrongGems(1)).judgement).toBe("fair");
    expect(computeGemCoverage(gearWithWrongGems(2)).judgement).toBe("fair");
    expect(computeGemCoverage(gearWithWrongGems(3)).judgement).toBe("bad");
  });
});

describe("computePrepHygiene — enchant/gem integration", () => {
  it("folds a bad enchantCoverage row into the overall judgement", () => {
    const combatant = aCombatantInfoEvent({ gear: [] }); // every slot missing -> bad
    const result = computePrepHygiene([combatant], 2);
    expect(result.enchantCoverage.judgement).toBe("bad");
    expect(result.judgement).not.toBe("good");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/metrics/prepHygiene.test.ts`
Expected: FAIL — `computeEnchantCoverage`/`computeGemCoverage`/`ENCHANTABLE_SLOT_INDEXES` don't
exist yet, and the test file's own `BIS_ID_BY_SLOT`/`ACCEPTABLE_ID_BY_SLOT`/`BIS_META_GEM_ID`/etc.
helper maps (built from Task 1's real constants — add them near the top of the test file, mapping
each `EnchantableSlot` to its real researched bis/acceptable ID) don't exist until written.

- [ ] **Step 3: Write the implementation**

In `src/metrics/prepHygiene.ts`, paste Task 1's researched constants (with their source comments),
then add:

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

export type GearTier = "bis" | "acceptable";

// WoW's fixed 19-slot equipment order — same convention MAIN_HAND_GEAR_INDEX already
// documents. Ring/Neck/Waist/Trinket/OffHand/Ranged/Tabard are never enchantable in TBC
// (or not relevant for a resto healer) and are excluded. See docs/backlog.md story 602.
export const ENCHANTABLE_SLOT_INDEXES: Record<EnchantableSlot, number> = {
  Head: 0,
  Shoulder: 2,
  Back: 14,
  Chest: 4,
  Wrist: 8,
  Hands: 9,
  Legs: 6,
  Feet: 7,
  MainHand: 15, // permanent enchant; distinct from the existing temporaryEnchant check above
};

// Tier tables built from the named constants above (see docs/specs/602-enchant-gem-check-design.md
// "ID compilation" for sourcing method). Only IDs confirmed via at least one guide and either a
// Wowhead item/enchant page or a live CombatantInfo capture appear here.
const SLOT_ENCHANT_IDS: Record<
  EnchantableSlot,
  Partial<Record<number, GearTier>>
> = {
  Head: { [GLYPH_OF_RENEWAL_ID]: "bis" },
  Shoulder: {
    [GREATER_INSCRIPTION_OF_FAITH_ID]: "bis",
    [INSCRIPTION_OF_FAITH_ID]: "acceptable",
  },
  // ... one entry per slot, per Task 1's output
} as Record<EnchantableSlot, Partial<Record<number, GearTier>>>;

const COLOR_GEM_IDS: Partial<Record<number, GearTier>> = {
  [BIS_COLOR_GEM_ID]: "bis",
  [ACCEPTABLE_COLOR_GEM_ID]: "acceptable",
};

const META_GEM_IDS: Partial<Record<number, GearTier>> = {
  [BIS_META_GEM_ID]: "bis",
};

interface CombatantGearEntry {
  temporaryEnchant?: number;
  permanentEnchant?: number;
  gems?: { id: number }[];
}

export interface EnchantCoverageResult {
  missingSlots: EnchantableSlot[];
  acceptableSlots: EnchantableSlot[];
  judgement: Judgement;
}

export interface GemCoverageResult {
  missingOrWrongCount: number;
  acceptableCount: number;
  metaGemRecognized: boolean;
  metaGemTier: GearTier | null;
  judgement: Judgement;
}

// Deliberately wide — the tiered bis/acceptable model already absorbs every legitimate
// lesser choice, so only real gaps count here. See docs/backlog.md story 602 and
// docs/specs/602-enchant-gem-check-design.md judgement call 3. Provisional pending a
// future calibration pass (no exemplar data exists yet for this metric).
function judgeEnchantCoverage(missingCount: number): Judgement {
  if (missingCount === 0) return "good";
  if (missingCount <= 3) return "fair";
  return "bad";
}

// Same rationale as judgeEnchantCoverage, narrower in absolute terms only because a
// geared druid has fewer typical gem sockets than judged enchant slots. See
// docs/specs/602-enchant-gem-check-design.md judgement call 4.
function judgeGemCoverage(missingOrWrongCount: number): Judgement {
  if (missingOrWrongCount === 0) return "good";
  if (missingOrWrongCount <= 2) return "fair";
  return "bad";
}

export function computeEnchantCoverage(
  gear: CombatantGearEntry[],
): EnchantCoverageResult {
  const missingSlots: EnchantableSlot[] = [];
  const acceptableSlots: EnchantableSlot[] = [];

  for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES) as [
    EnchantableSlot,
    number,
  ][]) {
    const enchantId = gear[index]?.permanentEnchant;
    const tier =
      enchantId !== undefined ? SLOT_ENCHANT_IDS[slot]?.[enchantId] : undefined;
    if (tier === undefined) missingSlots.push(slot);
    else if (tier === "acceptable") acceptableSlots.push(slot);
  }

  return {
    missingSlots,
    acceptableSlots,
    judgement: judgeEnchantCoverage(missingSlots.length),
  };
}

export function computeGemCoverage(
  gear: CombatantGearEntry[],
): GemCoverageResult {
  let wrongColorGemCount = 0;
  let acceptableCount = 0;

  for (const entry of gear) {
    for (const gem of entry.gems ?? []) {
      const tier = COLOR_GEM_IDS[gem.id];
      if (tier === undefined) wrongColorGemCount++;
      else if (tier === "acceptable") acceptableCount++;
    }
  }

  const headGems = gear[ENCHANTABLE_SLOT_INDEXES.Head]?.gems ?? [];
  let metaGemTier: GearTier | null = null;
  for (const gem of headGems) {
    const tier = META_GEM_IDS[gem.id];
    if (tier !== undefined) {
      metaGemTier = tier;
      if (tier === "acceptable") acceptableCount++;
      break;
    }
  }
  const metaGemRecognized = metaGemTier !== null;

  const missingOrWrongCount = wrongColorGemCount + (metaGemRecognized ? 0 : 1);

  return {
    missingOrWrongCount,
    acceptableCount,
    metaGemRecognized,
    metaGemTier,
    judgement: judgeGemCoverage(missingOrWrongCount),
  };
}
```

Then, in `computePrepHygiene`, add the two new calls and extend the `mixedJudgement` input array
and return object:

```ts
const combatantGear = combatant?.gear;
const gear = Array.isArray(combatantGear)
  ? (combatantGear as CombatantGearEntry[])
  : [];
// ... existing mainHand/weaponOilPresent logic stays exactly as-is ...

const enchantCoverage = computeEnchantCoverage(gear);
const gemCoverage = computeGemCoverage(gear);

const judgement = mixedJudgement([
  flaskOrElixirJudgement,
  foodBuffPresent ? "good" : "bad",
  weaponOilPresent ? "good" : "bad",
  enchantCoverage.judgement,
  gemCoverage.judgement,
]);

return {
  flaskOrElixir: {/* unchanged */},
  foodBuffPresent,
  weaponOilPresent,
  enchantCoverage,
  gemCoverage,
  judgement,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/metrics/prepHygiene.test.ts`
Expected: PASS (all tests in the file, including the pre-existing 601 tests unaffected by this
change).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/metrics/prepHygiene.ts src/metrics/prepHygiene.test.ts
git commit -m "feat(prep-hygiene): add enchant and gem coverage checks"
```

---

### Task 3: `PrepHygieneCard` — two new rows

**Files:**

- Modify: `src/app/components/PrepHygieneCard/index.tsx`
- Modify: `src/app/components/PrepHygieneCard/index.test.tsx`
- Modify: `src/app/components/PrepHygieneCard/index.module.css`

**Interfaces:**

- Consumes: `EnchantCoverageResult`/`GemCoverageResult` from Task 2 (already part of
  `PrepHygieneResult`, no new prop needed — `PrepHygieneCardProps` is unchanged).

- [ ] **Step 1: Update the failing tests**

In `src/app/components/PrepHygieneCard/index.test.tsx`, extend the existing "fully prepped"
combatant fixture with real recognized gear (using Task 1/2's real constants — import them from
`../../../metrics/prepHygiene`) and add assertions:

```ts
it("renders enchant and gem coverage rows for a fully-prepped combatant", async () => {
  // ... existing fully-prepped combatant setup extended with recognized gear via
  // the fullyBisGear()-style helper from Task 2's test file (duplicate the small
  // helper here, or extract it to testUtils/factories.ts if reused a third time) ...
  await waitFor(() =>
    expect(
      screen.getByText("All 9 enchantable slots enchanted"),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByText("All gems recognized, meta gem correct"),
  ).toBeInTheDocument();
});

it("shows an upgrade note for acceptable-tier gear without affecting the good judgement", async () => {
  // combatant with every slot on the acceptable tier (per Task 2's "still reads good"
  // case)
  await waitFor(() =>
    expect(screen.getByText(/upgrade available/)).toBeInTheDocument(),
  );
});

it("shows missing-slot detail when enchant coverage is incomplete", async () => {
  // combatant missing Head's enchant specifically
  await waitFor(() =>
    expect(
      screen.getByText(/Missing\/unrecognized enchant: Head/),
    ).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/PrepHygieneCard/index.test.tsx`
Expected: FAIL — new text isn't rendered yet.

- [ ] **Step 3: Write the implementation**

In `src/app/components/PrepHygieneCard/index.tsx`, destructure the two new fields and add the two
rows (immediately after the existing `ChecklistRow` elements, inside the same `MetricCard`):

```tsx
const {
  flaskOrElixir,
  foodBuffPresent,
  weaponOilPresent,
  enchantCoverage,
  gemCoverage,
  judgement,
} = result.result;
```

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

Add to `index.module.css`:

```css
.upgradeNote {
  color: var(--text-muted, #888);
  font-style: italic;
}
```

(match whatever muted-text custom property the rest of the app already uses — grep
`src/index.css` for the existing convention rather than inventing a new one.)

Update the `THRESHOLD` constant to add, after the existing weapon-oil sentence:

```
Enchant coverage: judged across 9 slots (Head, Shoulder, Back, Chest, Wrist, Hands, Legs, Feet,
MainHand's permanent enchant); a slot with a recognized best-in-slot or a legitimate lesser
("acceptable") enchant both count as covered — only a truly missing or unrecognized enchant counts
against the score. Good 0 missing, fair 1-3, bad 4+. Head and Legs are judged the same as any
other slot even though their enchants are reputation/profession-gated. Gem coverage: judged on
whatever gems are actually socketed (an unfilled socket can't be distinguished from a slot with no
socket at all, so this can only flag a present-but-wrong gem, never an empty one), plus a
Head-slot meta-gem check. Good 0 wrong/unrecognized, fair 1-2, bad 3+. Both bands are provisional,
pending a future calibration pass. See docs/backlog.md story 602.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/PrepHygieneCard/index.test.tsx`
Expected: PASS (all tests, including the pre-existing 601 ones).

- [ ] **Step 5: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/app/components/PrepHygieneCard/
git commit -m "feat(prep-hygiene): render enchant and gem coverage rows"
```

---

### Task 4: Realistic default gear in `aCombatantInfoEvent`

**Files:**

- Modify: `src/testUtils/factories.ts`

**Interfaces:**

- Consumes: Task 1's real bis IDs.
- Produces: `aCombatantInfoEvent`'s default `gear` array now includes recognized `permanentEnchant`
  values (bis tier) on the 9 enchantable slots and a recognized colored + meta gem, alongside its
  existing `temporaryEnchant` on MainHand — so every existing Prep Hygiene test/story that doesn't
  override `gear` keeps exercising a "fully prepped" combatant without needing to opt in.

- [ ] **Step 1: Update the factory**

In `src/testUtils/factories.ts`, update `aCombatantInfoEvent`'s default `gear` array: for each of
the 9 `ENCHANTABLE_SLOT_INDEXES` positions, set `{ permanentEnchant: <real bis id> }` (merging with
the existing MainHand `temporaryEnchant: 2678` entry rather than replacing it), and add a
`gems: [{ id: <real bis meta id> }]` entry on the Head slot and a `gems: [{ id: <real bis color
gem id> }]` on at least one other slot (e.g. Chest).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — every existing test that constructs a "fully prepped" combatant via the factory
default now also reads `good` on the two new rows; any test that previously asserted specific
`gear` contents via an override is unaffected (overrides still replace the default entirely,
matching the factory's existing behavior).

- [ ] **Step 3: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add src/testUtils/factories.ts
git commit -m "test(prep-hygiene): give aCombatantInfoEvent a fully-enchanted default"
```

---

### Task 5: Paperwork — docs, calibration-report fixture note, retire the spec/plan, mark 602 done

**Files:**

- Modify: `docs/backlog.md`
- Modify: `docs/thresholds.md`
- Modify: `docs/testing.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/602-enchant-gem-check-design.md`
- Delete: `docs/plans/602-enchant-gem-check-plan.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Mark story 602 done in the backlog**

In `docs/backlog.md`, change the heading `### 602 — Enchant & gem check 🔲 Todo` to
`### 602 — Enchant & gem check ✅ Done`.

- [ ] **Step 2: Add the two new rows to `docs/thresholds.md`**

In the "Prep hygiene (epic G)" table, add two rows matching the existing format:

```md
| Enchant coverage | good / fair / bad | 0 missing / 1-3 missing / 4+ missing (of 9 slots; bis and acceptable tiers both count as covered) | story 602 (provisional) | `src/metrics/prepHygiene.ts` (`judgeEnchantCoverage`) |
| Gem coverage | good / fair / bad | 0 wrong / 1-2 wrong / 3+ wrong (bis and acceptable tiers both count as covered; can't detect empty sockets) | story 602 (provisional) | `src/metrics/prepHygiene.ts` (`judgeGemCoverage`) |
```

- [ ] **Step 3: Extend `docs/testing.md`'s `4GYHZRdtL3bvhpc8` entry**

Add a sentence to the existing row for this report noting the live confirmation from this story's
research: `CombatantInfo`'s `gear` array also carries `permanentEnchant`/`gems`/`setID` (not just
`temporaryEnchant`, already documented) — `gems` entries are `{ id, itemLevel, icon }`, and the
`gems` key is either absent or non-empty, never an empty array (the basis for story 602's
documented empty-socket-detection limitation).

- [ ] **Step 4: Confirm nothing else references the spec/plan paths**

Run: `grep -rn "602-enchant-gem-check" --include='*.md' .`
Expected: only `docs/backlog.md`'s own reference (if any) and the two files about to be deleted.

- [ ] **Step 5: Delete the spec and plan**

```bash
git rm docs/specs/602-enchant-gem-check-design.md docs/plans/602-enchant-gem-check-plan.md
```

- [ ] **Step 6: Update `CLAUDE.md`'s Repo state paragraph**

Add a clause noting story 602 (enchant & gem check, epic G) is done, following the existing
paragraph's running-prose style — summarize the tiered bis/acceptable model briefly, matching how
other entries in that paragraph summarize their own key design decisions.

- [ ] **Step 7: Full static analysis and commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all pass with no errors.

```bash
git add docs/backlog.md docs/thresholds.md docs/testing.md CLAUDE.md
git commit -m "docs: mark story 602 done, retire its design spec and plan"
```
