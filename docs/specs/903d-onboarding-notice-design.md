# 903d — Onboarding notice on supported playstyles, design

Depends on 903a (per-fight talent-archetype detection, done). Two independent, additive pieces: static prose on the onboarding screen, and a contextual per-fight warning in the Scorecard. No new detection logic, no new fetches — both consume data 903a already computes.

## Why

903a/903c taught the app to detect a druid's talent archetype and hide metrics that don't apply, but a user in an unsupported build (Regrowth-spec resto, Restokin, or a Balance druid playing an off-spec healer role) still gets a full scorecard with no warning that the judgements behind it weren't validated for their playstyle. 903 itself found the majority of real top players fall outside deep resto. This story closes the honesty gap: say plainly, upfront and in-context, which builds this tool judges well.

## Bucket → support mapping

`src/report/archetypeDetection.ts`'s `TalentBucket` buckets split as:

| Bucket                                                 | Support                                                                                                                                                          | Notice?                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `deep-resto`                                           | Best-supported                                                                                                                                                   | No                                                                                                                                     |
| `likely-dreamstate-full` / `likely-dreamstate-partial` | Supported, lesser extent                                                                                                                                         | No                                                                                                                                     |
| `mostly-resto`                                         | Not well-supported (Regrowth-spec)                                                                                                                               | Yes                                                                                                                                    |
| `mostly-balance`                                       | Not well-supported (Balance-as-healer)                                                                                                                           | Yes                                                                                                                                    |
| `other-unclassified`                                   | Not well-supported (catch-all)                                                                                                                                   | Yes                                                                                                                                    |
| `restokin-shaped`                                      | Never actually produced by `classifyBucket` today (see `docs/backlog.md` line 475 — Restokin is talent-indistinguishable from Dreamstate, both need 31+ Balance) | Yes, for forward-compatibility if that ever changes                                                                                    |
| `unknown-no-talent-data`                               | Unknown — talent read failed, build can't be assessed at all                                                                                                     | No (the existing archetype line already reads "unavailable"; a support/no-support claim about an unknown build would be a fabrication) |

Dreamstate is called out in the backlog as "supported to a lesser extent," not unsupported, so it's deliberately excluded from the flagged set even though Restokin (which the backlog does call unsupported) is indistinguishable from it by talent points alone. This is a known, documented limitation, not an oversight.

## 1. Onboarding static text

`src/app/components/Onboarding/index.tsx` gains a new `<h2>Which builds this fits</h2>` section, inserted after the existing "Who it's for" section and before "Why not just look at the healing meter?". Generic, non-technical prose (the onboarding screen is shown before any report is loaded, so no bucket jargon):

> Bloomwatch's judgements are tuned for a Restoration-focused healer — deep resto gets the most precise read, and Dreamstate hybrids are reasonably covered too. A Regrowth-only resto build, a Restokin (Balance/healer hybrid), or a Balance druid playing an off-spec healer role don't have enough process data behind them yet, so their scorecards may not be a fair judgement of that play. Once you load a report, the fight screen will flag it directly if your detected build falls outside what's well-supported today.

Styled as a plain `<p className={styles.section}>` matching every other paragraph on the screen — no new CSS.

## 2. Contextual per-fight notice

New export in `src/report/archetypeDetection.ts`, alongside the existing `BUCKET_DEFINITIONS`:

```ts
// Story 903d: buckets the onboarding notice calls out as not well-supported —
// Regrowth-spec resto, Balance-as-healer, and the unclassified catch-all.
// Dreamstate stays unflagged per docs/backlog.md 903d ("supported to a lesser
// extent"), even though it's talent-indistinguishable from Restokin.
export const UNSUPPORTED_ARCHETYPE_BUCKETS: ReadonlySet<TalentBucket> = new Set(
  ["mostly-resto", "mostly-balance", "other-unclassified", "restokin-shaped"],
);
```

`src/app/components/Scorecard/index.tsx` renders a new `Alert tone="warning"` immediately after the existing archetype line (`styles.archetypeLine`) and before the existing `healingRoleStatus` alert — same conditional-render pattern already used for that alert, no new hook:

```tsx
{
  archetypeStatus.status === "ready" &&
    UNSUPPORTED_ARCHETYPE_BUCKETS.has(archetypeStatus.bucket) && (
      <Alert tone="warning">
        This fight's detected build ({ARCHETYPE_LABELS[archetypeStatus.bucket]})
        isn't one Bloomwatch judges well yet — the process judgements below may
        not be a fair read on this playstyle.
      </Alert>
    );
}
```

`archetypeStatus` and `ARCHETYPE_LABELS` are both already in scope in `Scorecard` (903a). Import `UNSUPPORTED_ARCHETYPE_BUCKETS` alongside the existing `BUCKET_DEFINITIONS`/`TalentBucket` import from `archetypeDetection.ts`.

## Explicitly out of scope

- `ReportDashboard` (702) gets no changes — archetype detection stays scoped to the per-fight `Scorecard`, matching 903a's existing footprint; no new plumbing to detect archetype across a whole report's fight list.
- `scripts/calibrate.ts` / `scripts/lib/rollup.ts` — that's story 907, already filed and separately scoped.
- No change to 903c's card-hiding/gating logic — this story only adds a warning, it doesn't hide anything new.

## Testing

Both changes are Tier 3 (component, React Testing Library, co-located):

- `Onboarding/index.test.tsx`: assert the new section's heading/text renders.
- `Scorecard/index.test.tsx`: assert the warning renders for a flagged bucket (e.g. `mostly-balance`) and is absent for `deep-resto` and for `unknown-no-talent-data`.

No Tier 1 unit test for `UNSUPPORTED_ARCHETYPE_BUCKETS` itself — it's a literal value, not logic; the Tier 3 assertions above exercise it end-to-end through the real render path.
