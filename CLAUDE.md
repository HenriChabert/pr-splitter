# PR Splitter

CLI tool that splits large PRs into smaller, file-based PRs. GitHub only, uses `gh` CLI for PR creation.

## Commands

```bash
uv sync                        # Install dependencies
uv run pytest                  # Run all tests (75 tests)
uv run pytest tests/test_X.py  # Run a specific test file
uv run mypy src/               # Type check (strict mode)
uv run pr-splitter split --help # CLI usage
```

## Architecture

`src/` layout with hatchling build backend. Entry point: `pr_splitter.cli:main`.

```
src/pr_splitter/
  errors.py    — Exception hierarchy (PrSplitterError > GitError, ValidationError, GitHubError)
  models.py    — Pydantic models (SplitConfig, FileDiff, PrGroup, SplitResult, CreatedPr)
  git_ops.py   — Git operations via GitPython (open_repo, get_changed_files, create_branch_with_files)
  splitter.py  — Core logic: plan/execute separation (split() returns plan, execute_split() materializes)
  github.py    — GitHub integration via `gh` subprocess (push_branch, create_pr, create_all_prs, get_current_pr_info)
  cli.py       — Click CLI with `split` subcommand
```

## Key Design Decisions

- **Plan/execute separation**: `split()` computes a `SplitResult` with no side effects; `execute_split()` creates branches. This enables `--dry-run` and confirmation prompts.
- **`git checkout <source> -- <file>`** to apply changes to new branches (handles binary files, simpler than `git apply`).
- **Two distribution modes**: round-robin (default) or manual assignment via `--assign "GROUP:PATTERN"`.
- **Source PR metadata**: titles default to `[1/N] <source PR title>` (fetched via `gh pr view`), body is inherited from source PR.
- **`gh` CLI via subprocess** for PR creation — no token management needed, uses user's existing auth.
- **pathspec** with `gitignore` pattern style for file filtering.

## Testing

Tests use temporary git repos created via pytest fixtures (see `tests/conftest.py`). GitHub tests mock subprocess calls. CLI tests use Click's `CliRunner`. Tests that call `split()` mock `get_current_pr_info` to avoid subprocess calls.
