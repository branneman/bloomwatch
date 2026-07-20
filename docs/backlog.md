# Bloomwatch — Backlog

_Keep your Lifeblooms rolling._

User stories, grouped by epic. Each story is intended to be independently implementable (one story ≈ one agent session). Thresholds listed are **defaults**; 802 is an internal calibration pass by the project's maintainers, not a user-facing settings screen.

Conventions used below:

- **Persona** is "a resto druid raider" unless stated otherwise.
- "R/O/G" = red / orange / green judgement.
- "Opener" = the first ~10 seconds of a pull (ramp-up window, excluded from steady-state metrics).
- Spell IDs are _not_ hardcoded in stories; they must be resolved from the report's `masterData.abilities` at runtime (ranks matter in TBC — one spell name maps to multiple ability IDs).
- Completed stories are marked `✅ Done` in the heading; stories not yet started are marked `🔲 Todo`.

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

### 009 — Rate-limit usage banner ✅ Done

As any user of the app, I want a small banner near the top of the screen when the shared default WCL API client is running low on its hourly request budget, so that I understand why things feel slow instead of assuming the app is broken.

**Acceptance criteria**

- Banner appears once a request's `rateLimitData` shows the shared default client has consumed ≥ 75 % of its hourly limit; it disappears again once usage drops back below the threshold.
- Only shown to users still on the shared default Client ID — never shown once a user has supplied their own Client ID per 008.
- Message is non-technical and links to the same personal-Client-ID registration flow as 008's fallback.
- Visual design comes from a dedicated Claude Design pass (see `docs/design_v1`/`docs/design_v2` for the established pattern) before implementation.

### 010 — WCL request performance & loading-state audit ✅ Done

As a developer, I want a full audit of every WCL GraphQL request the app makes — checking for redundant refetches, oversized queries, and requests that could be batched or deferred — with a loading indicator added anywhere a request may take user-perceptible time, so that the app feels responsive and doesn't waste the shared rate-limit budget.

**Acceptance criteria**

- Every WCL request call site is reviewed; duplicate or avoidable requests are eliminated, or their necessity is justified in a comment.
- Every screen that triggers a WCL request shows a loading state (spinner/skeleton) while it's in flight, instead of an unexplained pause.
- Findings and fixes are captured in one pass — this sweeps whatever call sites exist at the time it's picked up, it isn't repeated per-epic.

### 011 — Dreamstate-spec test coverage ✅ Done

As a developer, I want test fixtures and factory support for a Dreamstate-spec druid (e.g. 35/0/26) in addition to the existing full-Resto-only test data (e.g. 12/0/49), so that spec/talent assumptions elsewhere in the app — starting with 005's auto-detection — are verified against more than one canonical build.

**What counts as "Dreamstate" in this repo:** at least 1 point in the Dreamstate talent itself (Balance tree, unlocked once 30 points are already spent in Balance) — not merely a Balance-heavy split. In practice this means Balance ≥ 31, Feral = 0, and the remainder in Restoration (e.g. 35/0/26, this story's fixture report). A build that happens to land near that split without the Dreamstate talent itself isn't Dreamstate by this definition.

**Acceptance criteria**

- At least one real or synthetic fixture report includes a Dreamstate-spec druid, documented in `docs/testing.md`'s known-test-reports table per its existing convention.
- 005's druid-detection tests (and any other spec-sensitive tests) run against both the full-Resto and Dreamstate fixtures.
- Any production code found assuming full-Resto talent points is flagged; fixing it is only in scope for this story if it's a small, contained change — otherwise it's called out as separate follow-up rather than silently expanding this story's scope.

### 012 — Support `classic.warcraftlogs.com` TBC reports for subscribed users ✅ Done

I want the app to accept a report from `classic.warcraftlogs.com` — not just `fresh.` Anniversary realms — whenever the report is genuinely TBC content and the currently logged-in WCL account has an active subscription, so that the tool also works for the original 2021-2024 TBC Classic launch's logs, not only Anniversary realms. Critically, this does **not** require a personal Client ID (story 008): subscription entitlement belongs to the _authenticated account_ that completes the PKCE login, not to whichever Client ID (shared default or personal) facilitated that login — a paying subscriber logged in through the app's shared default client gets `classic.` access exactly the same as someone using their own registered Client ID. This widens principle 1's scope (`docs/roadmap.md`/CLAUDE.md currently say "TBC Anniversary ('fresh') realms only, no other realm type") — that principle needs updating alongside this story, not left contradicting shipped behavior.

**What this does _not_ change:** the tool still only judges TBC content. `classic.warcraftlogs.com` also serves Classic Era (vanilla), Wrath, Cataclysm, and Mists of Pandaria logs (confirmed live this session: `expansion_id`s 1000/1001/1002/1003/1004 respectively, with 1001 = "The Burning Crusade") — every one of those non-TBC expansions must still be rejected, the same way story 002 already rejects non-Anniversary subdomains today.

**Acceptance criteria**

- Report URL/code parsing (story 002) accepts `classic.warcraftlogs.com` URLs for reports confirmed to be TBC content (`expansion_id` 1001), rejecting other expansions on that same subdomain with a clear message — not the current blanket "`classic.`/`www.` unsupported" rejection.
- Report codes resolve identically regardless of which of `www`/`classic`/`fresh` WCL hosts serves the request (confirmed live during implementation) — a bare report code needs no host disambiguation at all; it's fetched exactly as it always has been.
- `classic.` access is attempted with whatever Client ID is currently active — shared default or personal — since entitlement depends on the logged-in account, not the Client ID. Nothing in today's default-client flow (008) should block or discourage a `classic.` attempt.
- The account's subscription status is surfaced to the user proactively via `Report.archiveStatus.isAccessible` (confirmed live — no `currentUser`-level subscription field exists in the schema); a `classic.` report attempt that fails despite that check is surfaced as a clear, distinct message (per story 708's error-handling conventions) that explains a WCL subscription is needed and links to WCL's own subscription page — not a generic "something went wrong," and not a prompt to register a personal Client ID, since that alone wouldn't fix it.
- `src/wcl/client.ts`'s WCL API base URL stays a single hardcoded `www.warcraftlogs.com` endpoint — confirmed live that it already serves `classic.`-sourced reports identically, so no per-request host routing is needed. The parsed input `host` (`fresh`/`classic`) is used only for building outbound deep-links back to WCL's own web UI, not for choosing an API endpoint.
- `docs/roadmap.md` and CLAUDE.md's principle 1 are updated to describe the widened scope (TBC content generally — Anniversary _and_ the original Classic-launch TBC window — still excluding every other expansion/realm type) once this ships.
- `docs/testing.md`'s known-reports table gains at least one validated `classic.`-sourced TBC report, the same way every other row documents what it validates.

### 013 — Exclude non-raid content (dungeons, world zones, other-expansion content) from fight lists ✅ Done

I want the app's fight-list building to exclude anything that isn't a real TBC raid-boss encounter — not just raid trash and Karazhan's Chess Event (already excluded), but also 5-man dungeons/heroic dungeons, open-world zones (including incidental world PvP logged while travelling between raids), and — confirmed live to actually happen — full clears of an entirely different expansion's raid bundled into the same WCL report — so that a raid night's scorecard (both the single-fight list, 003, and the whole-report dashboard, 702) is never silently polluted by content this tool was never meant to judge. Per this project's "many logs contain 2 raids" convention (a guild session commonly spans two zones, e.g. an "SSC+TK" report), the fix has to work per-fight, not per-report — a report's own top-level `zone` field already can't be trusted to describe every fight inside it even for the two-raids-in-one-report case story 012 already handles, let alone these newly-found cases.

