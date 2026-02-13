import * as vscode from "vscode";
import type { SplitFile } from "./splitModel";
import { FolderNode, FileNode, type TreeNode } from "./treeNodes";

export const DRAG_MIME = "application/x-pr-splitter-files";

export const STATUS_ICONS: Record<string, string> = {
  A: "diff-added",
  M: "diff-modified",
  D: "diff-removed",
  R: "diff-renamed",
};

// --- Directory tree ---

export interface DirEntry {
  files: SplitFile[];
  subdirs: Map<string, DirEntry>;
}

export function buildDirTree(files: SplitFile[]): DirEntry {
  const root: DirEntry = { files: [], subdirs: new Map() };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!current.subdirs.has(dir)) {
        current.subdirs.set(dir, { files: [], subdirs: new Map() });
      }
      current = current.subdirs.get(dir)!;
    }

    current.files.push(file);
  }

  return root;
}

export function collectAllFiles(entry: DirEntry): SplitFile[] {
  const result: SplitFile[] = [...entry.files];
  for (const sub of entry.subdirs.values()) {
    result.push(...collectAllFiles(sub));
  }
  return result;
}

export function dirEntryToNodes(
  entry: DirEntry,
  parentPath: string,
  groupId: number | "unassigned"
): TreeNode[] {
  const nodes: TreeNode[] = [];

  const sortedDirs = [...entry.subdirs.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [name, sub] of sortedDirs) {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    const allFiles = collectAllFiles(sub);
    nodes.push(new FolderNode(folderPath, name, groupId, allFiles));
  }

  const sortedFiles = [...entry.files].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  for (const file of sortedFiles) {
    nodes.push(new FileNode(file, groupId));
  }

  return nodes;
}

export function lookupSubdir(
  tree: DirEntry,
  folderPath: string
): DirEntry | undefined {
  let current = tree;
  for (const part of folderPath.split("/")) {
    const sub = current.subdirs.get(part);
    if (!sub) return undefined;
    current = sub;
  }
  return current;
}

// --- Drag helpers ---

export function collectDraggedFiles(source: readonly TreeNode[]): SplitFile[] {
  const files: SplitFile[] = [];

  for (const node of source) {
    if (node instanceof FileNode) {
      files.push(node.file);
    } else if (node instanceof FolderNode) {
      files.push(...node.files);
    }
  }

  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}

// --- Shared tree-item rendering ---

export function renderFolderItem(
  node: FolderNode,
  idPrefix: string
): vscode.TreeItem {
  const item = new vscode.TreeItem(
    node.name,
    vscode.TreeItemCollapsibleState.Expanded
  );
  item.id = `${idPrefix}:folder:${node.folderPath}`;
  item.iconPath = vscode.ThemeIcon.Folder;
  item.contextValue = "folder";
  item.description = `${node.files.length}`;
  return item;
}

export function renderFileItem(
  node: FileNode,
  idPrefix: string
): vscode.TreeItem {
  const fileName = node.file.path.split("/").pop() ?? node.file.path;
  const item = new vscode.TreeItem(
    fileName,
    vscode.TreeItemCollapsibleState.None
  );
  item.id = `${idPrefix}:file:${node.file.path}`;
  item.iconPath = new vscode.ThemeIcon(
    STATUS_ICONS[node.file.status] || "file"
  );
  item.contextValue = "file";
  item.tooltip = node.file.path;
  return item;
}
