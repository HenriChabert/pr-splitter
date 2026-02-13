import * as vscode from "vscode";
import { SplitModel } from "./splitModel";
import { SplitTreeProvider, GroupNode } from "./splitTreeProvider";
import { getChangedFiles, getCurrentBranch, executeSplit } from "./gitHelper";

export function activate(context: vscode.ExtensionContext) {
  const model = new SplitModel();
  const treeProvider = new SplitTreeProvider(model);

  const treeView = vscode.window.createTreeView("prSplitterView", {
    treeDataProvider: treeProvider,
    dragAndDropController: treeProvider,
    canSelectMany: true,
  });

  function setActiveContext(active: boolean): void {
    vscode.commands.executeCommand("setContext", "pr-splitter.active", active);
  }

  // Initialize context
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

      // Prompt for number of PRs
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

      // Prompt for base branch
      const baseBranch = await vscode.window.showInputBox({
        prompt: "Base branch to compare against",
        value: "main",
      });
      if (baseBranch === undefined) return;

      // Get changed files
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
        treeProvider.refresh();
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
      if (!(node instanceof GroupNode) || node.groupId === "unassigned") return;

      const group = model.groups.find((g) => g.id === node.groupId);
      if (!group) return;

      const newLabel = await vscode.window.showInputBox({
        prompt: `Rename PR ${group.id}`,
        value: group.label,
      });
      if (newLabel === undefined) return;

      model.renameGroup(group.id, newLabel);
      treeProvider.refresh();
    }
  );

  // Delete Group
  const deleteGroup = vscode.commands.registerCommand(
    "pr-splitter.deleteGroup",
    (node: GroupNode) => {
      if (!(node instanceof GroupNode) || node.groupId === "unassigned") return;
      model.deleteGroup(node.groupId as number);
      treeProvider.refresh();
    }
  );

  // Execute Split
  const execSplit = vscode.commands.registerCommand(
    "pr-splitter.executeSplit",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder || !model.active) return;

      if (!model.canExecute) {
        vscode.window.showWarningMessage(
          "Assign at least some files to a group before executing."
        );
        return;
      }

      if (model.unassigned.length > 0) {
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
        "-y",
      ];

      executeSplit(cwd, args);
      model.reset();
      setActiveContext(false);
      treeProvider.refresh();
    }
  );

  // Cancel Split
  const cancelSplit = vscode.commands.registerCommand(
    "pr-splitter.cancelSplit",
    () => {
      model.reset();
      setActiveContext(false);
      treeProvider.refresh();
    }
  );

  context.subscriptions.push(
    treeView,
    startSplit,
    renameGroup,
    deleteGroup,
    execSplit,
    cancelSplit
  );
}

export function deactivate() {}
