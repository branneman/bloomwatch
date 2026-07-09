# Bloomwatch

*Keep your Lifeblooms rolling.*

A process-quality analyzer for TBC Resto Druids on Anniversary ("fresh") realms, built on [Warcraft Logs](https://www.warcraftlogs.com/). Paste a report link, pick a fight, get a scorecard that judges your **process** (GCD usage, Lifebloom discipline, mana economy, prep hygiene) instead of the healing meter, which is a zero-sum, misleading measure of individual play.

## Status

Pre-implementation. See [`docs/roadmap.md`](docs/roadmap.md) for the phased plan (currently Phase 0: proving the backend-less WCL auth pipeline) and [`docs/backlog.md`](docs/backlog.md) for the full set of user stories.

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
