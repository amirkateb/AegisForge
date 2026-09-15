import { z } from "zod";

export const IdSchema = z.string().uuid();
export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type AgentId = Brand<string, "AgentId">;
export type ProjectId = Brand<string, "ProjectId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type TaskId = Brand<string, "TaskId">;
export type ApprovalId = Brand<string, "ApprovalId">;

export const EnvironmentSchema = z.enum([
  "PRODUCTION",
  "DEVELOPMENT",
  "TESTING",
]);
export type EnvironmentName = z.infer<typeof EnvironmentSchema>;

export const RiskSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Risk = z.infer<typeof RiskSchema>;

export const PermissionLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const AgentAccessModeSchema = z.enum([
  "FULL_TRUST",
  "CAUTIOUS",
  "VERY_CAUTIOUS",
]);
export type AgentAccessMode = z.infer<typeof AgentAccessModeSchema>;

export const ApprovalModeSchema = z.enum(["NEVER", "SENSITIVE", "ALWAYS"]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const TaskStatusSchema = z.enum([
  "QUEUED",
  "UNDERSTANDING",
  "PLANNING",
  "WAITING_APPROVAL",
  "EXECUTING",
  "VERIFYING",
  "FIXING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgentInventorySchema = z.object({
  agentVersion: z.string().min(1).max(100).optional(),
  health: z
    .object({
      score: z.number().min(0).max(100),
      latencyMs: z.number().nonnegative().nullable(),
      lastHeartbeatAt: z.string().datetime(),
    })
    .optional(),
  os: z.object({
    platform: z.string(),
    release: z.string(),
    architecture: z.string(),
    hostname: z.string(),
  }),
  cpu: z.object({
    model: z.string(),
    cores: z.number().int().positive(),
    loadPercent: z.number().min(0).max(100),
  }),
  memory: z.object({
    totalBytes: z.number().nonnegative(),
    freeBytes: z.number().nonnegative(),
  }),
  disks: z.array(
    z.object({
      mount: z.string(),
      totalBytes: z.number().nonnegative(),
      freeBytes: z.number().nonnegative(),
    }),
  ),
  network: z.array(
    z.object({
      name: z.string(),
      address: z.string(),
      family: z.string(),
      isInternal: z.boolean(),
    }),
  ),
  runtimes: z.record(z.string(), z.string().nullable()),
  docker: z.object({
    isInstalled: z.boolean(),
    isRunning: z.boolean(),
    version: z.string().nullable(),
  }),
  databaseTools: z.array(z.string()),
  collectedAt: z.string().datetime(),
});
export type AgentInventory = z.infer<typeof AgentInventorySchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_.-]{1,99}$/),
  description: z.string().min(1).max(1000),
  requiredLevel: PermissionLevelSchema,
  risk: RiskSchema,
  approval: ApprovalModeSchema,
  inputSchema: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().positive().max(3_600_000),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const CreateTaskSchema = z.object({
  projectId: IdSchema,
  agentId: IdSchema,
  workspaceId: IdSchema,
  goal: z.string().trim().min(3).max(20_000),
  maxFixAttempts: z.number().int().min(0).max(5).default(2),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const ToolIntentSchema = z.object({
  taskId: IdSchema,
  stepId: IdSchema,
  toolName: z.string().min(2).max(100),
  arguments: z.record(z.string(), z.unknown()),
  reason: z.string().min(3).max(4000),
  expectedImpact: z.string().min(3).max(4000),
  affectedResources: z.array(z.string().max(1000)).max(100),
});
export type ToolIntent = z.infer<typeof ToolIntentSchema>;

export const PlanStepSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
  toolName: z.string().min(2).max(100).nullable(),
  arguments: z.record(z.string(), z.unknown()),
  verification: z.string().trim().min(3).max(2000),
});
export const EngineeringPlanSchema = z.object({
  summary: z.string().trim().min(3).max(4000),
  assumptions: z.array(z.string().max(1000)).max(20),
  steps: z.array(PlanStepSchema).min(1).max(50),
});
export type EngineeringPlan = z.infer<typeof EngineeringPlanSchema>;

export const ProjectProfileSchema = z.object({
  framework: z.array(z.string()).max(30),
  dependencies: z.array(z.string()).max(2000),
  databases: z.array(z.string()).max(20),
  routes: z.array(z.string()).max(500),
  architecture: z.array(z.string()).max(100),
  importantFiles: z.array(z.string()).max(200),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

export const CodeSymbolSchema = z.object({
  name: z.string().min(1).max(300),
  kind: z.enum(["class", "interface", "function", "method", "module"]),
  path: z.string().min(1).max(2000),
  line: z.number().int().positive(),
});
export const CodeRelationSchema = z.object({
  from: z.string().min(1).max(2000),
  to: z.string().min(1).max(2000),
  type: z.enum(["imports", "uses", "extends", "calls"]),
});
export const RouteInfoSchema = z.object({
  method: z.string().min(1).max(20),
  path: z.string().min(1).max(2000),
  handler: z.string().max(1000).nullable(),
  source: z.string().min(1).max(2000),
});
export const DatabaseEntitySchema = z.object({
  name: z.string().min(1).max(300),
  kind: z.enum(["table", "model", "migration"]),
  source: z.string().min(1).max(2000),
});
export const CodeIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  filesIndexed: z.number().int().nonnegative(),
  symbols: z.array(CodeSymbolSchema).max(20_000),
  relations: z.array(CodeRelationSchema).max(40_000),
  routes: z.array(RouteInfoSchema).max(5000),
  databaseEntities: z.array(DatabaseEntitySchema).max(5000),
});
export type CodeIndex = z.infer<typeof CodeIndexSchema>;

export const ProjectContextCategorySchema = z.enum([
  "architecture",
  "dependencies",
  "environment",
  "database",
  "routes",
  "decisions",
  "known-issues",
  "history",
  "code-index",
]);
export type ProjectContextCategory = z.infer<
  typeof ProjectContextCategorySchema
>;

export const ProjectContextSchema = z.object({
  projectId: z.string().min(1),
  architecture: z.unknown().nullable(),
  dependencies: z.unknown().nullable(),
  environment: z.unknown().nullable(),
  database: z.unknown().nullable(),
  routes: z.unknown().nullable(),
  decisions: z.unknown().nullable(),
  knownIssues: z.unknown().nullable(),
  history: z.unknown().nullable(),
  codeIndex: CodeIndexSchema.nullable(),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const AgentHelloSchema = z.object({
  type: z.literal("HELLO"),
  protocolVersion: z.literal(1),
  agentId: IdSchema,
  connectionNonce: z.string().min(32).max(256),
  inventory: AgentInventorySchema,
  tools: z.array(ToolDefinitionSchema).max(1000),
});

export const DispatchSchema = z.object({
  type: z.literal("DISPATCH"),
  protocolVersion: z.literal(1),
  dispatchId: IdSchema,
  taskId: IdSchema,
  projectId: IdSchema,
  workspaceId: IdSchema,
  tool: ToolDefinitionSchema,
  intent: ToolIntentSchema,
  permissionLevel: PermissionLevelSchema,
  accessMode: AgentAccessModeSchema,
  approvalGrantId: IdSchema.nullable(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type Dispatch = z.infer<typeof DispatchSchema>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface Page<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
