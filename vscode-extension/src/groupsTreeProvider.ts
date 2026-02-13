import * as vscode from "vscode";
import type { SplitModel } from "./splitModel";
import {
  GroupNode,
  FolderNode,
  FileNode,
  ActionNode,
  type TreeNode,
} from "./treeNodes";
import {
  DRAG_MIME,
  type DirEntry,
  buildDirTree,
  dirEntryToNodes,
  lookupSubdir,
  collectDraggedFiles,
  renderFolderItem,
  renderFileItem,
} from "./treeHelpers";
import { pendingDrag } from "./dragState";

export class GroupsTreeProvider
  implements
    vscode.TreeDataProvider<TreeNode>,
    vscode.TreeDragAndDropController<TreeNode>
{
  readonly dropMimeTypes = [DRAG_MIME];
  readonly dragMimeTypes = [DRAG_MIME];

  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
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
      const files =
        this.model.groups.find((g) => g.id === groupId)?.files ?? [];
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
      return renderFolderItem(element, `groups:${element.groupId}`);
    }

    if (element instanceof FileNode) {
      return renderFileItem(element, `groups:${element.groupId}`);
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
      pendingDrag.set(files);
      dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem("drag"));
    }
  }

  handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = dataTransfer.get(DRAG_MIME);
    if (!item) return;

    const files = pendingDrag.take();
    if (!files) return;

    let targetGroupId: number | undefined;

    if (target instanceof GroupNode) {
      targetGroupId = target.groupId;
    } else if (target instanceof FileNode && target.groupId !== "unassigned") {
      targetGroupId = target.groupId as number;
    } else if (
      target instanceof FolderNode &&
      target.groupId !== "unassigned"
    ) {
      targetGroupId = target.groupId as number;
    }

    if (targetGroupId === undefined) return;

    this.model.moveFiles(files, targetGroupId);
    this.refreshAll();
  }
}
