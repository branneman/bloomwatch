# Bloomwatch — Backlog

_Keep your Lifeblooms rolling._

User stories, grouped by epic. Each story is intended to be independently implementable (one story ≈ one agent session). Thresholds listed are **defaults**; 802 is an internal calibration pass by the project's maintainers, not a user-facing settings screen.

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
- **009 (rate-limit usage banner) builds directly on 008's `rateLimitData` plumbing** — sequence it after 008. It also needs its own Claude Design pass (see `docs/design_v1`/`docs/design_v2` for the established pattern) before implementation.
- **010 (WCL request performance & loading-state audit) is deliberately late** — it sweeps every WCL call site in the app, so it's most useful once most epics (and their call sites) already exist.
- **707 (Good/Fair/Bad labels) is deliberately late too, for the same reason as 010** — it's a sweep across every existing R/O/G chip in the app, so it's most useful once most epics (and their chips) already exist rather than repeated per epic.
- **011 (Dreamstate-spec test coverage) only needs 007** — best done early-ish so later metric stories are exercised against both specs from the start, but nothing blocks on it if it slips later.
- **705 (onboarding) has no dependency on any metric epic** — it's a static, login-free screen and can be built any time convenient, including before any metric epic exists.
- **706 (responsive/mobile layout) is blocked on `docs/design_v3` existing** — that design is produced via a separate Claude Design pass outside this repo's normal story flow; 706 can't start before it's downloaded.
- **Epic H is split across phases, not one block:** 701 (single-fight scorecard) belongs right after epic C — it's the Phase 1 MVP exit criterion ("paste link → judged scorecard for GCD + Lifebloom"), not a Phase 4 story. 702 (now the whole-report dashboard, superseding the old zone-aggregation framing) through 704 (shareable URL, Markdown export) are genuinely Phase 4, after D/E/F/G exist to aggregate/export — now that 702 has shipped, it's the primary screen a user lands on after druid selection, not a bonus view; its own per-boss list fulfills 003's former role rather than a separate fight-picker screen surviving alongside it. 802 is deliberately last (Phase 5 polish): it's a maintainer calibration pass that should wait until thresholds are stable. 803 (multi-druid comparison) has been removed from this backlog — TBC raids rarely run two resto druids, so the only comparison that makes sense is raid-vs-raid, which the per-report flow already supports.

**Suggested path from the current state (402 next):**

005 → 006 → 007 → 011 → 101 → 102 → 201 → 202 → 203 → 204 → 205 → **701** → 705 → 008 → 009 → 301 → 302 → 303 → 304 → 401 → 402 → 403 → 404 → 501 → 601 → 702 → 703 → 704 → 010 → 707 → 706 → 802

(008, 009, 705, and 601 are free-floating and can move earlier if convenient; 706 must wait for `docs/design_v3` to exist first; everything else follows its dependency/phase order above.)

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

I want to see the report's boss fights (name, pull number, kill/wipe, duration) as a list of buttons/links and select exactly one, so that I can drill into a specific pull's scorecard.

**Acceptance criteria**

