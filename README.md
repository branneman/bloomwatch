# Bloomwatch

_Keep your Lifeblooms rolling._

A process-quality analyzer for TBC Resto Druids on Anniversary ("fresh") realms, built on [Warcraft Logs](https://www.warcraftlogs.com/). Paste a report link, pick a fight, get a scorecard that judges your **process** (GCD usage, Lifebloom discipline, mana economy, prep hygiene) instead of the healing meter, which is a zero-sum, misleading measure of individual play.

## Status

Phase 0 complete (see [`docs/wcl-auth.md`](docs/wcl-auth.md)). Phase 1 foundation (story 801) in place — see [`docs/roadmap.md`](docs/roadmap.md) and [`docs/backlog.md`](docs/backlog.md) for what's next.

Live: https://branneman.github.io/bloomwatch/

## Development

```bash
npm install
npm run dev            # local dev server
npm run build          # production build
npm test                # unit + integration + component tests (Tiers 1-3)
npm run test:contract  # real WCL API, needs WCL_TEST_ACCESS_TOKEN — see docs/testing.md
npm run test:e2e       # Playwright smoke test, needs WCL_TEST_ACCESS_TOKEN — see docs/testing.md
```

See [`docs/testing.md`](docs/testing.md) for the full test pyramid.

## Architecture

- Static single-page app, deployable on GitHub Pages. No server, no database, no accounts.
- Data source: WCL API v2 (GraphQL), called client-side.
- All analysis happens in the browser per fight.

See `docs/roadmap.md` for the full architecture rationale and open risks.

## Contributing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- See `CLAUDE.md` for project conventions used by AI coding agents working in this repo.

## License

TBD.
