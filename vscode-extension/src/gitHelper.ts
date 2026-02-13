import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import type { SplitFile } from "./splitModel";

function run(
  command: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function getChangedFiles(
  cwd: string,
  baseBranch: string
): Promise<SplitFile[]> {
  // Find merge base
  const mergeBase = await run("git", ["merge-base", baseBranch, "HEAD"], cwd);

  const output = await run(
    "git",
    ["diff", "--name-status", "--no-renames", mergeBase, "HEAD"],
    cwd
  );

  if (!output) return [];

  const files: SplitFile[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const statusChar = parts[0][0];
    const path = parts[parts.length - 1];

    let status: SplitFile["status"];
    switch (statusChar) {
      case "A":
        status = "A";
        break;
      case "M":
        status = "M";
        break;
      case "D":
        status = "D";
        break;
      case "R":
        status = "R";
        break;
      default:
        status = "M";
    }

    files.push({ path, status });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return run("git", ["branch", "--show-current"], cwd);
}

export function executeSplit(cwd: string, args: string[]): void {
  // Write command to a temp script to avoid terminal input buffer limits
  const escaped = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" \\\n  ");
  const script = `#!/bin/bash\ncd "${cwd}" && pr-splitter split \\\n  ${escaped}\n`;
  const scriptPath = path.join(os.tmpdir(), `pr-splitter-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const terminal = vscode.window.createTerminal("PR Splitter");
  terminal.sendText(`bash "${scriptPath}"`);
  terminal.show();
}
