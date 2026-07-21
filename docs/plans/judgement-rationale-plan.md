# Judgement Rationale page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new user-facing content page (`#/judgements`) that explains, in plain language, how Bloomwatch collects data from Warcraft Logs and turns it into Good/Fair/Bad verdicts — plus give the existing About/Onboarding screen a real `#/about` route and link the two together.

**Architecture:** Content is authored as MDX (`content.mdx`, compiled to a real React component at build time via `@mdx-js/rollup` — no runtime markdown parser shipped) and imports the actual threshold constants from `src/metrics/*.ts` so numbers can never drift from the real code. `hashRoute.ts` gains two new top-level routes (`about`, `judgements`) independent of report/druid/fight state. A small fix to `useHashRoute.ts` (listening for `hashchange`, not just `popstate`) makes plain `<a href="#/...">` anchors safe for internal navigation anywhere in the app, which is what lets `MetricCard`'s new deep-link avoid threading a `navigate` callback through ~18 nested card components.

**Tech Stack:** React 19, TypeScript ~6.0, Vite 8, Vitest 4 + Testing Library, `@mdx-js/rollup` (new).

## Global Constraints

- No hardcoded Good/Fair/Bad threshold value may appear in `content.mdx` prose without being interpolated from the real exported constant in `src/metrics/*.ts` — per the approved design, this is what keeps the page from drifting out of sync with future recalibration stories.
- `content.mdx`'s own prose never uses this repo's internal "epic"/"story"/story-number vocabulary — metric groups are named in plain terms only (e.g. "GCD economy", not "epic B").
- No new runtime dependency may ship to the browser bundle purely for markdown rendering — MDX compiles to plain JSX at build time; no client-side markdown parser.
- `src/metrics/*.ts` constant exports in this plan must not change any numeric value or runtime behavior — these are export-visibility changes only (verified by the existing test suite staying green, unchanged).
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) must pass after every task, matching this repo's full-project pre-commit hook — don't scope checks to changed files only.
- Every internal navigation added in this plan must go through either the existing `navigate()` callback (already-established pattern for buttons) or a plain `<a href="#/...">` anchor now that `useHashRoute.ts` handles `hashchange` (new pattern, used only for the two new links this plan adds) — never a raw anchor before Task 1 lands.

---

## File Structure

New files:

- `src/app/components/JudgementRationale/index.tsx` — the page component: heading, table of contents, MDX content, deep-link scroll behavior.
- `src/app/components/JudgementRationale/index.test.tsx` — component tests.
- `src/app/components/JudgementRationale/content.mdx` — the actual prose/tables (the "large document").
- `src/app/components/JudgementRationale/MdxTable.tsx` — table/th/td overrides that reuse `DataTable`'s CSS module.
- `src/app/components/JudgementRationale/index.module.css` — page-level layout (container width, TOC list, heading spacing).
- `src/mdx.d.ts` — ambient module declaration so TypeScript recognizes `*.mdx` imports.

Modified files (by task): `vite.config.ts`, `.prettierignore`, `src/app/routing/hashRoute.ts` (+ test), `src/app/routing/useHashRoute.ts` (+ test), 15 files under `src/metrics/` (constant exports), `src/App.tsx` (+ test), `src/app/components/Onboarding/index.tsx` (+ test), `src/app/components/ui/Footer/index.tsx` (+ test), `src/app/components/ui/MetricCard/index.tsx` (+ test), 18 files under `src/app/components/*Card/index.tsx`, `docs/thresholds.md`, `docs/backlog.md`, `CLAUDE.md`.

---

### Task 1: Routing infrastructure — `about`/`judgements` routes, and a `hashchange` fix for safe internal anchors

**Files:**

- Modify: `src/app/routing/hashRoute.ts`
- Modify: `src/app/routing/hashRoute.test.ts`
- Modify: `src/app/routing/useHashRoute.ts`
- Modify: `src/app/routing/useHashRoute.test.ts`

**Interfaces:**

- Produces: `Route` union gains `{ screen: "about" }` and `{ screen: "judgements"; slug?: string }`. `parseHash`/`serializeRoute` handle both. `useHashRoute`'s returned `{ route, navigate }` is unchanged in shape; its internal listener now also re-syncs on `hashchange`.

- [ ] **Step 1: Write the failing route-parsing tests**

Add to `src/app/routing/hashRoute.test.ts`, inside the existing `cases` array (after the `"report + classic host + druid + fight + epic"` case, before the closing `];`):

```ts
    { name: "about", hash: "#/about", route: { screen: "about" } },
    {
      name: "judgements, no slug",
      hash: "#/judgements",
      route: { screen: "judgements" },
    },
    {
      name: "judgements with slug",
      hash: "#/judgements/rejuv-clip-share",
      route: { screen: "judgements", slug: "rejuv-clip-share" },
    },
```

Also add, after the existing `it.each([...])("falls back to the input screen for malformed hash %s", ...)` block:

```ts
it.each(["#/about/extra", "#/judgements/slug/extra"])(
  "falls back to the input screen for malformed hash %s",
  (hash) => {
    expect(parseHash(hash)).toEqual({ screen: "input" });
  },
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/routing/hashRoute.test.ts`
Expected: FAIL — `parseHash("#/about")` currently returns `{ screen: "input" }`, not `{ screen: "about" }` (no case matches it yet, since `segments[0] !== "r"` falls through to `INPUT_ROUTE`).

- [ ] **Step 3: Implement the two new routes**

In `src/app/routing/hashRoute.ts`, extend the `Route` union:

```ts
export type Route =
  | { screen: "input" }
  | { screen: "about" }
  | { screen: "judgements"; slug?: string }
  | { screen: "druidPicker"; reportCode: string; host: Host };
```

(leave the remaining `dashboard`/`fight`/`fightEpic` variants unchanged).

Replace the top of `parseHash` — currently:

```ts
if (segments.length === 0) return INPUT_ROUTE;
if (segments[0] !== "r" || segments.length < 2) return INPUT_ROUTE;
const reportCode = decodeURIComponent(segments[1]);
```

with:

```ts
if (segments.length === 0) return INPUT_ROUTE;

if (segments[0] === "about") {
  return segments.length === 1 ? { screen: "about" } : INPUT_ROUTE;
}

if (segments[0] === "judgements") {
  if (segments.length === 1) return { screen: "judgements" };
  if (segments.length === 2) {
    return { screen: "judgements", slug: decodeURIComponent(segments[1]) };
  }
  return INPUT_ROUTE;
}

if (segments[0] !== "r" || segments.length < 2) return INPUT_ROUTE;
const reportCode = decodeURIComponent(segments[1]);
```

Extend `serializeRoute`'s `switch`:

```ts
  switch (route.screen) {
    case "input":
      return "#";
    case "about":
      return "#/about";
    case "judgements":
      return route.slug
        ? `#/judgements/${encodeURIComponent(route.slug)}`
        : "#/judgements";
    case "druidPicker":
```

(leave every other case unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/routing/hashRoute.test.ts`
Expected: PASS (all cases, including the two new malformed-hash cases — `#/about/extra` has `segments.length === 2` so falls to `INPUT_ROUTE`; `#/judgements/slug/extra` has `segments.length === 3` so falls to `INPUT_ROUTE` too).

- [ ] **Step 5: Write the failing `hashchange` test**

Read `src/app/routing/useHashRoute.test.ts` first to match its existing style, then add a new test asserting that a manual `hashchange` (not `popstate`) re-syncs the hook's route — e.g.:

```ts
it("re-syncs on a hashchange event, not just popstate (a plain <a href> anchor click fires hashchange, never popstate)", () => {
  const { result } = renderHook(() => useHashRoute());

  act(() => {
    window.location.hash = "#/about";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  expect(result.current.route).toEqual({ screen: "about" });
});
```

