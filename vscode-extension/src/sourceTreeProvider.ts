import * as vscode from "vscode";
import type { SplitModel } from "./splitModel";
import { FolderNode, FileNode, type TreeNode } from "./treeNodes";
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

export class SourceTreeProvider
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
      return renderFolderItem(element, "source");
    }

    if (element instanceof FileNode) {
      return renderFileItem(element, "source");
    }

    return new vscode.TreeItem("");
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.model.active) return [];

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
      pendingDrag.set(files);
      dataTransfer.set(DRAG_MIME, new vscode.DataTransferItem("drag"));
    }
  }

  handleDrop(
    _target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = dataTransfer.get(DRAG_MIME);
    if (!item) return;

    const files = pendingDrag.take();
    if (!files) return;

    this.model.moveFiles(files, "unassigned");
    this.refreshAll();
  }
}
