# Bloomwatch — Backlog

_Keep your Lifeblooms rolling._

User stories, grouped by epic. Each story is intended to be independently implementable (one story ≈ one agent session). Thresholds listed are **defaults**, to be made configurable in 802.

Conventions used below:

- **Persona** is "a resto druid raider" unless stated otherwise.
- "R/O/G" = red / orange / green judgement.
- "Opener" = the first ~10 seconds of a pull (ramp-up window, excluded from steady-state metrics).
- Spell IDs are _not_ hardcoded in stories; they must be resolved from the report's `masterData.abilities` at runtime (ranks matter in TBC — one spell name maps to multiple ability IDs).
- Completed stories are marked `✅ Done` in the heading.

### Ordering note

Epic letters (A, B, C…) are topical groupings, not a strict execution order — the real sequencing logic is dependency-driven and phase-driven (see `docs/roadmap.md`'s phases). In particular:

- **006 (event fetching/caching) and 007 (ability resolution) are hard prerequisites for every metric epic (B–G)** — every metric reads events through 006 and resolves spell IDs through 007. 005 (druid detection) must precede them functionally since metrics need a selected druid. 008 (default client fallback) has no downstream dependents — it's shared-client resilience, not a data dependency, and can slip later without blocking feature work.
- **Stories within one epic build on each other** (e.g. 202–205 reuse 201's Lifebloom stack-reconstruction; 402–404 reuse 401's resource-data plumbing) — don't expect to cherry-pick just the first story of several epics and treat the rest as parallel-safe.
- **501 (per-death audit) depends on 302 and 304's logic** (Swiftmend CD state, Nature's Swiftness CD state), not just 201 — it can't be pulled forward ahead of epic D.
- **601 (prep hygiene) has no dependency on any other metric epic** beyond 006 — it's free-floating and can be slotted in wherever convenient.
- **Epic H is split across phases, not one block:** 701 (single-fight scorecard) belongs right after epic C — it's the Phase 1 MVP exit criterion ("paste link → judged scorecard for GCD + Lifebloom"), not a Phase 4 story. 702–704 (zone aggregation, shareable URL, Markdown export) are genuinely Phase 4, after D/E/F/G exist to aggregate/export. 802/803 are deliberately last (Phase 5 polish): 802 exposes thresholds that should be stable by then, 803 compares metrics that need to already all exist.

**Suggested path from the current state (102 next):**

005 → 006 → 007 → 101 → 102 → 201 → 202 → 203 → 204 → 205 → **701** → 008 → 301 → 302 → 303 → 304 → 401 → 402 → 403 → 404 → 501 → 601 → 702 → 703 → 704 → 802 → 803

(008 and 601 are free-floating and can move earlier if convenient; everything else follows its dependency/phase order above.)

---

## Epic A — Foundation & data access

### 001 — WCL API access spike ✅ Done

As a developer, I want a proven, documented way to call the WCL v2 GraphQL API from a static GitHub Pages site, so that the entire no-backend architecture is validated before feature work starts.

**Acceptance criteria**

- A static page fetches fight metadata for a hardcoded report code, from GitHub Pages hosting (not localhost).
- The auth approach (PKCE / client-credentials-from-browser / paste-a-token) is documented in the repo with its trade-offs.
- Fresh-realm report codes (`fresh.warcraftlogs.com/reports/...`) are confirmed to resolve, and the correct API host is documented.
- If no approach works without a backend, the spike concludes with a written recommendation instead of code.

### 002 — Report URL input ✅ Done

I want to paste a WCL report URL (`fresh.warcraftlogs.com`, with or without `#fight=` fragments) or a bare report code, so that I don't have to think about URL formats — and a clear message if I paste a report from a realm type this tool doesn't support.

**Acceptance criteria**

- Valid `fresh.` URLs and bare 16-char report codes yield the report code; a `#fight=N` fragment pre-selects that fight after load.
- URLs from other WCL subdomains (`www.`, `classic.`) are recognized and rejected with a message explaining this tool only supports TBC Anniversary ("fresh") realms — not treated as generic invalid input.
- Other malformed input shows a clear generic error.

### 003 — Fight list & selection ✅ Done

I want to see the report's boss fights (name, pull number, kill/wipe, duration) and select one, so that I can analyze a specific pull.

