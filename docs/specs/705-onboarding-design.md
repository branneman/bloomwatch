# Design: Story 705 — Onboarding screen

## Summary

Add a new `Onboarding` screen, shown before the existing Connect screen, that explains what
Bloomwatch is, who it's for, and why HPS/effective-healing/parse-percentile judgement is
misleading — before asking anyone to paste a report link or log in. Shown once per browser (first
visit), reachable again later via an "About" link. Fully viewable without WCL login.

## Why

- `docs/backlog.md` story 705: free-floating, no dependency on any metric epic — buildable any
  time.
- `docs/design_v3` screen 01 (`docs/design_v3/source/onboarding.jsx`) is the maintainer-approved
  visual and copy reference — fidelity is high for layout, spacing, and **copy** (per
  `docs/design_v3/README.md`'s Fidelity section), so this spec reuses that copy verbatim rather
  than re-deriving it from `docs/roadmap.md`'s Vision section, even though the two say the same
  thing.
- Picked to run in parallel with another session's work on story 702 (whole-report dashboard):
  702's spec (`docs/specs/702-whole-report-dashboard-design.md`) rewrites `App.tsx`'s
  post-report flow (fight confirmation → druid → dashboard, roughly the current file's lines
  228–358). This story only touches the pre-auth region of `App.tsx` (the `!accessToken` branch,
  current lines 168–192) plus one new component directory — low file-overlap risk, not zero.

## Content & copy

Source of truth: `docs/design_v3/source/onboarding.jsx`. Sections, in order:

1. Header row: logo mark + "Bloomwatch" heading (left), "Skip intro →" link (top-right).
2. Tagline paragraph ("Keep your Lifeblooms rolling...").
3. "What this is" — one paragraph.
4. "Who it's for" — a 3-item list: Primary / Secondary / Tertiary (matches
   `docs/roadmap.md`'s "Who is this for" section, satisfying backlog 705's acceptance criterion).
5. "Why not just look at the healing meter?" — the zero-sum argument (matches
   `docs/roadmap.md`'s Vision paragraph).
6. Action row: primary "Continue" button + "TBC Resto Druid Rotation Game ↗" link
   (`https://branneman.github.io/tbc-resto-druid-rotation-game/`).
7. Small caption: "Shown once on your first visit — reachable anytime after that from an 'About'
   link in the footer."

Copy is pasted directly from the `.jsx` source, not retyped by hand, to avoid drift.

## `Onboarding` component

New: `src/app/components/Onboarding/index.tsx` (+ `index.module.css`, `index.test.tsx`), matching
the existing component-folder convention (see `ConnectPanel`, `ReportInput`, etc.).

**Props:** `onContinue: () => void` — fired by both the "Continue" button and the "Skip intro →"
link (design distinguishes them only by position/emphasis, not behavior; both dismiss the screen
the same way).

Presentational only — no internal state, no localStorage access (that's `App.tsx`'s job, matching
the existing split where `OwnClientIdField` calls `onConnect` and `useWclAuth` owns persistence).

Reuses the same logo import `App.tsx` already has (`./assets/logo/lifebloom.jpg`, imported as
`logo`) rather than the design mock's `assets/spell-icons/lifebloom.jpg` path, for consistency
with the Connect screen's existing header.

**Width:** the design frame is 820px wide, but `Shell`'s `width` prop (`src/app/components/ui/
Shell/index.tsx`) currently only accepts `760 | 800`. Extend the union to `760 | 800 | 820` rather
than rounding down to 800 — this is a one-line, additive change with no effect on existing
callers.

## `App.tsx` wiring (gating + persistence)

New state, initialized once from `localStorage` (same plain-key pattern as `useWclAuth.ts`'s
`CLIENT_ID_STORAGE_KEY`, not a wrapper hook):

```ts
const ONBOARDING_SEEN_KEY = "bloomwatch_onboarding_seen";
const [onboardingDismissed, setOnboardingDismissed] = useState(
  () => localStorage.getItem(ONBOARDING_SEEN_KEY) === "true",
);
```

Rendering: `Onboarding` is the **first** conditional in `App.tsx`'s returned JSX — shown whenever
`!onboardingDismissed`, ahead of (and regardless of) the existing `!accessToken` Connect-screen
branch. This satisfies backlog 705's "fully viewable without WCL login" criterion for free: it's
literally the first thing rendered, before auth is checked at all.

```tsx
function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  setOnboardingDismissed(true);
}

return (
  <>
    {!onboardingDismissed && (
      <Shell width={820}>
        <Onboarding onContinue={dismissOnboarding} />
      </Shell>
    )}
    {onboardingDismissed && (
      <>{/* existing !accessToken / accessToken tree, unchanged */}</>
    )}
  </>
);
```

**Reopening ("About" link):** add a small "About" link to the Connect screen's existing footer
paragraph (`styles.connectFooter`, current line ~187–190 — the "No account, no server, no secret"
note) — the one persistent low-traffic screen every user already passes through, so this doesn't
touch any other screen. Clicking it sets `onboardingDismissed` back to `false` **without**
touching `localStorage` (the "seen" flag stays true — re-opening manually isn't a new "first
visit"). Reuses the same `dismissOnboarding`-shaped flow in reverse: a small `showOnboarding()`
setter is enough, no new persisted state needed.

## Explicitly out of scope

- Any change to the post-report flow, druid picker, or dashboard — story 702's territory.
- The rate-limit usage banner (009) and its "app-wide chrome" placement — separate story,
  deliberately not picked up alongside this one because it would require touching the same
  top-level `App.tsx` render structure 702 is mid-rewriting.
- Any mechanism fancier than a single localStorage boolean (e.g. versioned onboarding, "what's
  new" re-prompts) — not specified by backlog 705, not needed yet.

## Testing

Per `docs/testing.md`:

- **Tier 3**: `Onboarding/index.test.tsx` — renders all required sections (What this is / Who it's
  for with 3 items / Why not the healing meter / rotation-game link with correct `href`); both
  "Continue" and "Skip intro →" call `onContinue`.
- **`App.test.tsx`** (existing file, extended): renders `Onboarding` first when
  `localStorage` has no `bloomwatch_onboarding_seen` key; dismissing it (either control) sets
  `localStorage.getItem("bloomwatch_onboarding_seen")` to `"true"` and reveals the Connect screen
  underneath; a second render with the key already `"true"` skips straight to Connect. Follows the
  existing `localStorage.clear()` `beforeEach` convention already in this file.
