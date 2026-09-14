import type {
  EngineeringPlan,
  ProjectProfile,
  TaskStatus,
} from "../../packages/contracts/src/index.js";
import type { WorkflowPort } from "../../controller/src/execution-loop.js";
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
  async recordEvidence(taskId: string, step: number, evidence: unknown) {
    await this.store.recordTaskEvidence(taskId, step, evidence);
  }
}