(Match whatever `render`/`act`/`renderHook` imports the existing file already uses — it already tests `popstate` re-sync the same way, just substitute the event.)

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts`
Expected: FAIL — no `hashchange` listener exists yet, so `result.current.route` stays `{ screen: "input" }`.

- [ ] **Step 7: Add the `hashchange` listener**

In `src/app/routing/useHashRoute.ts`, in the mount effect, change:

```ts
function handlePopState() {
  setRoute(parseHash(window.location.hash));
}
window.addEventListener("popstate", handlePopState);
return () => window.removeEventListener("popstate", handlePopState);
```

to:

```ts
function handleHashChange() {
  setRoute(parseHash(window.location.hash));
}
// Both events matter: browser back/forward fires popstate (never
// hashchange); a plain <a href="#/..."> anchor click fires hashchange
// (never popstate, since it's not history traversal). navigate()'s own
// pushState calls neither, so this only ever handles external changes —
// no double-handling risk with the setRoute() call in navigate() below.
window.addEventListener("popstate", handleHashChange);
window.addEventListener("hashchange", handleHashChange);
return () => {
  window.removeEventListener("popstate", handleHashChange);
  window.removeEventListener("hashchange", handleHashChange);
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/app/routing/useHashRoute.test.ts src/app/routing/hashRoute.test.ts`
Expected: PASS, all tests.

- [ ] **Step 9: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/app/routing/hashRoute.ts src/app/routing/hashRoute.test.ts src/app/routing/useHashRoute.ts src/app/routing/useHashRoute.test.ts
git commit -m "feat(routing): add #/about and #/judgements routes, sync on hashchange too"
```

---

### Task 2: Export every judgement-threshold constant used by the new page

Pure refactor — visibility/naming changes only, zero behavior change. No new tests are written; the existing suite staying green _is_ the verification.

**Files (all under `src/metrics/`):** `gcdUtilization.ts`, `idleGaps.ts`, `lb3Uptime.ts`, `refreshCadence.ts`, `accidentalBlooms.ts`, `restackTax.ts`, `concurrentLb3Targets.ts`, `hotClipDetection.ts`, `swiftmendAudit.ts`, `downrankingDiscipline.ts`, `naturesSwiftnessAudit.ts`, `manaCurve.ts`, `consumableThroughput.ts`, `innervateAudit.ts`, `overhealTable.ts`, `deathForensics.ts`.

**Interfaces:**

- Produces (every name below is a new or newly-exported named export from the file listed — these are exactly what Tasks 4–6's `content.mdx` imports):

| File                       | Export                                                                                                                                                                                                                                                                                                                                                                               | Value (unchanged)              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `gcdUtilization.ts`        | `GOOD_MIN_PCT`, `FAIR_MIN_PCT`                                                                                                                                                                                                                                                                                                                                                       | 85, 70                         |
| `idleGaps.ts`              | `GOOD_MAX_PCT`, `FAIR_MAX_PCT`                                                                                                                                                                                                                                                                                                                                                       | 7, 15                          |
| `lb3Uptime.ts`             | `GOOD_MIN_PCT`, `FAIR_MIN_PCT`                                                                                                                                                                                                                                                                                                                                                       | 80, 60                         |
| `refreshCadence.ts`        | `GOOD_MIN_MS`, `GOOD_MAX_MS`, `FAIR_MIN_MS`                                                                                                                                                                                                                                                                                                                                          | 6000, 7000, 5000               |
| `accidentalBlooms.ts`      | `GOOD_MAX_COUNT`, `FAIR_MAX_COUNT`, `ACCIDENTAL_WINDOW_MS`                                                                                                                                                                                                                                                                                                                           | 1, 2, 3000                     |
| `restackTax.ts`            | `LIFEBLOOM_MANA_COST`                                                                                                                                                                                                                                                                                                                                                                | 220                            |
| `concurrentLb3Targets.ts`  | `CONCURRENT_MIN_TIME_PCT` (new name, replaces inline `50`)                                                                                                                                                                                                                                                                                                                           | 50                             |
| `hotClipDetection.ts`      | `CLIP_GOOD_MAX_PCT`, `CLIP_FAIR_MAX_PCT` (new names, replace inline `5`/`15`)                                                                                                                                                                                                                                                                                                        | 5, 15                          |
| `swiftmendAudit.ts`        | `SWIFTMEND_WASTEFUL_GOOD_MAX_PCT`, `SWIFTMEND_WASTEFUL_FAIR_MAX_PCT`, `SWIFTMEND_UTILIZATION_GOOD_MIN_PCT`, `SWIFTMEND_UTILIZATION_FAIR_MIN_PCT` (new names, replace inline `40`/`80`/`50`/`25`)                                                                                                                                                                                     | 40, 80, 50, 25                 |
| `downrankingDiscipline.ts` | `DOWNRANK_FLAG_OVERHEAL_PCT` (new name, replaces inline `50`)                                                                                                                                                                                                                                                                                                                        | 50                             |
| `naturesSwiftnessAudit.ts` | `NS_UTILIZATION_GOOD_MIN_PCT`, `NS_UTILIZATION_FAIR_MIN_PCT` (new names, replace inline `75`/`50`)                                                                                                                                                                                                                                                                                   | 75, 50                         |
| `manaCurve.ts`             | `MANA_BAND_GOOD_MIN_PCT`, `MANA_BAND_GOOD_MAX_PCT`, `MANA_BAND_BAD_MIN_PCT` (new names, replace inline `5`/`40`/`70`), `MIN_JUDGED_FIGHT_DURATION_MS`                                                                                                                                                                                                                                | 5, 40, 70, 90000               |
| `consumableThroughput.ts`  | `POTION_FLOOR_INTERVAL_MS`, `RUNE_FLOOR_INTERVAL_MS`, `MANA_DROP_THRESHOLD_PCT`                                                                                                                                                                                                                                                                                                      | 120000, 300000, 70             |
| `innervateAudit.ts`        | `MANA_CONSTRAINED_MIN_DURATION_MS`, `LATE_CAST_FRACTION`                                                                                                                                                                                                                                                                                                                             | 180000, 0.9                    |
| `overhealTable.ts`         | `BLOOM_OVERHEAL_GOOD_MAX_PCT`, `BLOOM_OVERHEAL_FAIR_MAX_PCT`, `DIRECT_OVERHEAL_GOOD_MAX_PCT`, `DIRECT_OVERHEAL_FAIR_MAX_PCT`, `REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT`, `REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT`, `REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT`, `REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT` (new names, replace inline `80`/`90`/`30`/`50`/`38`/`60`/`60`/`85`) | 80, 90, 30, 50, 38, 60, 60, 85 |
| `deathForensics.ts`        | `DEATH_IDLE_WINDOW_MS`                                                                                                                                                                                                                                                                                                                                                               | 5000                           |

- [ ] **Step 1: Simple "just add `export`" edits (no behavior change, no renaming)**

For each of these, the constant already has the exact name shown — just add the `export` keyword in front of its `const` declaration:

- `gcdUtilization.ts`: `const GOOD_MIN_PCT = 85;` → `export const GOOD_MIN_PCT = 85;` (same for `FAIR_MIN_PCT`)
- `idleGaps.ts`: `GOOD_MAX_PCT`, `FAIR_MAX_PCT`
- `lb3Uptime.ts`: `GOOD_MIN_PCT`, `FAIR_MIN_PCT`
- `refreshCadence.ts`: `GOOD_MIN_MS`, `GOOD_MAX_MS`, `FAIR_MIN_MS`
- `accidentalBlooms.ts`: `GOOD_MAX_COUNT`, `FAIR_MAX_COUNT`, `ACCIDENTAL_WINDOW_MS`
- `restackTax.ts`: `LIFEBLOOM_MANA_COST`
- `manaCurve.ts`: `MIN_JUDGED_FIGHT_DURATION_MS`
- `consumableThroughput.ts`: `POTION_FLOOR_INTERVAL_MS`, `RUNE_FLOOR_INTERVAL_MS`, `MANA_DROP_THRESHOLD_PCT`
- `innervateAudit.ts`: `MANA_CONSTRAINED_MIN_DURATION_MS`, `LATE_CAST_FRACTION`
- `deathForensics.ts`: `DEATH_IDLE_WINDOW_MS`

- [ ] **Step 2: Extract-and-export edits (inline literal → new named exported constant)**

`concurrentLb3Targets.ts` — change:

```ts
const judgement: Judgement | null = timeAt2PlusPct >= 50 ? "good" : null;
```

Add above the function (near the top of the file, alongside the existing `MAINTAINED_MIN_UPTIME_PCT`):

```ts
// Story 205/914: 2+ targets need to hold LB3's 3rd stack for at least this
// much of the fight for the reward-only judgement to fire.
export const CONCURRENT_MIN_TIME_PCT = 50;
```

and use it in place of the inline `50`:

```ts
const judgement: Judgement | null =
  timeAt2PlusPct >= CONCURRENT_MIN_TIME_PCT ? "good" : null;
```

`hotClipDetection.ts` — change:

```ts
// Good < 5%, fair 5-15%, bad > 15% of that spell's casts, per
// docs/backlog.md story 301.
function judgeClipPct(clipPct: number): Judgement {
  return judgeThresholdBelow(clipPct, { goodMax: 5, fairMax: 15 });
}
```

to:

```ts
// Good < 5%, fair 5-15%, bad > 15% of that spell's casts, per
// docs/backlog.md story 301.
export const CLIP_GOOD_MAX_PCT = 5;
export const CLIP_FAIR_MAX_PCT = 15;

function judgeClipPct(clipPct: number): Judgement {
  return judgeThresholdBelow(clipPct, {
    goodMax: CLIP_GOOD_MAX_PCT,
    fairMax: CLIP_FAIR_MAX_PCT,
  });
}
```

`swiftmendAudit.ts` — change:

```ts
function judgeWastefulShare(wastefulPct: number): Judgement {
  return judgeThresholdBelow(wastefulPct, { goodMax: 40, fairMax: 80 });
}
```

to (add the two exported constants directly above, using the comment already there):

```ts
export const SWIFTMEND_WASTEFUL_GOOD_MAX_PCT = 40;
export const SWIFTMEND_WASTEFUL_FAIR_MAX_PCT = 80;

function judgeWastefulShare(wastefulPct: number): Judgement {
  return judgeThresholdBelow(wastefulPct, {
    goodMax: SWIFTMEND_WASTEFUL_GOOD_MAX_PCT,
    fairMax: SWIFTMEND_WASTEFUL_FAIR_MAX_PCT,
  });
}
```

and change:

```ts
function judgeUtilization(utilizationPct: number): Judgement {
  return judgeThreshold(utilizationPct, { goodMin: 50, fairMin: 25 });
}
```

to:

```ts
export const SWIFTMEND_UTILIZATION_GOOD_MIN_PCT = 50;
export const SWIFTMEND_UTILIZATION_FAIR_MIN_PCT = 25;

function judgeUtilization(utilizationPct: number): Judgement {
  return judgeThreshold(utilizationPct, {
    goodMin: SWIFTMEND_UTILIZATION_GOOD_MIN_PCT,
    fairMin: SWIFTMEND_UTILIZATION_FAIR_MIN_PCT,
  });
}
```

`downrankingDiscipline.ts` — change:

```ts
const flagged = isMaxRank && rawOverhealPct > 50 && isFlaggable(group.spell);
```

Add above `computeDownrankingDiscipline`:

```ts
// Story 303: a max-rank cast whose direct-heal overheal exceeds this is
// flagged as a likely downranking miss.
export const DOWNRANK_FLAG_OVERHEAL_PCT = 50;
```

and use it:

```ts
const flagged =
  isMaxRank &&
  rawOverhealPct > DOWNRANK_FLAG_OVERHEAL_PCT &&
  isFlaggable(group.spell);
```

`naturesSwiftnessAudit.ts` — change:

```ts
function judgeUtilization(
  castCount: number,
  availableWindows: number,
  utilizationPct: number,
): Judgement {
  if (availableWindows === 1) {
    return castCount >= 1 ? "good" : "fair";
  }
  return judgeThreshold(utilizationPct, { goodMin: 75, fairMin: 50 });
}
```

to:

```ts
export const NS_UTILIZATION_GOOD_MIN_PCT = 75;
export const NS_UTILIZATION_FAIR_MIN_PCT = 50;

function judgeUtilization(
  castCount: number,
  availableWindows: number,
  utilizationPct: number,
): Judgement {
  if (availableWindows === 1) {
    return castCount >= 1 ? "good" : "fair";
  }
  return judgeThreshold(utilizationPct, {
    goodMin: NS_UTILIZATION_GOOD_MIN_PCT,
    fairMin: NS_UTILIZATION_FAIR_MIN_PCT,
  });
}
```

`manaCurve.ts` — change:

```ts
function judgeManaBand(pct: number): Judgement {
  if (pct > 70) return "bad";
  if (pct >= 5 && pct <= 40) return "good";
  return "fair";
}
```

to:

```ts
export const MANA_BAND_GOOD_MIN_PCT = 5;
export const MANA_BAND_GOOD_MAX_PCT = 40;
export const MANA_BAND_BAD_MIN_PCT = 70;

function judgeManaBand(pct: number): Judgement {
  if (pct > MANA_BAND_BAD_MIN_PCT) return "bad";
  if (pct >= MANA_BAND_GOOD_MIN_PCT && pct <= MANA_BAND_GOOD_MAX_PCT)
    return "good";
  return "fair";
}
```

`overhealTable.ts` — change:

```ts
function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { goodMax: 80, fairMax: 90 });
}
```

to:

```ts
export const BLOOM_OVERHEAL_GOOD_MAX_PCT = 80;
export const BLOOM_OVERHEAL_FAIR_MAX_PCT = 90;

function judgeBloomOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, {
    goodMax: BLOOM_OVERHEAL_GOOD_MAX_PCT,
    fairMax: BLOOM_OVERHEAL_FAIR_MAX_PCT,
  });
}
```

change:

```ts
function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, { goodMax: 30, fairMax: 50 });
}
```

to:

```ts
export const DIRECT_OVERHEAL_GOOD_MAX_PCT = 30;
export const DIRECT_OVERHEAL_FAIR_MAX_PCT = 50;

function judgeDirectOverheal(overhealPct: number): Judgement {
  return judgeThresholdBelow(overhealPct, {
    goodMax: DIRECT_OVERHEAL_GOOD_MAX_PCT,
    fairMax: DIRECT_OVERHEAL_FAIR_MAX_PCT,
  });
}
```

and change:

```ts
function judgeRegrowthDirectOverheal(
  overhealPct: number,
  bucket: TalentBucket,
): Judgement {
  if (
    bucket === "likely-dreamstate-full" ||
    bucket === "likely-dreamstate-partial"
  ) {
    return judgeThresholdBelow(overhealPct, { goodMax: 60, fairMax: 85 });
  }
  return judgeThresholdBelow(overhealPct, { goodMax: 38, fairMax: 60 });
}
```

to:

```ts
export const REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT = 38;
export const REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT = 60;
export const REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT = 60;
export const REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT = 85;

function judgeRegrowthDirectOverheal(
  overhealPct: number,
  bucket: TalentBucket,
): Judgement {
  if (
    bucket === "likely-dreamstate-full" ||
    bucket === "likely-dreamstate-partial"
  ) {
    return judgeThresholdBelow(overhealPct, {
      goodMax: REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT,
      fairMax: REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT,
    });
  }
  return judgeThresholdBelow(overhealPct, {
    goodMax: REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT,
    fairMax: REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT,
  });
}
```

- [ ] **Step 3: Run the full existing test suite to confirm zero behavior change**

Run: `npm test`
Expected: PASS, same test count and results as before this task — this is a pure refactor, no test file changes were made in this task.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (`noUnusedLocals` will catch it immediately if any new exported constant is misspelled at its one call-site usage above.)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/gcdUtilization.ts src/metrics/idleGaps.ts src/metrics/lb3Uptime.ts src/metrics/refreshCadence.ts src/metrics/accidentalBlooms.ts src/metrics/restackTax.ts src/metrics/concurrentLb3Targets.ts src/metrics/hotClipDetection.ts src/metrics/swiftmendAudit.ts src/metrics/downrankingDiscipline.ts src/metrics/naturesSwiftnessAudit.ts src/metrics/manaCurve.ts src/metrics/consumableThroughput.ts src/metrics/innervateAudit.ts src/metrics/overhealTable.ts src/metrics/deathForensics.ts
git commit -m "refactor(metrics): export every judgement-threshold constant

No behavior change — visibility only, plus a few inline literals given
names. Lets the upcoming Judgement Rationale page import real numbers
directly instead of hardcoding a second copy that can drift."
```

---

### Task 3: MDX build tooling + page skeleton + intro sections

**Files:**

- Create: `src/mdx.d.ts`
- Create: `src/app/components/JudgementRationale/content.mdx`
- Create: `src/app/components/JudgementRationale/MdxTable.tsx`
- Create: `src/app/components/JudgementRationale/index.tsx`
- Create: `src/app/components/JudgementRationale/index.module.css`
- Create: `src/app/components/JudgementRationale/index.test.tsx`
- Modify: `vite.config.ts`
- Modify: `.prettierignore`
- Modify: `package.json` (via `npm install`)

**Interfaces:**

- Consumes: `DataTable`'s CSS module classnames (`src/app/components/ui/DataTable/index.module.css` — `.tableWrap`, `.table`, `.headerCell`, `.cell`), `Shell` (`src/app/components/ui/Shell`).
- Produces: `JudgementRationale({ slug }: { slug?: string })` component, default-exported from `src/app/components/JudgementRationale/index.tsx`. Every later content task (4–7) edits `content.mdx` only — this task's `index.tsx`/`MdxTable.tsx` don't change again.

- [ ] **Step 1: Install the MDX Vite plugin**

Run: `npm install --save-dev @mdx-js/rollup`
Expected: `package.json`'s `devDependencies` gains `"@mdx-js/rollup"`.

- [ ] **Step 2: Wire it into Vite**

In `vite.config.ts`, add the import:

```ts
import mdx from "@mdx-js/rollup";
```

and change:

```ts
  plugins: [react()],
```

to:

```ts
  plugins: [
    // MDX must run before @vitejs/plugin-react's own transform — it
    // compiles .mdx source straight to plain JS (already using the
    // automatic JSX runtime), so plugin-react's .jsx/.tsx handling never
    // needs to touch its output.
    { enforce: "pre", ...mdx() },
    react(),
  ],
```

- [ ] **Step 3: Add the ambient module declaration**

Create `src/mdx.d.ts`:

```ts
declare module "*.mdx" {
  import type { ComponentType, ReactNode } from "react";

  type MdxComponentOverrides = Record<
    string,
    ComponentType<{ children?: ReactNode }>
  >;

  const MDXComponent: ComponentType<{ components?: MdxComponentOverrides }>;
  export default MDXComponent;
}
```

- [ ] **Step 4: Keep Prettier off the content file**

In `.prettierignore`, add a new line:

```
**/*.mdx
```

(Prettier core has no MDX parser; without this, `npm run format:check` — run in the pre-commit hook and CI — would fail on `content.mdx`.)

- [ ] **Step 5: Write the table-wrapper components**

Create `src/app/components/JudgementRationale/MdxTable.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "../ui/DataTable/index.module.css";

// Reuses DataTable's own CSS module (not the DataTable component itself,
// which takes columns/rows props rather than children) so markdown tables
// in content.mdx get the same overflow-x: auto scroll wrapper every other
// wide table in the app already has (story 706).
export function MdxTable({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>{children}</table>
    </div>
  );
}

export function MdxTh({ children }: { children?: ReactNode }) {
  return <th className={styles.headerCell}>{children}</th>;
}

export function MdxTd({ children }: { children?: ReactNode }) {
  return <td className={styles.cell}>{children}</td>;
}
```

- [ ] **Step 6: Write the page component**

Create `src/app/components/JudgementRationale/index.module.css`:

```css
.page {
  max-width: 720px;
  margin: 0 auto;
}

.toc {
  padding-left: 20px;
  line-height: 1.8;
}

.toc a {
  color: var(--accent);
}
```

Create `src/app/components/JudgementRationale/index.tsx`:

```tsx
import { useEffect } from "react";
import Content from "./content.mdx";
import { MdxTable, MdxTh, MdxTd } from "./MdxTable";
import styles from "./index.module.css";

const MDX_COMPONENTS = { table: MdxTable, th: MdxTh, td: MdxTd };

export interface JudgementRationaleProps {
  slug?: string;
}

export function JudgementRationale({ slug }: JudgementRationaleProps) {
  useEffect(() => {
    if (!slug) return;
    document.getElementById(slug)?.scrollIntoView();
  }, [slug]);

  return (
    <div className={styles.page}>
      <Content components={MDX_COMPONENTS} />
    </div>
  );
}
```

- [ ] **Step 7: Write `content.mdx` — heading, full table of contents, and the two intro sections**

Create `src/app/components/JudgementRationale/content.mdx`:

```mdx
import styles from "./index.module.css";

<h1>How Bloomwatch judges you</h1>

<p>
  This page is for anyone reading a Bloomwatch scorecard: a druid new to healing
  on Restoration, an experienced druid who wants the exact numbers, or a raid
  lead sizing up a healer's play. It starts with the thinking behind the tool,
  then how a single Good/Fair/Bad verdict is actually built, then the exact
  thresholds for every metric, then how the underlying data is pulled from
  Warcraft Logs in the first place.
</p>

<h2>Contents</h2>
<ul className={styles.toc}>
  <li>
    <a href="#/judgements/why-process-not-output">Why process, not output</a>
  </li>
  <li>
    <a href="#/judgements/how-judgements-combine">How judgements combine</a>
  </li>
  <li>
    <a href="#/judgements/gcd-economy">GCD economy</a>
  </li>
  <li>
    <a href="#/judgements/lifebloom-discipline">Lifebloom discipline</a>
  </li>
  <li>
    <a href="#/judgements/spell-discipline">Spell discipline</a>
  </li>
  <li>
    <a href="#/judgements/mana-economy">Mana economy</a>
  </li>
  <li>
    <a href="#/judgements/death-forensics">Death forensics</a>
  </li>
  <li>
    <a href="#/judgements/crisis-response">Crisis response</a>
  </li>
  <li>
    <a href="#/judgements/prep-hygiene">Prep hygiene</a>
  </li>
  <li>
    <a href="#/judgements/where-the-data-comes-from">
      Where the data comes from
    </a>
  </li>
</ul>

<h2 id="why-process-not-output">Why process, not output</h2>

<p>
  Healing is zero-sum. Every hitpoint one healer heals is a hitpoint another
  healer didn't get to heal — so on any given pull, healers are structurally
  competing for the same pool of damage taken. A healing meter ranks that
  competition, not skill: who gets assigned the tank versus raid-wide AoE, how
  many other healers are in the group, how efficiently everyone else played, all
  of that moves the ranking without you doing anything differently. Two druids
  can play a fight identically and land on opposite ends of the meter purely
  because of who they were assigned to heal.
</p>

<p>
  Bloomwatch measures process instead: your GCD utilization, your Lifebloom
  refresh cadence, your mana-potion cooldown usage, whether you had a cooldown
  in reserve when someone nearly died. None of that can be taken from you by a
  co-healer's assignment or a raid comp — it's a fair read on how you actually
  played, pull after pull, independent of who else was in the raid.
</p>

<p>
  That's also why nothing on this page or anywhere in Bloomwatch is built from
  HPS, effective-healing totals, or a parse percentile. If a metric can't be
  answered from your own actions alone, it doesn't belong here.
</p>

<h2 id="how-judgements-combine">How judgements combine</h2>

<p>
  Every individual metric gets its own Good/Fair/Bad verdict against a fixed
  threshold — the rest of this page lists every one of those thresholds. But a
  single fight's scorecard needs to fold several metrics into one verdict per
  group (GCD economy, Lifebloom discipline, and so on), and a whole raid night
  needs to fold several fights into one verdict per group again. Both steps use
  the same idea:
</p>

<p>
  <strong>A mix of good and bad reads as fair, not a flat bad.</strong> If three
  metrics in a group come back good, good, and bad, the group doesn't read as a
  flat "bad" just because one thing went wrong — it reads "fair", since at least
  one of those metrics genuinely went well. This is deliberately symmetric: a
  group that's mostly bad with one good metric is capped at "fair" too, not
  pulled all the way up to "good". A group with no bad metrics at all (say, two
  good and one fair) still resolves by simple worst-of, unaffected by this rule.
</p>

<p>
  The same rule applies one level up, across a whole report: if a metric group
  reads good on some fights and bad on others, the report-wide verdict for that
  group reads "fair", weighted by how long each fight actually ran — a
  two-minute wipe doesn't count as much as a six-minute kill. Without this, a
  single bad pull in an otherwise strong raid night could make an entire metric
  group look like a flat failure.
</p>

<p>
  A metric that depends on a talent you don't have (Swiftmend or Nature's
  Swiftness need specific Restoration talent points, for example) is hidden from
  your scorecard entirely for that build, rather than judged "bad" — Bloomwatch
  only judges what your build could actually have done.
</p>
```

- [ ] **Step 8: Write the component test**

Create `src/app/components/JudgementRationale/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JudgementRationale } from "./index";

describe("JudgementRationale", () => {
  it("renders the heading and every table-of-contents entry", () => {
    render(<JudgementRationale />);

    expect(
      screen.getByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Why process, not output" }),
    ).toHaveAttribute("href", "#/judgements/why-process-not-output");
    expect(screen.getByRole("link", { name: "GCD economy" })).toHaveAttribute(
      "href",
      "#/judgements/gcd-economy",
    );
  });

  it("renders the zero-sum healing argument", () => {
    render(<JudgementRationale />);

    expect(screen.getByText(/Healing is zero-sum/)).toBeInTheDocument();
  });

  it("scrolls to the section matching the given slug", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<JudgementRationale slug="how-judgements-combine" />);

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it("does not scroll when no slug is given", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<JudgementRationale />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run the test**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: PASS, all 4 tests.

- [ ] **Step 10: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors (the `format:check` run confirms `.prettierignore`'s new `**/*.mdx` line actually takes effect).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vite.config.ts .prettierignore src/mdx.d.ts src/app/components/JudgementRationale
git commit -m "feat(judgements): add MDX tooling and the Judgement Rationale page skeleton

Intro sections (why process not output, how judgements combine) prove
the MDX pipeline end to end; per-metric-group sections land in the
following tasks."
```

---

### Task 4: Content — GCD economy and Lifebloom discipline sections

**Files:**

- Modify: `src/app/components/JudgementRationale/content.mdx`
- Modify: `src/app/components/JudgementRationale/index.test.tsx`

**Interfaces:**

- Consumes: `GOOD_MIN_PCT`/`FAIR_MIN_PCT` from `gcdUtilization.ts`; `GOOD_MAX_PCT`/`FAIR_MAX_PCT`/`IDLE_GAP_THRESHOLD_MS` from `idleGaps.ts`; `MAINTAINED_MIN_UPTIME_PCT`/`GOOD_MIN_PCT`/`FAIR_MIN_PCT` from `lb3Uptime.ts`; `GOOD_MIN_MS`/`GOOD_MAX_MS`/`FAIR_MIN_MS` from `refreshCadence.ts`; `GOOD_MAX_COUNT`/`FAIR_MAX_COUNT`/`ACCIDENTAL_WINDOW_MS` from `accidentalBlooms.ts`; `LIFEBLOOM_MANA_COST` from `restackTax.ts`; `CONCURRENT_MIN_TIME_PCT` from `concurrentLb3Targets.ts` (all exported by Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `src/app/components/JudgementRationale/index.test.tsx`, inside the `describe` block:

```tsx
it("renders live GCD utilization thresholds, not hardcoded prose", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/85% or above/)).toBeInTheDocument();
  expect(screen.getByText(/70–85%/)).toBeInTheDocument();
});

it("renders live LB3 uptime thresholds", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/80% or above/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: FAIL — no GCD/Lifebloom sections exist in `content.mdx` yet.

- [ ] **Step 3: Add the imports and the two sections**

At the very top of `content.mdx`, before the `<h1>`, add:

```mdx
import {
  GOOD_MIN_PCT as GCD_GOOD_MIN_PCT,
  FAIR_MIN_PCT as GCD_FAIR_MIN_PCT,
} from "../../../metrics/gcdUtilization";
import {
  GOOD_MAX_PCT as IDLE_GOOD_MAX_PCT,
  FAIR_MAX_PCT as IDLE_FAIR_MAX_PCT,
  IDLE_GAP_THRESHOLD_MS,
} from "../../../metrics/idleGaps";
import {
  MAINTAINED_MIN_UPTIME_PCT,
  GOOD_MIN_PCT as LB3_GOOD_MIN_PCT,
  FAIR_MIN_PCT as LB3_FAIR_MIN_PCT,
} from "../../../metrics/lb3Uptime";
import {
  GOOD_MIN_MS as CADENCE_GOOD_MIN_MS,
  GOOD_MAX_MS as CADENCE_GOOD_MAX_MS,
  FAIR_MIN_MS as CADENCE_FAIR_MIN_MS,
} from "../../../metrics/refreshCadence";
import {
  GOOD_MAX_COUNT as BLOOM_GOOD_MAX_COUNT,
  FAIR_MAX_COUNT as BLOOM_FAIR_MAX_COUNT,
  ACCIDENTAL_WINDOW_MS,
} from "../../../metrics/accidentalBlooms";
import { LIFEBLOOM_MANA_COST } from "../../../metrics/restackTax";
import { CONCURRENT_MIN_TIME_PCT } from "../../../metrics/concurrentLb3Targets";
```

At the end of the file (after the "How judgements combine" section), add:

```mdx
<h2 id="gcd-economy">GCD economy</h2>

<p>
  How much of the fight you spent actually casting, versus standing idle with
  nothing on cooldown.
</p>

<h3 id="gcd-utilization">GCD utilization</h3>
<p>
  Time spent on the global cooldown (or a cast-time spell's actual cast time) as
  a share of the fight's total duration. Good at {GCD_GOOD_MIN_PCT}% or above,
  fair from {GCD_FAIR_MIN_PCT}–{GCD_GOOD_MIN_PCT}%, bad below that. 100% isn't a
  realistic target — it's the theoretical ceiling the percentage is measured
  against, not something anyone actually reaches.
</p>

<h3 id="idle-gap-dead-time">Idle-gap dead time</h3>
<p>
  A gap longer than {IDLE_GAP_THRESHOLD_MS / 1000}s between casts counts as
  idle. Good under {IDLE_GOOD_MAX_PCT}% of the fight spent idle, fair from{" "}
  {IDLE_GOOD_MAX_PCT}–{IDLE_FAIR_MAX_PCT}%, bad above {IDLE_FAIR_MAX_PCT}%.
</p>

<h2 id="lifebloom-discipline">Lifebloom discipline</h2>

<p>
  How well Lifebloom was maintained on the target(s) it was actually kept up on
  — a target only counts as "maintained" once it's held at least{" "}
  {MAINTAINED_MIN_UPTIME_PCT}% any-stack Lifebloom uptime; anything below that
  is treated as an incidental one-off cast, not excluded from the fight
  entirely.
</p>

<h3 id="lb3-uptime-per-target">LB3 uptime per target</h3>
<p>
  Measured from the moment a target first reaches 3 stacks. Good at{" "}
  {LB3_GOOD_MIN_PCT}% or above, fair from {LB3_FAIR_MIN_PCT}–{LB3_GOOD_MIN_PCT}
  %, bad below {LB3_FAIR_MIN_PCT}%, per target. This metric is strongest as a
  read on a dedicated tank-healer assignment — a druid splitting attention
  across many raid-wide targets by design will structurally show lower
  per-target numbers here without having played any worse.
</p>

<h3 id="refresh-cadence">Refresh cadence</h3>
<p>
  How long after reaching 3 stacks each refresh actually landed. Good from{" "}
  {CADENCE_GOOD_MIN_MS / 1000}–{CADENCE_GOOD_MAX_MS / 1000}s, fair from{" "}
  {CADENCE_FAIR_MIN_MS / 1000}–{CADENCE_GOOD_MIN_MS / 1000}s, bad both below{" "}
  {CADENCE_FAIR_MIN_MS / 1000}s (too eager, wasting the stack) and above{" "}
  {CADENCE_GOOD_MAX_MS / 1000}s (too late, risking a natural bloom).
</p>

<h3 id="accidental-blooms">Accidental blooms</h3>
<p>
  A bloom counts as accidental when Lifebloom is re-applied to the same target
  within {ACCIDENTAL_WINDOW_MS / 1000}s of it blooming — evidence the bloom
  itself wasn't the intended play. Good at{" "}
  {BLOOM_GOOD_MAX_COUNT === 1 ? "0" : `under ${BLOOM_GOOD_MAX_COUNT}`}, fair
  from {BLOOM_GOOD_MAX_COUNT}–{BLOOM_FAIR_MAX_COUNT}, bad at{" "}
  {BLOOM_FAIR_MAX_COUNT + 1} or more.
</p>

<h3 id="restack-tax">Re-stack tax</h3>
<p>
  A "tax" cast is one spent re-establishing Lifebloom on a target that had
  already reached 3 stacks and then dropped it entirely — each one costs an
  estimated {LIFEBLOOM_MANA_COST} mana that a clean refresh cycle wouldn't have
  needed. The Good/Fair/Bad bar scales with fight length rather than a fixed
  count, since a longer fight has more opportunities for a stack to drop.
</p>

<h3 id="concurrent-lb3-targets">Concurrent LB3 targets</h3>
<p>
  Reward-only: holding 2 or more targets at 3 stacks for at least{" "}
  {CONCURRENT_MIN_TIME_PCT}% of the fight reads good. There's no fair or bad
  here — how many targets a druid should be juggling at once depends on raid
  healing assignments this tool can't see, so falling short of that bar simply
  isn't judged rather than being counted against you.
</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/JudgementRationale
git commit -m "docs(judgements): add GCD economy and Lifebloom discipline sections"
```

---

### Task 5: Content — Spell discipline and Mana economy sections

**Files:**

- Modify: `src/app/components/JudgementRationale/content.mdx`
- Modify: `src/app/components/JudgementRationale/index.test.tsx`

**Interfaces:**

- Consumes: `CLIP_THRESHOLD_MS`/`CLIP_GOOD_MAX_PCT`/`CLIP_FAIR_MAX_PCT` from `hotClipDetection.ts`; `SWIFTMEND_COOLDOWN_MS`/`SWIFTMEND_WASTEFUL_GOOD_MAX_PCT`/`SWIFTMEND_WASTEFUL_FAIR_MAX_PCT`/`SWIFTMEND_UTILIZATION_GOOD_MIN_PCT`/`SWIFTMEND_UTILIZATION_FAIR_MIN_PCT` from `swiftmendAudit.ts`; `DOWNRANK_FLAG_OVERHEAL_PCT` from `downrankingDiscipline.ts`; `NATURES_SWIFTNESS_COOLDOWN_MS`/`NS_UTILIZATION_GOOD_MIN_PCT`/`NS_UTILIZATION_FAIR_MIN_PCT` from `naturesSwiftnessAudit.ts`; `MANA_BAND_GOOD_MIN_PCT`/`MANA_BAND_GOOD_MAX_PCT`/`MANA_BAND_BAD_MIN_PCT` from `manaCurve.ts`; `POTION_FLOOR_INTERVAL_MS`/`RUNE_FLOOR_INTERVAL_MS`/`MANA_DROP_THRESHOLD_PCT` from `consumableThroughput.ts`; `MANA_CONSTRAINED_MIN_DURATION_MS`/`LATE_CAST_FRACTION` from `innervateAudit.ts`; `BLOOM_OVERHEAL_GOOD_MAX_PCT`/`BLOOM_OVERHEAL_FAIR_MAX_PCT`/`DIRECT_OVERHEAL_GOOD_MAX_PCT`/`DIRECT_OVERHEAL_FAIR_MAX_PCT`/`REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT`/`REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT`/`REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT`/`REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT` from `overhealTable.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `index.test.tsx`:

```tsx
it("renders live Swiftmend wasteful-share thresholds", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/under 40%/)).toBeInTheDocument();
});

it("renders live ending-mana band thresholds", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/hoarding/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: FAIL.

- [ ] **Step 3: Add the imports and the two sections**

Add to the top-of-file import block:

```mdx
import {
  CLIP_THRESHOLD_MS,
  CLIP_GOOD_MAX_PCT,
  CLIP_FAIR_MAX_PCT,
} from "../../../metrics/hotClipDetection";
import {
  SWIFTMEND_COOLDOWN_MS,
  SWIFTMEND_WASTEFUL_GOOD_MAX_PCT,
  SWIFTMEND_WASTEFUL_FAIR_MAX_PCT,
  SWIFTMEND_UTILIZATION_GOOD_MIN_PCT,
  SWIFTMEND_UTILIZATION_FAIR_MIN_PCT,
} from "../../../metrics/swiftmendAudit";
import { DOWNRANK_FLAG_OVERHEAL_PCT } from "../../../metrics/downrankingDiscipline";
import {
  NATURES_SWIFTNESS_COOLDOWN_MS,
  NS_UTILIZATION_GOOD_MIN_PCT,
  NS_UTILIZATION_FAIR_MIN_PCT,
} from "../../../metrics/naturesSwiftnessAudit";
import {
  MANA_BAND_GOOD_MIN_PCT,
  MANA_BAND_GOOD_MAX_PCT,
  MANA_BAND_BAD_MIN_PCT,
} from "../../../metrics/manaCurve";
import {
  POTION_FLOOR_INTERVAL_MS,
  RUNE_FLOOR_INTERVAL_MS,
  MANA_DROP_THRESHOLD_PCT,
} from "../../../metrics/consumableThroughput";
import {
  MANA_CONSTRAINED_MIN_DURATION_MS,
  LATE_CAST_FRACTION,
} from "../../../metrics/innervateAudit";
import {
  BLOOM_OVERHEAL_GOOD_MAX_PCT,
  BLOOM_OVERHEAL_FAIR_MAX_PCT,
  DIRECT_OVERHEAL_GOOD_MAX_PCT,
  DIRECT_OVERHEAL_FAIR_MAX_PCT,
  REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT,
  REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT,
  REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT,
  REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT,
} from "../../../metrics/overhealTable";
```

Append to `content.mdx`:

```mdx
<h2 id="spell-discipline">Spell discipline</h2>

<h3 id="rejuv-clip-share">Rejuvenation clip share</h3>
<p>
  A refresh "clips" the old application when it still had more than{" "}
  {CLIP_THRESHOLD_MS / 1000}s (more than one tick) left. Good under{" "}
  {CLIP_GOOD_MAX_PCT}% of casts clipped, fair from {CLIP_GOOD_MAX_PCT}–
  {CLIP_FAIR_MAX_PCT}%, bad above {CLIP_FAIR_MAX_PCT}%. Regrowth's own clip rate
  is shown for context only, with no verdict attached — in Tree of Form,
  Regrowth is the only non-cooldown direct heal available, so clipping its own
  HoT tail to answer burst damage is the correct play, not a process error.
</p>

<h3 id="swiftmend-quality-audit">Swiftmend quality audit</h3>
<p>
  Every Swiftmend cast is classified efficient (consumed a HoT with{" "}
  {CLIP_THRESHOLD_MS / 1000}s or less remaining), emergency (target at 50% HP or
  below), or wasteful (neither). Wasteful share: good under{" "}
  {SWIFTMEND_WASTEFUL_GOOD_MAX_PCT}%, fair from{" "}
  {SWIFTMEND_WASTEFUL_GOOD_MAX_PCT}–{SWIFTMEND_WASTEFUL_FAIR_MAX_PCT}%, bad
  above {SWIFTMEND_WASTEFUL_FAIR_MAX_PCT}%. Utilization — casts versus its{" "}
  {SWIFTMEND_COOLDOWN_MS / 1000}s cooldown's real availability — good at{" "}
  {SWIFTMEND_UTILIZATION_GOOD_MIN_PCT}% or above, fair from{" "}
  {SWIFTMEND_UTILIZATION_FAIR_MIN_PCT}–{SWIFTMEND_UTILIZATION_GOOD_MIN_PCT}%,
  bad below {SWIFTMEND_UTILIZATION_FAIR_MIN_PCT}% (provisional — this particular
  band hasn't been checked against a large sample of real logs yet, unlike most
  other thresholds on this page).
</p>

<h3 id="downranking-discipline">Downranking discipline</h3>
<p>
  A max-rank Regrowth or Healing Touch cast is flagged when its direct-heal
  portion overheals past {DOWNRANK_FLAG_OVERHEAL_PCT}% — a sign a lower rank
  might have healed for less waste. Good with zero flags, fair with one or more;
  bad isn't reachable here, since there are only two flaggable spell groups in
  the first place.
</p>

<h3 id="natures-swiftness-utilization">Nature's Swiftness utilization</h3>
<p>
  Casts versus its {NATURES_SWIFTNESS_COOLDOWN_MS / 60000}-minute cooldown's
  real availability. Good at {NS_UTILIZATION_GOOD_MIN_PCT}% or above, fair from{" "}
  {NS_UTILIZATION_FAIR_MIN_PCT}–{NS_UTILIZATION_GOOD_MIN_PCT}%, bad below{" "}
  {NS_UTILIZATION_FAIR_MIN_PCT}% — except on a fight under{" "}
  {NATURES_SWIFTNESS_COOLDOWN_MS / 60000} minutes, where there's only one real
  window: holding it in reserve for an emergency that simply doesn't arrive
  reads fair there, not bad.
</p>

<h2 id="mana-economy">Mana economy</h2>

<h3 id="ending-mana">Ending mana</h3>
<p>
  Mana remaining at the end of a kill, checked only on fights lasting at least
  90 seconds. Good between {MANA_BAND_GOOD_MIN_PCT}–{MANA_BAND_GOOD_MAX_PCT}%,
  fair either just below that ({MANA_BAND_GOOD_MIN_PCT}% or under — near-OOM is
  understandable, not penalized the same as hoarding) or from{" "}
  {MANA_BAND_GOOD_MAX_PCT}–{MANA_BAND_BAD_MIN_PCT}%, bad above{" "}
  {MANA_BAND_BAD_MIN_PCT}% — ending a kill with that much mana left unspent is
  hoarding, not efficiency.
</p>

<h3 id="consumable-throughput">Consumable throughput</h3>
<p>
  Only judged on fights where mana dropped below {MANA_DROP_THRESHOLD_PCT}% at
  some point — a fight that never got mana-tight is exempt entirely. Mana
  Potion's expected floor is one per {POTION_FLOOR_INTERVAL_MS / 60000} minutes
  of fight length; Rune's (Dark Rune or Demonic Rune, sharing one cooldown) is
  one per {RUNE_FLOOR_INTERVAL_MS / 60000} minutes — Runes cost health and need
  crafted or scarce reagents, so real elite play uses them far less often than
  Mana Potions. Good at or above the floor, fair one below it, bad two or more
  below.
</p>

<h3 id="innervate-audit">Innervate audit</h3>
<p>
  Casting Innervate on a mana-using ally reads good; wasting it on a non-mana
  class (Warrior, Rogue, or a Feral druid) reads bad. A self-cast reads good if
  it lands before {LATE_CAST_FRACTION * 100}% of the fight has elapsed, fair
  after. Never casting it at all in a mana-constrained fight running{" "}
  {MANA_CONSTRAINED_MIN_DURATION_MS / 60000}+ minutes reads bad.
</p>

<h3 id="overheal-table">Overheal table</h3>
<p>
  Lifebloom's bloom: good under {BLOOM_OVERHEAL_GOOD_MAX_PCT}%, fair from{" "}
  {BLOOM_OVERHEAL_GOOD_MAX_PCT}–{BLOOM_OVERHEAL_FAIR_MAX_PCT}%, bad above{" "}
  {BLOOM_OVERHEAL_FAIR_MAX_PCT}%. Healing Touch and Swiftmend's direct heals:
  good under {DIRECT_OVERHEAL_GOOD_MAX_PCT}%, fair from{" "}
  {DIRECT_OVERHEAL_GOOD_MAX_PCT}–{DIRECT_OVERHEAL_FAIR_MAX_PCT}%, bad above{" "}
  {DIRECT_OVERHEAL_FAIR_MAX_PCT}%. Regrowth's direct-heal portion splits by
  build: a deep-Restoration druid is judged good under{" "}
  {REGROWTH_OVERHEAL_DEEP_RESTO_GOOD_MAX_PCT}%, fair to{" "}
  {REGROWTH_OVERHEAL_DEEP_RESTO_FAIR_MAX_PCT}%, bad above it; a Dreamstate build
  (full or partial) runs structurally higher and is judged good under{" "}
  {REGROWTH_OVERHEAL_DREAMSTATE_GOOD_MAX_PCT}%, fair to{" "}
  {REGROWTH_OVERHEAL_DREAMSTATE_FAIR_MAX_PCT}%, bad above it. Rejuvenation and
  Regrowth's HoT-tick overheal is shown for context only, with no verdict — high
  overheal is inherent to a HoT ticking on an already-topped-off target.
</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/JudgementRationale
git commit -m "docs(judgements): add Spell discipline and Mana economy sections"
```

---

### Task 6: Content — Death forensics, Crisis response, Prep hygiene, and "Where the data comes from"

**Files:**

- Modify: `src/app/components/JudgementRationale/content.mdx`
- Modify: `src/app/components/JudgementRationale/index.test.tsx`
- Create: `src/app/components/JudgementRationale/GraphQLExample.tsx` (a small wrapper so the real query snippet can reuse the existing `Disclosure` component from MDX)
- Modify: `src/app/components/JudgementRationale/index.module.css`

**Interfaces:**

- Consumes: `DEATH_IDLE_WINDOW_MS` from `deathForensics.ts`; `CRISIS_THRESHOLD_PCT` from `nearDeathResponse.ts` (already exported); `BATTLE_ELIXIR_NAMES`/`GUARDIAN_ELIXIR_NAMES`/`FLASK_NAMES` from `prepHygiene.ts` (already exported); `Disclosure` (`src/app/components/ui/Disclosure`).

This task writes the plan's last four sections together, in one pass, so `content.mdx` never has to carry a stand-in heading between commits.

- [ ] **Step 1: Write the failing tests**

Add to `index.test.tsx`:

```tsx
it("renders live death-forensics and crisis-response thresholds", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/2 or more unspent/)).toBeInTheDocument();
  expect(screen.getByText(/15% or below/)).toBeInTheDocument();
});

it("explains the data pipeline conceptually, with no verdict data ever stored", () => {
  render(<JudgementRationale />);

  expect(screen.getByText(/nothing is stored anywhere/)).toBeInTheDocument();
});

it("keeps the one real query example collapsed by default, behind a disclosure", async () => {
  render(<JudgementRationale />);

  expect(screen.queryByText(/reportData/)).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "See a real example query" }),
  );

  expect(screen.getByText(/reportData/)).toBeInTheDocument();
});

