import * as vscode from "vscode";
import { SplitModel } from "./splitModel";
import { SourceTreeProvider, GroupsTreeProvider, GroupNode, FileNode, FolderNode } from "./splitTreeProvider";
import { getChangedFiles, getCurrentBranch, executeSplit } from "./gitHelper";

export function activate(context: vscode.ExtensionContext) {
  const model = new SplitModel();

  function refreshAll(): void {
    sourceProvider.refresh();
    groupsProvider.refresh();
    sourceView.description = model.active
      ? `${model.unassigned.length} file${model.unassigned.length === 1 ? "" : "s"}`
      : "";
  }

  const sourceProvider = new SourceTreeProvider(model, refreshAll);
  const groupsProvider = new GroupsTreeProvider(model, refreshAll);

  const sourceView = vscode.window.createTreeView("prSplitterSourceView", {
    treeDataProvider: sourceProvider,
    dragAndDropController: sourceProvider,
    canSelectMany: true,
  });

  const groupsView = vscode.window.createTreeView("prSplitterGroupsView", {
    treeDataProvider: groupsProvider,
    dragAndDropController: groupsProvider,
    canSelectMany: true,
  });

  function setActiveContext(active: boolean): void {
    vscode.commands.executeCommand("setContext", "pr-splitter.active", active);
  }

  setActiveContext(false);

  // Start Split
  const startSplit = vscode.commands.registerCommand(
    "pr-splitter.startSplit",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }
      const cwd = workspaceFolder.uri.fsPath;

      const numPrsStr = await vscode.window.showInputBox({
        prompt: "How many PRs to split into?",
        placeHolder: "3",
        validateInput: (v) => {
          if (!v) return "Required";
          const n = parseInt(v, 10);
          if (isNaN(n) || n < 1) return "Must be a positive integer";
          return null;
        },
      });
      if (!numPrsStr) return;
      const numPrs = parseInt(numPrsStr, 10);

      const baseBranch = await vscode.window.showInputBox({
        prompt: "Base branch to compare against",
        value: "main",
      });
      if (baseBranch === undefined) return;

      try {
        const files = await getChangedFiles(cwd, baseBranch);
        if (files.length === 0) {
          vscode.window.showWarningMessage(
            "No changed files found between branches."
          );
          return;
        }

        const sourceBranch = await getCurrentBranch(cwd);
        model.startSplit(numPrs, files, baseBranch, sourceBranch);
        setActiveContext(true);
        refreshAll();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Failed to get changed files: ${msg}`);
      }
    }
  );

  // Rename Group
  const renameGroup = vscode.commands.registerCommand(
    "pr-splitter.renameGroup",
    async (node: GroupNode) => {
      if (!(node instanceof GroupNode)) return;

      const group = model.groups.find((g) => g.id === node.groupId);
      if (!group) return;

      const newLabel = await vscode.window.showInputBox({
        prompt: `Rename PR ${group.id}`,
        value: group.label,
      });
      if (newLabel === undefined) return;

      model.renameGroup(group.id, newLabel);
      refreshAll();
    }
  );

  // Delete Group
  const deleteGroup = vscode.commands.registerCommand(
    "pr-splitter.deleteGroup",
    (node: GroupNode) => {
      if (!(node instanceof GroupNode)) return;
      model.deleteGroup(node.groupId);
      refreshAll();
    }
  );

  // Shared split logic
  async function runSplit(dryRun: boolean): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !model.active) return;

    if (!model.canExecute) {
      vscode.window.showWarningMessage(
        "Assign at least some files to a group before executing."
      );
      return;
    }

    if (!dryRun && model.unassigned.length > 0) {
      const proceed = await vscode.window.showWarningMessage(
        `${model.unassigned.length} file(s) are unassigned and will go into a separate "leftover" group.`,
        "Continue",
        "Cancel"
      );
      if (proceed !== "Continue") return;
    }

    const cwd = workspaceFolder.uri.fsPath;
    const args: string[] = [
      "--num-prs",
      String(model.numPrs),
      "--base-branch",
      model.baseBranch,
      ...model.getAssignArgs(),
      ...model.getTitleArgs(),
    ];

    if (dryRun) {
      args.push("--dry-run");
    } else {
      args.push("-y");
    }

    executeSplit(cwd, args);

    if (!dryRun) {
      model.reset();
      setActiveContext(false);
      refreshAll();
    }
  }

  // Execute Split
  const execSplit = vscode.commands.registerCommand(
    "pr-splitter.executeSplit",
    () => runSplit(false)
  );

  // Dry Run
  const dryRun = vscode.commands.registerCommand(
    "pr-splitter.dryRun",
    () => runSplit(true)
  );

  // Assign to PR
  const assignTo = vscode.commands.registerCommand(
    "pr-splitter.assignTo",
    async (node: FileNode | FolderNode) => {
      if (!model.active) return;
      if (!(node instanceof FileNode) && !(node instanceof FolderNode)) return;

      // Collect files from the clicked node
      const files =
        node instanceof FolderNode ? node.files : [node.file];

      // Build QuickPick items: all PR groups + Unassigned
      const items: vscode.QuickPickItem[] = [
        { label: "Unassigned", description: "Move back to unassigned" },
        ...model.groups.map((g) => ({
          label: g.label,
          description: `${g.files.length} file${g.files.length === 1 ? "" : "s"}`,
        })),
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Assign ${files.length} file${files.length === 1 ? "" : "s"} to...`,
      });
      if (!picked) return;

      if (picked.label === "Unassigned") {
        model.moveFiles(files, "unassigned");
      } else {
        const group = model.groups.find((g) => g.label === picked.label);
        if (group) {
          model.moveFiles(files, group.id);
        }
      }
      refreshAll();
    }
  );

  // Cancel Split
  const cancelSplit = vscode.commands.registerCommand(
    "pr-splitter.cancelSplit",
    () => {
      model.reset();
      setActiveContext(false);
      refreshAll();
    }
  );

  context.subscriptions.push(
    sourceView,
    groupsView,
    startSplit,
    renameGroup,
    deleteGroup,
    assignTo,
    execSplit,
    dryRun,
    cancelSplit
  );
}

export function deactivate() {}
