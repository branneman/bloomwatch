# Bloomwatch — Testing

How this project is tested. Adapted from [branneman/health's testing manifesto](https://github.com/branneman/health/blob/main/docs/testing-manifesto.md) for a backend-less, browser-only app with one external dependency (the real WCL API) instead of a self-hosted server, database, and mobile client.

This is the permanent reference — unlike `docs/specs/*`, which are retired once implemented, this file stays up to date as the project's testing approach evolves.

## Philosophy

Testing is about confidence, not coverage numbers. Catch regressions as cheaply as possible — push risk mitigation as low in the pyramid as possible. A test belongs at the lowest tier whose tools can catch the failure; don't reach for a higher tier just because it's easier to write.

Tests must test real behavior. A test that can't be wrong (e.g. asserting only that a function exists, or exercising a stub that always returns the expected value) provides no confidence and is noise. Dependencies that cross a boundary (the clock, `crypto.getRandomValues`, `fetch`) are replaced with real, minimal fake implementations of the interface — not mocking-framework mocks.

## The pyramid

```
[Tier 0]  Static analysis         ← tsc, ESLint, Prettier — every commit, whole project
[Tier 1]  Unit                    ← pure logic, co-located, the majority of tests
[Tier 2]  WCL client integration  ← mocked WCL API (MSW), real captured fixtures
[Tier 3]  Component               ← React Testing Library, co-located
[Tier 4]  Contract                ← real WCL API, dedicated test account, manual trigger only
[Tier 5]  E2E smoke               ← Playwright, real deployed site, one golden path
```

---

## Tier 0 — Static analysis

**Charter:** catch syntax, type, and style errors before they reach any test at all — the cheapest possible tier, and a different class of issue than behavior (Tier 1+) covers.

- `tsc --noEmit` — type checking.
- ESLint (`typescript-eslint` + `eslint-plugin-react-hooks` + Vite's recommended React config) — correctness/logic rules (unused vars, hook dependency bugs, unreachable code). Chosen over Biome because `eslint-plugin-react-hooks`'s rule depth (catching stale-closure/missing-dependency bugs) matters more here than Biome's speed advantage.
- Prettier — formatting only. `eslint-config-prettier` disables any ESLint rule that would conflict with Prettier, so the two never fight over the same concern.

**Runs on the whole project, not just changed files** — both in the pre-commit hook and in CI. This is deliberate: LLM-authored changes have a habit of leaving unrelated files unformatted or not touching files they should have, and a partial (staged-files-only) check would miss that. `format:check` and `lint` always scan every file Prettier/ESLint are configured to cover (all supported filetypes, respecting `.gitignore`), not a git diff.

**Local:**
```
npm run typecheck
npm run lint
npm run format         # writes fixes
npm run format:check   # CI mode, fails on unformatted files, no writes
```

**Pre-commit hook (Husky):** runs `typecheck`, `lint`, and `format:check` on every commit, full-project, before the commit is allowed. Same commands as CI — no separate "fast path" that only checks staged files.

---

## Tier 1 — Unit tests

**Charter:** pure logic, no I/O, no DOM. The majority of tests, and the first thing written for any new logic.

Covers: metric-calculation modules (GCD utilization, LB3 uptime, idle-gap detection, mana curve, R/O/G threshold judging, added as each backlog story builds them), report URL/code parsing (002), ability-ID resolution (007), and PKCE crypto helpers (`generateCodeChallenge`, `base64urlEncode`).

**Tooling:** Vitest, co-located as `*.test.ts` next to the file under test (e.g. `src/wcl/auth.ts` + `src/wcl/auth.test.ts`).

## Tier 2 — WCL client integration tests

**Charter:** the WCL client module (query building, response parsing, pagination via `nextPageTimestamp`, error/rate-limit handling, `/user` vs `/client` endpoint selection) exercised against a mocked WCL API. The analog of a "server integration" tier — except the "real server" is WCL's, not ours, so it's mocked at the HTTP layer instead of run locally.

**Tooling:** Vitest + MSW (Mock Service Worker), intercepting `fetch()`. Fixtures are **real** JSON payloads captured during story 001's live testing (fight list, actor list, cast events for report `4GYHZRdtL3bvhpc8`), in `test/integration/fixtures/*.json` — not hand-built synthetic data, since the point is verifying our parsing against WCL's actual shape.

## Tier 3 — Component tests

**Charter:** React components in isolation — fight picker, druid picker, scorecard cards, the threshold editor (802) — rendered in a real DOM (jsdom), exercising primary interactions with fake data injected as props. Behavior-focused assertions (what a user sees and can interact with), not pixel/screenshot tests.

**Tooling:** Vitest + React Testing Library, co-located as `*.test.tsx` next to the component (e.g. `src/app/components/FightPicker/index.tsx` + `index.test.tsx`).

## Tier 4 — Contract tests

**Charter:** the real, live WCL API, called from Node over HTTP, using a dedicated test account and the fixed real report code `4GYHZRdtL3bvhpc8`. Catches drift in an external dependency we don't control — WCL changing response shapes, deprecating fields, or the fixed report becoming unavailable.

**Auth:** the dedicated test WCL account logs in once via PKCE, manually, using its own separate Public Client ID (never the production default client from story 008) — this isolates contract-test traffic from real users' shared rate-limit budget entirely, since WCL's rate limits are scoped per-client. The resulting long-lived access token (~360 days, measured empirically in story 001) is stored as the CI secret `WCL_TEST_ACCESS_TOKEN` and sent directly as a Bearer token. Not a client secret — the Public Client / PKCE-only model is unchanged.

**Tooling:** Vitest, `test/contract/`. **Trigger: manual only** (`workflow_dispatch` in CI, or `npm run test:contract` locally) — deliberately no cron. This is a tool reached for before a release or when investigating a suspected WCL API change, not a background watcher; the project may quietly stop mattering after TBC Anniversary ends, and an eternal scheduled failure notification about that isn't wanted.

## Tier 5 — E2E smoke tests

**Charter:** the real deployed site, in a real browser, exercising exactly one core user journey: paste report URL → pick fight → pick druid → see a rendered scorecard with real numbers. Deliberately small — edge cases belong in lower tiers.

**Auth:** reuses `WCL_TEST_ACCESS_TOKEN`, injected directly into the browser's `sessionStorage` before the app loads (Playwright init script), skipping the interactive OAuth consent click-through. That flow was already proven live in story 001; re-driving a third party's login UI on every run would be fragile in a way unrelated to our own code.

**Tooling:** Playwright, `test/e2e/`. Target via `PLAYWRIGHT_BASE_URL` (defaults to `http://localhost:5173`; CI's post-deploy job sets it to the live Pages URL). Locally, copy `WCL_TEST_ACCESS_TOKEN` into a gitignored `.env.local` once to run E2E against a dev server without an interactive login.

**Trigger:** automatically, after every deploy — tied to real push activity to `main`, not a calendar.

---

## Test data strategy

- **Tiers 1 & 3:** hand-built factory functions with defaults + overrides, in `src/testUtils/factories.ts` (e.g. `aCastEvent({ abilityGameID: 26980 })`). Grows one function at a time as new shapes are needed — no speculative fixture library.
- **Tier 2:** real captured JSON response bodies in `test/integration/fixtures/*.json`.
- **Tiers 4 & 5:** no fixtures — real API, real (test-account) data, by design.

## Secrets & credentials

One CI secret: `WCL_TEST_ACCESS_TOKEN` — a bearer access token for a dedicated test WCL account, obtained once via PKCE against a separate test-only Public Client ID. Requires manual refresh roughly yearly. No client secret is introduced anywhere; the product's own build/deploy path requires zero secrets (principle 2).

## CI triggers summary

| Tier | When it runs |
|---|---|
| 0 (static analysis) | Every commit (pre-commit hook) and every push (CI) |
| 1-3 (unit/integration/component) | Every push to `main` |
| 4 (contract) | Manual only (`workflow_dispatch` / local) |
| 5 (E2E smoke) | After every deploy to `main` |

## Running everything locally

```
npm run typecheck && npm run lint && npm run format:check   # Tier 0
npm test              # Tiers 1-3
npm run test:contract # Tier 4 (needs WCL_TEST_ACCESS_TOKEN in .env.local)
npm run test:e2e      # Tier 5 (needs WCL_TEST_ACCESS_TOKEN in .env.local)
```
