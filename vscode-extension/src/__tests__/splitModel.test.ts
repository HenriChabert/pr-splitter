import { describe, it, expect, beforeEach } from "vitest";
import { SplitModel, type SplitFile } from "../splitModel";

function file(path: string, status: SplitFile["status"] = "M"): SplitFile {
  return { path, status };
}

describe("SplitModel", () => {
  let model: SplitModel;

  beforeEach(() => {
    model = new SplitModel();
  });

  describe("startSplit", () => {
    it("creates groups and sets state", () => {
      const files = [file("a.ts"), file("b.ts")];
      model.startSplit(3, files, "main", "feature");

      expect(model.active).toBe(true);
      expect(model.groups).toHaveLength(3);
      expect(model.groups[0].id).toBe(1);
      expect(model.groups[0].label).toBe("PR 1");
      expect(model.groups[2].id).toBe(3);
      expect(model.unassigned).toHaveLength(2);
      expect(model.baseBranch).toBe("main");
      expect(model.sourceBranch).toBe("feature");
    });

    it("throws if numPrs < 1", () => {
      expect(() => model.startSplit(0, [file("a.ts")], "main", "feat")).toThrow(
        "numPrs must be at least 1"
      );
    });

    it("throws if baseBranch is empty", () => {
      expect(() => model.startSplit(2, [file("a.ts")], "", "feat")).toThrow(
        "baseBranch is required"
      );
    });

    it("throws if sourceBranch is empty", () => {
      expect(() => model.startSplit(2, [file("a.ts")], "main", "")).toThrow(
        "sourceBranch is required"
      );
    });

    it("throws if files is empty", () => {
      expect(() => model.startSplit(2, [], "main", "feat")).toThrow(
        "files must not be empty"
      );
    });
  });

  describe("moveFiles", () => {
    beforeEach(() => {
      model.startSplit(2, [file("a.ts"), file("b.ts"), file("c.ts")], "main", "feat");
    });

    it("moves files to a group", () => {
      model.moveFiles([file("a.ts")], 1);
      expect(model.unassigned).toHaveLength(2);
      expect(model.groups[0].files).toHaveLength(1);
      expect(model.groups[0].files[0].path).toBe("a.ts");
    });

    it("moves files back to unassigned", () => {
      model.moveFiles([file("a.ts")], 1);
      model.moveFiles([file("a.ts")], "unassigned");
      expect(model.unassigned).toHaveLength(3);
      expect(model.groups[0].files).toHaveLength(0);
    });

    it("returns false for invalid target group", () => {
      const result = model.moveFiles([file("a.ts")], 99);
      expect(result).toBe(false);
    });

    it("returns true for valid moves", () => {
      expect(model.moveFiles([file("a.ts")], 1)).toBe(true);
      expect(model.moveFiles([file("a.ts")], "unassigned")).toBe(true);
    });
  });

  describe("renameGroup", () => {
    beforeEach(() => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
    });

    it("renames an existing group", () => {
      const result = model.renameGroup(1, "Auth changes");
      expect(result).toBe(true);
      expect(model.groups[0].label).toBe("Auth changes");
    });

    it("returns false for invalid group id", () => {
      expect(model.renameGroup(99, "nope")).toBe(false);
    });
  });

  describe("deleteGroup", () => {
    beforeEach(() => {
      model.startSplit(2, [file("a.ts"), file("b.ts")], "main", "feat");
      model.moveFiles([file("a.ts")], 1);
    });

    it("deletes group and returns files to unassigned", () => {
      const result = model.deleteGroup(1);
      expect(result).toBe(true);
      expect(model.groups).toHaveLength(1);
      expect(model.unassigned).toHaveLength(2);
    });

    it("returns false for invalid group id", () => {
      expect(model.deleteGroup(99)).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      model.reset();
      expect(model.active).toBe(false);
      expect(model.groups).toHaveLength(0);
      expect(model.unassigned).toHaveLength(0);
      expect(model.baseBranch).toBe("main");
      expect(model.sourceBranch).toBe("");
    });
  });

  describe("numPrs", () => {
    it("returns the number of groups", () => {
      model.startSplit(3, [file("a.ts")], "main", "feat");
      expect(model.numPrs).toBe(3);
    });
  });

  describe("canExecute", () => {
    it("returns false when inactive", () => {
      expect(model.canExecute).toBe(false);
    });

    it("returns false when no group has files", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      expect(model.canExecute).toBe(false);
    });

    it("returns true when at least one group has files", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      model.moveFiles([file("a.ts")], 1);
      expect(model.canExecute).toBe(true);
    });
  });

  describe("getAssignArgs", () => {
    it("produces correct CLI args", () => {
      model.startSplit(2, [file("a.ts"), file("b.ts")], "main", "feat");
      model.moveFiles([file("a.ts")], 1);
      model.moveFiles([file("b.ts")], 2);

      const args = model.getAssignArgs();
      expect(args).toEqual([
        "--assign", "1:a.ts",
        "--assign", "2:b.ts",
      ]);
    });

    it("returns empty array when no files assigned", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      expect(model.getAssignArgs()).toEqual([]);
    });
  });

  describe("getTitleArgs", () => {
    it("includes only renamed groups", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      model.renameGroup(1, "Auth changes");

      const args = model.getTitleArgs();
      expect(args).toEqual(["--title", "1:Auth changes"]);
    });

    it("skips groups with default labels", () => {
      model.startSplit(2, [file("a.ts")], "main", "feat");
      expect(model.getTitleArgs()).toEqual([]);
    });
  });
});
