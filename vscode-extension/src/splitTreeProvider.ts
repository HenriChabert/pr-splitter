import * as vscode from "vscode";
import type { SplitFile, SplitModel } from "./splitModel";

const DRAG_MIME = "application/x-pr-splitter-files";

// Tree item types
type TreeNode = GroupNode | FolderNode | FileNode | ActionNode;

export class GroupNode {
  constructor(
    public readonly groupId: number,
    public readonly label: string,
    public readonly fileCount: number
  ) {}
}

export class FolderNode {
  constructor(
    public readonly folderPath: string,
    public readonly name: string,
    public readonly groupId: number | "unassigned",
    public readonly files: SplitFile[]
  ) {}
}

export class FileNode {
  constructor(
    public readonly file: SplitFile,
    public readonly groupId: number | "unassigned"
  ) {}
}

export class ActionNode {
  constructor(
    public readonly actionId: string,
    public readonly label: string
  ) {}
}

// --- Directory tree helpers ---

interface DirEntry {
  files: SplitFile[];
  subdirs: Map<string, DirEntry>;
}

function buildDirTree(files: SplitFile[]): DirEntry {
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

function collectAllFiles(entry: DirEntry): SplitFile[] {
  const result: SplitFile[] = [...entry.files];
  for (const sub of entry.subdirs.values()) {
    result.push(...collectAllFiles(sub));
  }
  return result;
}

function dirEntryToNodes(
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

function lookupSubdir(tree: DirEntry, folderPath: string): DirEntry | undefined {
  let current = tree;
  for (const part of folderPath.split("/")) {
    const sub = current.subdirs.get(part);
    if (!sub) return undefined;
    current = sub;
  }
  return current;
}

// Shared drag state — bypasses DataTransfer serialization issues across trees
let pendingDragFiles: SplitFile[] | undefined;

function collectDraggedFiles(source: readonly TreeNode[]): SplitFile[] {
  const files: SplitFile[] = [];

  for (const node of source) {
    if (node instanceof FileNode) {
      files.push(node.file);
    } else if (node instanceof FolderNode) {
      files.push(...node.files);
    }
  }

  // Deduplicate by file path
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}

const STATUS_ICONS: Record<string, string> = {
  A: "diff-added",
  M: "diff-modified",
  D: "diff-removed",
  R: "diff-renamed",
};

// --- Source tree (Unassigned files) ---

export class SourceTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode>
{
  readonly dropMimeTypes = [DRAG_MIME];
  readonly dragMimeTypes = [DRAG_MIME];

  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private dirTreeCache: DirEntry | undefined;

  constructor(
    private model: SplitModel,
    private refreshAll: () => void
  ) {}

  refresh(): void {
    this.dirTreeCache = undefined;
    this._onDidChangeTreeData.fire();
  }

  private getDirTree(): DirEntry {
    if (!this.dirTreeCache) {
      this.dirTreeCache = buildDirTree(this.model.unassigned);
    }
    return this.dirTreeCache;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof FolderNode) {
      const item = new vscode.TreeItem(
        element.name,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = `source:folder:${element.folderPath}`;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "folder";
      item.description = `${element.files.length}`;
      return item;
    }

    if (element instanceof FileNode) {
      const fileName = element.file.path.split("/").pop() ?? element.file.path;
      const item = new vscode.TreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.None
      );
      item.id = `source:file:${element.file.path}`;
      item.iconPath = new vscode.ThemeIcon(
        STATUS_ICONS[element.file.status] || "file"
      );
      item.contextValue = "file";
      item.tooltip = element.file.path;
      return item;
    }

    return new vscode.TreeItem("");
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.model.active) return [];

    // Root: show folder/file tree directly (no group wrapper)
    if (!element) {
      return dirEntryToNodes(this.getDirTree(), "", "unassigned");
    }

    if (element instanceof FolderNode) {
      const sub = lookupSubdir(this.getDirTree(), element.folderPath);
      if (sub) {
        return dirEntryToNodes(sub, element.folderPath, "unassigned");
      }
    }

    return [];
  }

  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const files = collectDraggedFiles(source);
    if (files.length > 0) {
      pendingDragFiles = files;
      dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem("drag"));
    }
  }

  handleDrop(
    _target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = dataTransfer.get(DRAG_MIME);
    if (!item || !pendingDragFiles) return;

    const files = pendingDragFiles;
    pendingDragFiles = undefined;

    this.model.moveFiles(files, "unassigned");
    this.refreshAll();
  }
}