**Confirmed live this session**, while building a metrics-calibration CSV — the existing filter (`fightRows.ts`'s `isTrash`: `encounterID === 0` or the hardcoded Karazhan Chess Event id) only catches raid trash and that one special case. It does **not** catch:

- **Dungeons/heroic dungeons.** Report `y3kamxfc9N7H2Yb4` (titled "Karazhan 2026-03-10", one of this project's own maintainer's logs) contains two fight rows for a Heroic Dungeon zone visit ("The Slave Pens", `gameZone` id 547) sitting inside an otherwise-Karazhan report — one logs an implausible 27-minute non-kill duration. Both carry a **nonzero** `encounterID` (100004, `kill: false`) — WCL's own synthetic bucket id for that zone visit's untracked combat time — which slips straight past the current `encounterID === 0` check.
- **A full clear of a different expansion's raid, bundled into the same report.** Two reports already sitting in the local calibration corpus (`1ZD72N6CK9jpbhyg`, `gNYhK1ZAP7RQz2pa`, players Cowpop/Ronkin) contain a complete, legitimate Temple of Ahn'Qiraj **and** Blackwing Lair clear (real bosses, real nonzero `encounterID`s, `kill: true` — e.g. Skeram, Sartura, Fankriss, Razorgore, Vaelastrasz, Chromaggus, Nefarian) — vanilla-WoW raids, not TBC — bundled into the same WCL report as real SSC content. These read as fully valid, judgeable fights today; nothing in the current pipeline distinguishes them from real TBC boss kills. (Story 012 already added a report-level TBC-content gate via `Report.zone.expansion.id` — but that's a whole-report check made once at ingestion; it doesn't help here because the report's own nominal zone/expansion is TBC, and the contamination is only visible per-fight.)
- **Open-world content, including world PvP** logged incidentally while travelling between raid zones — not yet caught with a live repro in this project's own corpus, but the same mechanism (a fight whose zone isn't a real raid instance) covers it with no separate special-case needed.

**The fix requires the fight's `gameZone { id name }` field** — confirmed live via `wcl:query` to reliably distinguish "The Slave Pens" (id 547) from "Karazhan" (id 532) per individual fight, unlike the report-level `zone` field. This field existed in `fetchReportFights`'s query until story 010 removed it as unused (a performance cleanup done before this problem was known) — it needs to come back, this time with a real consumer.

**Live-confirmed TBC raid-zone allowlist** (queried via `worldData.zones(expansion_id: 1001)` on `--host classic`, then cross-checked against every fight's own `gameZone.name` across the full local 102-report calibration corpus): `Karazhan`, `Gruul's Lair`, `Magtheridon's Lair`, `Serpentshrine Cavern`, `The Eye`, `Hyjal Summit`, `Black Temple`, `Sunwell Plateau`, `Zul'Aman` — exactly TBC's 9 raid instances, a small, fixed, never-growing list (TBC is frozen content) — the same kind of hardcoded-but-enumerable table this codebase already uses for spell ranks and localized names, not a violation of the "never hardcode IDs" convention (that convention is about resolving per-report data dynamically; a zone list is closer to `NON_BOSS_ENCOUNTER_IDS` in shape, a fixed game-mechanics fact). Note `Mount Hyjal`/`Tempest Keep` — the names commonly used for these raids in casual conversation and in this doc's own known-reports table — are **not** the strings `gameZone.name` actually returns; live data returns `Hyjal Summit` and (for the paired instance formerly assumed to be called "Tempest Keep") the returned name was `The Eye` — confirm both spellings again live before shipping, don't trust this paragraph's transcription.

**Acceptance criteria**

- `fetchReportFights` (`src/wcl/client.ts`) requests `gameZone { id name }` per fight again.
- `fightRows.ts`'s `isTrash` also becomes `true` for any fight whose `gameZone.name` isn't in the live-confirmed TBC raid-zone allowlist above, in addition to the existing `encounterID === 0`/Chess Event checks — a dungeon boss kill, a heroic-dungeon trash bucket, an other-expansion raid boss, or an open-world (incl. world PvP) fight are all excluded the same way raid trash already is, with no separate mechanism needed per category.
- Confirmed against the real `y3kamxfc9N7H2Yb4` report (this story's primary discovery case) — its two `The Slave Pens` rows are excluded from both the fight list (003) and the whole-report dashboard (702)'s aggregate, while its real Karazhan boss fights are unaffected.
- `scripts/lib/calibrateReport.ts`/`scripts/calibrate.ts` (which already reuses `fightRows.ts`'s `isTrash`, per `scripts/lib/calibrateReport.ts:85`) picks up the same fix automatically with no separate change needed — worth re-confirming live against `y3kamxfc9N7H2Yb4`, `1ZD72N6CK9jpbhyg`, and `gNYhK1ZAP7RQz2pa` once the app-side fix lands, since exactly these three reports were silently distorting this session's calibration-CSV numbers before a duration/zone filter was applied by hand in that analysis.
- `docs/testing.md`'s known-reports table gains an entry for `y3kamxfc9N7H2Yb4` documenting this exact case, per its existing convention.

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
- Buckets share the same bands as the median R/O/G judgement below: red < 5 s, orange 5–6 s, green 6–7 s, red > 7 s.
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

**Note (flagged by 011, not fixed here):** the same Swiftmend-availability gap as 501's note applies here — for a build that can't talent into Swiftmend at all (e.g. Dreamstate, 26 Restoration points — Swiftmend requires 30, distinct from Tree of Life's 41-point capstone), the "usage count vs. availability windows" informational context reads as a large number of missed opportunities that were in fact never available. Not fixed in 011, for the same reason as 501's note; the same future follow-up story should address both.

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

**Note (flagged by 011, not fixed here):** `deathForensics.ts`'s `isReady()` helper (used for both `swiftmendReady` and `nsReady`) treats "no prior cast of this ability at all" as "ready" — correct for a druid who simply hasn't needed the cooldown yet, but indistinguishable from a druid whose build can never talent into it at all (e.g. a Dreamstate build, which tops out at 26 Restoration points — Swiftmend requires 30, and Tree of Life, Restoration's actual capstone, requires 41 — see `docs/testing.md`'s `bKRZ68XqgwYkxtzm` entry, whose real captured data confirms zero Swiftmend casts across every fight for this exact build). A Dreamstate druid's `unspentCount` is therefore inflated by a resource they never had access to, which can misjudge a death as red for "2 unspent resources" when only Nature's Swiftness was ever real. Fixing this needs the app to resolve a druid's actual talent points, which it doesn't do anywhere today — out of scope for 011's fixture-only mandate. A follow-up story should add talent-point resolution and gate CD-readiness checks on it.

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

**803 (multi-druid comparison) has been removed from this backlog** — TBC raids rarely run two resto druids, so the only comparison that makes sense is raid-vs-raid, which the per-report flow (702) already supports.

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

### 703 — Shareable report state ✅ Done

I want the report/fight/druid selection encoded in the URL, so that I can share a link to a specific scorecard with my healing officer. I also want the browser's own back/forward buttons to work throughout the app, so that navigating away from a screen doesn't feel like a dead end.

**Acceptance criteria**

- Opening a shared URL reproduces the same scorecard (after auth).
- No metric data is stored anywhere — the URL only encodes selection state.
- Every screen in the flow (report input, druid picker, whole-report dashboard (702, whose per-boss list fulfills 003's former role — there is no separate fight-picker screen to route), whole-report per-epic detail, per-fight scorecard (701), per-fight per-epic detail) changes the URL hash as the user navigates through it — not just the final scorecard view — using hash-based routing (no server-side routes to configure, matching the static-hosting/no-backend constraint).
- The browser's back/forward buttons move between screens the same way the in-app back-links (e.g. "← All fights", "← All metrics") do, everywhere in the flow — not just at the top level.
- Opening any hash-encoded URL directly (not just the fully-selected scorecard one) resumes at that exact screen once authenticated, instead of resetting to the report-input screen.

### 706 — Responsive/mobile layout ✅ Done

I want the app to work well on mobile, so that I can check a scorecard from my phone.

**Acceptance criteria**

- Layout follows `docs/design_v3` (produced via a dedicated Claude Design pass, same pattern as `docs/design_v1`/`docs/design_v2`) — this story does not specify a layout itself.
- All flow screens (onboarding, report input, druid picker, whole-report dashboard — whose own per-boss list is the fight picker, there is no separate screen — per-fight scorecard, per-epic detail views) are usable on common mobile viewport widths, matching design_v3.

### 707 — Judgement language: Good/Fair/Bad labels ✅ Done

I want every red/orange/green judgement chip to also carry a plain-language word — Good (green), Fair (orange), Bad (red) — so that the verdict doesn't rely on color alone, which is hard to parse at a glance and inaccessible to colorblind users.

**Acceptance criteria**

- Every judgement chip anywhere in the app (overview widgets, per-epic detail rows) shows its Good/Fair/Bad label alongside its color, never color alone.
- Wording is consistent everywhere the same judgement tier appears — no epic invents its own synonyms for "Fair."

### 708 — Global error handling & recovery overlay ✅ Done

I want any error — an uncaught bug, a failed WCL request, or a GraphQL request that hangs — to show a clear, non-technical "something went wrong" screen instead of a blank page or a silently broken widget, so that a transient glitch doesn't look like the app is dead.

**Acceptance criteria**

- A top-level React error boundary catches any uncaught rendering error anywhere in the component tree and replaces the screen with the recovery overlay below, instead of an unhandled exception blanking the page.
- Every WCL GraphQL request (`src/wcl/client.ts`, `src/wcl/events.ts`) gets a 30-second timeout (`AbortSignal.timeout(30_000)` or equivalent); a request that times out is surfaced as a distinct, clearly-labeled error rather than hanging indefinitely or reading as a generic failure.
- The overlay replaces every existing inline error Alert in the app (e.g. `ConnectPanel`'s fetch-failure message) — one error-handling path, going forward. The one exception is the rate-limit banner (008/009): a 429 keeps its own dedicated banner and recovery flow (register a personal Client ID), since that's a distinct, actionable, non-fatal condition, not a generic error.
- The overlay shows: an apology ("Sorry, something went wrong"), a collapsed-by-default "View details" disclosure with the error's message, stack trace (when available), and a timestamp, a "Start over" button that navigates to `#/` and reloads the app, and a prompt to open an issue at `https://github.com/branneman/bloomwatch/issues` (with the same details) if a retry doesn't fix it.
- No error-reporting/telemetry service is introduced (principles 2/4 — no backend, FOSS) — "View details" is for the user to copy into a manually-filed GitHub issue; nothing is sent anywhere automatically.

### 801 — Build & test tooling ✅ Done

As a developer, I want a Vite + React + TypeScript project scaffold with a full test pyramid and automated CI/CD to GitHub Pages, so that the app has a maintainable foundation and every later story can be built and verified with confidence.

**Acceptance criteria**

- Vite + React + TypeScript scaffold builds and deploys automatically to GitHub Pages on every push to `main`; the live URL is in the README.
- `index.html`'s spike logic (PKCE auth, GraphQL client) is ported into typed, tested modules under `src/wcl/`; the spike itself is retired.
- Static analysis (typecheck, ESLint, Prettier) runs full-project in both a pre-commit hook and CI — not scoped to changed files only.
- Test pyramid stood up per `docs/testing.md`: unit + WCL-client-integration (mocked) + component tests run on every push; contract tests (real WCL API, dedicated test Client ID) run on manual trigger only; E2E smoke runs against the live site after every deploy.
- No secrets are required to build or deploy the product itself (per principle 2); the dedicated test Client ID's access token is a CI-only test credential, documented as such.

### 802 — Threshold calibration pass ✅ Done

As the project's maintainers, we want to review every R/O/G threshold in the app against a corpus of real, well-regarded druid logs and adjust the ones that are currently unfair, so that judgements are consistent and trustworthy across the whole tool. This is deliberately last: it only makes sense once every metric epic exists, so we can look at the full picture holistically instead of tuning one metric in isolation. This is an internal engineering pass — there is no end-user-facing threshold-editing UI; users do not get to configure their own judgements.

**Acceptance criteria**

- Every threshold used anywhere in the app is listed in one place (a doc or dev-only view) with its current default and source rationale, to review against.
- Each threshold is checked against real log data spanning a range of skill levels; any threshold that misjudges known-good or known-bad play is adjusted, with the change and its reasoning recorded in `docs/backlog.md`.
- No `localStorage`-backed settings screen, no user-facing configuration UI — thresholds remain hardcoded defaults, just better-calibrated ones.

The threshold inventory (`docs/thresholds.md`) and the `scripts/calibrate.ts`/`scripts/wcl-query.ts` tooling this story called for are done. Running that tooling against real reports surfaced findings much larger than "adjust a few numbers" — see Epic I below, which is now how this story is actually carried out.

---

## Epic I — Calibration & spec-awareness

Discovered mid-802, once real calibration data existed: the app's thresholds implicitly assume one playstyle (deep resto, Tree of Life, HoT-heavy 4-GCD Lifebloom-stacking), but a talent scan of 45 real druids pulled from top-competing TBC Anniversary guilds found only 3 (7%) talent-eligible for that playstyle at all — the other 93% cluster into a small number of Balance-heavy hybrid builds (see story 903 for the exact split). Judging that 93% against deep-resto thresholds is a category error, not a calibration error, and it's the real reason early findings against story 802's initial corpus looked so uniformly harsh. This epic is ordered by product priority, not build-dependency order — 900-902 (exemplar-finding and Lifebloom recalibration) are judged the most urgent, since the tool has limited value until its flagship metric is calibrated against real examples of the playstyle it claims to judge.

### 900 — Tag calibration corpus with detected talent-archetype buckets ✅ Done

I want every report/druid we've already pulled into `calibration-data/` (and every one we pull from now on) tagged with a talent-archetype bucket, so that exemplar-hunting (901) and every later recalibration story can filter the corpus by archetype instead of re-deriving it by hand each time, the way this session's investigation had to.

**Acceptance criteria**

- Talent point totals (Balance/Feral/Restoration) are read from each fight's `CombatantInfo` event (`talents` field — confirmed live, three entries `{id, icon}` in tree order; TBC-era logs do not populate the richer `talentTree`/`specID` fields, so point totals are the ceiling of what's available, not a limitation of this story) and recorded per druid.
- Buckets, derived from point totals only (exact talent picks are unavailable — see story 802's investigation): **deep resto** (Restoration ≥ 41, Tree of Life-eligible), **likely dreamstate** (Balance ≥ 31 — Dreamstate unlocks at 30 Balance points, so 1 point there requires ≥ 31 total; ≥ 33 for full 3/3), **mostly resto** (Restoration is the largest of the three trees but below the deep-resto cutoff — added after the initial classifier mislabeled a 21/0/40 split as "mostly balance" purely because Balance ≥ 20, ignoring that Restoration dominated), **mostly balance** (Balance is the largest of the three trees and ≥ 20), **restokin-shaped** (see note below — not currently distinguishable from "likely dreamstate"), **other/unclassified** (covers Feral-dominant splits too — not a target archetype for this app).
- Bucket assignment is a per-report/per-druid record, committed to git as `docs/calibration-archetypes.json` (`scripts/tagArchetypes.ts` produces it) — not just a one-off script's stdout, so it persists across sessions and worktrees. Lives outside `calibration-data/` (gitignored per story 902's cleanup) since this index is a durable finding, not scratch output.
- All 75 reports gathered this session (54 Anniversary, 21 from the 2021-2022 TBC Classic launch) are backfilled.
- **Restokin note:** researched live — Moonkin Form (Restokin's signature talent) also requires 31 Balance points, the same tier as Dreamstate. Point totals alone can't distinguish the two builds; a dedicated `restokin-shaped` bucket isn't achievable from this data source without a behavioral signal (e.g. real Starfire/Wrath cast volume) layered on top, which is out of scope here.
- Explicitly out of scope: inferring exact talent choices (Swiftmend/NS/Dreamstate specifically) from point totals alone — that needs behavioral corroboration, which is story 901/903's concern, not this one's.

### 901 — Find and validate deep-resto 4-GCD exemplar reports ✅ Done

I want a validated set of real reports/fights from druids who are both talent-eligible for deep resto _and_ behaviorally playing the 4-GCD, multi-target LB3-stacking style, so that story 902 has genuine exemplars to calibrate against — not just talent-filtered candidates, one of which (Profex, 16/0/45, a 99-parse on Lady Vashj) turned out to show zero maintained 3-stack targets on a real fight despite deep-resto talents. Talent eligibility alone doesn't prove playstyle; this story is deliberately treated as high-effort and important, since the tool has limited value without it.

**Acceptance criteria**

- A documented, repeatable method combines a talent filter (story 900's "deep resto" bucket) with a _behavioral_ filter — candidate fights must show sustained multi-target LB3 maintenance (e.g. `concurrentLb3Targets.avgConcurrent` above a real, evidence-set threshold), not just deep-resto talents.
- WCL's top-parse rankings are not the sole sourcing method — story 802's own investigation showed HPS-based search is biased toward the Balance-hybrid majority, not deep resto, so this story also pursues community-sourced recommendations (e.g. druid Discord communities naming specific known-good players/reports) as a complementary source that captures reputation nuance an automated filter can't. In practice the strongest source turned out to be the 2021-2022 TBC Classic launch's progression content (Black Temple/Hyjal/Sunwell) once story 012's subscription investigation made it accessible — real deep-resto exemplars were far more common there than in Anniversary's farm-tier SSC/TK.
- At least a handful of validated exemplar fights are captured in `docs/testing.md`'s known-reports table, each annotated with the evidence for why it qualifies (talent split + concurrent-LB3 behavior, or community sourcing rationale) — done: 20 reports across 16 players.
- Exemplars are tagged via story 900's bucketing so they're queryable alongside the rest of the corpus.

### 902 — Recalibrate Lifebloom discipline thresholds against exemplars ✅ Done

I want LB3-uptime and refresh-cadence thresholds reviewed against story 901's exemplar data, so that judgements reflect what real, skilled 4-GCD play actually looks like — the initial 46-report corpus couldn't clear these thresholds at all (100% red at the whole-report rollup level, 68% red per-fight even before rollup amplification), which is a strong signal the thresholds were never validated against real examples of the target playstyle in the first place.

**Findings so far, from real `classic.warcraftlogs.com` progression logs (Olklo, Frankensteak, Was, Spideyhoof, Khiara, Wah, Nachobeár — sourced via story 012's investigation, subscription-gated data from the first TBC Classic launch, 2021-2022, not the 2007 original release):** refresh cadence looks well-calibrated as-is — elite players consistently land 80-94% of refreshes in the current 5.5-7s "ideal" band, across many independent logs, which is real validation rather than a guess. Concurrent multi-target LB3 maintenance is real and does happen, but shows up far more in harder, later-phase content (BT/Hyjal, Sunwell — peak concurrent up to 5) than in farm-tier SSC/TK content, Anniversary or 2021-2022-Classic alike; searching only farm-tier logs was looking in the wrong difficulty tier. Per-target uptime, however, structurally drops for players juggling _more_ simultaneous targets (e.g. Olklo's Sunwell log: 10 targets at 19-71% each) versus fewer (his BT/Hyjal log: 3 targets at a tight 64-65%) — a wider assignment isn't worse play, it's harder play, and the current metric can't tell the difference.

**Resolved:** per-target LB3 uptime isn't the wrong shape of metric, but it's only a meaningful signal for a druid actually assigned as a dedicated tank healer — a raid healer splitting attention across many targets by design will structurally score worse on it without playing worse. Rather than trying to detect assignment (no WCL data source for that), the metric's own copy should say so directly (something like "if you're mainly raid-healing this fight, this metric isn't a fair read on you") — the same kind of caveat the whole-report dashboard already carries ("can't judge target selection, assignment adherence, or positioning").

**Acceptance criteria**

- Every exemplar fight's per-target LB3 uptime and refresh-cadence median are tabulated against the current thresholds (`src/metrics/lb3Uptime.ts`: green ≥90%/orange 75-90%/red <75%; `src/metrics/refreshCadence.ts`: green 6-7s/orange 5-6s/red outside that).
- The LB3-uptime-per-target card/detail view gains a caveat noting the metric is strongest for tank-healer assignments and shouldn't be weighted heavily by a primarily raid-healing druid, per the resolution above.
- Any threshold that misjudges known-good exemplar play is adjusted, with the change and reasoning recorded here per story 802's own acceptance criteria — refresh cadence's current band is a candidate for "no change needed" given the findings above, pending final review against the full exemplar set.
- `docs/thresholds.md` is updated to reflect the recalibration and cite the exemplar evidence backing it.

### 903 — Spec/archetype-aware judgement

I want the app to detect a druid's talent archetype and actual per-fight healing role, and adjust which metrics it shows and how it judges them accordingly, so that a Dreamstate or Balance-hybrid druid isn't silently judged against deep-resto assumptions they were never trying to meet. A real talent scan this session found only 3 of 45 druids pulled from top-competing guilds were even talent-eligible for deep resto — the other 42 clustered into `35/0/26`, `37/0/24`, and `48/0/13` splits (Restoration below Swiftmend's 30-point requirement in every case), meaning the majority of real top players can't even take Swiftmend, which today's tool judges them on anyway. Split into four sub-stories (903a-903d) since the combined scope was too large for one implementation plan/session — each is independently implementable, with 903c and 903d depending on 903a's detection work landing first.

### 903a — Per-fight talent-archetype detection ✅ Done

I want per-fight talent-archetype detection (story 900's bucket definitions) computed for the report's selected druid and surfaced in the UI, so that 903c's card-hiding and 903d's onboarding notice have real per-fight data to consume instead of the offline-only classification story 900 produced.

**Acceptance criteria**

- Talent-bucket classification logic (currently only in `scripts/tagArchetypes.ts`, story 900) is extracted into a shared `src/` module so both the CLI tool and the app use the same classifier — no duplicated bucket logic.
- The bucket is computed per fight (not once per report) by reading the `CombatantInfo` event's `talents` field for the selected druid — the same event/field story 900's script already reads — fetched via the app's existing `fetchEvents`/event-cache layer (already used for other `CombatantInfo` consumers, e.g. Prep hygiene, story 601).
- The detected bucket (or an explicit "unknown — talent read failed" state when the event is missing/malformed) is surfaced somewhere visible in the Scorecard UI (e.g. next to the druid name/label), so this story has a verifiable, user-visible outcome rather than shipping as dead plumbing with no consumer yet.
- Out of scope: card-hiding behavior (903c) and any change to healing-role detection (903b) — this story is detection + display only.

### 903b — Per-fight healing-role detection ✅ Done

I want healing-role detection refined to work per fight instead of once per report, so that a Restokin-style druid who legitimately swaps between healing and DPS across pulls (no respec) is judged per-fight rather than by one whole-report identity. Absorbs/supersedes story 709.

**Acceptance criteria**

- Today's detection (story 005) sums healing casts across the whole report and reuses one druid identity for every fight; this is refined to detect per fight instead.
- A fight where the selected druid's healing-cast count in that fight falls below story 005's `MIN_HEALING_CASTS_FOR_DETECTION` threshold is excluded from that druid's aggregation in 702's whole-report dashboard and doesn't contribute to any epic's worst-of judgement.
- The excluded fight is still visible in the fight list (e.g. labeled "not healing this fight" or similar), not silently dropped, so a user isn't confused about a missing pull.
- Confirmed against a real report with this exact scenario (see `docs/testing.md`'s `F7aL6x13zVq8kTRt` entry — a druid respecs to DPS for some bosses, back to Resto for others, within one report; flagged during story 802's calibration-tooling work).
- Story 709 is retired once this ships (per this repo's "a story isn't done until its paperwork is retired" convention) — its off-role-fight exclusion becomes a special case of per-fight role detection, not a separate mechanism.

### 903c — Hide metrics whose prerequisite talent is unreachable (app) ✅ Done

Depends on 903a. I want metric cards gated behind a talent the fight's actual Restoration point count can't reach to stop rendering a misleading judgement — e.g. the Swiftmend quality audit card doesn't render at all below 30 Restoration points, rather than defaulting to a fake "green" from 0 wasteful casts out of 0 total. Scoped to what a live user actually sees (cards, the Scorecard overview widget, and 702's whole-report rollup); the CLI calibration tool's own separate pooling is out of scope here — see the new story this investigation filed for that.

**Talent-threshold inventory** (researched and cross-validated against this repo's own already-verified talent-bucket data — Swiftmend at 30 points and Tree of Life at 41 points, both already documented elsewhere in this file, match TBC's standard 5-points-per-tier rule applied to Swiftmend's tier 7 and Tree of Life's tier 9, which cross-checks the same rule's tier 5 placement for Nature's Swiftness):

- **Swiftmend quality audit** (story 302): needs Restoration ≥ 30.
- **Nature's Swiftness card** (story 204's sibling audit): needs Restoration ≥ 20. Informational-only today (no R/O/G judgement), but its "usage vs. availability windows" count is just as fictitious for a Nature's Swiftness-ineligible build as Swiftmend's own availability count already flagged in story 302's note below — hidden for the same reason.
- **Innervate audit** (story 403): **not gated** — Innervate is a base trainable spell available to every druid spec regardless of talent investment, confirmed live research; no card hiding needed.

**Acceptance criteria**

- 903a's `useArchetypeBucket` hook is extended to also expose the fight's raw Restoration point count (the categorical bucket alone isn't precise enough to gate an exact point threshold — e.g. a "mostly-resto" bucket could be anywhere from ~20 to ~40 Restoration points).
- The Swiftmend quality audit and Nature's Swiftness cards are each hidden — not rendered, not silently scored "green" — for a fight where the druid's Restoration points fall below that card's threshold; a short explanatory note replaces each (e.g. "Not shown — this build can't take Swiftmend").
- The "Spell discipline" epic summary (`useSpellDisciplineSummary`/`summarizeSpellDiscipline`, shared by both the Scorecard overview widget and `ReportDashboard`'s whole-report rollup) excludes a talent-ineligible metric's judgement and stat line from its pooling, treating it as "not applicable" rather than a spurious green or a missing data point.
- Story 302's Swiftmend-availability note is resolved as a side effect of hiding the whole card — no separate fix needed.
- Story 501's Death Forensics `unspentCount` inflation (flagged during story 011, `docs/backlog.md`'s existing note) is fixed now that real talent data exists: `swiftmendReady`/`nsReady` are only `true` when the druid's build can actually reach that talent, not merely "no prior cast recorded."

### 907 — Talent-aware pooling for the calibration CLI tool ✅ Done

Depends on 903c. I want `scripts/lib/rollup.ts`'s whole-report pooling (used by `scripts/calibrate.ts`) to exclude a fight's Swiftmend/Nature's Swiftness metrics from a druid's numeric rollup when 903a's per-fight talent data shows the build can't reach that talent, so the CLI tool's own calibration output doesn't suffer the same fake-green/fake-availability distortion 903c fixes in the live app. Implemented alongside story 905, whose archetype-bucket plumbing this reuses. Investigating this against the real code (not just the story's original hunch) found the described Swiftmend distortion doesn't actually reproduce: `computeSwiftmendAudit` already returns `wastefulPct: 0` with `weight: 0` (zero real casts) for an ineligible fight, and a zero-weight entry is mathematically neutral in `scripts/lib/rollup.ts`'s `countWeightedAverage` — confirmed against real corpus output (`swiftmendWastefulPctPooled: null`, not a fake number, for a talent-confirmed Swiftmend-ineligible druid). The real live bug was in `InformationalRollup.naturesSwiftnessAvailableWindowsTotal`, a plain `sum()` with no such protection, silently accumulating a fictitious cooldown-based "available windows" count from Nature's-Swiftness-ineligible fights.

**Acceptance criteria**

- `scripts/lib/calibrateReport.ts`'s fight-context building already fetches `CombatantInfo` per fight and computes `hasNaturesSwiftness` (predates this story) — it now also exposes `hasNaturesSwiftness` on the returned `FightResult`.
- `scripts/lib/rollup.ts`'s informational pooling excludes a fight's Nature's Swiftness `castCount`/`availableWindows` from `naturesSwiftnessCastsTotal`/`naturesSwiftnessAvailableWindowsTotal` when that fight's druid can't reach Nature's Swiftness's talent threshold.
- Swiftmend's own `swiftmendWastefulPctPooled` needed no change — verified safe by the corpus check above, documented here rather than silently left unexamined.
- Confirmed against a real report already known to include a Nature's-Swiftness-ineligible druid (`docs/testing.md`'s `F7aL6x13zVq8kTRt` entry, druid Nebd, Restoration 13).

### 908 — Recalibrate GCD economy thresholds against exemplars ✅ Done

I want GCD economy's two thresholds (story 101/102) reviewed against real exemplar data before accepting story 904's finding that "the threshold values aren't the problem, the aggregation is" at face value for this epic specifically — 904's 33/27/39 per-fight split was pooled across the whole, non-archetype-filtered corpus, not validated deep-resto exemplars.

**Findings**, from the same 22-report story-901 `classic.warcraftlogs.com` exemplar corpus 902 used (167 real kill-fights, duration > 30s, Karazhan's non-boss "Chess Event" excluded, computed via `scripts/calibrate.ts`):

- **GCD utilization (green ≥85%/orange 70-85%/red <70%): no change.** 81% green/11% orange/7% red, median 98.3% — strong real validation of the current bands.
- **Idle-gap dead time (green <5%/orange 5-15%/red >15%): green boundary revised to <7%.** The old 5% line sat almost exactly on the sample's median (4.0%), so only 56% of genuinely elite pulls landed green; moving only the green boundary (red ceiling unchanged) shifts the sample to 64% green/20% orange/16% red.

**Acceptance criteria**

- `src/metrics/idleGaps.ts`'s `GREEN_MAX_PCT` constant updated from 5 to 7, with its sourcing comment citing both story 102 and this revision.
- `src/metrics/gcdUtilization.ts` unchanged (its thresholds were validated as-is).
- `docs/thresholds.md` updated with the new idle-gap default and a dated calibration-review paragraph recording both findings.

### 903d — Onboarding notice on supported playstyles ✅ Done

Depends on 903a. I want the onboarding screen (705) and/or a new in-app notice to make explicit which playstyles the tool judges well (deep resto, and Dreamstate to a lesser extent) versus which it doesn't yet support meaningfully (Regrowth-spec, Restokin, Balance druids playing a healer-style role) — so a user in an unsupported archetype gets an honest "this tool isn't built for your build yet" rather than a silently wrong scorecard.

**Acceptance criteria**

- The onboarding screen and/or an in-app notice states plainly, in generic terms, which playstyles are well-supported vs. not.
- Where practical, the notice is contextualized to the actually-detected archetype (903a) once a report/druid is loaded, not just generic static text on the onboarding screen.

### 904 — Overhaul whole-report rollup policy ✅ Done

I want the whole-report dashboard's per-epic judgement to stop being a strict worst-of across every fight, so that one rough pull in an otherwise-clean 10-13-fight raid night doesn't single-handedly crush the whole night's verdict to red. Real corpus data showed this starkly: GCD economy was 33% green/27% orange/39% red _per fight_, but 0% green/9% orange/91% red at the worst-of rollup; spell discipline was 70% green per-fight but only 35% green at rollup. The threshold values aren't the problem here — the aggregation is.

Implemented as a duration-weighted median (`weightedMedianJudgement`) plus a fight-count breakdown (`judgementBreakdown`), both new pure functions in `src/metrics/judgement.ts`, shared by the app's `ReportDashboard` chip strip (`rollupEpicJudgement` in `src/metrics/reportAggregation.ts`) and `scripts/lib/rollup.ts`'s CLI rollup — one policy, not two. Chosen over a percentage-band cutoff scheme specifically to avoid needing new arbitrary sourced constants (a median needs none); chosen over a per-metric numeric-pool-and-rejudge approach because several metrics (accidental blooms, restack tax, downranking flags) are judged as raw per-fight event counts that can't be meaningfully pooled and re-judged against a single-fight threshold. See `docs/thresholds.md`'s revised compounding-factors bullet for the full mechanism.

**Acceptance criteria**

- A replacement aggregation mechanism is designed and documented (open question as of this writing — no mechanism has been chosen yet; candidates to evaluate include a duration-weighted or count-weighted blend per metric, matching `scripts/lib/rollup.ts`'s existing per-metric pooling rules, versus a "mostly green with call-outs" summary that surfaces the number of red/orange fights without letting the worst one dominate the headline verdict).
- Whatever mechanism is chosen still lets a user drill into which specific fight(s) drove a bad result — this story must not lose the diagnostic value the current (harsh) worst-of policy at least provides honestly.
- The per-fight scorecard (701) is unaffected — this story is scoped to 702's whole-report rollup and `scripts/lib/rollup.ts`'s judgement pooling, not single-fight judging.

### 905 — Recalibrate mana economy thresholds ✅ Done

I want mana economy's thresholds reviewed against real data, so that judgements reflect real play rather than an artifact of overheal thresholds tuned for a different gear/content-progression assumption. Real corpus data showed mana economy driven almost entirely by the overheal sub-metric (204/393 fight-rows red — mana curve, consumables, and Innervate were all reasonably distributed on their own). Pooling the corpus by story 900/903a's archetype buckets found two distinct problems: Bloom overheal was miscalibrated for every archetype alike (both deep-resto and dreamstate exemplars cluster at ~72-74% median overheal against an old 70% red line), while Regrowth-direct overheal genuinely differs by archetype (deep-resto median 31% vs. dreamstate median 50%, p75 84%) — Healing Touch and Swiftmend overheal, by contrast, already fit the existing threshold well in both archetypes and needed no change. See `docs/thresholds.md`'s story 905 calibration-review paragraph for the full numeric findings, including the explicit caveat that dreamstate's Regrowth-direct number is provisional (calibrated against the broader talent-tagged corpus, not a behaviorally-validated exemplar set — no dreamstate equivalent of story 901 exists yet).

**Acceptance criteria**

- Bloom overheal's threshold is recalibrated as a single value, unchanged across archetypes (`src/metrics/overhealTable.ts`'s `judgeBloomOverheal`).
- Regrowth-direct overheal gets its own threshold per archetype bucket, computed by `computeOverhealTable`'s new `archetypeBucket` parameter (default `"deep-resto"`) and consumed by `OverhealTableCard`, `useManaEconomySummary`, and `scripts/lib/calibrateReport.ts` alike, each sourcing the bucket from 903a's existing `useArchetypeBucket`/`classifyBucket`.
- Healing Touch and Swiftmend overheal are left unchanged.
- `docs/thresholds.md` is updated with the new values and a dated calibration-review paragraph.

### 906 — Fix locale-dependent ability-name matching ✅ Done

I want ability resolution to stop depending on English spell-name strings, so that a report logged by a non-English WoW client doesn't silently lose data for any spell resolved through the name-matching fallback. `src/abilities/resolveAbilities.ts` matches by game ID first (locale-safe) but falls back to matching `ability.name` against hardcoded English strings for any ID not already in its rank table; `src/report/druidDetection.ts`'s `HEALING_SPELL_NAMES` (which decides who counts as a healer at all) is 100% name-based with no ID fallback whatsoever. This wasn't confirmed as a live bug this session (a suspected German-localized report turned out to log Lifebloom in English — combat logs reflect the uploader's client language, not each player's own), but the fragility is real and independently worth fixing.

**Acceptance criteria**

- WoW TBC has a fixed, enumerable set of supported client languages — every spell name currently matched via the English-only fallback path gets a hardcoded per-language translation table, rather than relying on a live non-English repro to drive the fix.
- `druidDetection.ts`'s `HEALING_SPELL_NAMES` gains the same per-language coverage, or is changed to resolve via game ID the same way `resolveAbilities.ts`'s primary path already does.
- A short note in `docs/testing.md` records which language(s) were actually validated against a real non-English-logged report, versus which are translated but unverified.

### 909 — Recalibrate spell discipline thresholds against exemplars ✅ Done

I want Rejuvenation clip share, Swiftmend wasteful share, and downranking flag count reviewed against real exemplar data the same way Lifebloom (902), mana economy (905), and GCD economy (908) already were, so these three stop being the only thresholds in Epic D still running on their original story-era defaults with zero real-play validation behind them.

**Findings**, from the same 20-report story-901 `classic.warcraftlogs.com` deep-resto exemplar corpus 902/908 used (134 real kill-fights, duration > 30s, regenerated fresh via `scripts/calibrate.ts` after story 013's non-raid-zone contamination fix and the Lifebloom any-stack-uptime carry-in fix):

- **Rejuvenation clip share (good <5%/fair 5-15%/bad >15%): no change.** 93% good/5% fair/1% bad, median 0% clips — strong real validation of the current bands.
- **Swiftmend wasteful share (good ==0%/fair ≤25%/bad >25%): recalibrated to good <40%/fair 40-80%/bad >80%.** The old zero-tolerance good band convicted the median real player: 440 real Swiftmend casts from 20 elite players pooled a 58.2% wasteful rate overall (median 63.6% per fight). The "wasteful"-classified casts themselves have a median 10.6s of HoT remaining and median target HP of 73% (min 51%) — real skilled play routinely bursts Swiftmend onto a healthy-ish target with a live HoT, which the classify() logic's "efficient / emergency (≤50% HP) / else wasteful" split can't distinguish from careless spam. Flagged but not fixed here: the classify() emergency-HP cutoff (50%) looks like the real root cause and is a candidate for a future recalibration pass, but redefining classification logic is outside a threshold-value story's scope — only the wasteful-share band moved.
- **Downranking flagged-count (good 0 flags/fair ≥1 flag): no change.** 88% good/12% fair, max flags seen in any real fight was 1 (confirms "bad is structurally unreachable" still holds). The underlying >50% direct-overheal flag cutoff sits almost exactly at the real p75 of max-rank overheal-by-spell-group (median 36%, p75 51%), additional support for no change.

**Acceptance criteria**

- Regenerate the local calibration corpus (`calibration-data/`) with current code before pooling — two correctness fixes landed the same session this story was filed (013's non-raid-zone contamination fix, and a Lifebloom any-stack-uptime carry-in fix) after most of the existing `calibration-data/` JSON was generated; recalibrating against stale files would repeat the exact category of error that session found and fixed.
- Rejuvenation clip share, Swiftmend wasteful share, and downranking flagged-count are each tabulated against their current thresholds (`hotClipDetection.ts`: good <5%/fair 5-15%/bad >15%; `swiftmendAudit.ts`: good 0%/fair ≤25%/bad >25%; `downrankingDiscipline.ts`: good 0/fair ≥1 flags) across the story-901 deep-resto exemplar corpus, the same corpus 902/908 already used.
- Any threshold that misjudges known-good exemplar play is adjusted, with the change and reasoning recorded in this file per story 802's own acceptance criteria; a threshold that already fits is recorded as a real "no change" finding with its supporting numbers, the same way 908 documented GCD utilization needing none — not silently skipped.
- `docs/thresholds.md` is updated with a dated calibration-review paragraph, matching 902/905/908's existing format.

### 910 — Recalibrate death forensics thresholds against exemplars ✅ Done

I want per-death readiness's threshold (0/1/≥2 unspent resources) reviewed against real exemplar data, so it stops being the one remaining Epic F metric nobody has validated since story 501 shipped it.

This was initially set aside as unusually hard to calibrate, on the reasoning that you can't verify whether a resource would have actually prevented a specific death. That reasoning was wrong to apply here: story 501 already only judges _process_ — was Swiftmend/NS/a free GCD available and unspent in the 5s before death — never the counterfactual outcome of whether using it would have saved the target. Casting Swiftmend or Nature's Swiftness in that moment is good process regardless of whether the target lives; the metric was designed around exactly this from the start (its own "a death is not automatically the druid's fault; this audits your readiness only" caveat). Calibrating the _threshold_ — is 2 unspent resources genuinely worse than 1, does that split hold up against real deaths — is the same kind of statistical exercise 902/905/908 already did elsewhere; nothing about it needs outcome verification, and it shouldn't have been treated as categorically harder than the rest of this list.

**Findings:** the whole local `calibration-data/` corpus (100 reports, including the story-901 20-report deep-resto exemplar set) was regenerated fresh via `scripts/calibrate.ts` first, per this story's own acceptance criteria — the pre-regeneration data actually mattered here: two reports (`2BtcLqgWQR3dT6jf`, `x1pftLJDc6nXAqY7`) had shown `unspentCount: 3` (Swiftmend-ready **and** NS-ready **and** idle-preceding, all true) before regeneration, which dropped to a correctly-gated `unspentCount: 2` after — `swiftmendReady` flipped to `false` because that druid's (Dommymomplz's) talents don't reach `SWIFTMEND_MIN_RESTORATION`, confirming story 903c's talent-eligibility gating is live and correctly wired in both `scripts/lib/calibrateReport.ts` and the app's `useDeathForensicsSummary.ts` (both derive `hasSwiftmend`/`hasNaturesSwiftness` per-fight from that fight's own `CombatantInfo` talents — no stale/report-wide flag). Because of this gating, `unspentCount` never actually reaches 3 among judged (maintained-target, kill-fight) deaths anywhere in the regenerated corpus — it only appears on unmaintained-target deaths, which aren't judged at all.

Tabulated `judgeDeathReadiness` (good 0/fair 1/bad ≥2 unspent) against real maintained-target deaths on kill-fights (duration > 30s), same filter 902/905/908/909 used:

- **Story-901 deep-resto exemplar corpus (20 reports, 146 qualifying kill-fights): 20 judged deaths.** unspentCount distribution 0:4 / 1:9 / 2:7 → **good 20% / fair 45% / bad 35%**. `swiftmendReady` true in 14/20, `nsReady` true in 9/20, `idlePreceding` true in 0/20.
- **Full talent-tagged corpus (100 reports, mixed skill/archetype, 764 qualifying kill-fights, widened per this story's own note since deaths are rare): 60 judged deaths.** unspentCount distribution 0:14 / 1:28 / 2:18 → **good 23% / fair 47% / bad 30%**. `swiftmendReady` true in 28/60, `nsReady` true in 32/60, `idlePreceding` true in 4/60 (all 4 land in the "bad" bucket, alongside 14 "bad" cases from both cooldowns simply being off simultaneously with no idle time).
- **No change.** Both corpora land close together (elite: 20/45/35, broad: 23/47/30) rather than the elite pool clearing the bar by a wide margin — but critically, the _modal_ bucket in both is "fair" (45-47%), not "bad": a real maintained-target death for even a known-good deep-resto player most often has exactly one spare resource sitting unused, not two. That's the opposite of the pattern 909 found broken in Swiftmend's old wasteful-share band (which convicted the _median_ real cast as the worst tier outright). "Bad" stays a genuine minority outcome (30-35%) rather than the default, and "good" (0 unspent) is real and reachable (20-23%), not vanishingly rare. The current 0/1/≥2 split holds up and needs no adjustment.
- One documented caveat for future readers, not itself grounds for a threshold change (redefining what counts as "unspent" is classify()-logic scope, not this threshold-value story's, per the same boundary 909 drew around Swiftmend's classify()): Swiftmend's short 15s native cooldown and NS's low real cast frequency relative to its 180s cooldown mean `swiftmendReady`/`nsReady` both carry an elevated structural base rate of "true" at any random moment (including death moments) — that's an accurate reflection of the ability's real cooldown, not a computation bug, and the data above shows it doesn't actually cause the threshold to over-convict known-good play.

**Acceptance criteria**

- Regenerate the calibration corpus with current code first (same note as 909).
- Per-death readiness is tabulated against its current threshold (`deathForensics.ts`'s `judgeDeathReadiness`: good 0/fair 1/bad ≥2 unspent resources) across real deaths in the story-901 exemplar corpus and/or the broader talent-tagged corpus — deaths are a comparatively rare event, so a wider net than 902/905/908 needed may be required to get a large-enough sample.
- Story 903c's talent-eligibility gating (Swiftmend/NS readiness only counted when the build can actually reach that talent) is confirmed still correctly wired before pooling, so an ineligible build's `unspentCount` isn't silently re-inflating the sample the way it did before 903c's fix.
- Any threshold that misjudges known-good (or known-bad) exemplar play is adjusted, with reasoning recorded here; if the current 0/1/≥2 split already holds up, that's recorded as a real "no change" finding with supporting numbers, not skipped.
- `docs/thresholds.md` is updated with a dated calibration-review paragraph.

### 911 — Deepen mana curve, consumable throughput, and Innervate calibration 🔲 Todo

I want ending mana %, consumable throughput, and the Innervate audit reviewed with the same rigor 905 gave overheal, so that "reasonably distributed" (905's own words, a passing observation rather than a real percentile finding) stops standing in for calibration on three thresholds that were only glanced at while investigating a different sub-metric.

**Acceptance criteria**

- Regenerate the calibration corpus with current code first (same note as 909/910).
- Ending mana % (`manaCurve.ts`'s good 5-40%/fair 40-70% or 0-5%/bad >70%, kills only ≥90s), consumable throughput's expected-floor formula (`consumableThroughput.ts`), and Innervate's three judgement branches (`innervateAudit.ts`) are each tabulated against the story-901 exemplar corpus with the same percentile detail 902/905/908's calibration-review paragraphs already show for other metrics — not just a pass/fail glance.
- Any threshold that misjudges known-good exemplar play is adjusted, with reasoning recorded here; a threshold that already fits is recorded as a real "no change" finding with supporting numbers, same standard as 909/910.
- `docs/thresholds.md`'s existing story 905 paragraph is either extended or superseded by a new dated paragraph specific to this story, so the "reasonably distributed" placeholder language is replaced with real findings.

### 912 — Find and validate dreamstate exemplar reports (a "901 for dreamstate") 🔲 Todo

I want a validated set of real reports/fights from genuinely dreamstate-spec, dreamstate-behaviorally-playing druids — the same rigor story 901 applied to deep-resto — so dreamstate-specific thresholds (currently just Regrowth-direct overheal, story 905) stop resting on the broader talent-tagged corpus alone, and so future archetype-aware calibration work (909-911, and story 914 below) has real dreamstate exemplars to check against instead of none.

**Acceptance criteria**

- A documented, repeatable method combines story 900's `likely-dreamstate-full`/`likely-dreamstate-partial` talent buckets with a genuine behavioral filter (analogous to 901's concurrent-LB3-maintenance filter for deep-resto) — talent eligibility alone doesn't prove a player is actually playing the style, the same lesson 901 learned the hard way with Profex (99-parse, deep-resto talents, zero maintained 3-stack targets on a real fight).
- At least a handful of validated dreamstate exemplar fights are captured in `docs/testing.md`'s known-reports table, each annotated with the evidence for why it qualifies, mirroring 901's entries.
- Exemplars are tagged via story 900's bucketing so they're queryable alongside the rest of the corpus.
- Story 905's dreamstate Regrowth-direct overheal band (`<60%/60-85%/>85%`, currently marked provisional in `docs/thresholds.md`) is re-reviewed against this new exemplar set specifically, and either confirmed or adjusted — with the provisional flag removed either way.

### 913 — Recalibrate re-stack tax thresholds 🔲 Todo

I want re-stack tax's duration-scaled formula reviewed against real exemplar data, so it stops being the one Lifebloom-discipline metric 902 didn't cover (902 was scoped to LB3 uptime and refresh cadence only) and the last remaining untouched original from Epic C.

**Acceptance criteria**

- Regenerate the calibration corpus with current code first (same note as 909-911).
- Re-stack tax's current formula (`restackTax.ts`'s `judgeRestackTax`: good ≤1 cast per 2min elapsed, fair ≤1 cast per 1min elapsed) is tabulated against the story-901 exemplar corpus — this is a rate/formula threshold rather than a flat percentage, so the review needs to check the formula's shape (does the ratio between good/fair tiers hold up, not just a single cutoff number) rather than just one percentile line.
- Any part of the formula that misjudges known-good exemplar play is adjusted, with reasoning recorded here; a formula that already fits is recorded as a real "no change" finding with supporting numbers.
- `docs/thresholds.md` is updated with a dated calibration-review paragraph.

### 914 — Revisit metrics currently left un-judged (informational-only) 🔲 Todo

I want every metric currently shipped as informational-only (no Good/Fair/Bad judgement) re-examined against real data and sharper thinking about whether "we don't have enough signal to judge this" still holds, rather than leaving that call unrevisited forever just because it was the original decision. Prompted directly: correcting story 910's initial framing above found that a metric can look uncalibratable before you're precise about what it's actually measuring (process vs. outcome) — the same sharpening may apply to the metrics below too.

**Per-metric review, each independently resolvable as "confirmed still informational" or "add real judgement":**

- **Concurrent LB3 targets (story 205).** Currently unjudged because "the right number depends on assignments," and WCL has no direct signal for raid healing assignments. Investigate whether a proxy exists — e.g. inferring likely tank-count from damage-taken patterns already in the event stream — before re-accepting the original "can't be judged" conclusion at face value.
- **Regrowth clip share (story 301).** Currently exempted from judgement specifically because "in Tree of Life form, Regrowth is a resto druid's only direct heal without a cooldown" — but Tree of Life is gated behind 41 Restoration (deep-resto only, per story 903c). For any other archetype (dreamstate, mostly-resto, etc.) that never reaches Tree of Life at all, this exemption's premise doesn't hold — those players have Healing Touch available with no form-swap tax, so clipping Regrowth's HoT tail isn't the same forced trade-off for them. This looks like a real gap worth fixing with an archetype-aware judgement (deep-resto stays informational per the existing reasoning; other archetypes get a real threshold), not just re-confirming the status quo.
- **Nature's Swiftness usage (story 304).** Currently informational because "NS is situational by design." Check whether that's still true for _routine_ usage patterns (probably yes — NS is a burst cooldown, not a rotational spell) separately from _emergency_ availability, which 501's death forensics already judges as a process failure when unspent at a maintained-target death. Confirm that emergency-availability path is fully and correctly wired (no double-counting or gaps against 903c's talent-eligibility gating) rather than assuming it's fine; the routine-usage card itself likely stays informational unless real data suggests otherwise.
- **HoT-tick overheal (story 404).** Currently informational-only, on the reasoning that high overheal is inherent to HoTs landing during overlapping raid-wide healing. Story 905 found Bloom overheal — also assumed "inherent" — genuinely does cluster tight enough (72-74% median) that a real threshold was possible once actual data was pooled, exactly this same kind of assumption getting tested with real numbers instead of a guess. Check whether HoT-tick overheal clusters as tightly across the exemplar corpus; if it does, that's confirmation the "inherent, don't judge" call was right; if it shows real spread, that spread is itself a skill signal worth judging (e.g. distinguishing proactive, well-timed HoTs that occasionally overheal from compulsive recasting on already-full-health targets).

**Acceptance criteria**

- Each of the four metrics above gets an explicit, documented conclusion in this file (not silence) — either "confirmed: stays informational, here's the data and reasoning" or "add judgement: here's the new threshold and its sourcing," matching every other calibrated threshold's rationale-in-a-comment convention.
- Regrowth clip share, if it gains an archetype-aware judgement, follows the pattern story 905 already established for Regrowth-direct overheal (per-archetype threshold sourced from `useArchetypeBucket`/`classifyBucket`, deep-resto kept informational per the existing Tree-of-Life reasoning).
- `docs/thresholds.md` is updated to reflect whatever is decided for each of the four metrics, whether that's a new threshold row or an updated "confirmed informational" rationale.

---

## Epic J — Crisis response

A tip from a fellow druid (creator of another community tool, the "LB3 Calculator") proposed raid-wide "clutch save" detection: find near-death moments and credit every healer who intervened, built out into a shareable "look what we did" view. Reframed here to fit this app's process-over-output principle and its single-druid scope (see the removed story 803's precedent against raid-wide/multi-player comparison): the credit-everyone leaderboard framing is left out, but the process question underneath it — did you react when a real crisis hit — is real and in scope below.

### 1001 — Near-death response audit ✅ Done

I want an audit of raid-wide near-death moments — a raider's HP dropping critically low and surviving — so that my reaction to genuine crises is judged the same honest, process-first way story 501 judges an actual death: this is near-survival's mirror image of 501, not an extension of it. 501 audits readiness at an actual death on a maintained target; this audits whether a _survived_ crisis got a real reactive response from me, raid-wide, with an exemption for crises outside my apparent healing assignment.

**Acceptance criteria**

- A "crisis" opens when a target's HP% (`hitPoints`, already a real percentage from WCL's `includeResources: true` on both `DamageTaken` and `Healing` events — confirmed live during this story's design, no reconstruction of raw/absolute HP needed) drops to ≤15% (provisional, sourced value pending a calibration pass akin to 909-913), walking each target's merged damage+healing HP-reading timeline with that target's own `Deaths` events merged in as explicit terminal markers (not inferred from timestamp proximity — a live check found a battle-rez can leave a ~90s gap between a death and its target's next real HP reading, which a proximity-based rule would misread as one long survived crisis).
- The response window for a crisis runs from that reading until the earliest of: the target's HP next reads above the threshold (survived), a death marker appears first for that target (excluded — 501's territory, not this one), or the target's timeline runs out with the fight still in progress (survived, unresolved by fight end).
- "Responded" means a new reactive healing-spell cast (a `Casts` event, `sourceID` = the druid) lands on the target inside that window — a HoT already ticking from an earlier cast does not count on its own; it must be an active decision made during the crisis.
- Scope/exemption: compute "maintained targets" exactly as stories 201/501 already do (≥30% Lifebloom uptime). If the druid has a clear tank assignment (1-2 maintained targets), crises on any other raider are shown as context only and excluded from judgement. If there's no such assignment, every raider's crisis is judged.
- Judgement mirrors 501's shape: a judged crisis is green if responded; if not, red/orange severity uses the same unspent-resource tally 501 already computes (Swiftmend ready / Nature's Swiftness ready / a GCD available in the 5s before the crisis).
- New card on the single-fight Scorecard (mirrors `DeathForensicsCard`'s structure and placement) and folds into 702's whole-report rollup via 904's existing weighted-median policy, same as every other judged metric.
- Clearly labeled caveat, matching 501's own: a missed crisis outside your maintained targets is not automatically a failure — this audits your readiness and reaction only, not assignments or positioning.
