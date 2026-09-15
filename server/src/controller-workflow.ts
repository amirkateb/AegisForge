import type {
  EngineeringPlan,
  ProjectProfile,
  TaskStatus,
} from "@aegisforge/contracts";
import type { WorkflowPort } from "@aegisforge/controller";
import type { EngineeringPhase } from "@aegisforge/controller";
import type { PlatformStore } from "./domain.js";

export class PersistentWorkflow implements WorkflowPort {
  constructor(private readonly store: PlatformStore) {}
  async setStatus(taskId: string, status: TaskStatus) {
    if (!(await this.store.updateTaskStatus(taskId, status)))
      throw new Error("Task not found");
  }
  async saveProfile(projectId: string, profile: ProjectProfile) {
    await this.store.saveProjectProfile(projectId, profile);
  }
  async savePlan(taskId: string, plan: EngineeringPlan) {
    await this.store.saveTaskPlan(taskId, plan);
  }
  async recordEvidence(taskId: string, step: number, evidence: unknown, verified = true) {
    await this.store.recordTaskEvidence(taskId, step, evidence, verified);
  }
  async loadContext(projectId: string) {
    return this.store.loadProjectContext(projectId);
  }
  async recordPhase(taskId: string, phase: EngineeringPhase, detail?: unknown) {
    const task = await this.store.findTask(taskId);
    await this.store.appendAudit({
      agentId: task?.agentId ?? null,
      projectId: task?.projectId ?? null,
      userId: "controller",
      action: `agent.phase.${phase.toLowerCase()}`,
      durationMs: null,
      status: "SUCCESS",
      metadata: { taskId, detail },
    });
  }
  async recordLearning(projectId: string, taskId: string, learning: unknown) {
    const item = learning as { outcome?: string; summary?: string };
    await this.store.appendProjectHistory(projectId, {
      taskId,
      outcome: item.outcome ?? "UNKNOWN",
      summary: item.summary ?? "Engineering cycle completed",
    });
  }
  async completedSteps(taskId: string) {
    return new Set((await this.store.listTaskSteps(taskId)).filter((step) => step.state === "VERIFIED").map((step) => step.position));
  }
}
