import type { SplitFile } from "./splitModel";

export type TreeNode = GroupNode | FolderNode | FileNode | ActionNode;

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
