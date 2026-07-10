# Druid auto-detection & selection — design

Implements backlog story 005.

## Goal

Given a loaded report, detect all resto druids **in the report** (not scoped to
whatever fights are currently selected in the fight picker) and let the user
pick one — auto-selecting when there's only one.

## Validation against real data

Tested live against 7 real TBC Anniversary reports (the existing fixture
report `4GYHZRdtL3bvhpc8`, plus 6 more spanning SSC/TK, Gruul/Magtheridon, and
Karazhan on different raid nights) using WCL's `table(dataType: Casts)` query.

Findings that shaped this design:

- WCL's own class/spec label (the `icon` field, e.g. `"Druid-Restoration"`) is
  reliable when an actor played one spec for the whole report, but frequently
  degrades to a bare `"Druid"` (no spec suffix) for actors who played
  multiple specs across different fights in the same report — common in these
  multi-night combined logs.
- In one report, a druid labeled `"Druid-Restoration"` had **zero** healing
  casts in that fight (a resto-geared player who was actually playing
  feral/bear that pull). Trusting the label alone would have misidentified
  them.
- Summing actual healing-spell casts (Rejuvenation, Regrowth, Lifebloom,
  Healing Touch, Swiftmend, Tranquility) cleanly separated real healers from
  everyone else in all 7 reports: the real resto druid always landed in the
  hundreds-to-thousands of heal casts report-wide; every non-healing druid
  landed at exactly 0. No borderline cases appeared anywhere near a small
  threshold.
- One report (`mdXzqAT6vJPfGxVH`, Karazhan) had a single druid who mostly
  played Balance (390 Starfire casts) but still cast Lifebloom 40 times, with
  an ambiguous `"Druid"` label. Cast-count detection still correctly surfaces
  them as the sole candidate for auto-selection — the tool can't know this
  log isn't a "real" resto healing night, and shouldn't pretend otherwise by
  either hiding or over-trusting a label.

**Conclusion: healing-cast count is the actual filter for candidacy. The
combatant-info spec label is read and shown as a corroborating badge, and
used to order multiple candidates, but never gates inclusion or exclusion.**
This is a deliberate reading of the backlog's "combatant info where
available, with a fallback heuristic" language — in practice, for this data
source, the label is available but not trustworthy enough to gate on, so the
cast heuristic isn't just a fallback, it's the mechanism that makes detection
correct.

## Data layer

`src/wcl/client.ts` — add:

```ts
export interface CastTableAbility {
  name: string;
  total: number;
}

export interface CastTableEntry {
  id: number;
  name: string;
  type: string; // WCL class name, e.g. "Druid"
  icon: string; // WCL class-spec icon key, e.g. "Druid-Restoration" or bare "Druid" when ambiguous
  abilities: CastTableAbility[];
}

export async function fetchCastsTable(
  accessToken: string,
  reportCode: string,
  fightIds: number[],
): Promise<CastTableEntry[]>;
```

Thin fetch+parse wrapper around WCL's `reportData.report.table(fightIDs,
dataType: Casts)` query (a JSON-scalar field, like `playerDetails`), mirroring
`fetchReportFights`'s shape and error handling (`WclApiError` on non-2xx).

## Pure detection logic

New `src/report/druidDetection.ts`:

```ts
export const HEALING_SPELL_NAMES = [
  "Rejuvenation",
  "Regrowth",
  "Lifebloom",
  "Healing Touch",
  "Swiftmend",
  "Tranquility",
];

// A stray opportunistic cross-heal from an off-spec druid is 1-2 casts; a real
// healer casts in the hundreds even in a single fight (see docs/specs/druid-detection-design.md
// live validation). 3 comfortably separates the two with no observed borderline cases.
export const MIN_HEALING_CASTS_FOR_DETECTION = 3;

export interface DruidCandidate {
  id: number;
  name: string;
  healingCastCount: number;
  isRestoSpec: boolean; // WCL's own label said "Druid-Restoration" — corroboration only
}

