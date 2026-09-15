import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import {
  AgentAccessModeSchema,
  CreateTaskSchema,
  CodeIndexSchema,
  EngineeringPlanSchema,
  EnvironmentSchema,
  IdSchema,
  PermissionLevelSchema,
  ProjectContextCategorySchema,
  ToolIntentSchema,
} from "@aegisforge/contracts";
import { evaluateContextPolicy } from "@aegisforge/policy";
import type { PlatformStore } from "./domain.js";
import {
  requireRole,
  safeDigestEqual,
  safeEqual,
  tokenDigest,
} from "./security/auth.js";
import {
  clearSessionCookie,
  issueSession,
  requireSession,
  setSessionCookie,
} from "./security/session.js";
import { redactEvent } from "./observability/redaction.js";
import { AgentHub } from "./agents/agent-hub.js";
import { createMcpNodeHandler } from "./integrations/mcp.js";
import { selectAgent } from "@aegisforge/controller";
import { findAffectedCode } from "@aegisforge/controller";
import { TaskRunner } from "./task-runner.js";
import { createDeploymentPlan, createTlsPlan } from "@aegisforge/tools";

export interface ServerSecrets {
  masterApiKey: string;
  mcpKey: string;
  enrollmentKey: string;
  sessionSecret?: string;
}
export interface BuildServerOptions {
  store: PlatformStore;
  secrets: ServerSecrets;
  logger?: boolean;
  allowedOrigins?: string[];
}

