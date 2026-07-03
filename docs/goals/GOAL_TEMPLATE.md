# Goal: {short title}

Branch: `{type}/{slug}` · Date: {YYYY-MM-DD}

## Objective

{1–2 sentences: what exists when this goal is done, and why.}

## Requirements

<!-- Feature-specific. Each one measurable — an observable behavior, not a vibe. -->

1. {Requirement}
2. {…}

## QA Validation

<!-- One entry per requirement. Exact commands or steps a fresh session can run. -->

- Req 1: {command / Discord interaction and the expected result}
- Req 2: {…}

## Constraints

- {What must not change — e.g. "no changes to registered command names", "settings_db schema untouched", "no new pm2 processes"}

## Code Quality (reusable — keep in every gitfitbot goal)

- Verifiers green, run as separate commands:
  - `pnpm typecheck` — 0 errors
  - `pnpm format:check` — clean
  - `pnpm build` — exits 0
- Commit messages pass commitlint (Conventional Commits — husky enforces on commit; don't bypass with `--no-verify`).
- Slash-command changes documented in `docs/COMMANDS.md` and noted in `CHANGELOG.md`.
- No dead code; no `@ts-ignore`/`eslint-disable` without an inline justification.
- New domain terms added to `CONTEXT.md`.
- Run the `code-reviewer` skill on the diff and address every finding or explicitly justify skipping it.

## Workflow

- Feature branch off updated `main`; Conventional Commit subjects; PR reviewed before merge to `main`. (Issues are disabled on this repo — link context in the PR body instead.)

## Completion Condition

Done when: {single objective statement — e.g. "all QA Validation steps pass as written, all three verifiers exit 0, and a PR is open against main."}
