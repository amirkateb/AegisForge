import { createHash } from "node:crypto";
import {
  createMcpHandler,
  Server,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { CreateTaskSchema } from "../../../packages/contracts/src/index.js";
import type { PlatformStore } from "../domain.js";

const tools: Tool[] = [
  {
    name: "aegis_list_agents",
    description: "List AegisForge Agents and their current status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "aegis_list_projects",
    description: "List registered AegisForge Projects.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "aegis_list_approvals",
    description: "List pending and recent operation approvals.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "aegis_create_task",
    description:
      "Create an explicitly assigned engineering task. Mutations require a caller-stable idempotencyKey.",
    inputSchema: {
      type: "object",
      required: [
        "idempotencyKey",
        "projectId",
        "agentId",
        "workspaceId",
        "goal",
      ],
      additionalProperties: false,
      properties: {
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
        projectId: { type: "string", format: "uuid" },
        agentId: { type: "string", format: "uuid" },
        workspaceId: { type: "string", format: "uuid" },
        goal: { type: "string", minLength: 3, maxLength: 20000 },
        maxFixAttempts: { type: "integer", minimum: 0, maximum: 5 },
      },
    },
  },
];
const text = (value: unknown, isError = false): CallToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
  ...(isError ? { isError: true } : {}),
});
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function serverFor(store: PlatformStore) {
  const server = new Server(
    { name: "aegisforge", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler("tools/list", async () => ({ tools }));
  server.setRequestHandler("tools/call", async (request) => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      switch (request.params.name) {
        case "aegis_list_agents":
          return text(await store.listAgents());
        case "aegis_list_projects":
          return text(await store.listProjects());
        case "aegis_list_approvals":
          return text(await store.listApprovals());
        case "aegis_create_task": {
          const key =
            typeof args.idempotencyKey === "string" ? args.idempotencyKey : "";
          if (key.length < 8) throw new Error("idempotencyKey is required");
          const input = CreateTaskSchema.parse(args);
          const [agent, project, workspace] = await Promise.all([
            store.findAgent(input.agentId),
            store.findProject(input.projectId),
            store.findWorkspace(input.workspaceId),
          ]);
          if (
            !agent ||
            !project ||
            !workspace ||
            workspace.agentId !== agent.id ||
            workspace.projectId !== project.id
          )
            throw new Error("Invalid explicit task assignment");
          const result = await store.createTaskIdempotently(
            key,
            hash(input),
            input,
          );
          if (result.type === "MISMATCH")
            throw new Error("Idempotency key reused with a different request");
          return text(result.task);
        }
        default:
          return text("Unknown tool", true);
      }
    } catch (error) {
      return text(error instanceof Error ? error.message : String(error), true);
    }
  });
  return server;
}
export function createMcpNodeHandler(store: PlatformStore) {
  return toNodeHandler(
    createMcpHandler(() => serverFor(store), { legacy: "stateless" }),
  );
}