const AgentInput = z.object({
  name: z.string().trim().min(2).max(100),
  environment: EnvironmentSchema,
  permissionLevel: PermissionLevelSchema,
});
const AgentAccessModeInput = z.object({
  accessMode: AgentAccessModeSchema,
});
const ProjectInput = z.object({
  name: z.string().trim().min(2).max(120),
  repositoryUrl: z.string().url().nullable().default(null),
  organizationId: IdSchema.nullable().optional(),
});
const OrganizationInput = z.object({ name: z.string().trim().min(2).max(120) });
const WorkspaceInput = z.object({
  projectId: IdSchema,
  agentId: IdSchema,
  rootPath: z.string().startsWith("/").max(2000),
});
const DecisionInput = z.object({
  decision: z.enum(["APPROVE_ONCE", "APPROVE_SESSION", "DENY"]),
});
const ToolRunInput = z.object({
  taskId: IdSchema,
  projectId: IdSchema,
  agentId: IdSchema,
  workspaceId: IdSchema,
  stepId: IdSchema,
  toolName: z.string().min(2).max(100),
  arguments: z.record(z.string(), z.unknown()),
  reason: z.string().min(3).max(4000),
  expectedImpact: z.string().min(3).max(4000),
  affectedResources: z.array(z.string().max(1000)).max(100),
  approvalId: IdSchema.optional(),
});
const TaskToolRunInput = ToolRunInput.omit({
  taskId: true,
  projectId: true,
  agentId: true,
  workspaceId: true,
}).extend({ stepId: IdSchema.optional() });
const TaskPlanInput = z.object({
  plan: EngineeringPlanSchema,
  start: z.boolean().default(true),
});
const TaskResultInput = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
  summary: z.string().trim().min(3).max(10_000),
  verification: z.unknown().optional(),
});
const AgentWorkspaceInput = z.object({
  projectName: z.string().trim().min(2).max(120),
  organizationId: IdSchema.nullable().optional(),
  rootPath: z.string().startsWith("/").max(2000),
  repositoryUrl: z.string().url().nullable().default(null),
});
const AuditQuery = z.object({
  status: z.string().max(50).optional(),
  action: z.string().max(200).optional(),
  search: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
const PlannedAssignment = z.object({
  agentId: IdSchema,
  workspaceId: IdSchema,
});
const DeploymentInput = PlannedAssignment.extend({
  environment: EnvironmentSchema,
  branch: z.string().regex(/^[A-Za-z0-9._\/-]{1,200}$/),
  service: z.string().regex(/^[A-Za-z0-9_.@-]{1,200}$/),
  healthUrl: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
    ),
  packageManager: z.enum(["npm", "composer"]),
  runMigrations: z.boolean().default(false),
});
const TlsInput = PlannedAssignment.extend({
  domain: z
    .string()
    .regex(
      /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/,
    ),
  email: z.string().email(),
  webServer: z.enum(["nginx", "apache", "traefik"]),
});
const TaskRequestInput = z
  .object({
    projectId: IdSchema,
    agentId: IdSchema.optional(),
    workspaceId: IdSchema.optional(),
    goal: z.string().trim().min(3).max(20_000),
    maxFixAttempts: z.number().int().min(0).max(5).default(2),
    requiredPermissionLevel: PermissionLevelSchema.default(2),
    technologies: z
      .array(z.string().trim().min(1).max(100))
      .max(30)
      .default([]),
    plan: EngineeringPlanSchema.optional(),
  })
  .refine((value) => Boolean(value.agentId) === Boolean(value.workspaceId), {
    message: "agentId and workspaceId must be provided together",
  });

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: "x-request-id",
  });
  await app.register(cors, {
    origin: options.allowedOrigins?.length ? options.allowedOrigins : false,
    credentials: true,
  });
  await app.register(websocket, { options: { maxPayload: 8 * 1024 * 1024 } });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("cache-control", "no-store");
    return payload;
  });

  app.setErrorHandler(async (error, request, reply) => {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    request.log.error(
      redactEvent({ message: normalized.message, name: normalized.name }),
    );
    await options.store.appendAudit({
      agentId: null,
      projectId: null,
      userId: "server",
      action: "http.request.failed",
      durationMs: null,
      status: "FAILED",
      metadata: {
        requestId: request.id,
        method: request.method,
        url: request.url,
        error: normalized.message,
        name: normalized.name,
      },
    });
    const validation = error instanceof z.ZodError;
    await reply.code(validation ? 422 : 500).send({
      error: {
        code: validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
        message: validation
          ? "Request validation failed"
          : "Internal server error",
        requestId: request.id,
        ...(validation ? { details: error.flatten() } : {}),
      },
    });
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "aegisforge-master",
    version: "0.1.0",
  }));
  const sessionSecret =
    options.secrets.sessionSecret ?? "test-only-dashboard-session-secret";
  app.post("/v1/session", async (request, reply) => {
    const input = z
      .object({ masterApiKey: z.string().min(1) })
      .parse(request.body);
    if (
      !safeDigestEqual(
        input.masterApiKey,
        createHash("sha256").update(options.secrets.masterApiKey).digest("hex"),
      )
    )
      return reply.code(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid credential",
          requestId: request.id,
        },
      });
    setSessionCookie(
      reply,
      issueSession(sessionSecret),
      process.env.NODE_ENV === "production",
    );
    return { ok: true };
  });
  app.delete("/v1/session", async (_request, reply) => {
    clearSessionCookie(reply, process.env.NODE_ENV === "production");
    return { ok: true };
  });
  const agentHub = new AgentHub(options.store);
  const taskRunner = new TaskRunner(options.store, agentHub);
  const continueTask = (taskId: string) => {
    void taskRunner.run(taskId).catch(async (error) => {
      await options.store.updateTaskStatus(taskId, "FAILED");
      const task = await options.store.findTask(taskId);
      await options.store.appendAudit({
        agentId: task?.agentId ?? null,
        projectId: task?.projectId ?? null,
        userId: "controller",
        action: "task.controller.failed",
        durationMs: null,
        status: "FAILED",
        metadata: {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });
  };
  app.get("/v1/agent/connect", { websocket: true }, async (socket, request) => {
    const agentId = request.headers["x-agent-id"];
    const match = /^Bearer\s+(.+)$/i.exec(
      request.headers.authorization?.trim() ?? "",
    );
    const agent =
      typeof agentId === "string"
        ? await options.store.findAgent(agentId)
        : null;
    if (
      !agent ||
      !match?.[1] ||
      !safeDigestEqual(match[1], agent.tokenDigest) ||
      ["DISABLED", "REVOKED"].includes(agent.status)
    ) {
      socket.close(4401, "Unauthorized");
      return;
    }
    await agentHub.accept(socket, agent.id);
  });
  app.addHook("onClose", async () => agentHub.close());
  const master = requireRole(options.secrets, ["MASTER"]);

  app.post("/v1/agents/enroll", async (request, reply) => {
    const token = /^Bearer\s+(.+)$/i.exec(
      request.headers.authorization?.trim() ?? "",
    )?.[1];
    if (!token || !safeEqual(token, options.secrets.enrollmentKey))
      return reply.code(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid enrollment credential",
          requestId: request.id,
        },
      });
    const input = AgentInput.parse(request.body);
    const agentToken = `af_agent_${randomBytes(32).toString("base64url")}`;
    const agent = await options.store.createAgent({
      ...input,
      tokenDigest: tokenDigest(agentToken),
    });
    await options.store.appendAudit({
      agentId: agent.id,
      projectId: null,
      userId: "enrollment",
      action: "agent.enrolled",
      durationMs: null,
      status: "SUCCESS",
      metadata: { name: agent.name },
    });
    return reply
      .code(201)
      .send({ agent: { ...agent, tokenDigest: undefined }, token: agentToken });
  });

  app.post("/v1/agent/workspaces", async (request, reply) => {
    const agentId = request.headers["x-agent-id"];
    const token = /^Bearer\s+(.+)$/i.exec(
      request.headers.authorization?.trim() ?? "",
    )?.[1];
    const agent =
      typeof agentId === "string"
        ? await options.store.findAgent(agentId)
        : null;
    if (
      !agent ||
      !token ||
      !safeDigestEqual(token, agent.tokenDigest) ||
      ["DISABLED", "REVOKED"].includes(agent.status)
    )
      return reply.code(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid Agent credential",
          requestId: request.id,
        },
      });
    const input = AgentWorkspaceInput.parse(request.body);
    if (
      input.organizationId &&
      !(await options.store.findOrganization(input.organizationId))
    )
      return reply.code(422).send({
        error: {
          code: "INVALID_REFERENCE",
          message: "Organization does not exist",
          requestId: request.id,
        },
      });
    let project = await options.store.findProjectByName(
      input.projectName,
      input.organizationId ?? null,
    );
    if (!project)
      project = await options.store.createProject({
        name: input.projectName,
        repositoryUrl: input.repositoryUrl,
        organizationId: input.organizationId ?? null,
      });
    const workspace = await options.store.createWorkspace({
      projectId: project.id,
      agentId: agent.id,
      rootPath: input.rootPath,
    });
    await options.store.appendAudit({
      agentId: agent.id,
      projectId: project.id,
      userId: "agent",
      action: "workspace.registered",
      durationMs: null,
      status: "SUCCESS",
      metadata: { workspaceId: workspace.id },
    });
    return reply.code(201).send({ project, workspace });
  });

  const masterOrMcp = requireRole(options.secrets, ["MASTER", "MCP"]);
  app.get("/v1/agents", { preHandler: masterOrMcp }, async () => ({
    data: (await options.store.listAgents()).map(
      ({ tokenDigest: _tokenDigest, ...agent }) => agent,
    ),
  }));
  const changeAgentAccessMode = async (
    id: string,
    accessMode: z.infer<typeof AgentAccessModeSchema>,
    userId: string,
  ) => {
    const previous = await options.store.findAgent(id);
    if (!previous) return null;
    const previousMode = previous.accessMode;
    const previousPermissionLevel = previous.permissionLevel;
    const agent = await options.store.updateAgentAccessMode(id, accessMode);
    if (!agent) return null;
    await options.store.appendAudit({
      agentId: id,
      projectId: null,
      userId,
      action: "agent.access_mode_changed",
      durationMs: null,
      status: "SUCCESS",
      metadata: {
        previousMode,
        accessMode: agent.accessMode,
        previousPermissionLevel,
        permissionLevel: agent.permissionLevel,
      },
    });
    return agent;
  };
  app.patch(
    "/v1/agents/:id/access-mode",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const { accessMode } = AgentAccessModeInput.parse(request.body);
      const agent = await changeAgentAccessMode(id, accessMode, "master");
      if (!agent)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Agent not found",
            requestId: request.id,
          },
        });
      const { tokenDigest: _tokenDigest, ...publicAgent } = agent;
      return publicAgent;
    },
  );
  app.post("/v1/agents", { preHandler: master }, async (request, reply) => {
    const input = AgentInput.parse(request.body);
    const token = `af_agent_${randomBytes(32).toString("base64url")}`;
    const agent = await options.store.createAgent({
      ...input,
      tokenDigest: tokenDigest(token),
    });
    await options.store.appendAudit({
      agentId: agent.id,
      projectId: null,
      userId: "master",
      action: "agent.created",
      durationMs: null,
      status: "SUCCESS",
      metadata: { name: agent.name },
    });
    await reply
      .code(201)
      .send({ agent: { ...agent, tokenDigest: undefined }, token });
  });
  app.post(
    "/v1/agents/:id/revoke",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const agent = await options.store.updateAgentStatus(id, "REVOKED");
      if (!agent)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Agent not found",
            requestId: request.id,
          },
        });
      agentHub.disconnectAgent(id, "Agent revoked");
      return { id: agent.id, status: agent.status };
    },
  );
  app.post(
    "/v1/agents/:id/disable",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const agent = await options.store.updateAgentStatus(id, "DISABLED");
      if (agent) agentHub.disconnectAgent(id, "Agent disabled");
      return agent
        ? { id, status: agent.status }
        : reply.code(404).send({
            error: {
              code: "NOT_FOUND",
              message: "Agent not found",
              requestId: request.id,
            },
          });
    },
  );
  app.post(
    "/v1/agents/:id/enable",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const current = await options.store.findAgent(id);
      if (!current || current.status === "REVOKED")
        return reply.code(409).send({
          error: {
            code: "AGENT_NOT_ENABLEABLE",
            message: "Agent is missing or revoked",
            requestId: request.id,
          },
        });
      const agent = await options.store.updateAgentStatus(id, "OFFLINE");
      return { id, status: agent!.status };
    },
  );
  app.post(
    "/v1/agents/:id/rotate-token",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const token = `af_agent_${randomBytes(32).toString("base64url")}`;
      const agent = await options.store.updateAgentToken(
        id,
        tokenDigest(token),
      );
      if (!agent)
        return reply.code(409).send({
          error: {
            code: "AGENT_NOT_ROTATABLE",
            message: "Agent is missing or revoked",
            requestId: request.id,
          },
        });
      agentHub.disconnectAgent(id, "Agent token rotated");
      await options.store.updateAgentStatus(id, "OFFLINE");
      await options.store.appendAudit({
        agentId: id,
        projectId: null,
        userId: "master",
        action: "agent.token_rotated",
        durationMs: null,
        status: "SUCCESS",
        metadata: {},
      });
      return { agentId: id, token };
    },
  );

  app.get("/v1/projects", { preHandler: masterOrMcp }, async () => ({
    data: await options.store.listProjects(),
  }));
  app.get("/v1/organizations", { preHandler: masterOrMcp }, async () => ({
    data: await options.store.listOrganizations(),
  }));
  app.post(
    "/v1/organizations",
    { preHandler: master },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await options.store.createOrganization(
            OrganizationInput.parse(request.body),
          ),
        ),
  );
  app.post("/v1/projects", { preHandler: master }, async (request, reply) => {
    const input = ProjectInput.parse(request.body);
    if (
      input.organizationId &&
      !(await options.store.findOrganization(input.organizationId))
    )
      return reply.code(422).send({
        error: {
          code: "INVALID_REFERENCE",
          message: "Organization does not exist",
          requestId: request.id,
        },
      });
    return reply.code(201).send(
      await options.store.createProject({
        name: input.name,
        repositoryUrl: input.repositoryUrl,
        organizationId: input.organizationId ?? null,
      }),
    );
  });
  app.post("/v1/workspaces", { preHandler: master }, async (request, reply) => {
    const input = WorkspaceInput.parse(request.body);
    if (
      !(await options.store.findProject(input.projectId)) ||
      !(await options.store.findAgent(input.agentId))
    ) {
      return reply.code(422).send({
        error: {
          code: "INVALID_REFERENCE",
          message: "Project or Agent does not exist",
          requestId: request.id,
        },
      });
    }
    return reply.code(201).send(await options.store.createWorkspace(input));
  });

  app.get("/v1/workspaces", { preHandler: masterOrMcp }, async (request) => {
    const query = z
      .object({ projectId: IdSchema.optional() })
      .parse(request.query);
    return { data: await options.store.listWorkspaces(query.projectId) };
  });

  app.get("/v1/ai/catalog", { preHandler: masterOrMcp }, async () => {
    const [organizations, projects, agents, workspaces] = await Promise.all([
      options.store.listOrganizations(),
      options.store.listProjects(),
      options.store.listAgents(),
      options.store.listWorkspaces(),
    ]);
    const connectedTools = new Map(
      agentHub.connectedTools().map((item) => [item.agentId, item.tools]),
    );
    return {
      organizations,
      projects,
      servers: agents.map(({ tokenDigest: _tokenDigest, ...agent }) => ({
        ...agent,
        workspaces: workspaces.filter(
          (workspace) => workspace.agentId === agent.id,
        ),
        tools: connectedTools.get(agent.id) ?? [],
      })),
    };
  });

  app.get("/v1/tasks", { preHandler: master }, async () => ({
    data: await options.store.listTasks(),
  }));
  app.post(
    "/v1/tasks",
    { preHandler: requireRole(options.secrets, ["MASTER", "MCP"]) },
    async (request, reply) => {
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.length < 8 || key.length > 200) {
        return reply.code(400).send({
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "A valid Idempotency-Key is required",
            requestId: request.id,
          },
        });
      }
      const requested = TaskRequestInput.parse(request.body);
      const hash = requestHash(requested);
      let assignment: { agentId: string; workspaceId: string };
      if (requested.agentId && requested.workspaceId) {
        assignment = {
          agentId: requested.agentId,
          workspaceId: requested.workspaceId,
        };
      } else {
        const selection = selectAgent({
          projectId: requested.projectId,
          requiredPermissionLevel: requested.requiredPermissionLevel,
          technologies: requested.technologies,
          agents: await options.store.listAgents(),
          workspaces: await options.store.listWorkspaces(requested.projectId),
        });
        if (selection.type !== "SELECTED")
          return reply.code(409).send({
            error: {
              code: "AGENT_SELECTION_REQUIRED",
              message: "No unique viable Agent assignment is available",
              requestId: request.id,
              details: selection,
            },
          });
        assignment = selection;
      }
      const input = CreateTaskSchema.parse({
        projectId: requested.projectId,
        ...assignment,
        goal: requested.goal,
        maxFixAttempts: requested.maxFixAttempts,
      });
      const [agent, project, workspace] = await Promise.all([
        options.store.findAgent(input.agentId),
        options.store.findProject(input.projectId),
        options.store.findWorkspace(input.workspaceId),
      ]);
      if (
        !agent ||
        !project ||
        !workspace ||
        workspace.agentId !== agent.id ||
        workspace.projectId !== project.id ||
        ["DISABLED", "REVOKED"].includes(agent.status)
      ) {
        return reply.code(422).send({
          error: {
            code: "INVALID_ASSIGNMENT",
            message: "Task assignment is invalid or unavailable",
            requestId: request.id,
          },
        });
      }
      const result = await options.store.createTaskIdempotently(
        key,
        hash,
        input,
      );
      if (result.type === "MISMATCH")
        return reply.code(422).send({
          error: {
            code: "IDEMPOTENCY_MISMATCH",
            message: "Idempotency key was used with a different request",
            requestId: request.id,
          },
        });
      const task = result.task;
      if (requested.plan && !(await options.store.loadTaskPlan(task.id)))
        await options.store.saveTaskPlan(task.id, requested.plan);
      if (result.type === "REPLAYED")
        return reply
          .code(200)
          .send({ ...task, planAccepted: Boolean(requested.plan) });
      await options.store.appendAudit({
        agentId: agent.id,
        projectId: project.id,
        userId: "api",
        action: "task.created",
        durationMs: null,
        status: "SUCCESS",
        metadata: { taskId: task.id },
      });
      if (requested.plan) continueTask(task.id);
      return reply
        .code(201)
        .send({ ...task, planAccepted: Boolean(requested.plan) });
    },
  );

  app.get(
    "/v1/tasks/:id",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const task = await options.store.findTask(id);
      if (!task)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
            requestId: request.id,
          },
        });
      const [plan, steps, approvals, events] = await Promise.all([
        options.store.loadTaskPlan(id),
        options.store.listTaskSteps(id),
        options.store.listApprovals(),
        options.store.listAudits(),
      ]);
      return {
        task,
        plan,
        steps,
        approvals: approvals.filter((item) => item.taskId === id),
        events: events.filter((item) => item.metadata.taskId === id),
      };
    },
  );

  app.post(
    "/v1/tasks/:id/plan",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const input = TaskPlanInput.parse(request.body);
      const task = await options.store.findTask(id);
      if (!task)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
            requestId: request.id,
          },
        });
      if (["COMPLETED", "CANCELLED"].includes(task.status))
        return reply.code(409).send({
          error: {
            code: "TASK_TERMINAL",
            message: "A terminal task cannot receive a plan",
            requestId: request.id,
          },
        });
      await options.store.saveTaskPlan(id, input.plan);
      if (task.status === "FAILED")
        await options.store.updateTaskStatus(id, "QUEUED");
      await options.store.appendAudit({
        agentId: task.agentId,
        projectId: task.projectId,
        userId: "gpt",
        action: "task.plan.submitted",
        durationMs: null,
        status: "SUCCESS",
        metadata: {
          taskId: id,
          steps: input.plan.steps.length,
          start: input.start,
        },
      });
      if (input.start) continueTask(id);
      return reply
        .code(202)
        .send({ taskId: id, status: "QUEUED", started: input.start });
    },
  );

  app.post(
    "/v1/tasks/:id/result",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const input = TaskResultInput.parse(request.body);
      const task = await options.store.findTask(id);
      if (!task)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
            requestId: request.id,
          },
        });
      const updated = await options.store.updateTaskStatus(id, input.status);
      await options.store.appendAudit({
        agentId: task.agentId,
        projectId: task.projectId,
        userId: "gpt",
        action: `task.gpt.${input.status.toLowerCase()}`,
        durationMs: null,
        status: input.status,
        metadata: {
          taskId: id,
          summary: input.summary,
          verification: input.verification ?? null,
        },
      });
      return { task: updated, report: input };
    },
  );
  app.post(
    "/v1/tasks/:id/run",
    { preHandler: requireRole(options.secrets, ["MASTER", "MCP"]) },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const result = await taskRunner.run(id);
      return reply
        .code(result.status === "WAITING_APPROVAL" ? 202 : 200)
        .send(result);
    },
  );
  app.post(
    "/v1/projects/:id/deployments",
    { preHandler: requireRole(options.secrets, ["MASTER", "MCP"]) },
    async (request, reply) => {
      const projectId = IdSchema.parse((request.params as { id: unknown }).id);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.length < 8 || key.length > 200)
        return reply.code(400).send({
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "A valid Idempotency-Key is required",
            requestId: request.id,
          },
        });
      const input = DeploymentInput.parse(request.body);
      const assignment = await validatePlannedAssignment(
        options.store,
        projectId,
        input.agentId,
        input.workspaceId,
      );
      if (!assignment.ok)
        return reply.code(422).send({
          error: {
            code: "INVALID_ASSIGNMENT",
            message: assignment.reason,
            requestId: request.id,
          },
        });
      if (assignment.agent.environment !== input.environment)
        return reply.code(422).send({
          error: {
            code: "ENVIRONMENT_MISMATCH",
            message: "Deployment environment must match the assigned Agent",
            requestId: request.id,
          },
        });
      const plan = createDeploymentPlan(input);
      const result = await options.store.createTaskIdempotently(
        key,
        requestHash({ projectId, ...input }),
        {
          projectId,
          agentId: input.agentId,
          workspaceId: input.workspaceId,
          goal: plan.summary,
          maxFixAttempts: 1,
        },
      );
      if (result.type === "MISMATCH")
        return reply.code(422).send({
          error: {
            code: "IDEMPOTENCY_MISMATCH",
            message: "Idempotency key was used with a different deployment",
            requestId: request.id,
          },
        });
      if (result.type === "CREATED") {
        await options.store.saveTaskPlan(result.task.id, plan);
        continueTask(result.task.id);
      }
      return reply
        .code(result.type === "CREATED" ? 201 : 200)
        .send({ task: result.task, plan });
    },
  );
  app.post(
    "/v1/projects/:id/tls",
    { preHandler: requireRole(options.secrets, ["MASTER", "MCP"]) },
    async (request, reply) => {
      const projectId = IdSchema.parse((request.params as { id: unknown }).id);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.length < 8 || key.length > 200)
        return reply.code(400).send({
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "A valid Idempotency-Key is required",
            requestId: request.id,
          },
        });
      const input = TlsInput.parse(request.body);
      const assignment = await validatePlannedAssignment(
        options.store,
        projectId,
        input.agentId,
        input.workspaceId,
      );
      if (!assignment.ok)
        return reply.code(422).send({
          error: {
            code: "INVALID_ASSIGNMENT",
            message: assignment.reason,
            requestId: request.id,
          },
        });
      const plan = createTlsPlan(input);
      const result = await options.store.createTaskIdempotently(
        key,
        requestHash({ projectId, ...input }),
        {
          projectId,
          agentId: input.agentId,
          workspaceId: input.workspaceId,
          goal: plan.summary,
          maxFixAttempts: 1,
        },
      );
      if (result.type === "MISMATCH")
        return reply.code(422).send({
          error: {
            code: "IDEMPOTENCY_MISMATCH",
            message: "Idempotency key was used with different TLS input",
            requestId: request.id,
          },
        });
      if (result.type === "CREATED") {
        await options.store.saveTaskPlan(result.task.id, plan);
        continueTask(result.task.id);
      }
      return reply
        .code(result.type === "CREATED" ? 201 : 200)
        .send({ task: result.task, plan });
    },
  );

  app.get("/v1/approvals", { preHandler: master }, async () => ({
    data: await options.store.listApprovals(),
  }));
  app.post(
    "/v1/approvals/:id/decision",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const input = DecisionInput.parse(request.body);
      const approval = await options.store.decideApproval(
        id,
        input.decision,
        new Date(),
      );
      if (!approval)
        return reply.code(409).send({
          error: {
            code: "APPROVAL_NOT_PENDING",
            message: "Approval is missing or already decided",
            requestId: request.id,
          },
        });
      await options.store.appendAudit({
        agentId: null,
        projectId: null,
        userId: "master",
        action: "approval.decided",
        durationMs: null,
        status: approval.status,
        metadata: {
          taskId: approval.taskId,
          approvalId: id,
          decision: input.decision,
        },
      });
      if (
        approval.status === "APPROVED" &&
        (await options.store.loadTaskPlan(approval.taskId))
      )
        continueTask(approval.taskId);
      return approval;
    },
  );
  app.get(
    "/v1/projects/:id/context",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      if (!(await options.store.findProject(id)))
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Project not found",
            requestId: request.id,
          },
        });
      return options.store.loadProjectContext(id);
    },
  );
  app.put(
    "/v1/projects/:id/context/:category",
    { preHandler: master },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const category = ProjectContextCategorySchema.parse(
        (request.params as { category: unknown }).category,
      );
      if (!(await options.store.findProject(id)))
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Project not found",
            requestId: request.id,
          },
        });
      const input = z.object({ content: z.unknown() }).parse(request.body);
      const content = parseContextContent(category, input.content);
      const encoded = JSON.stringify(content);
      const bytes = Buffer.byteLength(encoded);
      if (bytes > 1_500_000)
        return reply.code(413).send({
          error: {
            code: "CONTEXT_TOO_LARGE",
            message: "Project context exceeds 1.5 MB",
            requestId: request.id,
          },
        });
      await options.store.saveProjectMemory(id, category, content);
      await options.store.appendAudit({
        agentId: null,
        projectId: id,
        userId: "master",
        action: `project.context.${category}.updated`,
        durationMs: null,
        status: "SUCCESS",
        metadata: { bytes },
      });
      return reply.code(204).send();
    },
  );
  app.get(
    "/v1/projects/:id/impact",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const query = z
        .object({ symbol: z.string().trim().min(1).max(300) })
        .parse(request.query);
      const context = await options.store.loadProjectContext(id);
      if (!context.codeIndex)
        return reply.code(409).send({
          error: {
            code: "CODE_INDEX_UNAVAILABLE",
            message: "Index the project before requesting impact",
            requestId: request.id,
          },
        });
      return findAffectedCode(context.codeIndex, query.symbol);
    },
  );
  const filteredAudits = async (rawQuery: unknown) => {
    const query = AuditQuery.parse(rawQuery);
    const search = query.search?.toLowerCase();
    return (await options.store.listAudits())
      .filter(
        (event) =>
          (!query.status || event.status === query.status) &&
          (!query.action || event.action.startsWith(query.action)) &&
          (!search || JSON.stringify(event).toLowerCase().includes(search)),
      )
      .slice(0, query.limit);
  };
  app.get("/v1/logs/export", { preHandler: master }, async (request, reply) => {
    const events = await filteredAudits(request.query);
    const rows = [
      [
        "timestamp",
        "agentId",
        "projectId",
        "userId",
        "action",
        "durationMs",
        "status",
        "metadata",
      ],
      ...events.map((event) => [
        event.timestamp.toISOString(),
        event.agentId,
        event.projectId,
        event.userId,
        event.action,
        event.durationMs,
        event.status,
        JSON.stringify(event.metadata),
      ]),
    ];
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "content-disposition",
        "attachment; filename=aegisforge-audit.csv",
      )
      .send(rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
  });
  app.get("/v1/logs", { preHandler: masterOrMcp }, async (request) => ({
    data: await filteredAudits(request.query),
  }));

  const executeToolIntent = async (
    input: z.infer<typeof ToolRunInput>,
    requestId: string,
    reply: FastifyReply,
  ) => {
    const [task, agent, project, workspace] = await Promise.all([
      options.store.findTask(input.taskId),
      options.store.findAgent(input.agentId),
      options.store.findProject(input.projectId),
      options.store.findWorkspace(input.workspaceId),
    ]);
    if (
      !task ||
      !agent ||
      !project ||
      !workspace ||
      task.agentId !== agent.id ||
      task.projectId !== project.id ||
      task.workspaceId !== workspace.id ||
      workspace.agentId !== agent.id ||
      workspace.projectId !== project.id
    )
      return reply.code(422).send({
        error: {
          code: "INVALID_ASSIGNMENT",
          message: "Tool execution assignment is invalid",
          requestId,
        },
      });
    const tool = agentHub.getTool(agent.id, input.toolName);
    if (!tool)
      return reply.code(409).send({
        error: {
          code: "TOOL_UNAVAILABLE",
          message: "Tool is not advertised by the connected Agent",
          requestId,
        },
      });
    const decision = evaluateContextPolicy({
      accessMode: agent.accessMode,
      permissionLevel: agent.permissionLevel,
      requiredLevel: tool.requiredLevel,
      risk: tool.risk,
      approval: tool.approval,
      environment: agent.environment,
      toolName: tool.name,
      arguments: input.arguments,
      affectedPaths: input.affectedResources,
    });
    if (decision.type === "DENIED")
      return reply.code(403).send({
        error: {
          code: "POLICY_DENIED",
          message: decision.reason,
          requestId,
        },
      });
    const intent = ToolIntentSchema.parse(input);
    const argumentHash = requestHash({
      toolName: input.toolName,
      arguments: input.arguments,
      taskId: input.taskId,
      stepId: input.stepId,
    });
    let approvalGrantId: string | null = null;
    if (decision.type === "APPROVAL_REQUIRED") {
      if (!input.approvalId) {
        const approval = await options.store.createApproval({
          taskId: task.id,
          toolName: tool.name,
          risk: tool.risk,
          reason: input.reason,
          impact: input.expectedImpact,
          affectedResources: input.affectedResources,
          argumentHash,
        });
        await options.store.updateTaskStatus(task.id, "WAITING_APPROVAL");
        return reply.code(202).send({
          status: "APPROVAL_REQUIRED",
          stepId: input.stepId,
          approval,
        });
      }
      const approval = await options.store.findApproval(input.approvalId);
      if (
        !approval ||
        approval.taskId !== task.id ||
        approval.toolName !== tool.name ||
        approval.argumentHash !== argumentHash ||
        approval.status !== "APPROVED" ||
        !approval.expiresAt ||
        approval.expiresAt <= new Date()
      )
        return reply.code(403).send({
          error: {
            code: "INVALID_APPROVAL",
            message: "Approval does not authorize this exact operation",
            requestId,
          },
        });
      approvalGrantId = approval.id;
    }
    await options.store.updateTaskStatus(task.id, "EXECUTING");
    const started = Date.now();
    try {
      const result = await agentHub.dispatch(agent.id, {
        taskId: task.id,
        projectId: project.id,
        workspaceId: workspace.id,
        tool,
        intent,
        permissionLevel: agent.permissionLevel,
        accessMode: agent.accessMode,
        approvalGrantId,
        expiresAt: new Date(
          Date.now() + Math.min(tool.timeoutMs + 5000, 605000),
        ).toISOString(),
      });
      if (approvalGrantId)
        await options.store.consumeApproval(approvalGrantId, new Date());
      await options.store.appendAudit({
        agentId: agent.id,
        projectId: project.id,
        userId: "api",
        action: `tool.${tool.name}`,
        durationMs: Date.now() - started,
        status: "SUCCESS",
        metadata: { taskId: task.id, stepId: input.stepId },
      });
      return { status: "EXECUTED", stepId: input.stepId, result };
    } catch (error) {
      await options.store.updateTaskStatus(task.id, "UNKNOWN");
      await options.store.appendAudit({
        agentId: agent.id,
        projectId: project.id,
        userId: "api",
        action: `tool.${tool.name}`,
        durationMs: Date.now() - started,
        status: "UNKNOWN",
        metadata: {
          taskId: task.id,
          stepId: input.stepId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  };

  app.post(
    "/v1/tools/run",
    { preHandler: masterOrMcp },
    async (request, reply) =>
      executeToolIntent(ToolRunInput.parse(request.body), request.id, reply),
  );

  app.post(
    "/v1/tasks/:id/tools/run",
    { preHandler: masterOrMcp },
    async (request, reply) => {
      const taskId = IdSchema.parse((request.params as { id: unknown }).id);
      const task = await options.store.findTask(taskId);
      if (!task)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Task not found",
            requestId: request.id,
          },
        });
      const input = TaskToolRunInput.parse(request.body);
      return executeToolIntent(
        ToolRunInput.parse({
          ...input,
          taskId,
          projectId: task.projectId,
          agentId: task.agentId,
          workspaceId: task.workspaceId,
          stepId: input.stepId ?? randomUUID(),
        }),
        request.id,
        reply,
      );
    },
  );

  const mcpHandler = createMcpNodeHandler(options.store, taskRunner);
  app.all(
    "/mcp",
    { preHandler: requireRole(options.secrets, ["MCP"]) },
    async (request, reply) => {
      reply.hijack();
      await mcpHandler(request.raw as never, reply.raw, request.body);
    },
  );

  const dashboardSession = requireSession(sessionSecret);
  app.get("/v1/ui/snapshot", { preHandler: dashboardSession }, async () => {
    const [agents, organizations, projects, tasks, approvals, logs] =
      await Promise.all([
        options.store.listAgents(),
        options.store.listOrganizations(),
        options.store.listProjects(),
        options.store.listTasks(),
        options.store.listApprovals(),
        options.store.listAudits(),
      ]);
    return {
      agents: agents.map(({ tokenDigest: _tokenDigest, ...agent }) => agent),
      organizations,
      projects,
      tasks,
      approvals,
      logs,
      tools: agentHub.connectedTools(),
    };
  });
  app.patch(
    "/v1/ui/agents/:id/access-mode",
    { preHandler: dashboardSession },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const { accessMode } = AgentAccessModeInput.parse(request.body);
      const agent = await changeAgentAccessMode(id, accessMode, "dashboard");
      if (!agent)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Agent not found",
            requestId: request.id,
          },
        });
      const { tokenDigest: _tokenDigest, ...publicAgent } = agent;
      return publicAgent;
    },
  );
  app.post(
    "/v1/ui/approvals/:id/decision",
    { preHandler: dashboardSession },
    async (request, reply) => {
      const id = IdSchema.parse((request.params as { id: unknown }).id);
      const input = DecisionInput.parse(request.body);
      const approval = await options.store.decideApproval(
        id,
        input.decision,
        new Date(),
      );
      if (!approval)
        return reply.code(409).send({
          error: {
            code: "APPROVAL_NOT_PENDING",
            message: "Approval is missing or already decided",
            requestId: request.id,
          },
        });
      await options.store.appendAudit({
        agentId: null,
        projectId: null,
        userId: "dashboard",
        action: "approval.decided",
        durationMs: null,
        status: approval.status,
        metadata: {
          taskId: approval.taskId,
          approvalId: id,
          decision: input.decision,
        },
      });
      if (
        approval.status === "APPROVED" &&
        (await options.store.loadTaskPlan(approval.taskId))
      )
        continueTask(approval.taskId);
      return approval;
    },
  );

  const dashboardRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dashboard/dist",
  );
  if (existsSync(dashboardRoot)) {
    await app.register(fastifyStatic, { root: dashboardRoot, wildcard: true });
  }

  return app;
}

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseContextContent(category: string, content: unknown): unknown {
  if (category === "code-index") return CodeIndexSchema.parse(content);
  if (category === "decisions" || category === "known-issues")
    return z.string().max(1_000_000).parse(content);
  if (category === "history")
    return z.array(z.unknown()).max(500).parse(content);
  return z.record(z.string(), z.unknown()).parse(content);
}

async function validatePlannedAssignment(
  store: PlatformStore,
  projectId: string,
  agentId: string,
  workspaceId: string,
) {
  const [project, agent, workspace] = await Promise.all([
    store.findProject(projectId),
    store.findAgent(agentId),
    store.findWorkspace(workspaceId),
  ]);
  if (!project) return { ok: false as const, reason: "Project does not exist" };
  if (!agent || ["DISABLED", "REVOKED"].includes(agent.status))
    return { ok: false as const, reason: "Agent is unavailable" };
  if (
    !workspace ||
    workspace.projectId !== projectId ||
    workspace.agentId !== agentId
  )
    return {
      ok: false as const,
      reason: "Workspace is not bound to this Project and Agent",
    };
  return { ok: true as const, agent, workspace };
}
