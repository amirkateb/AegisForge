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
      permissionLevel: 2,
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
      };
      if (value.type === "DISPATCH")
        socket.send(
          JSON.stringify({
            type: "RESULT",
            protocolVersion: 1,
            dispatchId: value.dispatchId,
            ok: true,
            result: { content: '{"name":"sample"}' },
          }),
        );
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/tools/run",
      headers: { authorization: "Bearer master-test-key" },
      payload: {
        taskId: task.id,
        projectId: project.id,
        agentId: agent.id,
        workspaceId: workspace.id,
        stepId: randomUUID(),
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
    expect((await store.findTask(task.id))?.status).toBe("EXECUTING");
    await app.close();
  });
});
