import { randomUUID } from "node:crypto";
import type {
  EngineeringPlan,
  ProjectProfile,
} from "../../../packages/contracts/src/index.js";
import type {
  AgentRecord,
  ApprovalRecord,
  AuditRecord,
  PlatformStore,
  ProjectRecord,
  TaskRecord,
  TaskStepRecord,
  WorkspaceRecord,
} from "../domain.js";
import { redactEvent } from "../observability/redaction.js";

export class MemoryStore implements PlatformStore {
  private agents: AgentRecord[] = [];
  private projects: ProjectRecord[] = [];
  private workspaces: WorkspaceRecord[] = [];
  private tasks: TaskRecord[] = [];
  private approvals: ApprovalRecord[] = [];
  private audits: AuditRecord[] = [];
  private idempotency = new Map<
    string,
    { requestHash: string; response: TaskRecord }
  >();
  private taskSteps: TaskStepRecord[] = [];
  private projectProfiles = new Map<string, ProjectProfile>();

  async listAgents() {
    return this.agents.toSorted((a, b) => a.name.localeCompare(b.name));
  }
  async createAgent(
    input: Pick<
      AgentRecord,
      "name" | "environment" | "permissionLevel" | "tokenDigest"
    >,
  ) {
    const record: AgentRecord = {
      id: randomUUID(),
      ...input,
      status: "OFFLINE",
      inventory: null,
      lastSeenAt: null,
      createdAt: new Date(),
    };
    this.agents.push(record);
    return record;
  }
  async updateAgentStatus(id: string, status: AgentRecord["status"]) {
    const record = this.agents.find((agent) => agent.id === id);
    if (!record) return null;
    record.status = status;
    return record;
  }
  async updateAgentToken(id: string, tokenDigest: string) {
    const record = this.agents.find((agent) => agent.id === id);
    if (!record || record.status === "REVOKED") return null;
    record.tokenDigest = tokenDigest;
    return record;
  }
  async updateAgentPresence(id: string, inventory: unknown, lastSeenAt: Date) {
    const record = this.agents.find((agent) => agent.id === id);
    if (!record || ["DISABLED", "REVOKED"].includes(record.status)) return null;
    record.status = "ONLINE";
    record.inventory = inventory;
    record.lastSeenAt = lastSeenAt;
    return record;
  }
  async findAgent(id: string) {
    return this.agents.find((agent) => agent.id === id) ?? null;
  }
  async listProjects() {
    return this.projects.toSorted((a, b) => a.name.localeCompare(b.name));
  }
  async createProject(input: Pick<ProjectRecord, "name" | "repositoryUrl">) {
    const record: ProjectRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    this.projects.push(record);
    return record;
  }
  async findProject(id: string) {
    return this.projects.find((project) => project.id === id) ?? null;
  }
  async findProjectByName(name: string) {
    return this.projects.find((project) => project.name === name) ?? null;
  }
  async createWorkspace(
    input: Pick<WorkspaceRecord, "projectId" | "agentId" | "rootPath">,
  ) {
    const record: WorkspaceRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    this.workspaces.push(record);
    return record;
  }
  async findWorkspace(id: string) {
    return this.workspaces.find((workspace) => workspace.id === id) ?? null;
  }
  async listTasks() {
    return this.tasks.toSorted(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  async findTask(id: string) {
    return this.tasks.find((task) => task.id === id) ?? null;
  }
  async updateTaskStatus(id: string, status: TaskRecord["status"]) {
    const record = this.tasks.find((task) => task.id === id);
    if (!record) return null;
    record.status = status;
    record.updatedAt = new Date();
    return record;
  }
  async createTask(
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ) {
    const now = new Date();
    const record: TaskRecord = {
      id: randomUUID(),
      ...input,
      status: "QUEUED",
      fixAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(record);
    return record;
  }
  async createTaskIdempotently(
    key: string,
    requestHash: string,
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ) {
    const existing = this.idempotency.get(key);
    if (existing)
      return existing.requestHash === requestHash
        ? { type: "REPLAYED" as const, task: existing.response }
        : { type: "MISMATCH" as const };
    const task = await this.createTask(input);
    this.idempotency.set(key, { requestHash, response: task });
    return { type: "CREATED" as const, task };
  }
  async listApprovals() {
    return this.approvals.toSorted(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  async findApproval(id: string) {
    return this.approvals.find((approval) => approval.id === id) ?? null;
  }
  async consumeApproval(id: string, now: Date) {
    const record = this.approvals.find((approval) => approval.id === id);
    if (
      !record ||
      record.status !== "APPROVED" ||
      !record.expiresAt ||
      record.expiresAt <= now
    )
      return null;
    if (record.scope === "ONCE") record.status = "EXPIRED";
    return record;
  }
  async createApproval(
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
  ) {
    const record: ApprovalRecord = {
      id: randomUUID(),
      ...input,
      status: "PENDING",
      scope: null,
      expiresAt: null,
      decidedAt: null,
      createdAt: new Date(),
    };
    this.approvals.push(record);
    return record;
  }
  async decideApproval(
    id: string,
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
    now: Date,
  ) {
    const record = this.approvals.find((approval) => approval.id === id);
    if (!record || record.status !== "PENDING") return null;
    record.status = decision === "DENY" ? "DENIED" : "APPROVED";
    record.scope =
      decision === "APPROVE_ONCE"
        ? "ONCE"
        : decision === "APPROVE_SESSION"
          ? "SESSION"
          : null;
    record.decidedAt = now;
    record.expiresAt =
      decision === "DENY"
        ? null
        : new Date(
            now.getTime() +
              (record.scope === "ONCE" ? 10 * 60_000 : 60 * 60_000),
          );
    return record;
  }
  async appendAudit(input: Omit<AuditRecord, "id" | "timestamp">) {
    const record: AuditRecord = {
      id: randomUUID(),
      timestamp: new Date(),
      ...input,
      metadata: redactEvent(input.metadata) as Record<string, unknown>,
    };
    this.audits.push(record);
    return record;
  }
  async listAudits() {
    return this.audits.toSorted(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }
  async saveProjectProfile(projectId: string, profile: ProjectProfile) {
    this.projectProfiles.set(projectId, profile);
  }
  async saveTaskPlan(taskId: string, plan: EngineeringPlan) {
    this.taskSteps = this.taskSteps.filter((step) => step.taskId !== taskId);
    this.taskSteps.push(
      ...plan.steps.map((step, position) => ({
        id: randomUUID(),
        taskId,
        position,
        title: step.title,
        toolName: step.toolName,
        arguments: step.arguments,
        state: "PLANNED",
        evidence: null,
        createdAt: new Date(),
      })),
    );
  }
  async recordTaskEvidence(
    taskId: string,
    position: number,
    evidence: unknown,
  ) {
    const step = this.taskSteps.find(
      (item) => item.taskId === taskId && item.position === position,
    );
    if (!step) throw new Error("Task step not found");
    step.evidence = redactEvent(evidence);
    step.state = "VERIFIED";
  }
  async listTaskSteps(taskId: string) {
    return this.taskSteps
      .filter((step) => step.taskId === taskId)
      .toSorted((a, b) => a.position - b.position);
  }
}
