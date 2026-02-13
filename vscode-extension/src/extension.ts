import * as vscode from "vscode";
import { execFile } from "child_process";

const outputChannel = vscode.window.createOutputChannel("PR Splitter");

interface SplitOptions {
  numPrs: string;
  baseBranch: string;
  files: string[];
  exclude: string[];
  assign: string[];
  titles: string[];
  noPush: boolean;
  noDraft: boolean;
}

async function promptNumPrs(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: "How many PRs to split into?",
    placeHolder: "3",
    validateInput: (v) => {
      if (!v) return "Required";
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) return "Must be a positive integer";
      return null;
    },
  });
}

interface SettingItem extends vscode.QuickPickItem {
  id: string;
}

async function promptSettings(): Promise<SplitOptions | undefined> {
  const options: SplitOptions = {
    numPrs: "",
    baseBranch: "main",
    files: [],
    exclude: [],
    assign: [],
    titles: [],
    noPush: false,
    noDraft: false,
  };

  const numPrs = await promptNumPrs();
  if (!numPrs) return undefined;
  options.numPrs = numPrs;

  const settings: SettingItem[] = [
    {
      id: "baseBranch",
      label: "Base branch",
      description: "Default: main",
    },
    {
      id: "files",
      label: "Include file patterns",
      description: "e.g., src/**/*.py",
    },
    {
      id: "exclude",
      label: "Exclude file patterns",
      description: "e.g., tests/**",
    },
    {
      id: "assign",
      label: "Assign files to groups",
      description: "e.g., 1:src/models/**",
    },
    {
      id: "titles",
      label: "Custom PR titles",
      description: "e.g., 1:Add models",
    },
    {
      id: "noPush",
      label: "Local only (no push)",
      description: "Create branches without pushing",
    },
    {
      id: "noDraft",
      label: "Non-draft PRs",
      description: "Create PRs as non-draft",
    },
  ];

  const selected = await vscode.window.showQuickPick(settings, {
    canPickMany: true,
    placeHolder: "Select options to configure (or press Enter to skip)",
  });

  if (selected === undefined) return undefined;

  for (const item of selected) {
    switch (item.id) {
      case "baseBranch": {
        const val = await vscode.window.showInputBox({
          prompt: "Base branch name",
          value: "main",
        });
        if (val === undefined) return undefined;
        options.baseBranch = val;
        break;
      }
      case "files": {
        const val = await vscode.window.showInputBox({
          prompt: "File patterns to include (comma-separated)",
          placeHolder: "src/**/*.py, lib/**/*.py",
        });
        if (val === undefined) return undefined;
        if (val)
          options.files = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "exclude": {
        const val = await vscode.window.showInputBox({
          prompt: "File patterns to exclude (comma-separated)",
          placeHolder: "tests/**, docs/**",
        });
        if (val === undefined) return undefined;
        if (val)
          options.exclude = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "assign": {
        const val = await vscode.window.showInputBox({
          prompt: "Assign files to groups (comma-separated, format: GROUP:PATTERN)",
          placeHolder: "1:src/models/**, 2:src/api/**",
        });
        if (val === undefined) return undefined;
        if (val)
          options.assign = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "titles": {
        const val = await vscode.window.showInputBox({
          prompt: "Custom titles (comma-separated, format: GROUP:TITLE)",
          placeHolder: "1:Add models, 2:API endpoints",
        });
        if (val === undefined) return undefined;
        if (val)
          options.titles = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "noPush":
        options.noPush = true;
        break;
      case "noDraft":
        options.noDraft = true;
        break;
    }
  }

  return options;
}

function buildArgs(options: SplitOptions, dryRun: boolean): string[] {
  const args = ["split", "--num-prs", options.numPrs];

  if (options.baseBranch !== "main") {
    args.push("--base-branch", options.baseBranch);
  }
  for (const f of options.files) {
    args.push("--files", f);
  }
  for (const e of options.exclude) {
    args.push("--exclude", e);
  }
  for (const a of options.assign) {
    args.push("--assign", a);
  }
  for (const t of options.titles) {
    args.push("--title", t);
  }
  if (options.noPush) {
    args.push("--no-push");
  }
  if (options.noDraft) {
    args.push("--no-draft");
  }
  if (dryRun) {
    args.push("--dry-run");
  } else {
    args.push("-y");
  }

  return args;
}

function runDryRun(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("pr-splitter", args, { cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || "",
        stderr: stderr || "",
        code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
      });
    });
  });
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "pr-splitter.split",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      const options = await promptSettings();
      if (!options) return;

      const cwd = workspaceFolder.uri.fsPath;

      // Dry run first
      outputChannel.clear();
      outputChannel.show();
      outputChannel.appendLine("Running dry run...\n");

      const dryRunArgs = buildArgs(options, true);
      const result = await runDryRun(cwd, dryRunArgs);

      if (result.stdout) outputChannel.appendLine(result.stdout);
      if (result.stderr) outputChannel.appendLine(result.stderr);

      if (result.code !== 0) {
        vscode.window.showErrorMessage(
          `PR Splitter failed. Check the Output panel for details.`
        );
        return;
      }

      // Confirm
      const proceed = await vscode.window.showInformationMessage(
        "Review the split plan in the Output panel. Proceed?",
        "Yes",
        "No"
      );

      if (proceed !== "Yes") {
        outputChannel.appendLine("\nAborted.");
        return;
      }

      // Execute in terminal
      const executeArgs = buildArgs(options, false);
      const terminal = vscode.window.createTerminal("PR Splitter");
      terminal.sendText(
        `pr-splitter ${executeArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`
      );
      terminal.show();
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