**Acceptance criteria**

- Trash fights are excluded by default (toggle to include).
- Kills and wipes are visually distinct; wipes show boss HP% reached.

### 004 — Zone-wide selection ✅ Done

I want to select a whole raid zone within the report (e.g. "SSC — all bosses"), so that I can get one aggregated report for a full raid night.

**Acceptance criteria**

- Zone selector lists only zones present in the report.
- Selecting a zone selects all its boss fights; individual fights can be deselected.

### 005 — Druid auto-detection & selection ✅ Done

I want the app to detect all resto druids in the report and let me pick one (pre-selecting when there is only one), so that I immediately analyze the right player.

**Acceptance criteria**

- Detection uses combatant info (spec/talents) where available, with a fallback heuristic (druid class + healing spell casts).
- Multiple druids → picker; single druid → auto-selected.

### 006 — Event fetching & caching layer ✅ Done

As a developer, I want a single data layer that fetches casts, buffs, heal events, resource data, deaths, and combatant info per fight, with pagination and in-memory caching, so that every metric module reads from one consistent source.

**Acceptance criteria**

- Handles WCL event pagination (`nextPageTimestamp`) transparently.
- The same fight's events are never fetched twice in a session.
- Rate-limit responses surface as a user-visible, retryable message.

### 007 — Ability resolution table ✅ Done

As a developer, I want a per-report lookup that maps ability IDs to (spell, rank) for all druid healing spells and relevant consumables, so that metric modules can be written against spell names and ranks instead of magic numbers.

**Acceptance criteria**

- Covers: Lifebloom, Rejuvenation, Regrowth, Healing Touch, Swiftmend, Nature's Swiftness, Tranquility, Innervate, mana potions, Dark/Demonic Runes.
- Multiple ranks of one spell resolve to one logical spell with a rank attribute.

### 008 — Default API client with graceful rate-limit fallback ✅ Done

As a druid pasting a report link for the first time, I want the app to just work without registering my own WCL API client, so that "paste link → judged scorecard" isn't blocked by an API-client-registration detour. As the app's maintainer, I want a rate-limit hit on the shared default client to degrade gracefully into asking that one user for their own client_id, so that one busy raid night doesn't lock everyone else out.

**Acceptance criteria**

