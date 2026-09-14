import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../server/src/persistence/memory-store.js";
import { PersistentWorkflow } from "../../server/src/controller-workflow.js";

describe("persistent engineering workflow", () => {
  it("stores project understanding, plans and redacted evidence for resume", async () => {
    const store = new MemoryStore();
    const agent = await store.createAgent({
      name: "memory-agent",
      environment: "TESTING",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "memory-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/tmp/memory",
    });
    const task = await store.createTask({
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Persist a resumable plan",
      maxFixAttempts: 1,
    });
    const workflow = new PersistentWorkflow(store);
    await workflow.saveProfile(project.id, {
      framework: ["Node.js"],
      dependencies: [],
      databases: [],
      routes: [],
      architecture: ["modular"],
      importantFiles: ["package.json"],
    });
    await workflow.savePlan(task.id, {
      summary: "Inspect and verify",
      assumptions: [],
      steps: [
        {
          title: "Read manifest",
          description: "Inspect package metadata",
          toolName: "filesystem.read",
          arguments: { path: "package.json" },
          verification: "Manifest parses",
        },
      ],
    });
    await workflow.recordEvidence(task.id, 0, {
      status: "ok",
      token: "must-not-persist",
    });
    const steps = await store.listTaskSteps(task.id);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.state).toBe("VERIFIED");
    expect(JSON.stringify(steps[0]?.evidence)).not.toContain(
      "must-not-persist",
    );
  });
});
