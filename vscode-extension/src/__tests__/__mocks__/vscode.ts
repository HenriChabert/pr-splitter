export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  id?: string;
  iconPath?: unknown;
  contextValue?: string;
  description?: string;
  tooltip?: string;
  command?: unknown;

  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None
  ) {}
}

export class ThemeIcon {
  static readonly Folder = new ThemeIcon("folder");

  constructor(public readonly id: string) {}
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}

export class DataTransferItem {
  constructor(public readonly value: unknown) {}
}
