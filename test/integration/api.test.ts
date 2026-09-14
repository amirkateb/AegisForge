import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../server/src/app.js";
import { MemoryStore } from "../../server/src/persistence/memory-store.js";

describe("Master REST API", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const masterHeaders = { authorization: "Bearer master-test-key" };

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildServer({
      store,
      secrets: {
        masterApiKey: "master-test-key",
        mcpKey: "mcp-test-key",
        enrollmentKey: "enroll-test-key",
      },
      logger: false,
    });
  });

  afterEach(async () => app.close());

  it("keeps operator and MCP credentials in separate trust boundaries", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/v1/agents" })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/agents",
          headers: { authorization: "Bearer mcp-test-key" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/agents",
          headers: masterHeaders,
        })
      ).statusCode,
    ).toBe(200);
  });

  it("creates an explicitly assigned task idempotently", async () => {
    const agent = await store.createAgent({
      name: "forge-01",
      environment: "DEVELOPMENT",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "console",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/console",
    });
    const payload = {
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Run and verify the test suite",
    };
    const request = {
      method: "POST" as const,
      url: "/v1/tasks",
      headers: { ...masterHeaders, "idempotency-key": "task-intent-1" },
      payload,
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
  });

  it("rejects reuse of an idempotency key with another payload", async () => {
    const agent = await store.createAgent({
      name: "forge-02",
      environment: "TESTING",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "api",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/api",
    });
    const headers = { ...masterHeaders, "idempotency-key": "same-key" };
    await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers,
      payload: {
        projectId: project.id,
        agentId: agent.id,
        workspaceId: workspace.id,
        goal: "First valid goal",
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers,
      payload: {
        projectId: project.id,
        agentId: agent.id,
        workspaceId: workspace.id,
        goal: "Different valid goal",
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("IDEMPOTENCY_MISMATCH");
  });

  it("records a one-time approval decision", async () => {
    const approval = await store.createApproval({
      taskId: randomUUID(),
      toolName: "database.migrate",
      risk: "HIGH",
      reason: "Apply schema",
      impact: "Database schema changes",
      affectedResources: ["database"],
      argumentHash: "hash",
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/approvals/${approval.id}/decision`,
      headers: masterHeaders,
      payload: { decision: "APPROVE_ONCE" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "APPROVED",
      scope: "ONCE",
    });
  });
});
