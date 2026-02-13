---
name: split-pr
description: Split the current branch's changes into multiple smaller PRs using pr-splitter
argument-hint: "[num-prs] [options]"
allowed-tools:
  - Bash
---

Split the current branch's changes into multiple smaller PRs.

## Usage

The user wants to split their current feature branch into smaller PRs. Parse their request to determine parameters, then run `pr-splitter split` with the appropriate options.

## How to interpret the user's request

- `$ARGUMENTS` contains the user's instructions (e.g., "3 PRs excluding tests" or "2 --dry-run")
- If the user specifies a number, use it as `--num-prs`
- If the user mentions file patterns to include, use `--files` (repeatable)
- If the user mentions patterns to exclude, use `--exclude` (repeatable)
- If the user says "dry run" or "preview", add `--dry-run`
- If the user says "no push" or "local only", add `--no-push`
- If the user mentions assigning specific files/patterns to a group, use `--assign "GROUP:PATTERN"` (repeatable)
- If the user mentions custom titles for groups, use `--title "GROUP:TITLE"` (repeatable)
- If the user doesn't specify a base branch, default is `main`
- If the user doesn't specify draft/no-draft, default is `--draft`

## Steps

1. First, run `git status` and `git branch` to understand the current repo state and confirm we're on a feature branch.
2. Run `pr-splitter split` with the determined options. Always start with `--dry-run` first so the user can review the plan before committing to it.
3. Show the user the dry-run output and ask if they want to proceed.
4. If they confirm, run the command again without `--dry-run` and with `-y` to skip the CLI confirmation prompt. If `--no-push` was not specified, this will also push branches and create draft PRs on GitHub (requires `gh` CLI authenticated).

## Examples

User says "split into 3 PRs":
```bash
pr-splitter split --num-prs 3 --dry-run
```

User says "split into 2, exclude tests, don't push":
```bash
pr-splitter split --num-prs 2 --exclude "tests/**" --no-push --dry-run
```

User says "split into 4 PRs, only Python files, base branch develop":
```bash
pr-splitter split --num-prs 4 --files "**/*.py" --base-branch develop --dry-run
```

User says "split into 2 PRs, models in group 1, api in group 2":
```bash
pr-splitter split --num-prs 2 --assign "1:src/models/**" --assign "2:src/api/**" --dry-run
```

User says "split into 2 PRs, title group 1 'Data models', title group 2 'API layer'":
```bash
pr-splitter split --num-prs 2 --title "1:Data models" --title "2:API layer" --dry-run
```

## CLI reference

```
pr-splitter split [OPTIONS]

Options:
  --files TEXT          File glob patterns to include (repeatable, default: **/*).
  --exclude TEXT        File glob patterns to exclude (repeatable).
  --num-prs INTEGER     Number of PRs to split into (required).
  --prefix TEXT         Branch name prefix.
  --base-branch TEXT    Base branch to compare against (default: main).
  --source-branch TEXT  Source branch (default: current branch).
  --depends-on TEXT     PR or branch that this split depends on.
  --draft / --no-draft  Create PRs as drafts (default: --draft).
  --push / --no-push    Push branches and create PRs on GitHub (default: --push).
  --dry-run             Show the split plan without creating branches.
  -y, --yes             Skip confirmation prompt and proceed automatically.
  --assign TEXT         Assign files to a group: 'GROUP:PATTERN' (e.g., '1:src/**'). Repeatable.
  --title TEXT          Custom title for a group: 'GROUP:TITLE' (e.g., '1:Add models'). Repeatable.
```
