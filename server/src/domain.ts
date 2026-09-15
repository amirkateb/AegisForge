import type {
  EngineeringPlan,
  EnvironmentName,
  PermissionLevel,
  ProjectProfile,
  ProjectContext,
  ProjectContextCategory,
  Risk,
  TaskStatus,
} from "@aegisforge/contracts";

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
  organizationId: string | null;
  name: string;
  repositoryUrl: string | null;
  createdAt: Date;
}
export interface OrganizationRecord {
  id: string;
  name: string;
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
  listOrganizations(): Promise<OrganizationRecord[]>;
  createOrganization(input: Pick<OrganizationRecord, "name">): Promise<OrganizationRecord>;
  findOrganization(id: string): Promise<OrganizationRecord | null>;
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
  createProject(input: {
    name: string;
    repositoryUrl: string | null;
    organizationId?: string | null;
  }): Promise<ProjectRecord>;
  findProject(id: string): Promise<ProjectRecord | null>;
  findProjectByName(name: string, organizationId?: string | null): Promise<ProjectRecord | null>;
  createWorkspace(
    input: Pick<WorkspaceRecord, "projectId" | "agentId" | "rootPath">,
  ): Promise<WorkspaceRecord>;
  findWorkspace(id: string): Promise<WorkspaceRecord | null>;
  listWorkspaces(projectId?: string): Promise<WorkspaceRecord[]>;
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
  saveProjectMemory(
    projectId: string,
    category: ProjectContextCategory,
    content: unknown,
    sourceTaskId?: string,
  ): Promise<void>;
  loadProjectContext(projectId: string): Promise<ProjectContext>;
  appendProjectHistory(
    projectId: string,
    entry: { taskId: string; outcome: string; summary: string; at?: string },
  ): Promise<void>;
  saveTaskPlan(taskId: string, plan: EngineeringPlan): Promise<void>;
  loadTaskPlan(taskId: string): Promise<EngineeringPlan | null>;
  recordTaskEvidence(
    taskId: string,
    position: number,
    evidence: unknown,
    verified?: boolean,
  ): Promise<void>;
  listTaskSteps(taskId: string): Promise<TaskStepRecord[]>;
}
