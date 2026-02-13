# PR Splitter — VS Code Extension

Split large PRs into smaller, file-based PRs with drag-and-drop file assignment directly from the Source Control sidebar.

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

1. Open the **Source Control** sidebar — the **PR Splitter** section appears below Git
2. Click **Start PR Split** (or use the command palette: `PR Splitter: Start PR Split`)
3. Enter the number of PRs to split into
4. Enter the base branch (defaults to `main`)
5. Changed files appear in an **Unassigned** group
6. **Drag and drop** files between PR groups to assign them
7. Use the inline **rename** icon on a group to set a custom PR title
8. Use the inline **delete** icon to remove a group (files return to Unassigned)
9. Click **Execute Split** to run `pr-splitter split` with your assignments
10. Unassigned files are placed in a separate "leftover" branch

## Commands

| Command | Description |
|---------|-------------|
| `PR Splitter: Start PR Split` | Begin a new split session |
| `PR Splitter: Execute Split` | Run the split with current assignments |
| `PR Splitter: Cancel Split` | Cancel and reset the current session |
| `PR Splitter: Rename` | Rename a PR group (sets PR title) |
| `PR Splitter: Delete Group` | Delete a group, moving its files to Unassigned |
