import type { SplitFile } from "./splitModel";

let pending: SplitFile[] | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const AUTO_CLEAR_MS = 10_000;

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

export const pendingDrag = {
  set(files: SplitFile[]): void {
    clearTimer();
    pending = files;
    timer = setTimeout(() => {
      pending = undefined;
      timer = undefined;
    }, AUTO_CLEAR_MS);
  },

  take(): SplitFile[] | undefined {
    clearTimer();
    const files = pending;
    pending = undefined;
    return files;
  },

  clear(): void {
    clearTimer();
    pending = undefined;
  },
};
