# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo.

## Project

Bloomwatch is a static, backend-less web app that turns a Warcraft Logs report into a process-quality scorecard for TBC Resto Druids. In scope: TBC Anniversary ("fresh") realms only — no other WoW version, expansion, or realm type. Full vision, principles, and phased roadmap: `docs/roadmap.md`. Full backlog of user stories (the unit of implementation work): `docs/backlog.md`. Testing strategy and tooling: `docs/testing.md`.

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
- Design specs go in `docs/specs/<topic>-design.md`; implementation plans go in `docs/plans/<topic>-plan.md`. No `superpowers` subdirectory, no dates in filenames. Once a story ships and its lasting details (rationale, tooling, conventions) are captured in a permanent doc (`docs/testing.md`, `docs/wcl-auth.md`, etc.), the spec/plan can be deleted — grep the repo for the file path first to confirm nothing else references it.
- Static analysis (typecheck, ESLint, Prettier) runs full-project — via a pre-commit hook and in CI, per `docs/testing.md` — not scoped to changed files only. Don't bypass the pre-commit hook.
- **Merging branches: fast-forward only.** Never create a merge commit (`git merge --no-ff`, or a merge commit from a PR's "Merge" button). Integrate branches via rebase (`git rebase`) followed by a fast-forward merge (`git merge --ff-only`), or a rebase-and-merge / squash-and-merge on GitHub. Keeps history linear.

## Repo state

Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), and story 003 (fight list & selection) are complete and live. Phase 1 MVP work continues with backlog story 004 (zone-wide selection) next. Story 003 has one outstanding manual follow-up: capture a real Tier 2 fixture with `encounterID`/`kill`/`bossPercentage` for `test/integration/fixtures/report-fights.json` (see `docs/plans/fight-picker-plan.md`'s "Manual follow-up" section), including verifying `bossPercentage`'s scale against the real API response.
