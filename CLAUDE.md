# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo.

## Project

Bloomwatch is a static, backend-less web app that turns a Warcraft Logs report into a process-quality scorecard for TBC Resto Druids. In scope: TBC Anniversary ("fresh") realms only — no other WoW version, expansion, or realm type. Full vision, principles, and phased roadmap: `docs/roadmap.md`. Full backlog of user stories (the unit of implementation work): `docs/backlog.md`.

Read both docs before starting substantial feature work — they define scope, thresholds, and acceptance criteria that shouldn't be re-derived or guessed.

## Product principles (do not violate silently)

1. **Process over output.** Never add a metric based on HPS, effective healing rank, or parse percentile.
2. **No backend.** No server-side code, no database, no accounts. All WCL API calls happen client-side; all computation happens in the browser.
3. **Judgement is visible and sourced.** Every red/orange/green threshold must be documented and, per story 802, eventually user-configurable — don't hardcode a threshold without a comment pointing to its rationale in `docs/backlog.md`.
4. **FOSS.** Keep the repo reproducible from a clean clone with no required secrets at build time.

## Working conventions

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/)**: `type(scope): summary`, e.g. `feat(lifebloom): add LB3 uptime per target`, `fix(auth): handle expired PKCE token`, `docs: update roadmap`. Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`. Scope is optional but preferred when a change is confined to one epic/module (e.g. `gcd`, `lifebloom`, `mana`, `auth`, `wcl-client`).
- Backlog stories (`docs/backlog.md`) are the primary unit of work — one story is intended to be independently implementable in one session. When implementing a story, its acceptance criteria are the spec; don't add scope beyond them.
- Spell/ability IDs must never be hardcoded — resolve them from the report's `masterData.abilities` at runtime (see backlog story 007). TBC has multiple ranks per spell.
- No secrets should ever be required at build or deploy time (see story 801 / principle 2). If an auth approach needs a client secret, it does not meet the no-backend bar — flag it rather than working around it.
- Design specs go in `docs/specs/<topic>-design.md`; implementation plans go in `docs/plans/<topic>-plan.md`. No `superpowers` subdirectory, no dates in filenames.

## Repo state

Phase 0 (`docs/roadmap.md`) is complete: the backend-less WCL auth pipeline is proven (`index.html`, `docs/wcl-auth.md`). Phase 1 build tooling (story 801) is next.
