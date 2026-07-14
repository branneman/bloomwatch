# Innervate audit — design (story 403)

## Premise

`docs/backlog.md`'s story 403 acceptance criteria already resolve the open question
`CLAUDE.md`'s repo-state narrative describes as pending: whether auditing the druid's own
Innervate usage makes sense given it's normally handed to another mana-starved caster. The
backlog's criteria explicitly reward that pattern (green for handing it to a mana-using ally,
not just for self-cast). This design implements exactly what's written there; `CLAUDE.md`'s
"remains open" note is stale and should be corrected once this ships.

## Judgement rules

Only the druid's **first** Innervate cast in the fight (by timestamp) feeds the R/O/G verdict.
Any later casts in the same fight (TBC's 3-min CD makes a second cast possible in a long pull)
are listed for visibility only — informational, no chip, no effect on the judgement. (Considered
judging every cast independently with a worst-of, like the Swiftmend log; rejected as
unnecessary complexity for what's usually a single cast per fight.)

Per `docs/backlog.md` story 403:

- **Never cast**, and the fight is mana-constrained (the druid's own mana dropped below 70% at
  any point — reusing 401/402's existing `extractManaSamples` check) **and** ≥ 3 min long →
  **red**. Otherwise (fight wasn't mana-constrained, or under 3 min) → no judgement, shown as
  informational, mirroring `ManaCurveCard`'s existing short-fight downgrade pattern.
- **Cast on another player, who is a non-mana-using class/spec** → **red**, wasted.
- **Cast on another player, who is a mana-using class/spec** → **green** — the normal, correct
  pattern per the backlog's explicit framing (not a fallback below self-cast).
- **Self-cast** → judged by timing only: **green** normally, **orange** if cast in the fight's
  final 10% (too late to make use of the extra mana).

### Mana-use classification (TBC ruleset fact, not a tunable threshold)

No `docs/backlog.md` rationale pointer is needed for this table (principle 3 requires sourcing
for R/O/G _thresholds_; this is a fixed game-mechanics fact, documented inline instead, the same
way `prepHygiene.ts` documents its elixir/flask name lists).

| Mana-using (green if Innervate'd)              | Non-mana-using (red if Innervate'd) |
| ---------------------------------------------- | ----------------------------------- |
| Mage, Priest, Warlock, Shaman, Paladin, Hunter | Warrior, Rogue                      |
| Druid — Balance or Restoration spec            | Druid — Feral Combat spec           |

Druid is the only class needing spec-level resolution (via the `icon` field's
`"Druid-<Spec>"` suffix, same convention `druidDetection.ts` already uses for
`"Druid-Restoration"`). Every other class's mana-use is constant across specs.

## Mana % display (informational only, never drives judgement)

- Self-cast: read directly off the Innervate cast event's own `classResources` (exact — no
  lookup needed, same field `extractManaSamples` already reads).
- Ally-cast: the target's nearest own cast-with-resources event to the Innervate timestamp
  (we don't have an exact-timestamp sample for a different actor). If the target has no such
  event in the fight, mana% is shown as unknown rather than blocking the row — not expected to
  be common (a raid member active for a multi-minute pull almost always casts something), but
  not worth erroring over.

## Data plumbing

No new WCL query. `App.tsx` already fetches a whole-report actor table once (`fetchCastsTable`,
originally for druid detection) whose entries carry `type` (class, e.g. `"Mage"`) and `icon`
(class-spec, e.g. `"Druid-Feral Combat"`) per actor — currently only `.name` is kept, as
`actorNames`, threaded through `Scorecard` as `targetNames` for other epics' target displays.

Extend `handleEntriesLoaded` to also build:

```ts
type ActorClass = { class: string; specIcon: string };
// actorClasses: Map<number, ActorClass>, built from entry.type / entry.icon
```

Pass `actorClasses` down the same path as `targetNames` (`App.tsx` → `Scorecard` →
`ManaEconomyContent` → the new card).

## Components

- **`src/metrics/innervateAudit.ts`** (new, Tier 1 unit tests) — pure function:

  ```ts
  computeInnervateAudit(
    castEvents: WclEvent[],
    druidId: number,
    actorClasses: Map<number, ActorClass>,
    fightDurationMs: number,
    fightStartMs: number,
  ): InnervateAuditResult
  ```

  Returns the judged first cast (time, target self/other, target class/spec, mana% or
  unknown, judgement), the list of any later casts (time + target only, no judgement), and the
  overall judgement (including the never-cast red/informational case).

  The mana-constrained check ("mana dropped below 70% at any point") is computed internally via
  `extractManaSamples`, the same self-contained way `computeConsumableThroughput` already does
  it — not threaded in as a param, so 402's existing internals stay untouched. A few duplicated
  lines here beat introducing a shared abstraction across two epics' cards for one boolean.

- **`src/app/components/InnervateAuditCard`** (new) — mirrors `ManaCurveCard`'s
  fetch/loading/error shape: fetches `Casts` events with `includeResources: true` (same fetch
  already made for the mana curve — WCL caching in `eventCache.ts` means this isn't a duplicate
  network request), resolves Innervate's ability ID(s) via `resolvedAbilities`, computes the
  audit, and renders a `MetricCard`:
  - `value`: `"Cast at 4:52, on Aggrolol (Mage)"` / `"Cast at 4:52, self"` / `"Not cast this
fight"`.
  - `judgement`: the chip, or `note` for the informational (not-mana-constrained /
    too-short / no-verdict) cases.
  - Body: mana% context line; if `laterCasts.length > 0`, an additional "Also cast at …"
    list below, informational only, no chips.

- **Wiring**: mount inside `ManaEconomyContent` alongside the existing three cards. Add
  `innervateAudit.judgement` into `summarizeManaEconomy`'s `worstJudgement([...])` call — no new
  dashboard stat line (caps at 2 per story 701; same precedent already set for `overhealTable`
  and `downranking` joining their epic's worst-of silently).

## Open item for the implementation plan (not resolved here)

Whether an Innervate cast event's `targetID` equals the caster's own ID for a self-cast, or is
omitted entirely, isn't yet confirmed against a real report. Per `CLAUDE.md`'s live-query
convention, spot-check this against a known test report (`docs/testing.md`'s table) before
writing the self-cast detection branch, rather than assuming.

## Testing

- **Tier 1** (`src/metrics/innervateAudit.test.ts`): self-cast timing bands (on-time/late),
  ally-cast on a mana-using class, ally-cast on a non-mana-using class, ally-cast on each Druid
  spec, never-cast while mana-constrained + ≥3min (red), never-cast otherwise (informational),
  multiple casts (only first judged, rest listed), unknown target mana%.
- **Tier 3** (`InnervateAuditCard/index.test.tsx`): loading, error, and one render per judgement
  state, following `ManaCurveCard/index.test.tsx`'s existing pattern.
