import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { EngineeringController, WorkflowPausedError } from "@aegisforge/controller";
import { analyzeCode } from "@aegisforge/controller";
import { analyzeProject, type ProjectReader } from "@aegisforge/controller";
import { diagnoseFailure } from "@aegisforge/controller";
import { evaluateContextPolicy } from "@aegisforge/policy";
import type { EngineeringPlan, ToolDefinition } from "@aegisforge/contracts";
import type { AgentHub } from "./agents/agent-hub.js";
import { PersistentWorkflow } from "./controller-workflow.js";
import type { PlatformStore, TaskRecord } from "./domain.js";

export class TaskRunner {
  private readonly active = new Map<string, Promise<{ status: string; detail?: unknown }>>();
  constructor(
    private readonly store: PlatformStore,
    private readonly hub: AgentHub
  ) {}

  run(taskId: string) {
    const existing = this.active.get(taskId);
    if (existing) return existing;
    const operation = this.runOnce(taskId)
      .catch(async (error) => {
        await this.store.updateTaskStatus(taskId, "FAILED");
        throw error;
      })
      .finally(() => this.active.delete(taskId));
    this.active.set(taskId, operation);
    return operation;
  }

  private async runOnce(taskId: string): Promise<{ status: string; detail?: unknown }> {
    const task = await this.store.findTask(taskId);
    if (!task) throw new Error("Task not found");
    if (["COMPLETED", "CANCELLED"].includes(task.status)) return { status: task.status };
    const agent = await this.store.findAgent(task.agentId);
    const workspace = await this.store.findWorkspace(task.workspaceId);
    if (!agent || !workspace || agent.status !== "ONLINE" || !this.hub.connectedAgentIds().includes(agent.id))
      throw new Error("Assigned Agent is not online");

    const reader = new RemoteProjectReader(this.hub, task, agent.permissionLevel);
    const [profile, codeIndex] = await Promise.all([analyzeProject(reader), analyzeCode(reader)]);
    await this.store.saveProjectMemory(task.projectId, "code-index", codeIndex, task.id);
    await this.store.saveProjectMemory(task.projectId, "environment", { agentId: agent.id, environment: agent.environment, inventory: agent.inventory }, task.id);
    const tools = this.hub.connectedTools().find((item) => item.agentId === agent.id)?.tools ?? [];
    const plan = await this.store.loadTaskPlan(task.id);

if (!plan) {
  throw new Error(
    "Task has no EngineeringPlan. Submit plan from CustomGPT before execution."
  );
}
    for (const step of plan.steps)
      if (step.toolName && !tools.some((tool) => tool.name === step.toolName))
        throw new Error(`Plan references unavailable tool: ${step.toolName}`);

    const controller = new EngineeringController(
      new PersistentWorkflow(this.store),
      new RemoteExecutionPort(this.store, this.hub, task, tools),
    );
    try {
      await controller.run({ taskId: task.id, projectId: task.projectId, goal: task.goal, profile, plan, tools, maxFixAttempts: task.maxFixAttempts, initialStatus: task.status });
      return { status: "COMPLETED" };
    } catch (error) {
      if (error instanceof WorkflowPausedError) return { status: "WAITING_APPROVAL", detail: error.detail };
      throw error;
    }
  }
}

class RemoteProjectReader implements ProjectReader {
  private files: string[] | null = null;
  private readonly cache = new Map<string, string | null>();
  constructor(private readonly hub: AgentHub, private readonly task: TaskRecord, private readonly permissionLevel: 0 | 1 | 2 | 3 | 4) {}
  async list(depth: number) {
    if (!this.files) {
      const result = await this.dispatch("filesystem.list", { path: ".", depth, maxFiles: 5000 }) as { files?: unknown };
      this.files = z.array(z.string()).max(5000).parse(result.files);
    }
    return this.files;
  }
  async read(path: string, maxBytes: number) {
    if (this.cache.has(path)) return this.cache.get(path)!;
    try {
      const result = await this.dispatch("filesystem.read", { path }) as { content?: unknown };
      const content = z.string().max(maxBytes).parse(result.content);
      this.cache.set(path, content);
      return content;
    } catch {
      this.cache.set(path, null);
      return null;
    }
  }
  private dispatch(toolName: string, arguments_: Record<string, unknown>) {
    const tool = this.hub.getTool(this.task.agentId, toolName);
    if (!tool) throw new Error(`Project intelligence requires Agent tool ${toolName}`);
    return this.hub.dispatch(this.task.agentId, {
      taskId: this.task.id, projectId: this.task.projectId, workspaceId: this.task.workspaceId, tool,
      intent: { taskId: this.task.id, stepId: randomUUID(), toolName, arguments: arguments_, reason: "Collect bounded project intelligence", expectedImpact: "Read-only project inspection", affectedResources: ["."] },
      permissionLevel: this.permissionLevel, approvalGrantId: null,
      expiresAt: new Date(Date.now() + tool.timeoutMs + 5000).toISOString(),
    });
  }
}

