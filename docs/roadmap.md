# Bloomwatch — Roadmap

_Keep your Lifeblooms rolling. A process-quality analyzer for TBC Resto Druids, built on Warcraft Logs._

## Vision

Healing parses are structurally broken: healing is zero-sum, so effective-healing rankings measure your co-healers' behaviour as much as your own. This tool takes the opposite approach — it measures **process, not output**. Inputs are not zero-sum: nobody can steal your GCD utilization, your Lifebloom refresh cadence, or your mana-potion cooldown usage.

You paste a Warcraft Logs report link (e.g. `https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8`), pick a boss fight — or a whole raid zone like SSC — and get a scorecard: every metric turned into a number with a Good/Fair/Bad judgement, so a resto druid can answer _"did I play well?"_ independent of the healing meter.

## Who is this for

- **The primary user:** a raiding resto druid on TBC Anniversary realms who wants objective, per-fight feedback on their own play.
- **Secondary:** healing officers / raid leads evaluating druids without falling into the parse trap.
- **Tertiary:** the broader Classic community, if the metric framework proves out (other HoT-centric specs could follow the same model).

## Product principles

1. **Process over output.** No HPS rankings, no parse percentiles. Only metrics the player fully controls.
2. **Judgement, not just data.** Every metric gets a Good/Fair/Bad verdict against documented default thresholds. Thresholds are visible and periodically recalibrated by the maintainers against real logs (802) — not user-configurable — but the tool always shows its work.
3. **No backend.** Pure static SPA on GitHub Pages. All WCL API calls happen client-side. No server, no database, no accounts, no cost.
4. **FOSS.** Public repo, permissive license, reproducible builds.
5. **Honest about limits.** The report explicitly states what logs cannot judge: target selection quality, assignment adherence, positioning. These are out of scope by design.

## Architecture snapshot (constraints, not design)

- Static single-page app, deployable via GitHub Pages. No server-side code.
- Data source: **WCL API v2 (GraphQL)** — report metadata, fights, combatant info, casts/buffs/resources tables, and raw event streams.
- Auth is resolved (Phase 0 spike, see `docs/wcl-auth.md`): Authorization Code + PKCE from the browser, no client secret, against WCL's OAuth endpoints. Token exchange happens entirely client-side via `fetch()`.
- TBC reports resolve against `https://www.warcraftlogs.com/api/v2/user` regardless of whether the link is `fresh.warcraftlogs.com` (Anniversary) or `classic.warcraftlogs.com` (the original 2021-2024 Classic-launch TBC window) — confirmed with reports `4GYHZRdtL3bvhpc8` and `mtRh3kJ9YMLazyvQ` respectively (see `docs/wcl-auth.md`) — a single host regardless of which subdomain the report link uses. `classic.warcraftlogs.com` also serves Vanilla/Wrath/Cata/MoP logs, rejected via `zone.expansion.id !== 1001`; and older reports may require an active WCL subscription (`Report.archiveStatus.isAccessible`) — see backlog story 012.
- The app ships with a default WCL API Client ID (registered and maintained by the project, not the user) baked into the client-side code — safe because PKCE client IDs aren't secrets. WCL rate limits are scoped per-client, not per-user, so if the shared default's budget is ever exhausted, the app degrades gracefully: it explains the situation and lets the user register and paste their own free Client ID, which is then used for all their future requests instead. See backlog story 008. A top-bar banner warns users proactively once the shared budget crosses 75% usage, before it's actually exhausted (009).
- All heavy computation (event-stream analysis) happens in the browser per fight; results are cached in memory per report.

## Roadmap

### Phase 0 — Spike: prove the pipeline _(de-risk before building anything)_

- Confirm a backend-less auth path to WCL API v2.
- Confirm fresh-realm report codes resolve via the API.
- Fetch one report's fight list and one fight's cast events in the browser.
- **Exit criterion:** a hardcoded HTML page that prints the cast timeline of one druid in one fight, hosted on GitHub Pages.

