import type {
  EngineeringPlan,
  EnvironmentName,
  PermissionLevel,
  ProjectProfile,
  Risk,
  TaskStatus,
} from "../../packages/contracts/src/index.js";

export interface AgentRecord {
  id: string;
  name: string;
  environment: EnvironmentName;
  permissionLevel: PermissionLevel;
  tokenDigest: string;
  status: "ONLINE" | "OFFLINE" | "DISABLED" | "REVOKED";
  inventory: unknown | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}
export interface ProjectRecord {
  id: string;
  name: string;
  repositoryUrl: string | null;
  createdAt: Date;
}
export interface WorkspaceRecord {
  id: string;
  projectId: string;
  agentId: string;
  rootPath: string;
  createdAt: Date;
}
export interface TaskRecord {
  id: string;
  projectId: string;
  agentId: string;
  workspaceId: string;
  goal: string;
  status: TaskStatus;
  maxFixAttempts: number;
  fixAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface ApprovalRecord {
  id: string;
  taskId: string;
  toolName: string;
  risk: Risk;
  reason: string;
  impact: string;
  affectedResources: string[];
  argumentHash: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";
  scope: "ONCE" | "SESSION" | null;
  expiresAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
}
export interface AuditRecord {
  id: string;
  timestamp: Date;
  agentId: string | null;
  projectId: string | null;
  userId: string | null;
  action: string;
  durationMs: number | null;
  status: string;
  metadata: Record<string, unknown>;
}
export interface TaskStepRecord {
  id: string;
  taskId: string;
  position: number;
  title: string;
  toolName: string | null;
  arguments: Record<string, unknown>;
  state: string;
  evidence: unknown | null;
  createdAt: Date;
}

export interface PlatformStore {
  listAgents(): Promise<AgentRecord[]>;
  createAgent(
    input: Pick<
      AgentRecord,
      "name" | "environment" | "permissionLevel" | "tokenDigest"
    >,
  ): Promise<AgentRecord>;
  updateAgentStatus(
    id: string,
    status: AgentRecord["status"],
  ): Promise<AgentRecord | null>;
  updateAgentToken(
    id: string,
    tokenDigest: string,
  ): Promise<AgentRecord | null>;
  updateAgentPresence(
    id: string,
    inventory: unknown,
    lastSeenAt: Date,
  ): Promise<AgentRecord | null>;
  findAgent(id: string): Promise<AgentRecord | null>;
  listProjects(): Promise<ProjectRecord[]>;
  createProject(
    input: Pick<ProjectRecord, "name" | "repositoryUrl">,
  ): Promise<ProjectRecord>;
  findProject(id: string): Promise<ProjectRecord | null>;
  findProjectByName(name: string): Promise<ProjectRecord | null>;
  createWorkspace(
    input: Pick<WorkspaceRecord, "projectId" | "agentId" | "rootPath">,
  ): Promise<WorkspaceRecord>;
  findWorkspace(id: string): Promise<WorkspaceRecord | null>;
  listTasks(): Promise<TaskRecord[]>;
  findTask(id: string): Promise<TaskRecord | null>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<TaskRecord | null>;
  createTask(
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ): Promise<TaskRecord>;
  createTaskIdempotently(
    key: string,
    requestHash: string,
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ): Promise<
    | { type: "CREATED"; task: TaskRecord }
    | { type: "REPLAYED"; task: TaskRecord }
    | { type: "MISMATCH" }
  >;
  listApprovals(): Promise<ApprovalRecord[]>;
  findApproval(id: string): Promise<ApprovalRecord | null>;
  consumeApproval(id: string, now: Date): Promise<ApprovalRecord | null>;
  createApproval(
    input: Pick<
      ApprovalRecord,
      | "taskId"
      | "toolName"
      | "risk"
      | "reason"
      | "impact"
      | "affectedResources"
      | "argumentHash"
    >,
  ): Promise<ApprovalRecord>;
  decideApproval(
    id: string,
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
    now: Date,
  ): Promise<ApprovalRecord | null>;
  appendAudit(
    input: Omit<AuditRecord, "id" | "timestamp">,
  ): Promise<AuditRecord>;
  listAudits(): Promise<AuditRecord[]>;
  saveProjectProfile(
    projectId: string,
    profile: ProjectProfile,
    sourceTaskId?: string,
  ): Promise<void>;
  saveTaskPlan(taskId: string, plan: EngineeringPlan): Promise<void>;
  recordTaskEvidence(
    taskId: string,
    position: number,
    evidence: unknown,
  ): Promise<void>;
  listTaskSteps(taskId: string): Promise<TaskStepRecord[]>;
}
