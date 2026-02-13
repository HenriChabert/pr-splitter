# pr-splitter

Split large PRs into smaller, file-based PRs. GitHub only, uses the `gh` CLI for PR creation.

## Why

Large PRs are hard to review. `pr-splitter` takes your feature branch, distributes its changed files across N branches, and optionally creates draft PRs for each one.

## Quickstart

### Install

```bash
# With uv (recommended)
uv tool install pr-splitter

# Or from a local clone
git clone https://github.com/YOUR_ORG/pr-splitter.git
uv tool install ./pr-splitter
```

Requires Python 3.13+ and the [GitHub CLI](https://cli.github.com/) (`gh`) for PR creation.

### Usage

From a feature branch with changes relative to `main`:

```bash
# Preview the split plan
pr-splitter split --num-prs 3 --dry-run

# Create branches locally (no push)
pr-splitter split --num-prs 3 --no-push

# Create branches and open draft PRs on GitHub
pr-splitter split --num-prs 3

# Filter files
pr-splitter split --num-prs 2 --files "src/**/*.py" --exclude "tests/**"

# Manually assign files to groups
pr-splitter split --num-prs 2 \
  --assign "1:src/models/**" \
  --assign "2:src/api/**"

# Custom PR titles
pr-splitter split --num-prs 2 \
  --title "1:Add data models" \
  --title "2:API endpoints"

# Skip confirmation prompt
pr-splitter split --num-prs 3 -y
```

### Claude Code skill

A [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) is included so you can use `/split-pr` from any project. To install it globally:

```bash
cp -r skills/split-pr ~/.claude/skills/split-pr
```

Then in Claude Code, use it with natural language:

```
/split-pr 3 PRs excluding tests
/split-pr 2 only Python files, no push
/split-pr 2 assign models to group 1, api to group 2
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

## How it works

1. Compares your current branch against the base branch (`git diff --name-status`)
2. Filters files by include/exclude glob patterns (gitignore-style via `pathspec`)
3. Distributes files: round-robin by default, or manually via `--assign` patterns
4. Fetches the source PR title and description via `gh pr view` (falls back to branch name)
5. For each group, creates a branch from the base and applies files with `git checkout <source> -- <file>`
6. Optionally pushes branches and creates draft PRs via `gh pr create`

When using `--assign`, files not matched by any pattern go into an extra "leftover" group. PR titles default to `[1/N] <source PR title>` and the source PR description is copied to all split PRs.

## Development

```bash
uv sync                        # Install dependencies
uv run pytest                  # Run tests
uv run mypy src/               # Type check (strict mode)
```