class RemoteExecutionPort {
  constructor(
    private readonly store: PlatformStore,
    private readonly hub: AgentHub,
    private readonly task: TaskRecord,
    private readonly tools: ToolDefinition[],
  ) {}
  async execute(taskId: string, step: EngineeringPlan["steps"][number]) {
    if (!step.toolName) return { skipped: true, reason: "Reasoning-only plan step" };
    const tool = this.tools.find((item) => item.name === step.toolName);
    if (!tool) throw new Error(`Tool unavailable: ${step.toolName}`);
    const agent = await this.store.findAgent(this.task.agentId);
    if (!agent) throw new Error("Assigned Agent disappeared");
    const taskStep = (await this.store.listTaskSteps(taskId)).find((item) => item.state !== "VERIFIED" && item.title === step.title && item.toolName === step.toolName);
    if (!taskStep) throw new Error(`Persisted task step is missing: ${step.title}`);
    const affectedResources = extractResources(step.arguments);
    const decision = evaluateContextPolicy({ permissionLevel: agent.permissionLevel, requiredLevel: tool.requiredLevel, risk: tool.risk, approval: tool.approval, environment: agent.environment, toolName: tool.name, arguments: step.arguments, affectedPaths: affectedResources });
    if (decision.type === "DENIED") throw new Error(`Policy denied ${tool.name}: ${decision.reason}`);
    const argumentHash = digest({ toolName: tool.name, arguments: step.arguments, taskId, stepId: taskStep.id });
    let approvalGrantId: string | null = null;
    if (decision.type === "APPROVAL_REQUIRED") {
      const approval = (await this.store.listApprovals()).find((item) => item.taskId === taskId && item.toolName === tool.name && item.argumentHash === argumentHash);
      if (!approval) {
        const created = await this.store.createApproval({ taskId, toolName: tool.name, risk: decision.risk, reason: step.description, impact: step.verification, affectedResources, argumentHash });
        await this.store.updateTaskStatus(taskId, "WAITING_APPROVAL");
        throw new WorkflowPausedError({ approval: created });
      }
      if (approval.status === "PENDING") {
        await this.store.updateTaskStatus(taskId, "WAITING_APPROVAL");
        throw new WorkflowPausedError({ approval });
      }
      if (approval.status !== "APPROVED" || !approval.expiresAt || approval.expiresAt <= new Date())
        throw new Error(`Approval for ${tool.name} was denied or expired`);
      approvalGrantId = approval.id;
    }
    const result = await this.hub.dispatch(this.task.agentId, {
      taskId, projectId: this.task.projectId, workspaceId: this.task.workspaceId, tool,
      intent: { taskId, stepId: taskStep.id, toolName: tool.name, arguments: step.arguments, reason: step.description, expectedImpact: step.verification, affectedResources },
      permissionLevel: agent.permissionLevel, approvalGrantId,
      expiresAt: new Date(Date.now() + Math.min(tool.timeoutMs + 5000, 3_605_000)).toISOString(),
    });
    if (approvalGrantId) await this.store.consumeApproval(approvalGrantId, new Date());
    return result;
  }
  async verify(_taskId: string, step: EngineeringPlan["steps"][number], result: unknown) {
    const value = result as Record<string, unknown> | null;
    const ok = value == null || (typeof value.code !== "number" || value.code === 0) && (typeof value.status !== "number" || value.status < 400) && (typeof value.open !== "boolean" || value.open);
    return { ok, evidence: { expectation: step.verification, result } };
  }
  async diagnose(_taskId: string, step: EngineeringPlan["steps"][number], verification: { evidence: unknown }) {
    return { ...diagnoseFailure(verification.evidence), step: step.title };
  }
  async repair() {
    // The retry is intentional for transient failures; any different mutation must be a separately planned, policy-evaluated step.
    return { action: "retry_original_verified_step" };
  }
}

function extractResources(arguments_: Record<string, unknown>): string[] {
  const values = [arguments_.path, arguments_.source, arguments_.destination, arguments_.url, arguments_.name].filter((value): value is string => typeof value === "string");
  return values.length ? values.slice(0, 100) : ["workspace"];
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
