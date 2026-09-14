import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
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

function camel<T>(row: QueryResultRow): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row))
    out[
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    ] = value;
  return out as T;
}

export class PgStore implements PlatformStore {
  constructor(private readonly pool: Pool) {}

  async close(): Promise<void> {
    await this.pool.end();
  }
  private async rows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    return (await this.pool.query(sql, values)).rows.map((row) =>
      camel<T>(row),
    );
  }
  private async one<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    return (await this.rows<T>(sql, values))[0] ?? null;
  }

  async listAgents() {
    return this.rows<AgentRecord>("SELECT * FROM agents ORDER BY name");
  }
  async createAgent(
    input: Pick<
      AgentRecord,
      "name" | "environment" | "permissionLevel" | "tokenDigest"
    >,
  ) {
    return (await this.one<AgentRecord>(
      "INSERT INTO agents(name, environment, permission_level, token_digest) VALUES($1,$2,$3,$4) RETURNING *",
      [input.name, input.environment, input.permissionLevel, input.tokenDigest],
    ))!;
  }
  async updateAgentStatus(id: string, status: AgentRecord["status"]) {
    return this.one<AgentRecord>(
      "UPDATE agents SET status=$2 WHERE id=$1 RETURNING *",
      [id, status],
    );
  }
  async updateAgentToken(id: string, tokenDigest: string) {
    return this.one<AgentRecord>(
      "UPDATE agents SET token_digest=$2 WHERE id=$1 AND status<>'REVOKED' RETURNING *",
      [id, tokenDigest],
    );
  }
  async updateAgentPresence(id: string, inventory: unknown, lastSeenAt: Date) {
    return this.one<AgentRecord>(
      "UPDATE agents SET status='ONLINE',inventory=$2,last_seen_at=$3 WHERE id=$1 AND status NOT IN ('DISABLED','REVOKED') RETURNING *",
      [id, JSON.stringify(inventory), lastSeenAt],
    );
  }
  async findAgent(id: string) {
    return this.one<AgentRecord>("SELECT * FROM agents WHERE id=$1", [id]);
  }
  async listProjects() {
    return this.rows<ProjectRecord>("SELECT * FROM projects ORDER BY name");
  }
  async createProject(input: Pick<ProjectRecord, "name" | "repositoryUrl">) {
    return (await this.one<ProjectRecord>(
      "INSERT INTO projects(name, repository_url) VALUES($1,$2) RETURNING *",
      [input.name, input.repositoryUrl],
    ))!;
  }
  async findProject(id: string) {
    return this.one<ProjectRecord>("SELECT * FROM projects WHERE id=$1", [id]);
  }
  async findProjectByName(name: string) {
    return this.one<ProjectRecord>("SELECT * FROM projects WHERE name=$1", [
      name,
    ]);
  }
  async createWorkspace(
    input: Pick<WorkspaceRecord, "projectId" | "agentId" | "rootPath">,
  ) {
    return (await this.one<WorkspaceRecord>(
      "INSERT INTO workspaces(project_id, agent_id, root_path) VALUES($1,$2,$3) RETURNING *",
      [input.projectId, input.agentId, input.rootPath],
    ))!;
  }
  async findWorkspace(id: string) {
    return this.one<WorkspaceRecord>("SELECT * FROM workspaces WHERE id=$1", [
      id,
    ]);
  }
  async listTasks() {
    return this.rows<TaskRecord>(
      "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1000",
    );
  }
  async findTask(id: string) {
    return this.one<TaskRecord>("SELECT * FROM tasks WHERE id=$1", [id]);
  }
  async updateTaskStatus(id: string, status: TaskRecord["status"]) {
    return this.one<TaskRecord>(
      "UPDATE tasks SET status=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [id, status],
    );
  }
  async createTask(
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ) {
    return (await this.one<TaskRecord>(
      "INSERT INTO tasks(project_id,agent_id,workspace_id,goal,max_fix_attempts) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [
        input.projectId,
        input.agentId,
        input.workspaceId,
        input.goal,
        input.maxFixAttempts,
      ],
    ))!;
  }
  async createTaskIdempotently(
    key: string,
    requestHash: string,
    input: Omit<
      TaskRecord,
      "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
    >,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        "INSERT INTO idempotency_keys(key,request_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key",
        [key, requestHash],
      );
      if (claimed.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          task_id: string;
        }>(
          "SELECT request_hash, task_id FROM idempotency_keys WHERE key=$1 FOR UPDATE",
          [key],
        );
        const record = existing.rows[0];
        if (!record || record.request_hash !== requestHash) {
          await client.query("ROLLBACK");
          return { type: "MISMATCH" as const };
        }
        const task = await queryTask(client, record.task_id);
        await client.query("COMMIT");
        return { type: "REPLAYED" as const, task };
      }
      const task = await insertTask(client, input);
      await client.query(
        "UPDATE idempotency_keys SET task_id=$2 WHERE key=$1",
        [key, task.id],
      );
      await client.query("COMMIT");
      return { type: "CREATED" as const, task };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async listApprovals() {
    return this.rows<ApprovalRecord>(
      "SELECT * FROM approvals ORDER BY created_at DESC LIMIT 1000",
    );
  }
  async findApproval(id: string) {
    return this.one<ApprovalRecord>("SELECT * FROM approvals WHERE id=$1", [
      id,
    ]);
  }
  async consumeApproval(id: string, now: Date) {
    return this.one<ApprovalRecord>(
      "UPDATE approvals SET status=CASE WHEN scope='ONCE' THEN 'EXPIRED'::approval_status ELSE status END WHERE id=$1 AND status='APPROVED' AND expires_at>$2 RETURNING *",
      [id, now],
    );
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
    return (await this.one<ApprovalRecord>(
      "INSERT INTO approvals(task_id,tool_name,risk,reason,impact,affected_resources,argument_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [
        input.taskId,
        input.toolName,
        input.risk,
        input.reason,
        input.impact,
        JSON.stringify(input.affectedResources),
        input.argumentHash,
      ],
    ))!;
  }
  async decideApproval(
    id: string,
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
    now: Date,
  ) {
    const status = decision === "DENY" ? "DENIED" : "APPROVED";
    const scope =
      decision === "APPROVE_ONCE"
        ? "ONCE"
        : decision === "APPROVE_SESSION"
          ? "SESSION"
          : null;
    const minutes = scope === "SESSION" ? 60 : 10;
    return this.one<ApprovalRecord>(
      `UPDATE approvals SET status=$2,scope=$3,decided_at=$4,expires_at=CASE WHEN $3::approval_scope IS NULL THEN NULL ELSE $4::timestamptz + ($5 * interval '1 minute') END WHERE id=$1 AND status='PENDING' RETURNING *`,
      [id, status, scope, now, minutes],
    );
  }
  async appendAudit(input: Omit<AuditRecord, "id" | "timestamp">) {
    return (await this.one<AuditRecord>(
      "INSERT INTO audit_events(agent_id,project_id,user_id,action,duration_ms,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [
        input.agentId,
        input.projectId,
        input.userId,
        input.action,
        input.durationMs,
        input.status,
        JSON.stringify(redactEvent(input.metadata)),
      ],
    ))!;
  }
  async listAudits() {
    return this.rows<AuditRecord>(
      "SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT 1000",
    );
  }
  async saveProjectProfile(
    projectId: string,
    profile: ProjectProfile,
    sourceTaskId?: string,
  ) {
    await this.pool.query(
      "INSERT INTO project_memory(project_id,category,content,source_task_id) VALUES($1,'profile',$2,$3) ON CONFLICT(project_id,category) DO UPDATE SET content=excluded.content,source_task_id=excluded.source_task_id,updated_at=now()",
      [projectId, JSON.stringify(profile), sourceTaskId ?? null],
    );
  }
  async saveTaskPlan(taskId: string, plan: EngineeringPlan) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM task_steps WHERE task_id=$1", [taskId]);
      for (const [position, step] of plan.steps.entries())
        await client.query(
          "INSERT INTO task_steps(task_id,position,title,tool_name,arguments,state) VALUES($1,$2,$3,$4,$5,$6)",
          [
            taskId,
            position,
            step.title,
            step.toolName,
            JSON.stringify(step.arguments),
            "PLANNED",
          ],
        );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async recordTaskEvidence(
    taskId: string,
    position: number,
    evidence: unknown,
  ) {
    const result = await this.pool.query(
      "UPDATE task_steps SET evidence=$3,state='VERIFIED' WHERE task_id=$1 AND position=$2",
      [taskId, position, JSON.stringify(redactEvent(evidence))],
    );
    if (!result.rowCount) throw new Error("Task step not found");
  }
  async listTaskSteps(taskId: string) {
    return this.rows<TaskStepRecord>(
      "SELECT * FROM task_steps WHERE task_id=$1 ORDER BY position",
      [taskId],
    );
  }
}

async function insertTask(
  client: PoolClient,
  input: Omit<
    TaskRecord,
    "id" | "status" | "fixAttempts" | "createdAt" | "updatedAt"
  >,
): Promise<TaskRecord> {
  const result = await client.query(
    "INSERT INTO tasks(project_id,agent_id,workspace_id,goal,max_fix_attempts) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [
      input.projectId,
      input.agentId,
      input.workspaceId,
      input.goal,
      input.maxFixAttempts,
    ],
  );
  return camel<TaskRecord>(result.rows[0]!);
}
async function queryTask(client: PoolClient, id: string): Promise<TaskRecord> {
  const result = await client.query("SELECT * FROM tasks WHERE id=$1", [id]);
  if (!result.rows[0])
    throw new Error("Idempotency record references a missing task");
  return camel<TaskRecord>(result.rows[0]);
}

export function createPgStore(connectionString: string): PgStore {
  return new PgStore(
    new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: true }
        : undefined,
    }),
  );
}