it("links out to the GitHub repository for the full technical picture", () => {
  render(<JudgementRationale />);

  expect(
    screen.getByRole("link", { name: /Read more on GitHub/ }),
  ).toHaveAttribute("href", "https://github.com/branneman/bloomwatch#readme");
});
```

Add `import userEvent from "@testing-library/user-event";` to the top of `index.test.tsx` if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: FAIL — none of these four sections exist in `content.mdx` yet.

- [ ] **Step 3: Write the GraphQL example wrapper**

Create `src/app/components/JudgementRationale/GraphQLExample.tsx`:

```tsx
import { Disclosure } from "../ui/Disclosure";
import styles from "./index.module.css";

// A real, slightly-trimmed version of the query src/wcl/events.ts actually
// sends — kept as one worked example rather than an exhaustive API
// reference, which lives in the repository's own README instead.
const EXAMPLE_QUERY = `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "4GYHZRdtL3bvhpc8") {
      events(
        fightIDs: [6]
        dataType: Buffs
        startTime: 0
        endTime: 300000
        includeResources: true
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

export function GraphQLExample() {
  return (
    <Disclosure summary="See a real example query">
      <p>
        This is the actual shape of the request Bloomwatch sends to fetch one
        fight&apos;s Lifebloom buff events — the same query LB3 uptime, refresh
        cadence, and accidental blooms are all built from:
      </p>
      <pre className={styles.query}>
        <code>{EXAMPLE_QUERY}</code>
      </pre>
    </Disclosure>
  );
}
```

