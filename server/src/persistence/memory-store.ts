import { randomUUID } from "node:crypto";
import type {
  EngineeringPlan,
  ProjectContext,
  ProjectContextCategory,
  ProjectProfile,
} from "@aegisforge/contracts";
import type {
  AgentRecord,
  ApprovalRecord,
  AuditRecord,
  PlatformStore,
  OrganizationRecord,
  ProjectRecord,
  TaskRecord,
  TaskStepRecord,
  WorkspaceRecord,
} from "../domain.js";
import { redactEvent } from "../observability/redaction.js";

export class MemoryStore implements PlatformStore {
  private agents: AgentRecord[] = [];
  private organizations: OrganizationRecord[] = [];
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
  private taskPlans = new Map<string, EngineeringPlan>();
  private projectProfiles = new Map<string, ProjectProfile>();
  private projectMemory = new Map<string, Map<ProjectContextCategory, unknown>>();

  async listOrganizations() {
    return this.organizations.toSorted((a, b) => a.name.localeCompare(b.name));
  }
  async createOrganization(input: Pick<OrganizationRecord, "name">) {
    const record = { id: randomUUID(), name: input.name, createdAt: new Date() };
    this.organizations.push(record);
    return record;
  }
  async findOrganization(id: string) {
    return this.organizations.find((item) => item.id === id) ?? null;
  }

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
  async createProject(input: { name: string; repositoryUrl: string | null; organizationId?: string | null }) {
    const record: ProjectRecord = {
      id: randomUUID(),
      ...input,
      organizationId: input.organizationId ?? null,
      createdAt: new Date(),
    };
    this.projects.push(record);
    return record;
  }
  async findProject(id: string) {
    return this.projects.find((project) => project.id === id) ?? null;
  }
  async findProjectByName(name: string, organizationId: string | null = null) {
    return this.projects.find((project) => project.name === name && project.organizationId === organizationId) ?? null;
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
  async listWorkspaces(projectId?: string) {
    return this.workspaces.filter((item) => !projectId || item.projectId === projectId);
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
    await this.saveProjectMemory(projectId, "architecture", profile.architecture);
    await this.saveProjectMemory(projectId, "dependencies", profile.dependencies);
    await this.saveProjectMemory(projectId, "database", profile.databases);
    await this.saveProjectMemory(projectId, "routes", profile.routes);
  }
  async saveProjectMemory(projectId: string, category: ProjectContextCategory, content: unknown) {
    const categories = this.projectMemory.get(projectId) ?? new Map<ProjectContextCategory, unknown>();
    categories.set(category, redactEvent(content));
    this.projectMemory.set(projectId, categories);
  }
  async loadProjectContext(projectId: string): Promise<ProjectContext> {
    const memory = this.projectMemory.get(projectId);
    return {
      projectId,
      architecture: memory?.get("architecture") ?? null,
      dependencies: memory?.get("dependencies") ?? null,
      environment: memory?.get("environment") ?? null,
      database: memory?.get("database") ?? null,
      routes: memory?.get("routes") ?? null,
      decisions: memory?.get("decisions") ?? null,
      knownIssues: memory?.get("known-issues") ?? null,
      history: memory?.get("history") ?? null,
      codeIndex: (memory?.get("code-index") as ProjectContext["codeIndex"] | undefined) ?? null,
    };
  }
  async appendProjectHistory(projectId: string, entry: { taskId: string; outcome: string; summary: string; at?: string }) {
    const context = await this.loadProjectContext(projectId);
    const history = Array.isArray(context.history) ? context.history : [];
    await this.saveProjectMemory(projectId, "history", [...history.slice(-499), { ...entry, at: entry.at ?? new Date().toISOString() }]);
  }
  async saveTaskPlan(taskId: string, plan: EngineeringPlan) {
    this.taskPlans.set(taskId, structuredClone(plan));
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
  async loadTaskPlan(taskId: string) {
    return this.taskPlans.get(taskId) ?? null;
  }
  async recordTaskEvidence(
    taskId: string,
    position: number,
    evidence: unknown,
    verified = true,
  ) {
    const step = this.taskSteps.find(
      (item) => item.taskId === taskId && item.position === position,
    );
    if (!step) throw new Error("Task step not found");
    step.evidence = redactEvent(evidence);
    step.state = verified ? "VERIFIED" : "FAILED_VERIFICATION";
  }
  async listTaskSteps(taskId: string) {
    return this.taskSteps
      .filter((step) => step.taskId === taskId)
      .toSorted((a, b) => a.position - b.position);
  }
}
