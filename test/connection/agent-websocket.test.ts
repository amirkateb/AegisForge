import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../../server/src/app.js";
import { MemoryStore } from "../../server/src/persistence/memory-store.js";
import { tokenDigest } from "../../server/src/security/auth.js";

describe("Agent WebSocket", () => {
  const sockets: WebSocket[] = [];
  afterEach(() => sockets.splice(0).forEach((socket) => socket.close()));

  it("authenticates an independent Agent identity and accepts a valid hello", async () => {
    const store = new MemoryStore();
    const token = "agent-token-that-is-long-enough-for-testing";
    const agent = await store.createAgent({
      name: "test-agent",
      environment: "TESTING",
      permissionLevel: 2,
      tokenDigest: tokenDigest(token),
    });
    const app = await buildServer({
      store,
      secrets: {
        masterApiKey: "master-test-key",
        mcpKey: "mcp-test-key",
        enrollmentKey: "enroll-test-key",
      },
      logger: false,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/v1/agent/connect`,
      { headers: { authorization: `Bearer ${token}`, "x-agent-id": agent.id } },
    );
    sockets.push(socket);
    const ack = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        socket.once("open", () =>
          socket.send(
            JSON.stringify({
              type: "HELLO",
              protocolVersion: 1,
              agentId: agent.id,
              connectionNonce:
                randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
              inventory: {
                os: {
                  platform: "linux",
                  release: "test",
                  architecture: "x64",
                  hostname: "test",
                },
                cpu: { model: "test", cores: 2, loadPercent: 1 },
                memory: { totalBytes: 1024, freeBytes: 512 },
                disks: [],
                network: [],
                runtimes: { node: "v24" },
                docker: { isInstalled: false, isRunning: false, version: null },
                databaseTools: [],
                collectedAt: new Date().toISOString(),
              },
              tools: [],
            }),
          ),
        );
        socket.once("message", (data) => resolve(JSON.parse(data.toString())));
        socket.once("error", reject);
      },
    );
    expect(ack).toMatchObject({
      type: "HELLO_ACK",
      protocolVersion: 1,
      agentId: agent.id,
    });
    expect((await store.findAgent(agent.id))?.status).toBe("ONLINE");
    await app.close();
  });

  it("executes a real assigned task through the Master-Agent protocol", async () => {
    const store = new MemoryStore();
    const token = "agent-token-that-is-long-enough-for-testing";
    const agent = await store.createAgent({
      name: "worker-agent",
      environment: "TESTING",
      permissionLevel: 3,
      tokenDigest: tokenDigest(token),
    });
    const project = await store.createProject({
      name: "sample-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/tmp/aegisforge-sample",
    });
    const task = await store.createTask({
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Read package metadata and verify the response",
      maxFixAttempts: 1,
    });
    const app = await buildServer({
      store,
      secrets: {
        masterApiKey: "master-test-key",
        mcpKey: "mcp-test-key",
        enrollmentKey: "enroll-test-key",
      },
      logger: false,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/v1/agent/connect`,
      { headers: { authorization: `Bearer ${token}`, "x-agent-id": agent.id } },
    );
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () =>
        socket.send(
          JSON.stringify({
            type: "HELLO",
            protocolVersion: 1,
            agentId: agent.id,
            connectionNonce:
              randomUUID().replaceAll("-", "") +
              randomUUID().replaceAll("-", ""),
            inventory: {
              os: {
                platform: "linux",
                release: "test",
                architecture: "x64",
                hostname: "test",
              },
              cpu: { model: "test", cores: 2, loadPercent: 1 },
              memory: { totalBytes: 1024, freeBytes: 512 },
              disks: [],
              network: [],
              runtimes: { node: "v24" },
              docker: { isInstalled: false, isRunning: false, version: null },
              databaseTools: [],
              collectedAt: new Date().toISOString(),
            },
            tools: [
              {
                name: "filesystem.read",
                description: "Read a test file",
                requiredLevel: 0,
                risk: "LOW",
                approval: "NEVER",
                inputSchema: { type: "object" },
                timeoutMs: 5000,
              },
              {
                name: "filesystem.delete",
                description: "Delete a test file",
                requiredLevel: 3,
                risk: "HIGH",
                approval: "ALWAYS",
                inputSchema: { type: "object" },
                timeoutMs: 5000,
              },
            ],
          }),
        ),
      );
      socket.once("message", () => resolve());
      socket.once("error", reject);
    });
    socket.on("message", (data) => {
      const value = JSON.parse(data.toString()) as {
        type?: string;
        dispatchId?: string;
        intent?: { arguments?: { path?: string } };
      };
      if (value.type === "DISPATCH") {
        const shouldFail = value.intent?.arguments?.path === "missing.json";
        socket.send(
          JSON.stringify({
            type: "RESULT",
            protocolVersion: 1,
            dispatchId: value.dispatchId,
            ok: !shouldFail,
            ...(shouldFail
              ? { error: "ENOENT: missing.json" }
              : { result: { content: '{"name":"sample"}' } }),
          }),
        );
      }
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/tools/run`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: {
        toolName: "filesystem.read",
        arguments: { path: "package.json" },
        reason: "Understand package metadata",
        expectedImpact: "Read-only inspection",
        affectedResources: ["package.json"],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "EXECUTED",
      result: { content: '{"name":"sample"}' },
    });
    expect(response.json().stepId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await store.findTask(task.id))?.status).toBe("EXECUTING");

    const failed = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/tools/run`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: {
        toolName: "filesystem.read",
        arguments: { path: "missing.json" },
        reason: "Inspect a missing file",
        expectedImpact: "Read-only inspection",
        affectedResources: ["missing.json"],
      },
    });
    expect(failed.statusCode).toBe(500);
    await expect
      .poll(async () =>
        (await store.listAudits()).some(
          (event) =>
            event.action === "agent.tool.failed" &&
            event.status === "FAILED" &&
            event.metadata.error === "ENOENT: missing.json",
        ),
      )
      .toBe(true);

    const deletePayload = {
      toolName: "filesystem.delete",
      arguments: { path: "obsolete.txt" },
      reason: "Remove the obsolete test file",
      expectedImpact: "One obsolete file is deleted",
      affectedResources: ["obsolete.txt"],
    };
    const approvalRequired = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/tools/run`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: deletePayload,
    });
    expect(approvalRequired.statusCode).toBe(202);
    expect(approvalRequired.json()).toMatchObject({
      status: "APPROVAL_REQUIRED",
    });
    const { stepId, approval } = approvalRequired.json() as {
      stepId: string;
      approval: { id: string };
    };
    const decision = await app.inject({
      method: "POST",
      url: `/v1/approvals/${approval.id}/decision`,
      headers: { authorization: "Bearer master-test-key" },
      payload: { decision: "APPROVE_ONCE" },
    });
    expect(decision.statusCode).toBe(200);
    const approved = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/tools/run`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: { ...deletePayload, stepId, approvalId: approval.id },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ status: "EXECUTED", stepId });

    await store.updateAgentAccessMode(agent.id, "FULL_TRUST");
    const trusted = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/tools/run`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: {
        ...deletePayload,
        arguments: { path: "another-obsolete.txt" },
        affectedResources: ["another-obsolete.txt"],
      },
    });
    expect(trusted.statusCode).toBe(200);
    expect(trusted.json()).toMatchObject({ status: "EXECUTED" });
    expect(await store.listApprovals()).toHaveLength(1);
    await app.close();
  });

  it("runs the autonomous Observe-to-Learn controller against a connected Agent", async () => {
    const store = new MemoryStore();
    const token = "agent-token-that-is-long-enough-for-autonomous-test";
    const agent = await store.createAgent({
      name: "brain-agent",
      environment: "TESTING",
      permissionLevel: 2,
      tokenDigest: tokenDigest(token),
    });
    const project = await store.createProject({
      name: "brain-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/tmp/aegis-brain",
    });
    const app = await buildServer({
      store,
      secrets: {
        masterApiKey: "master-test-key",
        mcpKey: "mcp-test-key",
        enrollmentKey: "enroll-test-key",
      },
      logger: false,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/v1/agent/connect`,
      { headers: { authorization: `Bearer ${token}`, "x-agent-id": agent.id } },
    );
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () =>
        socket.send(
          JSON.stringify({
            type: "HELLO",
            protocolVersion: 1,
            agentId: agent.id,
            connectionNonce:
              randomUUID().replaceAll("-", "") +
              randomUUID().replaceAll("-", ""),
            inventory: {
              os: {
                platform: "linux",
                release: "test",
                architecture: "x64",
                hostname: "brain",
              },
              cpu: { model: "test", cores: 2, loadPercent: 1 },
              memory: { totalBytes: 1024, freeBytes: 800 },
              disks: [],
              network: [],
              runtimes: { node: "v24" },
              docker: { isInstalled: false, isRunning: false, version: null },
              databaseTools: [],
              collectedAt: new Date().toISOString(),
            },
            tools: ["filesystem.list", "filesystem.read"].map((name) => ({
              name,
              description: `Test ${name}`,
              requiredLevel: 0,
              risk: "LOW",
              approval: "NEVER",
              inputSchema: { type: "object" },
              timeoutMs: 5000,
            })),
          }),
        ),
      );
      socket.once("message", () => resolve());
      socket.once("error", reject);
    });
    socket.on("message", (data) => {
      const dispatch = JSON.parse(data.toString()) as {
        type?: string;
        dispatchId?: string;
        tool?: { name?: string };
        intent?: { arguments?: { path?: string } };
      };
      if (dispatch.type !== "DISPATCH") return;
      const result =
        dispatch.tool?.name === "filesystem.list"
          ? { files: ["package.json", "src/index.ts"], truncated: false }
          : {
              content:
                dispatch.intent?.arguments?.path === "package.json"
                  ? '{"dependencies":{"fastify":"^5"}}'
                  : "export function main() { return true; }",
            };
      socket.send(
        JSON.stringify({
          type: "RESULT",
          protocolVersion: 1,
          dispatchId: dispatch.dispatchId,
          ok: true,
          result,
        }),
      );
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        authorization: "Bearer mcp-test-key",
        "idempotency-key": "autonomous-task-1",
      },
      payload: {
        projectId: project.id,
        agentId: agent.id,
        workspaceId: workspace.id,
        goal: "Understand and inspect this project",
        plan: {
          summary: "Inspect the project manifest",
          assumptions: [],
          steps: [
            {
              title: "Read project manifest",
              description: "Read package metadata",
              toolName: "filesystem.read",
              arguments: { path: "package.json" },
              verification: "Manifest content is returned",
            },
          ],
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const taskId = created.json().id as string;
    await expect
      .poll(async () => (await store.findTask(taskId))?.status, {
        timeout: 3000,
      })
      .toBe("COMPLETED");
    const context = await store.loadProjectContext(project.id);
    expect(context.codeIndex).toMatchObject({ filesIndexed: 1 });
    expect(context.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId, outcome: "COMPLETED" }),
      ]),
    );
    await app.close();
  });
});
