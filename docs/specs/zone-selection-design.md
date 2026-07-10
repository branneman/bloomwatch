# Zone-Wide Selection (Story 004) Design

**Goal:** let the user select a whole raid zone (e.g. "SSC — all bosses") in one click, so a single aggregated scorecard can eventually be built across all of that zone's boss pulls, while still allowing individual fights to be added or removed from the selection.

## Scope

In scope: the WCL client's `Fight` type/query gains `gameZone`; `FightPicker` gains a zone selector and moves from single-select to multi-select. Out of scope: anything that _consumes_ the selected fight IDs (event fetching, metrics, aggregation) — those land in later stories (006+). `FightPicker` just needs to expose the selected set; nothing downstream reads it yet, same as story 003 left `selectedFightId` unused in `App.tsx`.

## Data model

`src/wcl/client.ts`:

```ts
export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID: number;
  kill: boolean | null;
  bossPercentage: number | null;
  gameZone: { id: number; name: string } | null;
}
```

Query adds `gameZone { id name }` to the `fights` selection set. `gameZone` is nullable in WCL's schema (trash/travel fights could in principle lack one), even though the real captured report has it populated on every fight, including trash.

## `groupFightsByZone` (new, `src/report/fightRows.ts`)

```ts
export interface ZoneGroup {
  zoneId: number;
  zoneName: string;
  fightIds: number[]; // boss (non-trash) fights only, in report order
}

export function groupFightsByZone(fights: Fight[]): ZoneGroup[];
```

- Trash fights (`encounterID === 0`) are never included in a zone's `fightIds`, regardless of whether they have a `gameZone`.
- Fights with `gameZone === null` are excluded from every group (nothing to bulk-select them by).
- Zones are returned in first-seen order among the boss fights, deduplicated by `zoneId`.

## `FightPicker` behavior changes

Props change from single-select to multi-select:

```ts
export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectionChange: (fightIds: number[]) => void;
}
```

- Internal state becomes `selectedFightIds: Set<number>` (or equivalent), seeded from `initialFightId` (one entry, or empty if null) — same trash-auto-reveal behavior as today when `initialFightId` points at a trash fight.
- A row of zone buttons renders above the fight list, one per `ZoneGroup`, labeled `"<zoneName> (<fightIds.length>)"`. Clicking one **replaces** the current selection with exactly that zone's `fightIds` (confirmed with the user: replace, not union — matches "one aggregated report for a full raid night," not a cross-zone selection).
- Each fight row's button becomes a checkbox (`role="checkbox"` via `<input type="checkbox">`), reflecting membership in `selectedFightIds`. Toggling one checkbox adds/removes just that fight's ID from the selection — independent of whatever a zone button last set, so a zone click followed by manually unchecking one fight leaves the rest selected.
- `onSelectionChange` fires with the full array of selected IDs, in report (fight list) order, after every change (checkbox toggle or zone click).
- The existing `showTrash` toggle and kill/wipe/duration row rendering are unchanged. Trash rows, when shown, remain individually checkable (consistent with today's single-select behavior letting a trash fight be the active selection).
- If no zones are present (e.g., an all-trash report, or a report where every fight lacks `gameZone`), the zone-button row simply doesn't render — no empty state needed since it's not a real scenario acceptance criteria calls out.

## `App.tsx`

- `selectedFightId: number | null` state becomes `selectedFightIds: number[]`.
- `FightPicker`'s `onSelectFight` prop wiring becomes `onSelectionChange={setSelectedFightIds}`.
- `handleReportSubmit` resets `selectedFightIds` to `[]` instead of `setSelectedFightId(null)`.

## Testing

- **Tier 1** (`src/report/fightRows.test.ts`): `groupFightsByZone` — dedupes repeated zones, excludes trash, excludes null-zone fights, preserves first-seen order, returns `[]` for an all-trash/no-zone report.
- **Tier 2** (`test/integration/client.test.ts` + `test/integration/fixtures/report-fights.json`): recapture the existing 6-fight fixture for report `4GYHZRdtL3bvhpc8` with the real `gameZone` field (all 6 are Serpentshrine Cavern, id 548 — confirmed via a live query during design), update the two existing fixture assertions (`fights[0]`, `fights[5]`) and the "requests encounterID, kill, and bossPercentage" query-shape test to also assert `gameZone`.
- **Tier 3** (`src/app/components/FightPicker/index.test.tsx`): rewrite the selection-related tests for checkboxes instead of buttons-with-`aria-current`; add zone-button tests (clicking a zone checks its fights and unchecks everything else; a subsequent individual uncheck sticks; clicking a fight checkbox directly without ever touching a zone button works; multiple zones render distinct buttons with correct counts, trash and null-zone fights never appear in any zone's count).
- **Tier 5** (`test/e2e/smoke.spec.ts`): update the fight-selection assertion from a button/`aria-current` click to a checkbox check (`getByRole("checkbox", ...)`, `toBeChecked()`).

## Non-goals

- No aggregation, event-fetching, or metrics work — this story only produces a selected-fight-IDs list.
- No persistence of the selection across report reloads.
- No cross-zone ("select these two zones together") capability.