- Trash fights are excluded entirely — no toggle to include them; boss pulls only (see `docs/roadmap.md`'s out-of-scope list).
- Kills and wipes are visually distinct; wipes show boss HP% reached.
- Single-select only: clicking a fight opens its scorecard (701) directly; no checkbox/multi-select UI. Story 004's zone-wide multi-select was removed for this exact reason (see below) — there is no supported "some but not all fights" mode, only exactly-one-fight (here) or the whole report (702).

**Note:** these criteria were trimmed after initial ship, when the trash-fight include-toggle and 004's multi-select zone capability still existed in the shipped `FightPicker` code and hadn't yet been revisited to match. That cleanup is now done: `FightPicker` has been deleted entirely, and these acceptance criteria are satisfied by 702's whole-report dashboard's own per-boss list instead of a standalone fight-picker screen.

### 005 — Druid auto-detection & selection ✅ Done

I want the app to detect all resto druids in the report and let me pick one (pre-selecting when there is only one), so that I immediately analyze the right player.

**Acceptance criteria**

- Detection uses combatant info (spec/talents) where available, with a fallback heuristic (druid class + healing spell casts).
- Multiple druids → picker; single druid → auto-selected.
- Detection never triggers a per-fight event-stream fetch — it reads combatant-info/master-data-level queries only. This step now runs before the user has chosen what to look at (see 702), so it must stay cheap.

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

### 009 — Rate-limit usage banner

As any user of the app, I want a small banner near the top of the screen when the shared default WCL API client is running low on its hourly request budget, so that I understand why things feel slow instead of assuming the app is broken.

**Acceptance criteria**

- Banner appears once a request's `rateLimitData` shows the shared default client has consumed ≥ 75 % of its hourly limit; it disappears again once usage drops back below the threshold.
- Only shown to users still on the shared default Client ID — never shown once a user has supplied their own Client ID per 008.
- Message is non-technical and links to the same personal-Client-ID registration flow as 008's fallback.
- Visual design comes from a dedicated Claude Design pass (see `docs/design_v1`/`docs/design_v2` for the established pattern) before implementation.

### 010 — WCL request performance & loading-state audit

As a developer, I want a full audit of every WCL GraphQL request the app makes — checking for redundant refetches, oversized queries, and requests that could be batched or deferred — with a loading indicator added anywhere a request may take user-perceptible time, so that the app feels responsive and doesn't waste the shared rate-limit budget.

**Acceptance criteria**

- Every WCL request call site is reviewed; duplicate or avoidable requests are eliminated, or their necessity is justified in a comment.
- Every screen that triggers a WCL request shows a loading state (spinner/skeleton) while it's in flight, instead of an unexplained pause.
- Findings and fixes are captured in one pass — this sweeps whatever call sites exist at the time it's picked up, it isn't repeated per-epic.

### 011 — Dreamstate-spec test coverage

As a developer, I want test fixtures and factory support for a Dreamstate-spec druid (e.g. 35/0/26) in addition to the existing full-Resto-only test data (e.g. 12/0/49), so that spec/talent assumptions elsewhere in the app — starting with 005's auto-detection — are verified against more than one canonical build.

**Acceptance criteria**

- At least one real or synthetic fixture report includes a Dreamstate-spec druid, documented in `docs/testing.md`'s known-test-reports table per its existing convention.
- 005's druid-detection tests (and any other spec-sensitive tests) run against both the full-Resto and Dreamstate fixtures.
- Any production code found assuming full-Resto talent points is flagged; fixing it is only in scope for this story if it's a small, contained change — otherwise it's called out as separate follow-up rather than silently expanding this story's scope.

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

### 303 — Downranking discipline ✅ Done

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

### 401 — Mana curve & ending mana ✅ Done

I want my mana-over-time curve with fight-end mana highlighted, so that I can see whether I hoarded mana (should have cast more Regrowths) or ran dry too early.

**Acceptance criteria**

- Curve rendered per fight from resource data; ending mana % shown as a number.
- R/O/G (kills only): green 5–40 % ending mana, orange 40–70 % or 0–5 %, red > 70 % (hoarding) — with an explicit note that short/easy fights make this metric moot (auto-downgrade to informational for fights < 90 s).

### 402 — Consumable throughput ✅ Done

I want counts of mana potions and Dark/Demonic Runes used vs. the expected floor for the fight length (separate 2-minute cooldowns each), so that unused consumable cooldowns become visible.

**Acceptance criteria**

- Expected floor per consumable = ⌊fight duration / 120 s⌋ for fights where mana dropped below 70 % at any point; fights that never did are exempt.
- R/O/G per consumable: green ≥ floor, orange = floor − 1, red ≤ floor − 2.

### 403 — Innervate audit ✅ Done

I want to see if and when Innervate was cast, on whom, and whether that target was a sensible recipient, so that I never end a mana-constrained fight with an unused Innervate — and so that Innervate spent on the wrong kind of target is flagged, not just its absence. In TBC raids Innervate is usually the correct call to hand to another mana-starved caster (a mage or boomkin, say) rather than keep for myself, since druids have strong natural mana regen from Spirit; the judgement should reward that pattern instead of assuming self-cast is the goal.

**Acceptance criteria**

- Reports cast time(s), target, target's class/spec (resolved from combatant info), and mana % at cast (the relevant party's — self if self-cast, target's if cast on someone else).
- R/O/G:
  - Red if never used on a mana-constrained fight ≥ 3 min (unused Innervate on a fight that needed it).
  - Red if used on a non-mana-using target (e.g. Warrior, Rogue, Feral Druid) — the mana return is wasted on a target that can't use it.
  - Green if used on another mana-using ally, typically a DPS caster (e.g. Mage, Boomkin) per common raid assignment — this is the normal, correct pattern, not a fallback.
  - Self-cast: judged by timing, same as before — green if used well, orange if used but very late (last 10 % of the fight).

### 404 — HoT-aware overheal table ✅ Done

I want per-spell overheal percentages judged against spell-appropriate thresholds, so that I'm not punished for the high overheal that is inherent to HoTs but am flagged for wasteful direct heals.

**Acceptance criteria**

- Separate thresholds: HoT ticks (lenient — informational only), Lifebloom blooms, direct heals (strict).
- Bloom overheal R/O/G: green < 40 %, orange 40–70 %, red > 70 %.
- Direct heal (Regrowth direct, HT, Swiftmend) R/O/G: green < 30 %, orange 30–50 %, red > 50 %.

---

## Epic F — Death forensics

### 501 — Per-death resource audit ✅ Done

I want an audit for every friendly death (with emphasis on my maintained tank targets): did the target have my LB3 rolling, and did I have Swiftmend / Nature's Swiftness / a GCD available in the 5 s before death, so that deaths with unspent emergency resources are exposed as process failures.

**Acceptance criteria**

- For each death: target, time, my LB3 status on that target, Swiftmend CD state, NS CD state, whether I was idle in the preceding 5 s.
- R/O/G per death: red if ≥ 2 unspent resources on a maintained target's death; summarized per fight.
- Clearly labeled caveat: a death is not automatically the druid's fault; this audits _your_ readiness only.

---

## Epic G — Prep hygiene

### 601 — Pull-time consumables check ✅ Done

I want a checklist of my raid-prep buffs at pull (battle elixir/flask, guardian elixir, food buff, weapon oil), so that missing prep is caught before anyone looks at gameplay.

**Acceptance criteria**

- Read from combatant-info auras (elixirs/flask/food) and gear (weapon-oil enchant) at fight start.
- Three rows, refined from the original binary-per-item sketch in direct conversation with the
  product owner: (1) flask/elixir coverage — green with a recognized flask, or with both a battle
  and a guardian elixir; orange with only one of the two; red with neither; (2) food buff —
  present/missing; (3) weapon oil — present/missing. Overall judgement is the worst of the three
  rows.
- Item/flask/elixir/oil recognition lists are data-driven (easy to adjust per phase/tier).

---

## Epic H — Reporting & UX

### 705 — Onboarding screen ✅ Done

I want a welcome screen, viewable without logging into WCL, that explains what Bloomwatch is, who it's for, and _why_ HPS/effective-healing/parse-percentile rankings are a bad way to judge a healer (the zero-sum argument from `docs/roadmap.md`'s Vision), with a link to the TBC resto druid rotation game (`https://branneman.github.io/tbc-resto-druid-rotation-game/`), so that a first-time visitor understands the tool's premise before they invest in pasting a report link.