// --- Groups tree (PR groups) ---

export class GroupsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode>
{
  readonly dropMimeTypes = [DRAG_MIME];
  readonly dragMimeTypes = [DRAG_MIME];

  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private dirTreeCache = new Map<number, DirEntry>();

  constructor(
    private model: SplitModel,
    private refreshAll: () => void
  ) {}

  refresh(): void {
    this.dirTreeCache.clear();
    this._onDidChangeTreeData.fire();
  }

  private getDirTree(groupId: number): DirEntry {
    if (!this.dirTreeCache.has(groupId)) {
      const files = this.model.groups.find((g) => g.id === groupId)?.files ?? [];
      this.dirTreeCache.set(groupId, buildDirTree(files));
    }
    return this.dirTreeCache.get(groupId)!;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof GroupNode) {
      const item = new vscode.TreeItem(
        `${element.label} (${element.fileCount})`,
        element.fileCount > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
      );
      item.id = `groups:group:${element.groupId}`;
      item.iconPath = new vscode.ThemeIcon("git-pull-request");
      item.contextValue = "group";
      return item;
    }

    if (element instanceof FolderNode) {
      const item = new vscode.TreeItem(
        element.name,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = `groups:folder:${element.groupId}:${element.folderPath}`;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "folder";
      item.description = `${element.files.length}`;
      return item;
    }

    if (element instanceof FileNode) {
      const fileName = element.file.path.split("/").pop() ?? element.file.path;
      const item = new vscode.TreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.None
      );
      item.id = `groups:file:${element.groupId}:${element.file.path}`;
      item.iconPath = new vscode.ThemeIcon(
        STATUS_ICONS[element.file.status] || "file"
      );
      item.contextValue = "file";
      item.tooltip = element.file.path;
      return item;
    }

    if (element instanceof ActionNode) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      );
      item.command = {
        command: `pr-splitter.${element.actionId}`,
        title: element.label,
      };
      item.iconPath = new vscode.ThemeIcon("play");
      item.contextValue = "action";
      return item;
    }

    return new vscode.TreeItem("");
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.model.active) return [];

    // Root: groups + execute action
    if (!element) {
      const nodes: TreeNode[] = [];
      for (const group of this.model.groups) {
        nodes.push(new GroupNode(group.id, group.label, group.files.length));
      }
      nodes.push(new ActionNode("executeSplit", "Execute Split"));
      return nodes;
    }

    if (element instanceof GroupNode) {
      const tree = this.getDirTree(element.groupId);
      return dirEntryToNodes(tree, "", element.groupId);
    }

    if (element instanceof FolderNode) {
      const groupId = element.groupId as number;
      const sub = lookupSubdir(this.getDirTree(groupId), element.folderPath);
      if (sub) {
        return dirEntryToNodes(sub, element.folderPath, groupId);
      }
    }

    return [];
  }

  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const files = collectDraggedFiles(source);
    if (files.length > 0) {
      pendingDragFiles = files;
      dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem("drag"));
    }
  }

  handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = dataTransfer.get(DRAG_MIME);
    if (!item || !pendingDragFiles) return;

    const files = pendingDragFiles;
    pendingDragFiles = undefined;

    // Determine target group from the drop target
    let targetGroupId: number | undefined;

    if (target instanceof GroupNode) {
      targetGroupId = target.groupId;
    } else if (target instanceof FileNode && target.groupId !== "unassigned") {
      targetGroupId = target.groupId as number;
    } else if (target instanceof FolderNode && target.groupId !== "unassigned") {
      targetGroupId = target.groupId as number;
    }

    if (targetGroupId === undefined) return;

    this.model.moveFiles(files, targetGroupId);
    this.refreshAll();
  }
}
