import { describe, it, expect, vi, beforeEach } from "vitest";
import { shellEscape } from "../gitHelper";

// Mock child_process, fs, os, path, and vscode before importing getChangedFiles
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  unlink: vi.fn(),
}));

describe("shellEscape", () => {
  it("returns safe strings unchanged", () => {
    expect(shellEscape("hello")).toBe("hello");
    expect(shellEscape("src/file.ts")).toBe("src/file.ts");
    expect(shellEscape("--num-prs")).toBe("--num-prs");
    expect(shellEscape("1:src/a.ts")).toBe("1:src/a.ts");
  });

  it("wraps strings with spaces in single quotes", () => {
    expect(shellEscape("hello world")).toBe("'hello world'");
  });

  it("escapes single quotes", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it("wraps strings with special characters", () => {
    expect(shellEscape("a&b")).toBe("'a&b'");
    expect(shellEscape("a;b")).toBe("'a;b'");
    expect(shellEscape("$(cmd)")).toBe("'$(cmd)'");
  });
});

describe("getChangedFiles", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses A/M/D/R status correctly", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    // First call: merge-base
    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "abc123\n", "");
        return {} as any;
      }
    );
    // Second call: diff
    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "A\tnew.ts\nM\tmod.ts\nD\tdel.ts\nR\tren.ts\n", "");
        return {} as any;
      }
    );

    const { getChangedFiles } = await import("../gitHelper");
    const files = await getChangedFiles("/repo", "main");

    expect(files).toHaveLength(4);
    expect(files.map((f) => f.status)).toEqual(["D", "M", "A", "R"]);
  });

  it("returns empty array for empty output", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "abc123\n", "");
        return {} as any;
      }
    );
    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "", "");
        return {} as any;
      }
    );

    const { getChangedFiles } = await import("../gitHelper");
    const files = await getChangedFiles("/repo", "main");
    expect(files).toEqual([]);
  });

  it("handles CRLF line endings", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "abc123\r\n", "");
        return {} as any;
      }
    );
    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "A\ta.ts\r\nM\tb.ts\r\n", "");
        return {} as any;
      }
    );

    const { getChangedFiles } = await import("../gitHelper");
    const files = await getChangedFiles("/repo", "main");
    expect(files).toHaveLength(2);
  });

  it("rejects on git failure", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error("git failed"), "", "fatal: not a repo");
        return {} as any;
      }
    );

    const { getChangedFiles } = await import("../gitHelper");
    await expect(getChangedFiles("/repo", "main")).rejects.toThrow(
      "fatal: not a repo"
    );
  });

  it("sorts files alphabetically", async () => {
    const { execFile } = await import("child_process");
    const mockedExecFile = vi.mocked(execFile);

    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "abc123\n", "");
        return {} as any;
      }
    );
    mockedExecFile.mockImplementationOnce(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "M\tz.ts\nM\ta.ts\nM\tm.ts\n", "");
        return {} as any;
      }
    );

    const { getChangedFiles } = await import("../gitHelper");
    const files = await getChangedFiles("/repo", "main");
    expect(files.map((f) => f.path)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });
});
