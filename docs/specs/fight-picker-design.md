# Fight list & selection — design (backlog story 003)

Implements backlog story 003: show the report's boss fights (name, pull number, kill/wipe, duration), exclude trash by default with a toggle, and let the user select one fight for later stories to consume.

## Data layer — `src/wcl/client.ts`

Extend the `Fight` interface and the `fetchReportFights` GraphQL query with three fields not currently fetched:

```ts
export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID: number; // 0 = trash/non-boss, nonzero = boss encounter
  kill: boolean | null; // null for trash
  bossPercentage: number | null; // remaining boss HP% on a wipe; null for kills and trash
}
```

Query becomes:

```graphql
query {
  reportData {
    report(code: "REPORT_CODE") {
      title
      fights {
        id
        name
        startTime
        endTime
        encounterID
        kill
        bossPercentage
      }
    }
  }
}
```

**Tier 2 fixture:** `test/integration/fixtures/report-fights.json` is a real captured payload (per `docs/testing.md`) for report `4GYHZRdtL3bvhpc8` with only the old field set. A fresh real capture with the new fields is needed — run the query above (with that report code) against `https://www.warcraftlogs.com/api/v2/user` using a real bearer token, and replace the fixture file with the response. `test/integration/client.test.ts`'s assertions on `fights[0]` / `fights[5]` get updated to match once the new fixture lands.

## Pure logic — `src/report/fightRows.ts` (new file)

Two pure functions, unit-tested (Tier 1), no React/DOM:

- `buildFightRows(fights: Fight[]): FightRow[]` where
  ```ts
  interface FightRow {
    fight: Fight;
    isTrash: boolean; // fight.encounterID === 0
    pullNumber: number | null; // per-encounterID running attempt count, in report order; null for trash
  }
  ```
  Pull numbering: group by `encounterID`, count occurrences in report order, starting at 1 per encounter. Trash fights always get `pullNumber: null`.
- `formatDuration(ms: number): string` — renders `endTime - startTime` as `m:ss` (e.g. `90000` → `"1:30"`).

Test cases to cover: single encounter with multiple attempts, two interleaved encounters (pull numbers don't cross-contaminate), an all-trash report, duration rounding/padding edge cases (e.g. `5000` → `"0:05"`).

## Component — `src/app/components/FightPicker/index.tsx` (new)

```ts
export interface FightPickerProps {
  fights: Fight[];
  initialFightId: number | null;
  onSelectFight: (fightId: number) => void;
}
```

Behavior:

- Runs `buildFightRows(fights)` once on the input list.
- Local state: `showTrash: boolean`, `selectedFightId: number | null`.
- On mount, if `initialFightId` is non-null and present in `fights`: set `selectedFightId` to it, and if that fight `isTrash`, also set `showTrash: true` (so a trash deep-link is visible immediately, per the design discussion).
- Renders a "Show trash fights" checkbox, unchecked by default.
- Renders one row per `FightRow` where `!row.isTrash || showTrash`. Each row shows:
  - Boss fights: `Pull {pullNumber} — {name}`.
  - Trash fights: just `{name}`.
  - Kill/wipe: `"Kill"` for `kill === true`; `` `Wipe (${Math.round(bossPercentage)}%)` `` for `kill === false` (WCL's `bossPercentage` is a float; round to a whole number for display); nothing for trash (`kill === null`).
  - `formatDuration(fight.endTime - fight.startTime)`.
- Clicking a row sets `selectedFightId` and calls `onSelectFight(fight.id)`; the selected row gets a visually distinct style (e.g. `aria-current="true"` + a CSS class) so kills/wipes/selection are all distinguishable without relying on color alone.

Co-located `index.test.tsx` (Tier 3): renders full list with trash hidden by default; toggling the checkbox reveals trash rows; clicking a row calls `onSelectFight` with the right id and highlights it; `initialFightId` pointing at a boss fight pre-selects without touching the toggle; `initialFightId` pointing at a trash fight pre-selects and auto-enables the toggle.

## Wiring — `ConnectPanel` and `App.tsx`

`ConnectPanel` gains one new prop:

```ts
onReportLoaded: (report: ReportFights) => void;
```

Called once, inside the existing `useEffect`, right after a successful fetch (alongside the existing `setResult`). `ConnectPanel` keeps rendering the title and loading/error states as it does today; it drops nothing from its own render output except the "N fights" paragraph, which moves to `FightPicker`. Existing `ConnectPanel` tests get updated: the "N fights" assertion is removed, and a new test confirms `onReportLoaded` fires with the parsed report.

`App.tsx`:

```ts
const [loadedReport, setLoadedReport] = useState<ReportFights | null>(null);
const [selectedFightId, setSelectedFightId] = useState<number | null>(null);

function handleReportSubmit(parsed: ParsedReport) {
  setReport(parsed);
  setLoadedReport(null);
  setSelectedFightId(null);
}
```

`ReportInput`'s `onSubmit` is rewired to `handleReportSubmit` (resets stale fight data when a new report is pasted). `ConnectPanel`'s `onReportLoaded` is wired to `setLoadedReport`. Once `loadedReport` is set, `FightPicker` renders as a sibling of `ConnectPanel`:

```tsx
{
  loadedReport && (
    <FightPicker
      fights={loadedReport.fights}
      initialFightId={report?.fightId ?? null}
      onSelectFight={setSelectedFightId}
    />
  );
}
```

`selectedFightId` isn't consumed by anything yet — story 005 (druid picker) is the next thing that will read it. The stale "story 003 will consume it" comment in `App.tsx` gets removed since it's now wired.

## E2E smoke test update

`test/e2e/smoke.spec.ts` currently asserts `/\d+ fights/` text, which no longer exists after this change. Update it to reflect "pick fight" as a real step in the golden path: after loading the report, click a fight row in the list and assert the selection is reflected (e.g. the row's selected styling/`aria-current`), instead of asserting fight-count text.

## Out of scope

- Zone-wide selection (story 004), druid detection (005) — `selectedFightId` is plumbed but unused beyond this story.
- Any consumption of `kill`/`bossPercentage` beyond display (e.g. filtering to kills-only) — not in story 003's acceptance criteria.