### Phase 1 — MVP: the two highest-signal metric groups

- URL input → report parsing → druid picker → fight picker (single-select, drill-down; flow order changed after initial ship — see backlog 003/005/702).
- **GCD economy:** active time, GCD utilization, idle-gap detection.
- **Lifebloom discipline:** LB3 uptime per target, refresh cadence, accidental blooms, re-stack tax, concurrent targets.
- Scorecard UI with Good/Fair/Bad per metric, per single fight.
- **Exit criterion:** paste link → pick fight → get a judged scorecard for groups 1–2.

### Phase 2 — Mana economy & spell discipline

- Mana curve, ending mana, potion/rune counts vs. expected floor, Innervate audit.
- Per-spell overheal with HoT-aware thresholds.
- Rejuv/Regrowth clip detection, Swiftmend quality audit, downranking check.

### Phase 3 — Death forensics & prep hygiene

- Per-death audit: LB3 rolling? Swiftmend / Nature's Swiftness available but unused?
- Pull-time consumables check (elixirs/flask, food, weapon oil).

### Phase 4 — Raid-wide reporting

- Whole-report dashboard: every non-trash fight aggregated automatically, no zone or partial-fight picker, with per-metric aggregation and per-boss drill-down (702). Becomes the primary screen shown right after druid selection once built.
- Trend view across fights within one report.
- Shareable report state via URL params; export to Markdown.

### Phase 5 — Polish & calibration

- Maintainer threshold-calibration pass: review every Good/Fair/Bad threshold against a corpus of well-regarded druid logs, once all metrics exist (802). An internal engineering pass, not user-facing configuration.

## Explicitly out of scope

- Positioning / mechanics ("don't stand in fire").
- Judging _who_ should have been healed (target selection, assignments).
- Other classes and specs (until the framework is proven).
- Any server-side component.
- Other WoW versions or expansions — Vanilla/Wrath/Cataclysm/MoP Classic, Season of Discovery, retail. TBC content only (Anniversary "fresh" realms and the original 2021-2024 Classic-launch TBC window via `classic.warcraftlogs.com`) — no other realm type.
- Trash / non-boss fights — too short for these metrics to produce a meaningful signal; boss pulls only (backlog 003).
- Partial multi-fight selection — viewing "some but not all" boss fights in a report. It's either exactly one fight or the whole report (backlog 702); this also keeps WCL rate-limit usage predictable.
- User-configurable judgement thresholds — thresholds are maintainer-calibrated (802), not user-editable.
- Multi-druid comparison within one report — TBC raid comps rarely run two resto druids; the only comparison that makes sense is raid-vs-raid, which the per-report flow already supports.

## Key risks

| Risk                                        | Impact                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WCL auth impossible without a backend       | Fatal to "no backend" principle                                                             | Phase 0 spike before any feature work; fallback = paste-a-token UX                                                                                                                                                                                                                                                                   |
| WCL API rate limits on event streams        | Slow whole-report dashboards, or the shared default Client ID's budget exhausted under load | Per-fight lazy loading + in-memory caching; request only needed event types; single-fight-or-whole-report only, no partial multi-select (702); proactive usage banner at 75% (009); default Client ID with graceful fallback to a user-supplied one when the shared budget is hit (008); dedicated request/loading-state audit (010) |
| Threshold defaults wrong → tool loses trust | Users dismiss judgements                                                                    | Thresholds visible, sourced; maintainer calibration pass in Phase 5 (802)                                                                                                                                                                                                                                                            |
| Fresh-realm API quirks                      | Blocks primary audience                                                                     | Verified in Phase 0 with a real fresh report                                                                                                                                                                                                                                                                                         |

## Success criteria

- A druid can go from WCL link to judged scorecard in under 30 seconds, on free hosting, with zero installs.
- The scorecard changes behaviour: users report fixing at least one concrete habit (idle gaps, over-refreshing, unused potions).
- Zero recurring infrastructure cost.
