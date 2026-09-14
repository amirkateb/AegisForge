import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceGuard } from "../../agent/src/security/workspace-guard.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("WorkspaceGuard", () => {
  it("allows files under the canonical workspace root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    created.push(root);
    const guard = await WorkspaceGuard.create(root);
    expect(await guard.resolve("src/index.ts")).toBe(
      path.join(root, "src/index.ts"),
    );
  });

  it("rejects parent traversal and symlink escape", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-workspace-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-outside-"));
    created.push(root, outside);
    await fs.symlink(outside, path.join(root, "escape"));
    const guard = await WorkspaceGuard.create(root);
    await expect(guard.resolve("../private.txt")).rejects.toThrow(
      /outside workspace/,
    );
    await expect(guard.resolve("escape/private.txt")).rejects.toThrow(
      /outside workspace/,
    );
  });
});