- The app ships with a hardcoded default Client ID (the maintainer's own registered Public Client, PKCE-only) baked into the client-side code. This is safe because PKCE client IDs are not secrets — see `docs/wcl-auth.md`.
- All requests use the default Client ID with no setup step required for a first-time user.
- WCL rate limits are scoped per-client (confirmed via the `rateLimitData` GraphQL field, see `docs/wcl-auth.md`), so heavy usage by one user does not exhaust another user's requests under a _different_ client_id — only the shared default pool is at risk.
- On a rate-limit response from a request made with the default Client ID, the app shows a clear, non-technical message explaining the shared client is temporarily over capacity, with a short explanation and a link to register a personal WCL API client (reusing `docs/wcl-auth.md`'s registration steps) plus an input to paste it.
- Once a user supplies their own Client ID, it's saved (`localStorage`) and used for all of that browser's future requests, bypassing the shared default entirely.
- No secrets are requested or stored at any point — the fallback still only asks for a Client ID, never a secret (per principle 2 / story 801).

---

## Epic B — GCD economy

### 101 — Active time & GCD utilization ✅ Done

I want to see my active time and a GCD-utilization percentage (time spent on GCD / fight duration), so that I know how full my cast timeline actually was.

**Acceptance criteria**

- GCD cost per cast: 1.5 s for instants, actual cast time for cast-time spells (e.g. Regrowth 2 s); values > 100 % clamp to 100 %.
- R/O/G defaults: green ≥ 85 %, orange 70–85 %, red < 70 %.
- The metric card explains the ceiling (~40 casts/min at 0 haste).

### 102 — Idle-gap detection ✅ Done

I want a list of every gap > 1.7 s between my casts, with total dead time and the five longest gaps (timestamp + duration), so that I can find exactly where I froze.

**Acceptance criteria**

- Gaps are measured from end-of-GCD/cast to next cast start.
- Each listed gap links to the corresponding timestamp in the WCL report.
- R/O/G on total dead time as % of fight: green < 5 %, orange 5–15 %, red > 15 %.

---

## Epic C — Lifebloom discipline

### 201 — LB3 uptime per target ✅ Done

I want per-target uptime of 3-stack Lifebloom on my maintained targets, so that I can verify my core job: keeping LB3 rolling on tanks.

**Acceptance criteria**

- Stack state is reconstructed from applybuff / applybuffstack / refreshbuff / removebuff events.
- "Maintained targets" = targets with ≥ 30 % LB uptime (filters out one-off casts).
- R/O/G per target, measured from first reaching 3 stacks: green ≥ 90 %, orange 75–90 %, red < 75 %.

### 202 — Refresh cadence histogram ✅ Done

I want a histogram of intervals between my Lifebloom refreshes on 3-stacked targets, with median and early/late percentages, so that I can see whether I refresh too eagerly (wasted mana/GCDs) or too late (accidental blooms).

**Acceptance criteria**

- Only refreshes on targets already at 3 stacks count.
- For each target, the interval from reaching 3 stacks to first refresh counts the same as any later refresh-to-refresh interval.
- Buckets: < 5.5 s (early), 5.5–7 s (ideal), > 7 s (late).
- R/O/G on median: green 6–7 s, orange 5–6 s, red < 5 s or > 7 s. Consistently late refreshes correlate with near-bloom timing and are judged as severely as refreshing too eagerly; actual bloom events are counted separately by story 203.

### 203 — Accidental bloom counter ✅ Done

I want a count of accidental blooms (bloom fired, then the stack was immediately rebuilt), separated from probable intentional blooms, so that dropped stacks are visible as the concrete errors they are.

**Acceptance criteria**

- Bloom detection: the non-periodic (non-tick) Lifebloom heal event.
- Heuristic "accidental": re-application of Lifebloom on the same target within 3 s of the bloom.
- Each accidental bloom lists timestamp + target; R/O/G per fight: green 0, orange 1–2, red ≥ 3.

### 204 — Re-stack tax ✅ Done

I want to see how many GCDs and how much mana I spent rebuilding Lifebloom stacks after the opener, so that I can quantify the cost of dropped stacks.

**Acceptance criteria**

- Counts LB casts on targets at < 3 stacks, excluding the opener and excluding deliberate new-target ramps (first ramp per target is free).
- Reported as casts + estimated mana; R/O/G scales with fight length.

### 205 — Concurrent LB3 targets ✅ Done

I want a timeline/summary of how many targets simultaneously had my LB3, so that maintaining multiple tanks is recognized as the skill it is.

**Acceptance criteria**

- Reports average and peak concurrent LB3 targets, and % of fight at each level.
- Informational (no R/O/G) — the right number depends on assignments.

---

## Epic D — Spell discipline

### 301 — HoT clip detection (Rejuvenation & Regrowth) ✅ Done

I want a count of Rejuvenation/Regrowth refreshes that clipped remaining ticks, so that I stop wasting the tail of HoTs that should be allowed to expire.

**Acceptance criteria**

- A refresh counts as a clip if the existing aura had > 1 tick (> 3 s) remaining.
- Clips consumed by Swiftmend are excluded (that's 302's domain).
- R/O/G on Rejuvenation's clipped-tick share of its casts only: green < 5 %, orange 5–15 %, red > 15 %. Regrowth's clip share is reported alongside it as informational context, with no R/O/G of its own — in Tree of Life form, Regrowth is a resto druid's only direct heal without a cooldown (Healing Touch forces a shapeshift out of form), so once Swiftmend is on cooldown, spamming Regrowth for its direct-heal component is the correct response to burst damage even though it clips Regrowth's own HoT tail as a side effect. Judging that the same as a clipped Rejuvenation — whose entire purpose is the HoT — would punish correct play.

### 302 — Swiftmend quality audit ✅ Done

I want each Swiftmend listed with the HoT it consumed, that HoT's remaining duration, and the target's HP% at cast, so that I can distinguish efficient Swiftmends (consuming a nearly-expired HoT) from justified emergencies from wasteful ones.

**Acceptance criteria**

- Classification: **efficient** (consumed HoT ≤ 3 s remaining), **emergency** (target ≤ 50 % HP), **wasteful** (neither).
- Also reports Swiftmend usage count vs. availability windows (15 s CD) as informational context.
- R/O/G on wasteful share: green 0 %, orange ≤ 25 %, red > 25 %.

### 303 — Downranking discipline

I want a per-rank breakdown of my direct heals (Regrowth, Healing Touch) with cast counts and direct-portion overheal, so that I can verify I'm using cheap ranks for spot healing and max ranks only when needed.

**Acceptance criteria**

- Table: spell, rank, casts, avg effective heal, direct overheal %.
- Flag: max-rank direct heals with > 50 % overheal (should have downranked).
- Informational plus a single R/O/G on the flag count.

### 304 — Nature's Swiftness audit ✅ Done

I want to see whether Nature's Swiftness was used, when, and on what follow-up spell, so that I know if I'm sitting on my emergency button.

**Acceptance criteria**

- Reports casts vs. theoretical availability (3 min CD); unused-while-available during a raid death is cross-referenced in 501.
- Informational (no standalone R/O/G) — NS is situational by design.

---

## Epic E — Mana economy

### 401 — Mana curve & ending mana

I want my mana-over-time curve with fight-end mana highlighted, so that I can see whether I hoarded mana (should have cast more Regrowths) or ran dry too early.

**Acceptance criteria**

- Curve rendered per fight from resource data; ending mana % shown as a number.
- R/O/G (kills only): green 5–40 % ending mana, orange 40–70 % or 0–5 %, red > 70 % (hoarding) — with an explicit note that short/easy fights make this metric moot (auto-downgrade to informational for fights < 90 s).

### 402 — Consumable throughput

I want counts of mana potions and Dark/Demonic Runes used vs. the expected floor for the fight length (separate 2-minute cooldowns each), so that unused consumable cooldowns become visible.

**Acceptance criteria**

- Expected floor per consumable = ⌊fight duration / 120 s⌋ for fights where mana dropped below 70 % at any point; fights that never did are exempt.
- R/O/G per consumable: green ≥ floor, orange = floor − 1, red ≤ floor − 2.

### 403 — Innervate audit

I want to see if and when Innervate was cast and on whom, so that I never end a mana-constrained fight with an unused Innervate.

**Acceptance criteria**

- Reports cast time(s), target, and (self-cast) own mana % at cast.
- R/O/G: red if never used on a mana-constrained fight ≥ 3 min; green if used; orange if used but very late (last 10 % of the fight).

### 404 — HoT-aware overheal table

I want per-spell overheal percentages judged against spell-appropriate thresholds, so that I'm not punished for the high overheal that is inherent to HoTs but am flagged for wasteful direct heals.

**Acceptance criteria**

- Separate thresholds: HoT ticks (lenient — informational only), Lifebloom blooms, direct heals (strict).
- Bloom overheal R/O/G: green < 40 %, orange 40–70 %, red > 70 %.
- Direct heal (Regrowth direct, HT, Swiftmend) R/O/G: green < 30 %, orange 30–50 %, red > 50 %.

---

## Epic F — Death forensics

### 501 — Per-death resource audit

I want an audit for every friendly death (with emphasis on my maintained tank targets): did the target have my LB3 rolling, and did I have Swiftmend / Nature's Swiftness / a GCD available in the 5 s before death, so that deaths with unspent emergency resources are exposed as process failures.

**Acceptance criteria**

- For each death: target, time, my LB3 status on that target, Swiftmend CD state, NS CD state, whether I was idle in the preceding 5 s.
- R/O/G per death: red if ≥ 2 unspent resources on a maintained target's death; summarized per fight.
- Clearly labeled caveat: a death is not automatically the druid's fault; this audits _your_ readiness only.

---

## Epic G — Prep hygiene

### 601 — Pull-time consumables check

I want a checklist of my raid-prep buffs at pull (battle elixir/flask, guardian elixir, food buff, weapon oil), so that missing prep is caught before anyone looks at gameplay.

**Acceptance criteria**

- Read from combatant-info auras at fight start.
- Binary per item with an aggregate R/O/G: green = all present, orange = 1 missing, red = ≥ 2 missing.
- Item list is data-driven (easy to adjust per phase/tier).

---

## Epic H — Reporting & UX

### 701 — Single-fight scorecard ✅ Done

I want one fight's results as a dashboard of small summary widgets — one per epic (GCD economy, Lifebloom discipline, spell discipline, mana economy, death forensics, prep hygiene) — all visible in one view with no scrolling, so that I get the whole fight's verdict at a glance. I want to click any widget to zoom into that epic's full detail — every metric a number + R/O/G chip + one-line explanation with a "why/threshold" expander — so that I can drill from summary to evidence without losing the overview.

**Acceptance criteria**

- The overview shows one widget per implemented epic, sized to fit together in a single view (no scrolling) regardless of how many epics are implemented so far.
- Each widget shows a worst-of R/O/G judgement across that epic's metrics, plus 1–2 key stats — enough to tell good from bad without opening it.
- Clicking a widget transitions to that epic's detail view: every implemented metric in the epic, each with its judgement and its threshold made visible on demand. A clear way back returns to the overview without reloading or re-fetching.

### 702 — Zone-aggregated report

I want an aggregated scorecard across all selected fights in a zone (e.g. all SSC bosses), with per-boss drill-down, so that I can review a full raid night in one view.

**Acceptance criteria**

- Aggregation rules per metric are explicit (uptime → duration-weighted mean; counts → sums; R/O/G → worst-of with per-boss chips visible).
- Clicking a boss row opens its single-fight scorecard (701).

### 703 — Shareable report state

I want the report/fight/druid selection encoded in the URL, so that I can share a link to a specific scorecard with my healing officer. I also want the browser's own back/forward buttons to work throughout the app, so that navigating away from a screen doesn't feel like a dead end.

**Acceptance criteria**

- Opening a shared URL reproduces the same scorecard (after auth).
- No metric data is stored anywhere — the URL only encodes selection state.
- Every screen in the flow (report input, fight picker, druid picker, dashboard, per-epic detail, per-fight scorecard) changes the URL hash as the user navigates through it — not just the final scorecard view — using hash-based routing (no server-side routes to configure, matching the static-hosting/no-backend constraint).
- The browser's back/forward buttons move between screens the same way the in-app back-links (e.g. "← All fights", "← All metrics", "← Change fight selection") do, everywhere in the flow — not just at the top level.
- Opening any hash-encoded URL directly (not just the fully-selected scorecard one) resumes at that exact screen once authenticated, instead of resetting to the report-input screen.

### 704 — Markdown export

I want to export the current scorecard as a Markdown file, so that I can paste it into Discord/notes or archive my progression.

**Acceptance criteria**

- Export includes numbers, judgements, thresholds used, report link, and generation date.
- Output renders cleanly in Discord and GitHub.

### 801 — Build & test tooling ✅ Done

As a developer, I want a Vite + React + TypeScript project scaffold with a full test pyramid and automated CI/CD to GitHub Pages, so that the app has a maintainable foundation and every later story can be built and verified with confidence.

**Acceptance criteria**

- Vite + React + TypeScript scaffold builds and deploys automatically to GitHub Pages on every push to `main`; the live URL is in the README.
- `index.html`'s spike logic (PKCE auth, GraphQL client) is ported into typed, tested modules under `src/wcl/`; the spike itself is retired.
- Static analysis (typecheck, ESLint, Prettier) runs full-project in both a pre-commit hook and CI — not scoped to changed files only.
- Test pyramid stood up per `docs/testing.md`: unit + WCL-client-integration (mocked) + component tests run on every push; contract tests (real WCL API, dedicated test Client ID) run on manual trigger only; E2E smoke runs against the live site after every deploy.
- No secrets are required to build or deploy the product itself (per principle 2); the dedicated test Client ID's access token is a CI-only test credential, documented as such.

### 802 — Configurable thresholds

I want to view and edit all R/O/G thresholds (persisted in `localStorage`, with a reset-to-defaults), so that I can adapt judgements to my raid's context and to future calibration.

**Acceptance criteria**

- Every threshold used anywhere in the app is listed in one settings view with its default and source rationale.
- Changes apply immediately to already-rendered scorecards.

### 803 — Multi-druid comparison

I want to compare two or more druids from the same report side-by-side on the same metrics, so that druid-vs-druid evaluation happens on process metrics instead of the healing meter.

**Acceptance criteria**

- Columns per druid, rows per metric, judgements per cell.
- Explicit note that different assignments (tank vs. raid) make some comparisons apples-to-oranges.