**Acceptance criteria**

- Fully viewable without WCL login — login remains mandatory only once the user tries to load an actual report.
- Content covers, at minimum: what the tool does, who it's for (primary/secondary/tertiary per roadmap.md), why parse/HPS-based judgement is misleading, and a link to the rotation game.
- Skippable for returning users (exact mechanism — e.g. shown only on first visit, or a persistent "About" entry point — is an implementation decision, not specified here).

### 701 — Single-fight scorecard ✅ Done

I want one fight's results as a dashboard of small summary widgets — one per epic (GCD economy, Lifebloom discipline, spell discipline, mana economy, death forensics, prep hygiene) — all visible in one view with no scrolling, so that I get the whole fight's verdict at a glance. I want to click any widget to zoom into that epic's full detail — every metric a number + R/O/G chip + one-line explanation with a "why/threshold" expander — so that I can drill from summary to evidence without losing the overview.

**Acceptance criteria**

- The overview shows one widget per implemented epic, sized to fit together in a single view (no scrolling) regardless of how many epics are implemented so far.
- Each widget shows a worst-of R/O/G judgement across that epic's metrics, plus 1–2 key stats — enough to tell good from bad without opening it.
- Clicking a widget transitions to that epic's detail view: every implemented metric in the epic, each with its judgement and its threshold made visible on demand. A clear way back returns to the overview without reloading or re-fetching.
- Reachable via the whole-report dashboard's per-boss list (702), which fulfills 003's former drill-down role directly — there is no separate fight-picker screen.

### 702 — Whole-report dashboard ✅ Done

I want an aggregated scorecard across every non-trash boss fight in the loaded report — no zone or fight picker in the way — with per-boss drill-down, so that I land on a full raid night's verdict immediately after picking my druid, and only zoom into one specific pull when something needs a closer look.

**Acceptance criteria**

- Aggregates every non-trash fight in the report automatically; no zone-selection or fight-selection step precedes it — it's the screen shown right after druid selection (005), replacing 003's old role as the first post-report screen.
- Aggregation rules per metric are explicit (uptime → duration-weighted mean; counts → sums; R/O/G → worst-of with per-boss chips visible).
- Clicking a boss row opens that fight's single-fight scorecard (701) inline; rows render and are clickable immediately from cheap fight metadata, before any judgement has resolved, so jumping to a specific pull never waits on the whole report's aggregate to finish computing. There is no separate fight-picker screen — this dashboard's own per-boss list fulfills 003's former role instead of a standalone screen existing alongside it.
- A report spanning multiple raid zones (e.g. both SSC and TK fights logged in one session) aggregates all of them together — there is no per-zone split or picker.
- Supersedes story 004 (zone-wide selection), removed from this backlog: partial "some but not all fights" selection is no longer a supported mode — it's either exactly one fight (via this dashboard's own list, 701) or the whole report (this story).

