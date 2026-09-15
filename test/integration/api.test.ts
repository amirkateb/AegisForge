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

  it("lets MCP read the private catalog but keeps operator mutations separate", async () => {
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
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/agents",
          headers: { authorization: "Bearer mcp-test-key" },
          payload: {
            name: "blocked",
            environment: "TESTING",
            permissionLevel: 0,
          },
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

  it("changes an Agent-wide access mode, synchronizes level 4, and audits it", async () => {
    const agent = await store.createAgent({
      name: "mode-worker",
      environment: "PRODUCTION",
      permissionLevel: 1,
      tokenDigest: "digest",
    });
    expect(agent.accessMode).toBe("CAUTIOUS");

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/agents/${agent.id}/access-mode`,
      headers: masterHeaders,
      payload: { accessMode: "FULL_TRUST" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: agent.id,
      accessMode: "FULL_TRUST",
      permissionLevel: 4,
    });
    expect(await store.findAgent(agent.id)).toMatchObject({
      accessMode: "FULL_TRUST",
      permissionLevel: 4,
    });
    expect(await store.listAudits()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: agent.id,
          action: "agent.access_mode_changed",
          status: "SUCCESS",
          metadata: expect.objectContaining({
            previousMode: "CAUTIOUS",
            accessMode: "FULL_TRUST",
            permissionLevel: 4,
          }),
        }),
      ]),
    );

    const mcpAttempt = await app.inject({
      method: "PATCH",
      url: `/v1/agents/${agent.id}/access-mode`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: { accessMode: "VERY_CAUTIOUS" },
    });
    expect(mcpAttempt.statusCode).toBe(403);

    const login = await app.inject({
      method: "POST",
      url: "/v1/session",
      payload: { masterApiKey: "master-test-key" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";", 1)[0]!;
    const dashboardChange = await app.inject({
      method: "PATCH",
      url: `/v1/ui/agents/${agent.id}/access-mode`,
      headers: { cookie },
      payload: { accessMode: "VERY_CAUTIOUS" },
    });
    expect(dashboardChange.statusCode).toBe(200);
    expect(dashboardChange.json()).toMatchObject({
      accessMode: "VERY_CAUTIOUS",
      permissionLevel: 4,
    });
  });

  it("lets the private GPT discover servers, projects, workspaces and tools", async () => {
    const agent = await store.createAgent({
      name: "telegram-core",
      environment: "PRODUCTION",
      permissionLevel: 3,
      tokenDigest: "must-not-be-returned",
    });
    const project = await store.createProject({
      name: "telegram-admin",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/telegram/admin",
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/ai/catalog",
      headers: { authorization: "Bearer mcp-test-key" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: agent.id,
          name: "telegram-core",
          workspaces: [
            expect.objectContaining({
              id: workspace.id,
              rootPath: "/srv/telegram/admin",
            }),
          ],
        }),
      ]),
    );
    expect(response.body).not.toContain("must-not-be-returned");
  });

  it("keeps an unplanned GPT task queued and returns its detail", async () => {
    const agent = await store.createAgent({
      name: "gpt-worker",
      environment: "DEVELOPMENT",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "gpt-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/gpt-project",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        authorization: "Bearer mcp-test-key",
        "idempotency-key": "private-gpt-task-1",
      },
      payload: {
        projectId: project.id,
        agentId: agent.id,
        workspaceId: workspace.id,
        goal: "Inspect before planning",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe("QUEUED");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await store.findTask(created.json().id))?.status).toBe("QUEUED");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/tasks/${created.json().id}`,
      headers: { authorization: "Bearer mcp-test-key" },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      task: { id: created.json().id },
      plan: null,
      steps: [],
      approvals: [],
    });
  });

  it("accepts a GPT plan and a final verified report", async () => {
    const agent = await store.createAgent({
      name: "report-worker",
      environment: "TESTING",
      permissionLevel: 2,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "report-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/report",
    });
    const task = await store.createTask({
      projectId: project.id,
      agentId: agent.id,
      workspaceId: workspace.id,
      goal: "Change and test admin page",
      maxFixAttempts: 2,
    });
    const plan = {
      summary: "Change and test admin page",
      assumptions: [],
      steps: [
        {
          title: "Inspect admin file",
          description: "Read the current implementation",
          toolName: "filesystem.read",
          arguments: { path: "src/admin.ts" },
          verification: "Current implementation is available",
        },
      ],
    };
    const submitted = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/plan`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: { plan, start: false },
    });
    expect(submitted.statusCode).toBe(202);
    expect(await store.loadTaskPlan(task.id)).toEqual(plan);

    const completed = await app.inject({
      method: "POST",
      url: `/v1/tasks/${task.id}/result`,
      headers: { authorization: "Bearer mcp-test-key" },
      payload: {
        status: "COMPLETED",
        summary: "Admin page updated",
        verification: { tests: "passed" },
      },
    });
    expect(completed.statusCode).toBe(200);
    expect((await store.findTask(task.id))?.status).toBe("COMPLETED");
    expect(await store.listAudits()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "task.gpt.completed",
          status: "COMPLETED",
          metadata: expect.objectContaining({ summary: "Admin page updated" }),
        }),
      ]),
    );
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
    await store.updateAgentPresence(
      agent.id,
      {
        cpu: { loadPercent: 10 },
        memory: { totalBytes: 100, freeBytes: 80 },
        runtimes: { php: "8.4" },
      },
      new Date(),
    );
    const project = await store.createProject({
      name: "auto-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/auto",
    });
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
    expect(response.json()).toMatchObject({
      agentId: agent.id,
      workspaceId: workspace.id,
    });
  });

  it("returns durable project context and filters audit logs", async () => {
    const project = await store.createProject({
      name: "context-project",
      repositoryUrl: null,
    });
    await store.saveProjectMemory(project.id, "decisions", {
      markdown: "Keep REST v1 stable",
    });
    await store.appendAudit({
      agentId: null,
      projectId: project.id,
      userId: "test",
      action: "security.decision",
      durationMs: 1,
      status: "DENIED",
      metadata: { reason: "test" },
    });
    const context = await app.inject({
      method: "GET",
      url: `/v1/projects/${project.id}/context`,
      headers: masterHeaders,
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().decisions.markdown).toContain("REST v1");
    const logs = await app.inject({
      method: "GET",
      url: `/v1/logs?status=DENIED&search=security`,
      headers: masterHeaders,
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data).toHaveLength(1);
    const exported = await app.inject({
      method: "GET",
      url: "/v1/logs/export?status=DENIED",
      headers: masterHeaders,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.body).toContain("security.decision");
  });

  it("keeps projects grouped across multiple organizations", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: masterHeaders,
      payload: { name: "Platform" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: masterHeaders,
      payload: { name: "Commerce" },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstProject = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: masterHeaders,
      payload: { name: "storefront", organizationId: first.json().id },
    });
    const project = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: masterHeaders,
      payload: { name: "storefront", organizationId: second.json().id },
    });
    expect(firstProject.statusCode).toBe(201);
    expect(project.statusCode).toBe(201);
    expect(project.json().organizationId).toBe(second.json().id);
    const organizations = await app.inject({
      method: "GET",
      url: "/v1/organizations",
      headers: masterHeaders,
    });
    expect(organizations.json().data).toHaveLength(2);
    expect(
      (await store.listProjects()).filter((item) => item.name === "storefront"),
    ).toHaveLength(2);
  });

  it("creates idempotent deployment and TLS tasks with persisted executable plans", async () => {
    const agent = await store.createAgent({
      name: "operations-agent",
      environment: "PRODUCTION",
      permissionLevel: 3,
      tokenDigest: "digest",
    });
    const project = await store.createProject({
      name: "operations-project",
      repositoryUrl: null,
    });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: "/srv/operations",
    });
    const deployment = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/deployments`,
      headers: { ...masterHeaders, "idempotency-key": "deployment-1" },
      payload: {
        agentId: agent.id,
        workspaceId: workspace.id,
        environment: "PRODUCTION",
        branch: "main",
        service: "storefront",
        healthUrl: "https://store.example.com/healthz",
        packageManager: "npm",
        runMigrations: true,
      },
    });
    expect(deployment.statusCode).toBe(201);
    expect(
      (await store.loadTaskPlan(deployment.json().task.id))?.steps.at(-1)
        ?.toolName,
    ).toBe("network.http");
    const tls = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/tls`,
      headers: { ...masterHeaders, "idempotency-key": "tls-workflow-1" },
      payload: {
        agentId: agent.id,
        workspaceId: workspace.id,
        domain: "store.example.com",
        email: "ops@example.com",
        webServer: "nginx",
      },
    });
    expect(tls.statusCode).toBe(201);
    expect(
      tls.json().plan.steps.map((step: { title: string }) => step.title),
    ).toContain("Verify HTTPS");
  });
});
