import { describe, it, expect } from "vitest";
import type { SplitFile } from "../splitModel";
import { FileNode, FolderNode } from "../treeNodes";
import {
  buildDirTree,
  collectAllFiles,
  dirEntryToNodes,
  lookupSubdir,
  collectDraggedFiles,
} from "../treeHelpers";

function file(path: string, status: SplitFile["status"] = "M"): SplitFile {
  return { path, status };
}

describe("buildDirTree", () => {
  it("handles flat files", () => {
    const tree = buildDirTree([file("a.ts"), file("b.ts")]);
    expect(tree.files).toHaveLength(2);
    expect(tree.subdirs.size).toBe(0);
  });

  it("handles nested paths", () => {
    const tree = buildDirTree([
      file("src/a.ts"),
      file("src/utils/b.ts"),
      file("root.ts"),
    ]);
    expect(tree.files).toHaveLength(1);
    expect(tree.files[0].path).toBe("root.ts");
    expect(tree.subdirs.has("src")).toBe(true);

    const src = tree.subdirs.get("src")!;
    expect(src.files).toHaveLength(1);
    expect(src.subdirs.has("utils")).toBe(true);
    expect(src.subdirs.get("utils")!.files).toHaveLength(1);
  });

  it("handles empty input", () => {
    const tree = buildDirTree([]);
    expect(tree.files).toHaveLength(0);
    expect(tree.subdirs.size).toBe(0);
  });
});

describe("collectAllFiles", () => {
  it("collects files recursively", () => {
    const tree = buildDirTree([
      file("src/a.ts"),
      file("src/utils/b.ts"),
      file("root.ts"),
    ]);
    const all = collectAllFiles(tree);
    expect(all).toHaveLength(3);
    const paths = all.map((f) => f.path).sort();
    expect(paths).toEqual(["root.ts", "src/a.ts", "src/utils/b.ts"]);
  });
});

describe("dirEntryToNodes", () => {
  it("produces folders before files, both sorted", () => {
    const tree = buildDirTree([
      file("z.ts"),
      file("a.ts"),
      file("src/x.ts"),
      file("lib/y.ts"),
    ]);
    const nodes = dirEntryToNodes(tree, "", "unassigned");

    // Folders first (lib, src), then files (a.ts, z.ts)
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toBeInstanceOf(FolderNode);
    expect((nodes[0] as FolderNode).name).toBe("lib");
    expect(nodes[1]).toBeInstanceOf(FolderNode);
    expect((nodes[1] as FolderNode).name).toBe("src");
    expect(nodes[2]).toBeInstanceOf(FileNode);
    expect((nodes[2] as FileNode).file.path).toBe("a.ts");
    expect(nodes[3]).toBeInstanceOf(FileNode);
    expect((nodes[3] as FileNode).file.path).toBe("z.ts");
  });

  it("propagates groupId to nodes", () => {
    const tree = buildDirTree([file("src/a.ts")]);
    const nodes = dirEntryToNodes(tree, "", 3);
    expect((nodes[0] as FolderNode).groupId).toBe(3);
  });

  it("sets correct folderPath with parentPath", () => {
    const tree = buildDirTree([file("src/utils/a.ts")]);
    const src = tree.subdirs.get("src")!;
    const nodes = dirEntryToNodes(src, "src", "unassigned");
    expect((nodes[0] as FolderNode).folderPath).toBe("src/utils");
  });
});

describe("lookupSubdir", () => {
  it("finds a valid subdir", () => {
    const tree = buildDirTree([file("src/utils/a.ts")]);
    const sub = lookupSubdir(tree, "src/utils");
    expect(sub).toBeDefined();
    expect(sub!.files).toHaveLength(1);
  });

  it("returns undefined for invalid path", () => {
    const tree = buildDirTree([file("src/a.ts")]);
    expect(lookupSubdir(tree, "lib/utils")).toBeUndefined();
  });
});

describe("collectDraggedFiles", () => {
  it("collects files from FileNode", () => {
    const f = file("a.ts");
    const nodes = [new FileNode(f, "unassigned")];
    const result = collectDraggedFiles(nodes);
    expect(result).toEqual([f]);
  });

  it("expands FolderNode files", () => {
    const files = [file("src/a.ts"), file("src/b.ts")];
    const nodes = [new FolderNode("src", "src", "unassigned", files)];
    const result = collectDraggedFiles(nodes);
    expect(result).toHaveLength(2);
  });

  it("deduplicates files", () => {
    const f = file("a.ts");
    const nodes = [
      new FileNode(f, "unassigned"),
      new FolderNode("root", "root", "unassigned", [f]),
    ];
    const result = collectDraggedFiles(nodes);
    expect(result).toHaveLength(1);
  });
});
