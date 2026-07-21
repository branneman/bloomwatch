# Bloomwatch

_Keep your Lifeblooms rolling._

A process-quality analyzer for TBC Resto Druids on Anniversary ("fresh") realms, built on [Warcraft Logs](https://www.warcraftlogs.com/). Paste a report link, pick a fight, get a scorecard that judges your **process** (GCD usage, Lifebloom discipline, mana economy, prep hygiene) instead of the healing meter, which is a zero-sum, misleading measure of individual play.

## Status

Phase 0 complete (see [`docs/wcl-auth.md`](docs/wcl-auth.md)). Phase 1 foundation (story 801) in place — see [`docs/roadmap.md`](docs/roadmap.md) and [`docs/backlog.md`](docs/backlog.md) for what's next.

Live: https://branneman.github.io/bloomwatch/

## Development

### Prerequisites

- Node.js 20.19+ or 22.12+ (matches Vite's own requirement), with npm.
- A [Warcraft Logs](https://www.warcraftlogs.com/) account, if you want to actually use the app against a real report (paste a report link, log in via WCL OAuth in the browser).

No secrets are required to build or run the app (see `CLAUDE.md`'s "No backend" principle) — the app ships with a public, no-secret OAuth Client ID (story 008), so a fresh clone works out of the box.

### Setup

```bash
git clone https://github.com/branneman/bloomwatch.git
cd bloomwatch
npm install    # also installs the Husky pre-commit hook (typecheck + lint + format:check)
npm run dev    # local dev server, http://localhost:5173
```

Open the dev server URL, paste a real WCL report link, and log in with your own WCL account when prompted — that's the whole loop.

### Everyday commands

```bash
npm run dev            # local dev server
npm run build          # production build (tsc -b && vite build)
npm run typecheck      # tsc, app + scripts
npm run lint           # ESLint
npm run format         # Prettier, writes fixes
npm test               # unit + integration + component tests (Tiers 1-3)
```

See [`docs/testing.md`](docs/testing.md) for the full test pyramid.

### Optional: real-WCL-API tooling

A few things need a `WCL_TEST_ACCESS_TOKEN` in a gitignored `.env.local` file, because they talk to the _real_ WCL API instead of the app's mocked/local paths. None of this is required for everyday feature work — see [`docs/testing.md`](docs/testing.md)'s "Secrets & credentials" section for how to obtain your own token (you'll register a separate, dedicated test-only Public Client — never reuse the app's default production client for this).

```bash
npm run test:contract              # Tier 4 contract tests, real WCL API
npm run test:e2e                   # Tier 5 Playwright smoke test, real deployed/dev-server app
npm run wcl:query -- '<query>'     # run any GraphQL query against WCL's API
npm run calibrate -- <reportCode>  # compute every metric for a real report, writes calibration-data/<reportCode>.json
```

## Architecture

- Vite + React + TypeScript static single-page app, deployed to GitHub Pages via GitHub Actions. No server, no database, no accounts.
- Data source: WCL API v2 (GraphQL), called client-side.
- All analysis happens in the browser per fight.

See `docs/roadmap.md` for the full architecture rationale and open risks.

## Contributing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Merging branches: rebase + fast-forward only. Keep history linear.
- See `CLAUDE.md` for project conventions used by AI coding agents working in this repo.

## License

TBD.
