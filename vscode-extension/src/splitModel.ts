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

  startSplit(numPrs: number, files: SplitFile[], baseBranch: string, sourceBranch: string): void {
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

  moveFiles(files: SplitFile[], targetGroupId: number | "unassigned"): void {
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
  }

  renameGroup(groupId: number, label: string): void {
    const group = this.groups.find((g) => g.id === groupId);
    if (group) {
      group.label = label;
    }
  }

  deleteGroup(groupId: number): void {
    const group = this.groups.find((g) => g.id === groupId);
    if (group) {
      this.unassigned.push(...group.files);
      this.groups = this.groups.filter((g) => g.id !== groupId);
    }
  }

  reset(): void {
    this.groups = [];
    this.unassigned = [];
    this.active = false;
    this.baseBranch = "main";
    this.sourceBranch = "";
  }

  /** Build --assign args for the CLI. Groups files by exact path. */
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
      // Only include if label was changed from default
      if (group.label !== `PR ${group.id}`) {
        args.push("--title", `${group.id}:${group.label}`);
      }
    }
    return args;
  }

  /** Number of groups (for --num-prs). */
  get numPrs(): number {
    return this.groups.length;
  }

  /** Whether the split can be executed (all files assigned, at least one group with files). */
  get canExecute(): boolean {
    return (
      this.active &&
      this.groups.length > 0 &&
      this.groups.some((g) => g.files.length > 0)
    );
  }
}
