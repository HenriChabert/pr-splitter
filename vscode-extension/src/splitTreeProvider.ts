import * as vscode from "vscode";
import type { SplitFile, SplitModel } from "./splitModel";

const MIME_TYPE = "application/vnd.code.tree.prSplitterView";

// Tree item types
type TreeNode = GroupNode | FolderNode | FileNode | ActionNode;

export class GroupNode {
  constructor(
    public readonly groupId: number | "unassigned",
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

interface DirEntry {
  files: SplitFile[];
  subdirs: Map<string, DirEntry>;
}

/** Build a directory tree from a flat list of files. */
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

/** Collect all files under a directory entry recursively. */
function collectAllFiles(entry: DirEntry): SplitFile[] {
  const result: SplitFile[] = [...entry.files];
  for (const sub of entry.subdirs.values()) {
    result.push(...collectAllFiles(sub));
  }
  return result;
}

/** Convert a DirEntry's children into tree nodes. */
function dirEntryToNodes(
  entry: DirEntry,
  parentPath: string,
  groupId: number | "unassigned"
): TreeNode[] {
  const nodes: TreeNode[] = [];

  // Sort subdirectories first, then files
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

export class SplitTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode>
{
  readonly dropMimeTypes = [MIME_TYPE];
  readonly dragMimeTypes = [MIME_TYPE];

  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Cache directory trees per group so getChildren can look up subtrees
  private dirTreeCache = new Map<number | "unassigned", DirEntry>();

  constructor(private model: SplitModel) {}

  refresh(): void {
    this.dirTreeCache.clear();
    this._onDidChangeTreeData.fire();
  }

  private getDirTree(groupId: number | "unassigned"): DirEntry {
    if (!this.dirTreeCache.has(groupId)) {
      const files =
        groupId === "unassigned"
          ? this.model.unassigned
          : this.model.groups.find((g) => g.id === groupId)?.files ?? [];
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
      item.iconPath = new vscode.ThemeIcon(
        element.groupId === "unassigned" ? "inbox" : "git-pull-request"
      );
      item.contextValue =
        element.groupId === "unassigned" ? "unassigned-group" : "group";
      return item;
    }

    if (element instanceof FolderNode) {
      const item = new vscode.TreeItem(
        element.name,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "folder";
      item.description = `${element.files.length} file${element.files.length === 1 ? "" : "s"}`;
      return item;
    }

    if (element instanceof FileNode) {
      const statusIcon: Record<string, string> = {
        A: "diff-added",
        M: "diff-modified",
        D: "diff-removed",
        R: "diff-renamed",
      };
      const fileName = element.file.path.split("/").pop() ?? element.file.path;
      const item = new vscode.TreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon(statusIcon[element.file.status] || "file");
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
      item.iconPath = new vscode.ThemeIcon(
        element.actionId === "executeSplit" ? "play" : "close"
      );
      item.contextValue = "action";
      return item;
    }

    return new vscode.TreeItem("");
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.model.active) {
      return [];
    }

    // Root level
    if (!element) {
      const nodes: TreeNode[] = [];

      // Unassigned group
      nodes.push(
        new GroupNode("unassigned", "Unassigned", this.model.unassigned.length)
      );

      // PR groups
      for (const group of this.model.groups) {
        nodes.push(new GroupNode(group.id, group.label, group.files.length));
      }

      // Actions
      nodes.push(new ActionNode("executeSplit", "Execute Split"));

      return nodes;
    }

    // Group children — build directory tree
    if (element instanceof GroupNode) {
      const tree = this.getDirTree(element.groupId);
      return dirEntryToNodes(tree, "", element.groupId);
    }

    // Folder children — look up subtree
    if (element instanceof FolderNode) {
      const tree = this.getDirTree(element.groupId);
      const parts = element.folderPath.split("/");
      let current = tree;
      for (const part of parts) {
        const sub = current.subdirs.get(part);
        if (!sub) return [];
        current = sub;
      }
      return dirEntryToNodes(current, element.folderPath, element.groupId);
    }

    return [];
  }

  // Drag and Drop

  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const fileNodes: FileNode[] = [];

    for (const node of source) {
      if (node instanceof FileNode) {
        fileNodes.push(node);
      } else if (node instanceof FolderNode) {
        // Drag an entire folder — include all files within
        for (const file of node.files) {
          fileNodes.push(new FileNode(file, node.groupId));
        }
      }
    }

    if (fileNodes.length > 0) {
      // Deduplicate by file path
      const seen = new Set<string>();
      const unique = fileNodes.filter((n) => {
        if (seen.has(n.file.path)) return false;
        seen.add(n.file.path);
        return true;
      });
      dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(unique));
    }
  }

  handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = dataTransfer.get(MIME_TYPE);
    if (!item) return;

    const draggedNodes: FileNode[] = item.value;
    if (!draggedNodes || draggedNodes.length === 0) return;

    // Determine target group
    let targetGroupId: number | "unassigned" | undefined;

    if (target instanceof GroupNode) {
      targetGroupId = target.groupId;
    } else if (target instanceof FileNode) {
      targetGroupId = target.groupId;
    } else if (target instanceof FolderNode) {
      targetGroupId = target.groupId;
    }

    if (targetGroupId === undefined) return;

    // Move files
    const files = draggedNodes.map((n) => n.file);
    this.model.moveFiles(files, targetGroupId);
    this.refresh();
  }
}