Add to `src/app/components/JudgementRationale/index.module.css`:

```css
.query {
  overflow-x: auto;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: var(--text-small-size);
}
```

- [ ] **Step 4: Add the imports and all four sections to `content.mdx`**

Add to the top-of-file import block:

```mdx
import { DEATH_IDLE_WINDOW_MS } from "../../../metrics/deathForensics";
import { CRISIS_THRESHOLD_PCT } from "../../../metrics/nearDeathResponse";
import {
  FLASK_NAMES,
  BATTLE_ELIXIR_NAMES,
  GUARDIAN_ELIXIR_NAMES,
} from "../../../metrics/prepHygiene";
import { GraphQLExample } from "./GraphQLExample";
```

Append to `content.mdx`:

```mdx
<h2 id="death-forensics">Death forensics</h2>
<p>
  Every death of a target the druid was actively maintaining (per Lifebloom
  discipline's own "maintained target" bar above) is checked for unspent
  resources at the moment it happened: was Swiftmend off cooldown, was Nature's
  Swiftness off cooldown, and had the druid gone idle (no cast) for at least{" "}
  {DEATH_IDLE_WINDOW_MS / 1000}s beforehand. Zero unspent resources reads good,
  one reads fair, 2 or more unspent reads bad — a death where every safety net
  was still available and unused is the clearest sign something could have gone
  differently. Deaths of targets the druid wasn't maintaining aren't judged at
  all — they're outside what this tool can fairly attribute to the druid's own
  play.
</p>

<h2 id="crisis-response">Crisis response</h2>
<p>
  The same unspent-resource check as death forensics, but for near-misses: any
  raid member whose health dropped to {CRISIS_THRESHOLD_PCT}% or below and
  survived. Responding with a heal in time reads good outright, regardless of
  what else was in reserve. Not responding falls back to the same 0/1/2+
  unspent-resources scale death forensics uses. Crises outside a druid's clear
  one-or-two-target assignment are shown for context only, not judged — the same
  scope limit death forensics doesn't need, since it only ever looks at targets
  the druid was already maintaining.
</p>

<h2 id="prep-hygiene">Prep hygiene</h2>
<p>
  Checked once per fight, from the raid buffs already active at pull: flask or
  elixir coverage (a real flask, or both a battle elixir and a guardian elixir
  together, reads good; exactly one of the two reads fair; neither reads bad), a
  food buff (present or missing), and Superior Wizard Oil on the main-hand
  weapon (present or missing). The last two are binary — no fair band, just
  present or missing.
</p>

<h2 id="where-the-data-comes-from">Where the data comes from</h2>
<p>
  Every number on this page and every scorecard in the app is computed from data
  pulled directly from Warcraft Logs' own public API (GraphQL, API v2) — from
  your browser, not from any Bloomwatch server, because there isn't one. Nothing
  is stored anywhere: closing the tab and pasting the same report link again
  re-fetches and re-computes everything from scratch.
</p>
<p>
  The pipeline, in order: the report's metadata and fight list, then which raid
  member is the druid being judged, then that druid's own casts, buffs, and
  resource events for whichever fight (or fights) are selected — all of it
  recombined in your browser into the metrics above.
</p>
<GraphQLExample />
<p>
  <a href="https://github.com/branneman/bloomwatch#readme">
    Read more on GitHub →
  </a>
</p>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/components/JudgementRationale`
Expected: PASS, all 12 tests.

