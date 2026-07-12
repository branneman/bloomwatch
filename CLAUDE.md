# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo.

## Project

Bloomwatch is a static, backend-less web app that turns a Warcraft Logs report into a process-quality scorecard for TBC Resto Druids. In scope: TBC Anniversary ("fresh") realms only — no other WoW version, expansion, or realm type. Full vision, principles, and phased roadmap: `docs/roadmap.md`. Full backlog of user stories (the unit of implementation work): `docs/backlog.md`. Testing strategy and tooling: `docs/testing.md`.

Read both docs before starting substantial feature work — they define scope, thresholds, and acceptance criteria that shouldn't be re-derived or guessed. Always read `docs/testing.md` before writing an implementation plan — it defines which test tier each kind of change belongs in and the tooling/conventions (factories, fixtures, co-location) each tier expects, none of which should be re-derived or guessed either.

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
- **A story isn't done until its paperwork is retired.** The moment a story ships, mark it `✅ Done` in `docs/backlog.md` and delete its `docs/specs/*-design.md` / `docs/plans/*-plan.md` files in the same commit (fix any dangling references first, per the point above). This is the standard for every story going forward — don't leave completed specs/plans lying around for a later cleanup pass.
- Static analysis (typecheck, ESLint, Prettier) runs full-project — via a pre-commit hook and in CI, per `docs/testing.md` — not scoped to changed files only. Don't bypass the pre-commit hook.
- **Merging branches: fast-forward only.** Never create a merge commit (`git merge --no-ff`, or a merge commit from a PR's "Merge" button). Integrate branches via rebase (`git rebase`) followed by a fast-forward merge (`git merge --ff-only`), or a rebase-and-merge / squash-and-merge on GitHub. Keeps history linear.
- **Executing an approved implementation plan: use the subagent-driven-development skill, directly on `main`.** No separate review-checkpoint session (skip executing-plans) and no git worktree isolation (skip using-git-worktrees) — work happens in the current session, on the current branch, unless the user says otherwise for a specific task.

## Running live WCL queries yourself

If `.env.local` has `WCL_TEST_ACCESS_TOKEN` set (see `docs/testing.md`), you can call the real WCL API directly — no GraphQL client needed, it's plain HTTP+JSON:

```bash
set -a; source .env.local; set +a
curl -s -X POST https://www.warcraftlogs.com/api/v2/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WCL_TEST_ACCESS_TOKEN" \
  -d '{"query":"query { reportData { report(code: \"4GYHZRdtL3bvhpc8\") { title fights { id name startTime endTime } } } }"}' \
  -o /path/to/scratch/response.json
```

Use this to capture real Tier 2 fixtures (`test/integration/fixtures/*.json`) or spot-check a field's real shape/scale before writing code against an assumption. `docs/testing.md`'s "Known real test reports" table lists report codes already validated against for this purpose (with what each is notable for) — check there before reaching for a new report, and add to it when a new one earns its place. Keep the token out of logs and chat output:

- Reference it only as `$WCL_TEST_ACCESS_TOKEN` in commands (never inline the literal value).
- Never `cat`/`echo`/print `.env.local` or the token itself.
- Redirect responses to a file (`-o`) rather than letting curl dump to stdout, especially if a header-echo flag (`-v`, `-i`) is ever added.
- `.env.local` is gitignored — never `git add` it.

## Repo state

Phase 0 (WCL auth pipeline, `docs/wcl-auth.md`), story 801 (build & test tooling foundation — Vite + React + TypeScript, full test pyramid, CI/CD to GitHub Pages, `docs/testing.md`), story 002 (report URL/code input), story 003 (fight list & selection), story 004 (zone-wide selection), story 005 (druid auto-detection & selection), story 006 (event fetching & caching layer), story 007 (ability resolution table), story 101 (active time & GCD utilization), story 102 (idle-gap detection), story 201 (LB3 uptime per target), story 202 (refresh cadence histogram), story 203 (accidental bloom counter), story 204 (re-stack tax), story 205 (concurrent LB3 targets), story 701 (single-fight scorecard), and story 008 (default API client fallback) are complete and live — Phase 1 MVP is done. Phase 2 work continues with epic D starting with story 301.
