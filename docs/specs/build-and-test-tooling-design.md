# Build & Test Tooling — Design

Backlog story: [801 — Build & test tooling](../backlog.md#801--build--test-tooling).

## Goal

Stand up the real project foundation — a Vite + React + TypeScript scaffold with automated GitHub Pages deployment and a full test pyramid — so that every later backlog story (metric modules, scorecard UI, etc.) has a maintainable base and a way to verify itself with confidence, instead of ad hoc manual testing.

## Non-goals

- Any actual metric-calculation logic (GCD, Lifebloom, mana, etc.) — those are separate backlog stories, built on top of this foundation.
- A component library / design system for the scorecard UI — out of scope until Phase 1 UI stories.
- Automating the dedicated test account's token refresh — it's a yearly manual step, documented as a runbook note, not tooling.

## Stack & project structure

- **Vite + React + TypeScript**, npm as package manager. Chosen over Eleventy/Astro because Bloomwatch is fundamentally one deeply interactive tool page (not a content-heavy multi-page site); plain Vite avoids an extra templating/island layer that wouldn't pay for itself at 1-2 static pages. TypeScript because WCL's GraphQL responses and the growing library of metric modules benefit from typed contracts across 5 roadmap phases.
- `index.html` at the repo root (the Phase 0 spike) is retired. Its PKCE auth and GraphQL client logic is ported into typed, tested modules under `src/wcl/`. The spike's job — proving the pipeline — is done and preserved in `docs/wcl-auth.md`; the code itself doesn't need to survive as a standalone artifact.

```
src/
  app/
    components/
      FightPicker/
        index.tsx
        index.test.tsx       # Tier 3, co-located
      ScorecardCard/
        index.tsx
        index.test.tsx
  wcl/
    auth.ts
    auth.test.ts             # Tier 1, co-located
    graphqlClient.ts
    graphqlClient.test.ts
  metrics/                   # populated by later stories
  pages/                     # 1-2 static entry points (app, about/methodology)
  testUtils/
    factories.ts             # shared unit/component test factories
test/
  integration/
    fixtures/*.json          # real captured WCL responses
  contract/
  e2e/
```

npm scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test` (tiers 1-3), `test:contract` (tier 4), `test:e2e` (tier 5).

## CI/CD pipeline

Single GitHub Actions workflow, triggered on push to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test` (tiers 1-3 — fast, deterministic, no network)
6. `npm run build`
7. Deploy `dist/` to GitHub Pages
8. `npm run test:e2e` (tier 5), against the just-deployed live URL — catches "works locally, broken on Pages" issues (base paths, CORS from the real origin, etc.)

### Pre-commit hook

Husky runs `typecheck`, `lint`, and `format:check` on every commit — the same commands as CI steps 2-4, scanning the **whole project**, not just staged/changed files. Deliberate: LLM-authored changes have a habit of leaving unrelated files unformatted, and a staged-files-only check (the typical `lint-staged` pattern) would miss that. No `lint-staged` dependency — Husky invokes the full-project npm scripts directly.

Installed automatically via a `"prepare": "husky"` script in `package.json` — npm runs `prepare` after both `npm install` and `npm ci`, so a fresh clone gets the hook wired up as a side effect of installing dependencies, with no separate setup step for contributors.

Tier 4 (contract tests against the real WCL API) is **not** part of this pipeline. It runs only via `workflow_dispatch` (a manual "Run workflow" button) or locally via `npm run test:contract`. No cron/schedule — the project may quietly stop mattering a year from now if TBC Anniversary ends, and an eternal cron nagging about that isn't wanted. It's a tool reached for before a release or when investigating a suspected WCL API change, not a background watcher.

No secrets are required for steps 1-5 — a normal clone/fork builds and deploys with zero configuration, per principle 2. Only tiers 4 and 5 need the test credential described below, and both skip with a clear log message if it's absent (a fork without the secret still builds and deploys fine).

## Test pyramid

Adapted from `https://github.com/branneman/health/blob/main/docs/testing-manifesto.md`, whose core principles carry over unchanged: tests must exercise real behavior (no `assertTrue(true)`-style noise), and each tier is used only when a lower tier's tools can't catch the failure. The concrete tiers are reshaped for a backend-less, browser-only app with one external dependency (WCL's real API) instead of a self-hosted server + database + Android client.

### Tier 0 — Static analysis

**Charter:** catch syntax, type, and style errors before any behavioral test runs — the cheapest possible tier, and a different class of issue than Tier 1+.

- `tsc --noEmit`.
- ESLint (`typescript-eslint` + `eslint-plugin-react-hooks` + Vite's recommended React config). Chosen over Biome (a faster, newer combined lint+format tool) because `eslint-plugin-react-hooks`'s rule depth — catching stale-closure/missing-dependency bugs — matters more here than Biome's speed advantage, and Biome's rule coverage for this is still thinner.
- Prettier for formatting only; `eslint-config-prettier` disables any overlapping ESLint style rule so the two never conflict.

Runs full-project (not diff-scoped) in both the pre-commit hook and CI — see the Pre-commit hook subsection below.

### Tier 1 — Unit tests

**Charter:** pure logic, no I/O, no DOM. The majority of tests, and the first thing written for any new logic.

Covers: metric-calculation modules as later stories build them (GCD utilization, LB3 uptime, idle-gap detection, mana curve, R/O/G threshold judging), report URL/code parsing (002), ability-ID resolution (007), and PKCE crypto helpers (`generateCodeChallenge`, `base64urlEncode`). Boundary-crossing dependencies (e.g. `crypto.getRandomValues`) are replaced with real, minimal fake implementations — not mocking-framework mocks — mirroring the manifesto's `Clock.fixed()` pattern.

Tooling: Vitest, co-located as `*.test.ts` next to the file under test.

### Tier 2 — WCL client integration tests

**Charter:** the real WCL client module (query building, response parsing, pagination, error/rate-limit handling, `/user` vs `/client` endpoint selection) exercised against a mocked WCL API, using real captured response bodies. This is the analog of the manifesto's server-integration tier — except the "real server" being integrated against is WCL's, not ours, so it's mocked at the HTTP layer instead of run locally.

Tooling: Vitest + MSW (Mock Service Worker), intercepting `fetch()`. Fixtures are real JSON payloads captured during story 001's live testing (fight list, actor list, cast events for report `4GYHZRdtL3bvhpc8`), stored in `test/integration/fixtures/*.json` — not hand-built synthetic data, since the point is verifying our parsing against WCL's actual shape.

### Tier 3 — Component tests

**Charter:** React components in isolation — fight picker, druid picker, scorecard cards, the threshold editor (802) — rendered in a real DOM (jsdom), exercising primary interactions with fake data injected as props. Behavior-focused assertions (what a user sees and can interact with), not pixel/screenshot tests. Direct web equivalent of the manifesto's Robolectric+Compose tier.

Tooling: Vitest + React Testing Library, co-located as `*.test.tsx` next to the component.

### Tier 4 — Contract tests

**Charter:** the real, live WCL API, called from Node over HTTP, using a dedicated test account and a fixed real report code (`4GYHZRdtL3bvhpc8`). Analogous to the manifesto's API-test tier ("prove the deployment is correct, not just the code") — except there's no deployment of ours to verify; the thing this catches is _drift in an external dependency we don't control_: WCL changing response shapes, deprecating fields, or the fixed report becoming unavailable.

Auth: the dedicated test WCL account logs in once via PKCE, manually, using its **own separate Public Client ID** (registered alongside the production default client from story 008, never the same one) — this keeps contract-test traffic fully isolated from real users' shared rate-limit budget, since WCL's rate limits are scoped per-client. The resulting long-lived access token (~360 days per empirical measurement in story 001) is stored as a CI secret (`WCL_TEST_ACCESS_TOKEN`) and used directly as a Bearer token in test requests. Not a client secret — the Public Client / PKCE-only model is unchanged; this is one dedicated low-privilege test account's bearer credential, same pattern as the manifesto's `test+api@bran.name`.

Tooling: Vitest, `test/contract/`. Trigger: `workflow_dispatch` only, or local `npm run test:contract` — see CI/CD section above.

### Tier 5 — E2E smoke tests

**Charter:** the real deployed site, in a real browser, exercising exactly one core user journey: paste report URL → pick fight → pick druid → see a rendered scorecard with real numbers. Deliberately small, per the manifesto's own tier charter — edge cases belong in lower tiers.

Auth: reuses the same dedicated test account's `WCL_TEST_ACCESS_TOKEN`, injected directly into the browser's `sessionStorage` before the app loads (via Playwright's init-script mechanism), skipping the interactive OAuth consent click-through. That flow was already proven live in story 001, and re-driving a third party's login UI on every run would be fragile in a way unrelated to our own code — this tier tests _our_ app's journey, trusting WCL's login page works.

Tooling: Playwright, `test/e2e/`. Target configured via `PLAYWRIGHT_BASE_URL` (defaults to `http://localhost:5173`, the Vite dev server, if unset; CI's post-deploy job sets it to the live Pages URL). Locally, a developer copies `WCL_TEST_ACCESS_TOKEN` into a gitignored `.env.local` once to run E2E against their own dev server without an interactive login. Trigger: automatically after every deploy (tied to real push activity, not a calendar).

## Test data strategy

Two kinds, matched to what each tier actually needs — no speculative fixture infrastructure beyond what this story's own tests require:

- **Tiers 1 & 3:** hand-built factory functions with defaults + overrides (`aCastEvent({ abilityGameID: 26980 })`), in `src/testUtils/factories.ts`. Starts with only what story 801's own tests need (WCL client shapes, PKCE helpers); grows one function at a time as later stories need new shapes.
- **Tier 2:** real captured JSON response bodies in `test/integration/fixtures/*.json`, seeded from story 001's actual live-tested payloads.
- **Tiers 4 & 5:** no fixtures — real API, real (test-account) data, by design.

## Secrets & credentials summary

One CI secret: `WCL_TEST_ACCESS_TOKEN`, a bearer access token for a dedicated test WCL account, obtained once via PKCE login against a separate test-only Public Client ID (not the production default client from story 008). Requires manual refresh roughly yearly (documented as a runbook note in `docs/wcl-auth.md`). No client secret is introduced anywhere; the product's build/deploy path requires zero secrets, satisfying principle 2.

## Documentation deliverables

- `docs/testing.md`: the permanent reference for how this project is tested (pyramid tiers, tooling, commands, CI triggers, secrets). Unlike this spec, it's not retired once story 801 ships — it's updated as the testing approach evolves. Already written; this spec's Test pyramid section is its design-time rationale, `docs/testing.md` is its lasting practical form.
- `README.md` gets the live GitHub Pages URL.
- `CLAUDE.md` gets a pointer to `docs/testing.md` alongside its existing pointers to `docs/roadmap.md` and `docs/backlog.md`.
