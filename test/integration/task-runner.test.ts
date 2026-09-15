import { describe, expect, it } from "vitest";
import type { AgentHub } from "../../server/src/agents/agent-hub.js";
import { MemoryStore } from "../../server/src/persistence/memory-store.js";
import { TaskRunner } from "../../server/src/task-runner.js";

const tool = (
  name: string,
  risk: "LOW" | "HIGH",
  approval: "NEVER" | "ALWAYS",
) => ({
  name,
  description: name,
  requiredLevel: risk === "LOW" ? (0 as const) : (3 as const),
  risk,
  approval,
  inputSchema: { type: "object" },
  timeoutMs: 5000,
});

describe("autonomous task runner approvals", () => {
  it("pauses a production effect and resumes the exact approved step", async () => {
    const store = new MemoryStore();
    const agent = await store.createAgent({
      name: "production-agent",
      environment: "PRODUCTION",
      permissionLevel: 3,
      tokenDigest: "digest",
    });
    await store.updateAgentPresence(
      agent.id,
      {
        cpu: { loadPercent: 1 },
        memory: { totalBytes: 100, freeBytes: 90 },
        runtimes: { node: "22" },
      },
      new Date(),
    );
    const project = await store.createProject({
      name: "runner-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/runner",
    });
    const task = await store.createTask({
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Restart and verify the service",
      maxFixAttempts: 1,
    });
    await store.saveTaskPlan(task.id, {
      summary: "Restart the production service",
      assumptions: [],
      steps: [
        {
          title: "Restart service",
          description: "Apply the reviewed restart",
          toolName: "system.service.control",
          arguments: { name: "aegisforge", action: "restart" },
          verification: "Service is active",
        },
      ],
    });
    const tools = [
      tool("filesystem.list", "LOW", "NEVER"),
      tool("filesystem.read", "LOW", "NEVER"),
      tool("system.service.control", "HIGH", "ALWAYS"),
    ];
    let serviceCalls = 0;
    const hub = {
      connectedAgentIds: () => [agent.id],
      connectedTools: () => [{ agentId: agent.id, tools }],
      getTool: (_agentId: string, name: string) =>
        tools.find((item) => item.name === name) ?? null,
      async dispatch(
        _agentId: string,
        input: {
          tool: { name: string };
          intent: { arguments: Record<string, unknown> };
        },
      ) {
        if (input.tool.name === "filesystem.list")
          return { files: ["package.json"] };
        if (input.tool.name === "filesystem.read") return { content: "{}" };
        serviceCalls++;
        return { code: 0, stdout: "active" };
      },
    } as unknown as AgentHub;
    const runner = new TaskRunner(store, hub);

    expect(await runner.run(task.id)).toMatchObject({
      status: "WAITING_APPROVAL",
    });
    expect(serviceCalls).toBe(0);
    const approval = (await store.listApprovals())[0]!;
    await store.decideApproval(approval.id, "APPROVE_ONCE", new Date());
    expect(await runner.run(task.id)).toMatchObject({ status: "COMPLETED" });
    expect(serviceCalls).toBe(1);
    expect((await store.findApproval(approval.id))?.status).toBe("EXPIRED");

    const interactiveTask = await store.createTask({
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Let the private GPT inspect interactively",
      maxFixAttempts: 1,
    });
    expect(await runner.run(interactiveTask.id)).toMatchObject({
      status: "QUEUED",
      detail: { code: "PLAN_REQUIRED" },
    });
    expect((await store.findTask(interactiveTask.id))?.status).toBe("QUEUED");
  });

  it("runs an ALWAYS production tool without creating approval in full-trust mode", async () => {
    const store = new MemoryStore();
    const created = await store.createAgent({
      name: "trusted-agent",
      environment: "PRODUCTION",
      permissionLevel: 1,
      tokenDigest: "digest",
    });
    const agent = await store.updateAgentAccessMode(created.id, "FULL_TRUST");
    await store.updateAgentPresence(agent!.id, {}, new Date());
    const project = await store.createProject({
      name: "trusted-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent!.id,
      rootPath: "/srv/trusted",
    });
    const task = await store.createTask({
      projectId: project.id,
      agentId: agent!.id,
      workspaceId: workspace.id,
      goal: "Restart without approval",
      maxFixAttempts: 0,
    });
    await store.saveTaskPlan(task.id, {
      summary: "Restart without approval",
      assumptions: [],
      steps: [
        {
          title: "Restart trusted service",
          description: "Restart the service",
          toolName: "system.service.control",
          arguments: { name: "trusted", action: "restart" },
          verification: "Command exits successfully",
        },
      ],
    });
    const tools = [
      tool("filesystem.list", "LOW", "NEVER"),
      tool("filesystem.read", "LOW", "NEVER"),
      tool("system.service.control", "HIGH", "ALWAYS"),
    ];
    const dispatchModes: string[] = [];
    const hub = {
      connectedAgentIds: () => [agent!.id],
      connectedTools: () => [{ agentId: agent!.id, tools }],
      getTool: (_agentId: string, name: string) =>
        tools.find((item) => item.name === name) ?? null,
      async dispatch(
        _agentId: string,
        input: { tool: { name: string }; accessMode: string },
      ) {
        dispatchModes.push(input.accessMode);
        if (input.tool.name === "filesystem.list")
          return { files: ["package.json"] };
        if (input.tool.name === "filesystem.read") return { content: "{}" };
        return { code: 0 };
      },
    } as unknown as AgentHub;

    expect(await new TaskRunner(store, hub).run(task.id)).toMatchObject({
      status: "COMPLETED",
    });
    expect(await store.listApprovals()).toEqual([]);
    expect(dispatchModes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(dispatchModes)).toEqual(new Set(["FULL_TRUST"]));
  });
});
