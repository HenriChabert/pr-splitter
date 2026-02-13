import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SplitFile } from "../splitModel";

function file(path: string): SplitFile {
  return { path, status: "M" };
}

describe("pendingDrag", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  it("set + take returns files then undefined", async () => {
    const { pendingDrag } = await import("../dragState");
    const files = [file("a.ts")];
    pendingDrag.set(files);

    expect(pendingDrag.take()).toEqual(files);
    expect(pendingDrag.take()).toBeUndefined();
  });

  it("second set overwrites first", async () => {
    const { pendingDrag } = await import("../dragState");
    const first = [file("a.ts")];
    const second = [file("b.ts")];

    pendingDrag.set(first);
    pendingDrag.set(second);

    expect(pendingDrag.take()).toEqual(second);
  });

  it("take without set returns undefined", async () => {
    const { pendingDrag } = await import("../dragState");
    expect(pendingDrag.take()).toBeUndefined();
  });

  it("clear removes pending state", async () => {
    const { pendingDrag } = await import("../dragState");
    pendingDrag.set([file("a.ts")]);
    pendingDrag.clear();

    expect(pendingDrag.take()).toBeUndefined();
  });

  it("auto-clears after timeout", async () => {
    const { pendingDrag } = await import("../dragState");
    pendingDrag.set([file("a.ts")]);

    vi.advanceTimersByTime(10_000);

    expect(pendingDrag.take()).toBeUndefined();
  });
});
