# Bloomwatch — Roadmap

*Keep your Lifeblooms rolling. A process-quality analyzer for TBC Resto Druids, built on Warcraft Logs.*

## Vision

Healing parses are structurally broken: healing is zero-sum, so effective-healing rankings measure your co-healers' behaviour as much as your own. This tool takes the opposite approach — it measures **process, not output**. Inputs are not zero-sum: nobody can steal your GCD utilization, your Lifebloom refresh cadence, or your mana-potion cooldown usage.

You paste a Warcraft Logs report link (e.g. `https://fresh.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8`), pick a boss fight — or a whole raid zone like SSC — and get a scorecard: every metric turned into a number with a red / orange / green judgement, so a resto druid can answer *"did I play well?"* independent of the healing meter.

## Who is this for

- **The primary user:** a raiding resto druid on TBC Anniversary realms who wants objective, per-fight feedback on their own play.
- **Secondary:** healing officers / raid leads evaluating druids without falling into the parse trap.
- **Tertiary:** the broader Classic community, if the metric framework proves out (other HoT-centric specs could follow the same model).

## Product principles

1. **Process over output.** No HPS rankings, no parse percentiles. Only metrics the player fully controls.
2. **Judgement, not just data.** Every metric gets a red/orange/green verdict against documented default thresholds. Thresholds are visible and configurable — the tool shows its work.
3. **No backend.** Pure static SPA on GitHub Pages. All WCL API calls happen client-side. No server, no database, no accounts, no cost.
4. **FOSS.** Public repo, permissive license, reproducible builds.
5. **Honest about limits.** The report explicitly states what logs cannot judge: target selection quality, assignment adherence, positioning. These are out of scope by design.

## Architecture snapshot (constraints, not design)

- Static single-page app, deployable via GitHub Pages. No server-side code.
- Data source: **WCL API v2 (GraphQL)** — report metadata, fights, combatant info, casts/buffs/resources tables, and raw event streams.
- Auth is resolved (Phase 0 spike, see `docs/wcl-auth.md`): Authorization Code + PKCE from the browser, no client secret, against WCL's OAuth endpoints. Token exchange happens entirely client-side via `fetch()`.
- Anniversary ("fresh") realm reports resolve against `https://www.warcraftlogs.com/api/v2/user` (confirmed with report `4GYHZRdtL3bvhpc8`, see `docs/wcl-auth.md`) — a single host regardless of which subdomain the report link uses.
- All heavy computation (event-stream analysis) happens in the browser per fight; results are cached in memory per report.

## Roadmap

### Phase 0 — Spike: prove the pipeline *(de-risk before building anything)*
- Confirm a backend-less auth path to WCL API v2.
- Confirm fresh-realm report codes resolve via the API.
- Fetch one report's fight list and one fight's cast events in the browser.
- **Exit criterion:** a hardcoded HTML page that prints the cast timeline of one druid in one fight, hosted on GitHub Pages.

### Phase 1 — MVP: the two highest-signal metric groups
- URL input → report parsing → fight picker → druid picker.
- **GCD economy:** active time, GCD utilization, idle-gap detection.
- **Lifebloom discipline:** LB3 uptime per target, refresh cadence, accidental blooms, re-stack tax, concurrent targets.
- Scorecard UI with red/orange/green per metric, per single fight.
- **Exit criterion:** paste link → pick fight → get a judged scorecard for groups 1–2.

### Phase 2 — Mana economy & spell discipline
- Mana curve, ending mana, potion/rune counts vs. expected floor, Innervate audit.
- Per-spell overheal with HoT-aware thresholds.
- Rejuv/Regrowth clip detection, Swiftmend quality audit, downranking check.

### Phase 3 — Death forensics & prep hygiene
- Per-death audit: LB3 rolling? Swiftmend / Nature's Swiftness available but unused?
- Pull-time consumables check (elixirs/flask, food, weapon oil).

### Phase 4 — Raid-wide reporting
- Zone selection (e.g. "all SSC bosses in this report") with per-metric aggregation and per-boss drill-down.
- Trend view across fights within one report.
- Shareable report state via URL params; export to Markdown.

### Phase 5 — Polish & calibration
- User-configurable thresholds with sane defaults; threshold presets per raid tier (fight length and tank count differ between Kara/Gruul and BT/SWP).
- Multi-druid comparison within one report.
- Calibrate default thresholds against a corpus of well-regarded druid logs.

## Explicitly out of scope

- Positioning / mechanics ("don't stand in fire").
- Judging *who* should have been healed (target selection, assignments).
- Other classes and specs (until the framework is proven).
- Any server-side component.

## Key risks

| Risk | Impact | Mitigation |
|---|---|---|
| WCL auth impossible without a backend | Fatal to "no backend" principle | Phase 0 spike before any feature work; fallback = paste-a-token UX |
| WCL API rate limits on event streams | Slow zone-wide reports | Per-fight lazy loading + in-memory caching; request only needed event types |
| Threshold defaults wrong → tool loses trust | Users dismiss judgements | Thresholds visible, sourced, configurable; calibration pass in Phase 5 |
| Fresh-realm API quirks | Blocks primary audience | Verified in Phase 0 with a real fresh report |

## Success criteria

- A druid can go from WCL link to judged scorecard in under 30 seconds, on free hosting, with zero installs.
- The scorecard changes behaviour: users report fixing at least one concrete habit (idle gaps, over-refreshing, unused potions).
- Zero recurring infrastructure cost.
