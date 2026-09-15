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

  it("automatically assigns a task to the best online project Agent", async () => {
    const agent = await store.createAgent({
      name: "auto-php",
      environment: "DEVELOPMENT",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    await store.updateAgentPresence(agent.id, {
      cpu: { loadPercent: 10 },
      memory: { totalBytes: 100, freeBytes: 80 },
      runtimes: { php: "8.4" },
    }, new Date());
    const project = await store.createProject({ name: "auto-project", repositoryUrl: null });
    const workspace = await store.createWorkspace({ projectId: project.id, agentId: agent.id, rootPath: "/srv/auto" });
    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: { ...masterHeaders, "idempotency-key": "auto-task-1" },
      payload: {
        projectId: project.id,
        goal: "Run Laravel tests",
        requiredPermissionLevel: 2,
        technologies: ["php", "laravel"],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ agentId: agent.id, workspaceId: workspace.id });
  });

  it("returns durable project context and filters audit logs", async () => {
    const project = await store.createProject({ name: "context-project", repositoryUrl: null });
    await store.saveProjectMemory(project.id, "decisions", { markdown: "Keep REST v1 stable" });
    await store.appendAudit({ agentId: null, projectId: project.id, userId: "test", action: "security.decision", durationMs: 1, status: "DENIED", metadata: { reason: "test" } });
    const context = await app.inject({ method: "GET", url: `/v1/projects/${project.id}/context`, headers: masterHeaders });
    expect(context.statusCode).toBe(200);
    expect(context.json().decisions.markdown).toContain("REST v1");
    const logs = await app.inject({ method: "GET", url: `/v1/logs?status=DENIED&search=security`, headers: masterHeaders });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data).toHaveLength(1);
    const exported = await app.inject({ method: "GET", url: "/v1/logs/export?status=DENIED", headers: masterHeaders });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.body).toContain("security.decision");
  });

  it("keeps projects grouped across multiple organizations", async () => {
    const first = await app.inject({ method: "POST", url: "/v1/organizations", headers: masterHeaders, payload: { name: "Platform" } });
    const second = await app.inject({ method: "POST", url: "/v1/organizations", headers: masterHeaders, payload: { name: "Commerce" } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstProject = await app.inject({ method: "POST", url: "/v1/projects", headers: masterHeaders, payload: { name: "storefront", organizationId: first.json().id } });
    const project = await app.inject({ method: "POST", url: "/v1/projects", headers: masterHeaders, payload: { name: "storefront", organizationId: second.json().id } });
    expect(firstProject.statusCode).toBe(201);
    expect(project.statusCode).toBe(201);
    expect(project.json().organizationId).toBe(second.json().id);
    const organizations = await app.inject({ method: "GET", url: "/v1/organizations", headers: masterHeaders });
    expect(organizations.json().data).toHaveLength(2);
    expect((await store.listProjects()).filter((item) => item.name === "storefront")).toHaveLength(2);
  });

  it("creates idempotent deployment and TLS tasks with persisted executable plans", async () => {
    const agent = await store.createAgent({ name: "operations-agent", environment: "PRODUCTION", permissionLevel: 3, tokenDigest: "digest" });
    const project = await store.createProject({ name: "operations-project", repositoryUrl: null });
    const workspace = await store.createWorkspace({ projectId: project.id, agentId: agent.id, rootPath: "/srv/operations" });
    const deployment = await app.inject({
      method: "POST", url: `/v1/projects/${project.id}/deployments`,
      headers: { ...masterHeaders, "idempotency-key": "deployment-1" },
      payload: { agentId: agent.id, workspaceId: workspace.id, environment: "PRODUCTION", branch: "main", service: "storefront", healthUrl: "https://store.example.com/healthz", packageManager: "npm", runMigrations: true },
    });
    expect(deployment.statusCode).toBe(201);
    expect((await store.loadTaskPlan(deployment.json().task.id))?.steps.at(-1)?.toolName).toBe("network.http");
    const tls = await app.inject({
      method: "POST", url: `/v1/projects/${project.id}/tls`,
      headers: { ...masterHeaders, "idempotency-key": "tls-workflow-1" },
      payload: { agentId: agent.id, workspaceId: workspace.id, domain: "store.example.com", email: "ops@example.com", webServer: "nginx" },
    });
    expect(tls.statusCode).toBe(201);
    expect(tls.json().plan.steps.map((step: { title: string }) => step.title)).toContain("Verify HTTPS");
  });
});
