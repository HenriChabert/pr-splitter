export interface SplitFile {
  path: string;
  status: "A" | "M" | "D" | "R";
}

export interface SplitGroup {
  id: number;
  label: string;
  files: SplitFile[];
}

export class SplitModel {
  groups: SplitGroup[] = [];
  unassigned: SplitFile[] = [];
  baseBranch = "main";
  sourceBranch = "";
  active = false;

  startSplit(
    numPrs: number,
    files: SplitFile[],
    baseBranch: string,
    sourceBranch: string
  ): void {
    if (numPrs < 1) {
      throw new Error("numPrs must be at least 1");
    }
    if (!baseBranch) {
      throw new Error("baseBranch is required");
    }
    if (!sourceBranch) {
      throw new Error("sourceBranch is required");
    }
    if (files.length === 0) {
      throw new Error("files must not be empty");
    }

    this.baseBranch = baseBranch;
    this.sourceBranch = sourceBranch;
    this.unassigned = [...files];
    this.groups = [];
    for (let i = 0; i < numPrs; i++) {
      this.groups.push({
        id: i + 1,
        label: `PR ${i + 1}`,
        files: [],
      });
    }
    this.active = true;
  }

  moveFiles(
    files: SplitFile[],
    targetGroupId: number | "unassigned"
  ): boolean {
    if (
      targetGroupId !== "unassigned" &&
      !this.groups.some((g) => g.id === targetGroupId)
    ) {
      return false;
    }

    const filePaths = new Set(files.map((f) => f.path));

    // Remove from unassigned
    this.unassigned = this.unassigned.filter((f) => !filePaths.has(f.path));

    // Remove from all groups
    for (const group of this.groups) {
      group.files = group.files.filter((f) => !filePaths.has(f.path));
    }

    // Add to target
    if (targetGroupId === "unassigned") {
      this.unassigned.push(...files);
    } else {
      const target = this.groups.find((g) => g.id === targetGroupId);
      if (target) {
        target.files.push(...files);
      }
    }

    return true;
  }

  renameGroup(groupId: number, label: string): boolean {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return false;
    group.label = label;
    return true;
  }

  deleteGroup(groupId: number): boolean {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return false;
    this.unassigned.push(...group.files);
    this.groups = this.groups.filter((g) => g.id !== groupId);
    return true;
  }

  reset(): void {
    this.groups = [];
    this.unassigned = [];
    this.active = false;
    this.baseBranch = "main";
    this.sourceBranch = "";
  }

  /** Build --assign args for the CLI. */
  getAssignArgs(): string[] {
    const args: string[] = [];
    for (const group of this.groups) {
      for (const file of group.files) {
        args.push("--assign", `${group.id}:${file.path}`);
      }
    }
    return args;
  }

  /** Build --title args for the CLI. */
  getTitleArgs(): string[] {
    const args: string[] = [];
    for (const group of this.groups) {
      if (group.label !== `PR ${group.id}`) {
        args.push("--title", `${group.id}:${group.label}`);
      }
    }
    return args;
  }

  get numPrs(): number {
    return this.groups.length;
  }

  get canExecute(): boolean {
    return (
      this.active &&
      this.groups.length > 0 &&
      this.groups.some((g) => g.files.length > 0)
    );
  }
}