export function detectDruids(entries: CastTableEntry[]): DruidCandidate[];
```

`detectDruids`:

1. Filters `entries` to `type === "Druid"`.
2. Sums `abilities[].total` where `name` is in `HEALING_SPELL_NAMES`.
3. Keeps entries with `healingCastCount >= MIN_HEALING_CASTS_FOR_DETECTION`.
4. Sorts Restoration-labeled candidates first (tie-break/display order only),
   then by `healingCastCount` descending.

No ability-ID resolution here — spell names come directly off the `table`
response as strings. Story 007's ID→(spell,rank) table is for rank-precision
metric work later; this coarse "is this a healing cast" check doesn't need
it, and building that infrastructure now would be out of scope for this
story.

## Components

Mirrors the existing `ConnectPanel` (fetch-owning) / `FightPicker`
(presentational) split.

**`src/app/components/DruidDetector/index.tsx`** (fetch-owning, like
`ConnectPanel`):

```ts
export interface DruidDetectorProps {
  accessToken: string;
  reportCode: string;
  fightIds: number[]; // all fight IDs in the loaded report
  fetchCastsTable: typeof fetchCastsTable;
  onDruidsDetected: (candidates: DruidCandidate[]) => void;
}
```

Fetches once on mount (and if `fightIds`/`reportCode`/`accessToken` change),
runs `detectDruids` on the result, calls `onDruidsDetected`. Same
loading/error state shape as `ConnectPanel` (a discriminated
current-vs-stale result keyed by the inputs, `role="alert"` on error).

**`src/app/components/DruidPicker/index.tsx`** (presentational, like
`FightPicker`):

```ts
export interface DruidPickerProps {
  candidates: DruidCandidate[];
  onSelect: (druidId: number) => void;
}
```

- Zero candidates → informational message ("No resto druids detected in this
  report.").
- Exactly one candidate → auto-selected via an effect that calls `onSelect`
  immediately; no picker UI rendered.
- Multiple candidates → radio-button list, one per candidate, showing name +
  a "Restoration" badge when `isRestoSpec` + heal-cast count for context.
  No pre-selection — the user picks.

## Wiring in `App.tsx`

Once `loadedReport` is set (independent of whatever's selected in
`FightPicker`), render `DruidDetector` with `fightIds: loadedReport.fights.map(f => f.id)`.
Its `onDruidsDetected` lifts `druidCandidates` into `App` state, which is
passed to a rendered `DruidPicker`; its `onSelect` lifts `selectedDruidId`
into `App` state (replacing the currently-unused `selectedFightIds` writer
with a real consumer — `selectedDruidId` becomes the first actually-consumed
piece of selection state, since no metric epic exists yet to consume fight
selection either).

The druid picker and fight picker are independent and can be interacted with
in either order.

## Testing

- **Tier 1** (`src/report/druidDetection.test.ts`): `detectDruids` against
  factory-built `CastTableEntry[]` — a clean resto candidate, a
  zero-heal-casts druid mislabeled `"Druid-Restoration"` (excluded), an
  ambiguous-icon druid with real heals (included), threshold boundary
  (2 vs. 3 heal casts), sort order (Restoration-labeled first).
- **Tier 2** (`test/integration/client.test.ts`): `fetchCastsTable` against a
  real captured fixture, `test/integration/fixtures/casts-table.json` —
  trimmed from my live capture of report `4GYHZRdtL3bvhpc8` down to a couple
  of fights, following the existing `report-fights.json` convention.
- **Tier 3** (`DruidPicker/index.test.tsx`, `DruidDetector/index.test.tsx`):
  auto-select on a single candidate, render a list for multiple, empty state,
  loading/error states for the fetch-owning component — following
  `FightPicker`'s and `ConnectPanel`'s existing test patterns.

`src/testUtils/factories.ts` gains `aCastTableEntry(overrides)` alongside the
existing `aFight`/`aReportFights` factories.
