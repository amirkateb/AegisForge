import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemProjectMemory } from "../../controller/src/project-memory.js";

describe("filesystem project memory", () => {
  let root = "";
  afterEach(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });

  it("persists the requested inspectable context layout atomically", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-memory-"));
    const memory = new FilesystemProjectMemory(root);
    await memory.save("project-1", {
      architecture: { layers: ["controller", "tools"] },
      dependencies: { npm: ["fastify"] },
      environment: { runtime: "node" },
      database: { engines: ["postgresql"] },
      routes: { api: ["/v1/tasks"] },
      decisions: "Keep REST v1 additive",
      knownIssues: "Live TLS needs delegated DNS",
      history: [{ outcome: "COMPLETED" }],
    });
    const directory = path.join(root, "projects", "project-1", "context");
    expect((await fs.readdir(directory)).sort()).toEqual([
      "architecture.json", "database.json", "decisions.md", "dependencies.json",
      "environment.json", "history.json", "known-issues.md", "routes.json",
    ]);
    expect((await memory.load("project-1")).decisions).toContain("REST v1");
  });
});