### 703 — Shareable report state

I want the report/fight/druid selection encoded in the URL, so that I can share a link to a specific scorecard with my healing officer. I also want the browser's own back/forward buttons to work throughout the app, so that navigating away from a screen doesn't feel like a dead end.

**Acceptance criteria**

- Opening a shared URL reproduces the same scorecard (after auth).
- No metric data is stored anywhere — the URL only encodes selection state.
- Every screen in the flow (report input, druid picker, whole-report dashboard (702, whose per-boss list fulfills 003's former role — there is no separate fight-picker screen to route), whole-report per-epic detail, per-fight scorecard (701), per-fight per-epic detail) changes the URL hash as the user navigates through it — not just the final scorecard view — using hash-based routing (no server-side routes to configure, matching the static-hosting/no-backend constraint).
- The browser's back/forward buttons move between screens the same way the in-app back-links (e.g. "← All fights", "← All metrics", "← Change fight selection") do, everywhere in the flow — not just at the top level.
- Opening any hash-encoded URL directly (not just the fully-selected scorecard one) resumes at that exact screen once authenticated, instead of resetting to the report-input screen.

### 704 — Markdown export

I want to export the current scorecard as a Markdown file, so that I can paste it into Discord/notes or archive my progression.

**Acceptance criteria**

- Export includes numbers, judgements, thresholds used, report link, and generation date.
- Output renders cleanly in Discord and GitHub.

### 706 — Responsive/mobile layout

I want the app to work well on mobile, so that I can check a scorecard from my phone.

**Acceptance criteria**

- Blocked on a `docs/design_v3` existing, produced via a dedicated Claude Design pass (same pattern as `docs/design_v1`/`docs/design_v2`) — this story does not specify a layout itself.
- Once design_v3 exists, all flow screens (onboarding, report input, druid picker, whole-report dashboard — whose own per-boss list is the fight picker, there is no separate screen — per-fight scorecard, per-epic detail views) are usable on common mobile viewport widths, matching design_v3.

### 707 — Judgement language: Good/Fair/Bad labels

I want every red/orange/green judgement chip to also carry a plain-language word — Good (green), Fair (orange), Bad (red) — so that the verdict doesn't rely on color alone, which is hard to parse at a glance and inaccessible to colorblind users.

**Acceptance criteria**

- Every R/O/G chip anywhere in the app (overview widgets, per-epic detail rows, exports) shows its Good/Fair/Bad label alongside its color, never color alone.
- The Markdown export (704) uses the text label too, not just a color name — Markdown can't render color, so the label is the only signal there.
- Wording is consistent everywhere the same judgement tier appears — no epic invents its own synonyms for "orange."

### 801 — Build & test tooling ✅ Done

As a developer, I want a Vite + React + TypeScript project scaffold with a full test pyramid and automated CI/CD to GitHub Pages, so that the app has a maintainable foundation and every later story can be built and verified with confidence.

**Acceptance criteria**

- Vite + React + TypeScript scaffold builds and deploys automatically to GitHub Pages on every push to `main`; the live URL is in the README.
- `index.html`'s spike logic (PKCE auth, GraphQL client) is ported into typed, tested modules under `src/wcl/`; the spike itself is retired.
- Static analysis (typecheck, ESLint, Prettier) runs full-project in both a pre-commit hook and CI — not scoped to changed files only.
- Test pyramid stood up per `docs/testing.md`: unit + WCL-client-integration (mocked) + component tests run on every push; contract tests (real WCL API, dedicated test Client ID) run on manual trigger only; E2E smoke runs against the live site after every deploy.
- No secrets are required to build or deploy the product itself (per principle 2); the dedicated test Client ID's access token is a CI-only test credential, documented as such.

### 802 — Threshold calibration pass

As the project's maintainers, we want to review every R/O/G threshold in the app against a corpus of real, well-regarded druid logs and adjust the ones that are currently unfair, so that judgements are consistent and trustworthy across the whole tool. This is deliberately last: it only makes sense once every metric epic exists, so we can look at the full picture holistically instead of tuning one metric in isolation. This is an internal engineering pass — there is no end-user-facing threshold-editing UI; users do not get to configure their own judgements.

**Acceptance criteria**

- Every threshold used anywhere in the app is listed in one place (a doc or dev-only view) with its current default and source rationale, to review against.
- Each threshold is checked against real log data spanning a range of skill levels; any threshold that misjudges known-good or known-bad play is adjusted, with the change and its reasoning recorded in `docs/backlog.md`.
- No `localStorage`-backed settings screen, no user-facing configuration UI — thresholds remain hardcoded defaults, just better-calibrated ones.
