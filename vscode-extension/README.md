# PR Splitter — VS Code Extension

Split large PRs into smaller, file-based PRs directly from VS Code.

## Prerequisites

- [pr-splitter](../README.md) CLI installed globally (`uv tool install pr-splitter`)
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (for pushing PRs)

## Install

```bash
cd vscode-extension
pnpm install
pnpm run compile
pnpm run package
```

Then install the `.vsix` file: Extensions > ... > Install from VSIX.

## Usage

1. Open the command palette (`Cmd+Shift+P`)
2. Run **"PR Splitter: Split PR"**
3. Enter the number of PRs
4. Optionally configure: base branch, file patterns, assignments, titles, push/draft settings
5. Review the dry-run plan in the Output panel
6. Confirm to create branches and PRs