- [ ] **Step 6: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/JudgementRationale
git commit -m "docs(judgements): add Death forensics, Crisis response, Prep hygiene, and data-sourcing sections"
```

---

### Task 7: Wire the routes into `App.tsx`, and link About ↔ Judgements

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/app/components/Onboarding/index.tsx`
- Modify: `src/app/components/Onboarding/index.test.tsx`
- Modify: `src/app/components/Onboarding/index.module.css`
- Modify: `src/app/components/ui/Footer/index.tsx`
- Modify: `src/app/components/ui/Footer/index.test.tsx`
- Modify: `src/app/components/ui/Footer/index.module.css`

**Interfaces:**

- Consumes: `JudgementRationale` (Task 3), `Route` (Task 1).
- Produces: `Onboarding` gains no new required props (its new link is a plain anchor, per Task 1's `hashchange` fix — no callback threading needed). `Footer` gains no new required props either, for the same reason.

- [ ] **Step 1: Write the failing App-level tests**

In `src/App.test.tsx`, add a new `describe` block after `describe("App — Onboarding", ...)`:

```tsx
describe("App — About and Judgements routes", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("shows the About screen and updates the hash when visited directly", () => {
    window.history.pushState(null, "", "#/about");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/about");
  });

  it("shows the Judgement Rationale screen when visited directly", () => {
    window.history.pushState(null, "", "#/judgements");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
  });

  it("links from About to the Judgement Rationale page", async () => {
    window.history.pushState(null, "", "#/about");
    const user = userEvent.setup();

    render(<App />);

    await user.click(
      screen.getByRole("link", { name: /Read the full judgement rationale/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/judgements");
  });

  it("opens the Judgement Rationale page from the footer, once authenticated", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("link", { name: "How judgements work" }));

    expect(
      await screen.findByRole("heading", { name: "How Bloomwatch judges you" }),
    ).toBeInTheDocument();
  });
});

describe("App — first-visit redirect to About", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
  });

  it("redirects a first-time visit at the root to #/about", () => {
    render(<App />);

    expect(window.location.hash).toBe("#/about");
    expect(
      screen.getByRole("heading", { name: "What this is" }),
    ).toBeInTheDocument();
  });

  it("returns to the originally-requested screen after Continue", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    const user = userEvent.setup();

    render(<App />);
    expect(window.location.hash).toBe("#/about");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByLabelText("Report URL or code")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/");
  });

  it("does not redirect a direct first-time visit to #/about itself", () => {
    window.history.pushState(null, "", "#/about");

    render(<App />);

    expect(window.location.hash).toBe("#/about");
  });
});
```

Add `import userEvent from "@testing-library/user-event";` — already imported at the top of `App.test.tsx`, no change needed there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — none of the new routes/links exist yet.

- [ ] **Step 3: Add the plain anchors to `Onboarding` and `Footer`**

In `src/app/components/Onboarding/index.tsx`, add before the closing `<p className={styles.caption}>` paragraph:

```tsx
<p className={styles.section}>
  Want the exact thresholds, and how the data is pulled from Warcraft Logs in
  the first place?{" "}
  <a href="#/judgements" className={styles.inlineLink}>
    Read the full judgement rationale →
  </a>
</p>
```

Add to `src/app/components/Onboarding/index.module.css`:

```css
.inlineLink {
  color: var(--accent);
}
```

In `src/app/components/ui/Footer/index.tsx`, change:

```tsx
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.aboutLink}
          onClick={onReopenOnboarding}
        >
          About
        </button>
```

to:

```tsx
      <div className={styles.inner}>
        <div className={styles.links}>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={onReopenOnboarding}
          >
            About
          </button>
          <a href="#/judgements" className={styles.aboutLink}>
            How judgements work
          </a>
        </div>
```

Add to `src/app/components/ui/Footer/index.module.css`:

```css
.links {
  display: flex;
  align-items: center;
  gap: 16px;
}
```

- [ ] **Step 4: Update `Onboarding`'s and `Footer`'s own component tests**

Add to `src/app/components/Onboarding/index.test.tsx`:

```tsx
it("links to the Judgement Rationale page", () => {
  render(<Onboarding onContinue={vi.fn()} />);

  expect(
    screen.getByRole("link", { name: "Read the full judgement rationale →" }),
  ).toHaveAttribute("href", "#/judgements");
});
```

Add to `src/app/components/ui/Footer/index.test.tsx`:

```tsx
it("links to the Judgement Rationale page", () => {
  render(<Footer onReopenOnboarding={vi.fn()} rateLimitUsage={null} />);

  expect(
    screen.getByRole("link", { name: "How judgements work" }),
  ).toHaveAttribute("href", "#/judgements");
});
```

- [ ] **Step 5: Restructure `App.tsx`'s render to handle the two new routes and the redirect**

In `src/App.tsx`, add the import:

```tsx
import { JudgementRationale } from "./app/components/JudgementRationale";
```

Replace:

```tsx
const [onboardingDismissed, setOnboardingDismissed] = useState(
  () => localStorage.getItem(ONBOARDING_SEEN_KEY) === "true",
);
```

with:

```tsx
const pendingRouteRef = useRef<Route | null>(null);

// First-time visit anywhere (not already headed to #/about itself):
// remember where the visitor was actually headed, then redirect to
// About. handleContinueFromAbout() below sends them on to that
// remembered destination once they dismiss it — mirroring the old
// "onboarding is an overlay, the route underneath is untouched" behavior,
// just expressed as an explicit route now that About has a real URL.
useEffect(() => {
  if (localStorage.getItem(ONBOARDING_SEEN_KEY) === "true") return;
  if (route.screen === "about") return;
  pendingRouteRef.current = route;
  navigate({ screen: "about" });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: only the very first resolved route should ever trigger this redirect, not every subsequent route change.
}, []);
```

Add `useRef` to the existing `react` import at the top of the file (change `import { useCallback, useEffect, useMemo, useState } from "react";` to `import { useCallback, useEffect, useMemo, useRef, useState } from "react";`), and add `import type { Route } from "./app/routing/hashRoute";` near the other type-only imports.

Replace:

```tsx
function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  setOnboardingDismissed(true);
}

function reopenOnboarding() {
  setOnboardingDismissed(false);
}
```

with:

```tsx
function handleContinueFromAbout() {
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  navigate(pendingRouteRef.current ?? { screen: "input" });
  pendingRouteRef.current = null;
}
```

Now restructure the return statement. Replace:

```tsx
  return (
    <>
      {!onboardingDismissed && (
        <Shell>
          <Onboarding onContinue={dismissOnboarding} />
        </Shell>
      )}

      {onboardingDismissed && !accessToken && (
        <Shell>
          <div className={styles.connectHeader}>
            <img src={logo} width={40} height={40} alt="" />
            <h1>Bloomwatch</h1>
          </div>
          <p className={styles.tagline}>
            Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
            scorecard that judges your process — not another parse percentile
            that healing, being zero-sum, can&apos;t fairly measure.
          </p>
          <Button onClick={() => connect()}>
            Connect to Warcraft Logs (WCL)
          </Button>
          <Disclosure summary="Optional: Use your own WCL API Client ID instead">
            <OwnClientIdField onConnect={connect} />
          </Disclosure>
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={reopenOnboarding}
            >
              About
            </button>
          </p>
        </Shell>
      )}

      {/* Onboarding and the pre-auth connect screen already show their own
          large centered logo+heading (a "hero" treatment) — this persistent
          slim header only starts once the user is past that gate, so it
          never duplicates the identity chrome. */}
      {onboardingDismissed && accessToken && (
        <AppHeader onClick={handleStartOver} />
      )}
```

with:

```tsx
  if (route.screen === "about") {
    return (
      <Shell>
        <Onboarding onContinue={handleContinueFromAbout} />
      </Shell>
    );
  }

  if (route.screen === "judgements") {
    return (
      <Shell>
        <JudgementRationale slug={route.slug} />
      </Shell>
    );
  }

  return (
    <>
      {!accessToken && (
        <Shell>
          <div className={styles.connectHeader}>
            <img src={logo} width={40} height={40} alt="" />
            <h1>Bloomwatch</h1>
          </div>
          <p className={styles.tagline}>
            Keep your Lifeblooms rolling. Paste a Warcraft Logs report and get a
            scorecard that judges your process — not another parse percentile
            that healing, being zero-sum, can&apos;t fairly measure.
          </p>
          <Button onClick={() => connect()}>
            Connect to Warcraft Logs (WCL)
          </Button>
          <Disclosure summary="Optional: Use your own WCL API Client ID instead">
            <OwnClientIdField onConnect={connect} />
          </Disclosure>
          <p className={styles.connectFooter}>
            No account, no server, no secret — every request to Warcraft Logs is
            made directly from your browser.{" "}
            <button
              type="button"
              className={styles.aboutLink}
              onClick={() => navigate({ screen: "about" })}
            >
              About
            </button>
          </p>
        </Shell>
      )}

      {/* Onboarding and the pre-auth connect screen already show their own
          large centered logo+heading (a "hero" treatment) — this persistent
          slim header only starts once the user is past that gate, so it
          never duplicates the identity chrome. */}
      {accessToken && <AppHeader onClick={handleStartOver} />}
```

Then, further down in the same return block, replace every remaining `onboardingDismissed && accessToken` condition with plain `accessToken` (three more occurrences: the rate-limited `Alert`/`OwnClientIdField` block, the `RateLimitBanner` block, and the big `<div ...>` wrapping `AbilityResolver`/`DruidDetector`/route screens), and replace the final:

```tsx
{
  onboardingDismissed && accessToken && (
    <Footer
      onReopenOnboarding={reopenOnboarding}
      rateLimitUsage={rateLimitUsage}
    />
  );
}
```

with:

```tsx
{
  accessToken && (
    <Footer
      onReopenOnboarding={() => navigate({ screen: "about" })}
      rateLimitUsage={rateLimitUsage}
    />
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx src/app/components/Onboarding src/app/components/ui/Footer`
Expected: PASS — including every pre-existing test in these three files, unchanged (the "App — Onboarding" describe block's four tests should pass exactly as before; verify none regressed).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, entire suite green.

- [ ] **Step 8: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/app/components/Onboarding src/app/components/ui/Footer
git commit -m "feat(app): route About/Judgements as real URLs, link them together

Onboarding is now the screen at #/about instead of localStorage-gated
overlay state; a first-time visit anywhere redirects there and Continue
resumes wherever the visitor was actually headed. Footer and About both
link to the new #/judgements page."
```

---

### Task 8: `MetricCard` deep-link, wired into all 18 cards

**Files:**

- Modify: `src/app/components/ui/MetricCard/index.tsx`
- Modify: `src/app/components/ui/MetricCard/index.test.tsx`
- Modify: `src/app/components/ui/MetricCard/index.module.css`
- Modify (add one prop + one JSX line, at every `<MetricCard ...>` call site — 2–4 occurrences per file): `GCDUtilizationCard`, `IdleGapsCard`, `LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `ConcurrentTargetsCard`, `HotClipDetectionCard`, `SwiftmendAuditCard`, `DownrankingDisciplineCard`, `NaturesSwiftnessCard`, `ManaCurveCard`, `ConsumableThroughputCard`, `InnervateAuditCard`, `OverhealTableCard`, `DeathForensicsCard`, `NearDeathResponseCard`, `PrepHygieneCard` (all under `src/app/components/*Card/index.tsx`).

**Interfaces:**

- Produces: `MetricCardProps` gains `rationaleSlug?: string`.

| Card file                   | `rationaleSlug`                   |
| --------------------------- | --------------------------------- |
| `GCDUtilizationCard`        | `"gcd-utilization"`               |
| `IdleGapsCard`              | `"idle-gap-dead-time"`            |
| `LB3UptimeCard`             | `"lb3-uptime-per-target"`         |
| `RefreshCadenceCard`        | `"refresh-cadence"`               |
| `AccidentalBloomsCard`      | `"accidental-blooms"`             |
| `RestackTaxCard`            | `"restack-tax"`                   |
| `ConcurrentTargetsCard`     | `"concurrent-lb3-targets"`        |
| `HotClipDetectionCard`      | `"rejuv-clip-share"`              |
| `SwiftmendAuditCard`        | `"swiftmend-quality-audit"`       |
| `DownrankingDisciplineCard` | `"downranking-discipline"`        |
| `NaturesSwiftnessCard`      | `"natures-swiftness-utilization"` |
| `ManaCurveCard`             | `"ending-mana"`                   |
| `ConsumableThroughputCard`  | `"consumable-throughput"`         |
| `InnervateAuditCard`        | `"innervate-audit"`               |
| `OverhealTableCard`         | `"overheal-table"`                |
| `DeathForensicsCard`        | `"death-forensics"`               |
| `NearDeathResponseCard`     | `"crisis-response"`               |
| `PrepHygieneCard`           | `"prep-hygiene"`                  |

Every one of these slugs matches an `id=` already present in `content.mdx` from Tasks 4–6 — this task doesn't add new ids, only links to the existing ones.

- [ ] **Step 1: Write the failing `MetricCard` test**

Add to `src/app/components/ui/MetricCard/index.test.tsx` (it already imports `render`/`screen` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`, and `describe`/`expect`/`it` from `vitest` — reuse those, no new imports needed):

```tsx
it("shows a link to the full rationale when rationaleSlug is given", async () => {
  const user = userEvent.setup();
  render(
    <MetricCard
      title="GCD utilization"
      threshold="Good >= 85%."
      rationaleSlug="gcd-utilization"
    />,
  );

  await user.click(screen.getByRole("button", { name: "Why this threshold?" }));

  expect(
    screen.getByRole("link", { name: "Read the full rationale →" }),
  ).toHaveAttribute("href", "#/judgements/gcd-utilization");
});

it("shows no rationale link when rationaleSlug is omitted", async () => {
  const user = userEvent.setup();
  render(<MetricCard title="GCD utilization" threshold="Good >= 85%." />);

  await user.click(screen.getByRole("button", { name: "Why this threshold?" }));

  expect(
    screen.queryByRole("link", { name: "Read the full rationale →" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/MetricCard`
Expected: FAIL — `rationaleSlug` isn't a recognized prop yet, and no link renders.

- [ ] **Step 3: Add the prop to `MetricCard`**

In `src/app/components/ui/MetricCard/index.tsx`, change:

```tsx
export interface MetricCardProps {
  icon?: string;
  title: string;
  value?: string;
  pct?: number;
  judgement?: Judgement | null;
  note?: string;
  threshold: string;
  children?: ReactNode;
}
```

to:

```tsx
export interface MetricCardProps {
  icon?: string;
  title: string;
  value?: string;
  pct?: number;
  judgement?: Judgement | null;
  note?: string;
  threshold: string;
  rationaleSlug?: string;
  children?: ReactNode;
}
```

and change:

```tsx
export function MetricCard({
  icon,
  title,
  value,
  pct,
  judgement,
  note,
  threshold,
  children,
}: MetricCardProps) {
```

to:

```tsx
export function MetricCard({
  icon,
  title,
  value,
  pct,
  judgement,
  note,
  threshold,
  rationaleSlug,
  children,
}: MetricCardProps) {
```

and change:

```tsx
<div className={styles.disclosure}>
  <Disclosure summary="Why this threshold?">{threshold}</Disclosure>
</div>
```

to:

```tsx
<div className={styles.disclosure}>
  <Disclosure summary="Why this threshold?">
    {threshold}
    {rationaleSlug && (
      <>
        {" "}
        <a
          href={`#/judgements/${rationaleSlug}`}
          className={styles.rationaleLink}
        >
          Read the full rationale →
        </a>
      </>
    )}
  </Disclosure>
</div>
```

Add to `src/app/components/ui/MetricCard/index.module.css`:

```css
.rationaleLink {
  color: var(--accent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/MetricCard`
Expected: PASS, both new tests.

- [ ] **Step 5: Wire `rationaleSlug` into every card's `<MetricCard>` call sites**

For each of the 18 files listed in the table above: find every `<MetricCard` JSX open tag in that file (2–4 per file, one per loading/error/ready render branch — see `GCDUtilizationCard`'s 3 occurrences and `SwiftmendAuditCard`'s 4 as examples of the pattern already in the codebase) and add the matching `rationaleSlug="..."` prop, e.g. for `GCDUtilizationCard`:

```tsx
      <MetricCard
        icon={gcdUtilizationIcon}
        title="GCD utilization"
        threshold={threshold}
        rationaleSlug="gcd-utilization"
      >
```

applied at all 3 of its `<MetricCard>` occurrences. Repeat for the other 17 files using the slug from the table, at every `<MetricCard>` occurrence in that file.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, entire suite green — this step is purely additive (a new prop on existing render output), so no existing test in any of the 18 card test files should need changes.

- [ ] **Step 7: Typecheck, lint, format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 8: Verify every slug actually resolves to a real heading id**

Run:

```bash
grep -oE 'rationaleSlug="[a-z0-9-]+"' src/app/components/*Card/index.tsx | sed -E 's/.*"(.+)"/\1/' | sort -u > /tmp/used-slugs.txt
grep -oE 'id="[a-z0-9-]+"' src/app/components/JudgementRationale/content.mdx | sed -E 's/.*"(.+)"/\1/' | sort -u > /tmp/defined-ids.txt
comm -23 /tmp/used-slugs.txt /tmp/defined-ids.txt
```

Expected: no output (every slug used by a card has a matching `id` in `content.mdx`). If anything prints, fix the mismatched slug or add the missing `id` before continuing.

- [ ] **Step 9: Commit**

```bash
git add src/app/components/ui/MetricCard src/app/components/GCDUtilizationCard src/app/components/IdleGapsCard src/app/components/LB3UptimeCard src/app/components/RefreshCadenceCard src/app/components/AccidentalBloomsCard src/app/components/RestackTaxCard src/app/components/ConcurrentTargetsCard src/app/components/HotClipDetectionCard src/app/components/SwiftmendAuditCard src/app/components/DownrankingDisciplineCard src/app/components/NaturesSwiftnessCard src/app/components/ManaCurveCard src/app/components/ConsumableThroughputCard src/app/components/InnervateAuditCard src/app/components/OverhealTableCard src/app/components/DeathForensicsCard src/app/components/NearDeathResponseCard src/app/components/PrepHygieneCard
git commit -m "feat(metric-card): link every metric's 'why this threshold' to its full rationale"
```

---

### Task 9: Bookkeeping — docs and backlog

**Files:**

- Modify: `docs/thresholds.md`
- Modify: `docs/backlog.md`
- Modify: `CLAUDE.md`
- Delete: `docs/specs/judgement-rationale-design.md`

No code changes in this task — verification is a manual read-through, not a test run.

- [ ] **Step 1: Add a pointer in `docs/thresholds.md`**

At the very top of `docs/thresholds.md`, after the existing intro paragraph ("Each threshold's rationale lives as a code comment..."), add:

```markdown
The in-app **Judgement Rationale** page (`#/judgements`) is the user-facing
companion to this file — it explains the same thresholds in plain language,
importing the real exported constants directly so it can't drift out of
sync the way a second hand-copied number could. This file remains the
permanent dev-facing index into each threshold's code-comment rationale;
that page is for end users.
```

- [ ] **Step 2: Add the backlog story entry**

In `docs/backlog.md`, under `## Epic H — Reporting & UX`, add a new story after `### 708 — Global error handling & recovery overlay ✅ Done` (before `### 801 — Build & test tooling`). Determine the next free story number by running `grep -n "^### [0-9]" docs/backlog.md | tail -5` first — Epic H's own numbers currently run 701/702/703/705/706/707/708, so use **709** unless that grep shows it's since been claimed by other work landed on `main` in the meantime (check `git log main -- docs/backlog.md` if unsure).

```markdown
### 709 — Judgement Rationale page ✅ Done

I want a plain-language page explaining how Bloomwatch collects its data and turns it into Good/Fair/Bad verdicts, so that a druid new to the tool, an experienced druid who wants the exact numbers, or a raid lead judging a healer's play can all understand the scorecard without guessing.

**Acceptance criteria**

- A new page, reachable at `#/about` for the existing Onboarding/About screen (Onboarding now renders at a real route instead of localStorage-gated overlay state) and `#/judgements` for the new content, linked from the app's footer, from About, and from every metric card's existing "why this threshold?" disclosure.
- Content covers, in order: the process-over-output philosophy, how individual Good/Fair/Bad judgements combine into a fight's and a report's overall verdict, every metric's exact threshold (imported live from the real exported constants in `src/metrics/*.ts`, never a hand-copied second number), and a conceptual explanation of how the underlying data is pulled from Warcraft Logs' GraphQL API — including one real, collapsed-by-default example query, with a link out to the repository's README for the full technical picture.
- Authored as MDX (`content.mdx`), compiled to a real React component at build time (`@mdx-js/rollup`) — no client-side markdown parser shipped.
- `#/judgements/<slug>` deep-links to and scrolls to a specific metric's own section.

</markdown>
```

Then mark it: use `docs/backlog.md`'s existing convention (a checkmark next to the heading, already shown above as `✅ Done`).

- [ ] **Step 3: Update `CLAUDE.md`'s repo-state paragraph**

Append one sentence to the long running paragraph in the `## Repo state` section of `CLAUDE.md` (after the sentence documenting story 802's threshold-recalibration work), following the file's existing style (one dense paragraph, no bullet points):

```
Story 709 (Judgement Rationale page, epic H) is done too — a new user-facing `#/judgements` page (MDX-authored, `src/app/components/JudgementRationale/content.mdx`, compiled to a real component at build time via `@mdx-js/rollup`) explains the process-over-output philosophy, how judgements combine, every metric's exact threshold (imported live from the same exported constants `docs/thresholds.md` already indexes, so the two can't drift apart), and a conceptual GraphQL data-sourcing overview; the existing Onboarding/About screen moved from `localStorage`-gated overlay state to a real `#/about` route in the same story, with a first-time visit anywhere now redirecting there and resuming wherever the visitor was actually headed once dismissed. `useHashRoute.ts` also now re-syncs on `hashchange` (not just `popstate`), which is what lets `MetricCard`'s new per-metric "read the full rationale" link use a plain anchor instead of threading a `navigate` callback through every metric card.
```

- [ ] **Step 4: Retire the design spec**

```bash
git rm docs/specs/judgement-rationale-design.md
```

(Its lasting content is now captured in `docs/thresholds.md`'s new pointer, `docs/backlog.md`'s story 709, and `CLAUDE.md`'s repo-state paragraph — per this repo's "a story isn't done until its paperwork is retired" convention. First confirm nothing else references the file: `grep -rn "judgement-rationale-design" --include="*.md" .` should show no results after this removal.)

- [ ] **Step 5: Final full-project verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all four pass clean — this is the same set the pre-commit hook and CI run.

- [ ] **Step 6: Commit**

```bash
git add docs/thresholds.md docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 709 done, retire its design spec"
```

---

## Plan self-review

**Spec coverage:** Purpose & scope (Task 7's routing restructure + Tasks 3–6's content) — covered. Routing changes (`#/about`, `#/judgements`, redirect, `#/judgements/<slug>`) — Tasks 1, 7. MDX rendering pipeline — Task 3. Threshold sourcing via live constants — Task 2 (export) + Tasks 4–6 (import/interpolate). Content outline (why-process, how-combine, 7 metric-group sections, GraphQL section) — Tasks 3–6, one-to-one. No internal jargon in page prose — verified by reading every section in Tasks 3–6: none mention "epic," "story," or a story number in `content.mdx`'s own text. Entry points (footer, About, MetricCard) — Task 7 (footer/About) + Task 8 (MetricCard). Testing & bookkeeping — Tasks 1–8 each carry their own tests; Task 9 is bookkeeping.

**Placeholder scan:** No placeholder or stand-in content ships in any task's commit — Task 6 was restructured during plan self-review to write Death forensics, Crisis response, Prep hygiene, and "Where the data comes from" together in one pass specifically so no intermediate placeholder heading would ever land in a commit. No other TBD/TODO/"add appropriate X" language appears anywhere in this plan.

**Type consistency:** `JudgementRationaleProps.slug` (Task 3) matches `route.slug` from the `judgements` route variant (Task 1) and what `App.tsx` passes in Task 7. `MetricCardProps.rationaleSlug` (Task 8) is a plain `string`, matching every table entry's literal string values used at each card's call site. `Route` import added to `App.tsx` in Task 7 matches the type already exported from `hashRoute.ts` in Task 1. Every constant name imported into `content.mdx` in Tasks 4–6 matches exactly what Task 2 exports (cross-checked against the export table in Task 2).

---

## Execution options

Plan complete and saved to `docs/plans/judgement-rationale-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
