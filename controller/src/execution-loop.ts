import type {
  EngineeringPlan,
  ProjectProfile,
  TaskStatus,
  ToolDefinition,
} from "../../packages/contracts/src/index.js";
import { transitionTask } from "./task-state.js";

export interface WorkflowPort {
  setStatus(taskId: string, status: TaskStatus): Promise<void>;
  saveProfile(projectId: string, profile: ProjectProfile): Promise<void>;
  savePlan(taskId: string, plan: EngineeringPlan): Promise<void>;
  recordEvidence(
    taskId: string,
    step: number,
    evidence: unknown,
  ): Promise<void>;
}
export interface ExecutionPort {
  execute(
    taskId: string,
    step: EngineeringPlan["steps"][number],
  ): Promise<unknown>;
  verify(
    taskId: string,
    step: EngineeringPlan["steps"][number],
    result: unknown,
  ): Promise<{ ok: boolean; evidence: unknown }>;
}
export interface ControllerInput {
  taskId: string;
  projectId: string;
  goal: string;
  profile: ProjectProfile;
  plan: EngineeringPlan;
  tools: ToolDefinition[];
  maxFixAttempts: number;
}

export class EngineeringController {
  constructor(
    private readonly workflow: WorkflowPort,
    private readonly executor: ExecutionPort,
  ) {}
  async run(input: ControllerInput): Promise<void> {
    let status: TaskStatus = "QUEUED";
    const move = async (next: TaskStatus) => {
      status = transitionTask(status, next);
      await this.workflow.setStatus(input.taskId, status);
    };
    try {
      await move("UNDERSTANDING");
      await this.workflow.saveProfile(input.projectId, input.profile);
      await move("PLANNING");
      await this.workflow.savePlan(input.taskId, input.plan);
      await move("EXECUTING");
      for (let index = 0; index < input.plan.steps.length; index++) {
        const step = input.plan.steps[index]!;
        let attempts = 0;
        while (true) {
          const result = await this.executor.execute(input.taskId, step);
          await move("VERIFYING");
          const verification = await this.executor.verify(
            input.taskId,
            step,
            result,
          );
          await this.workflow.recordEvidence(
            input.taskId,
            index,
            verification.evidence,
          );
          if (verification.ok) break;
          if (attempts >= input.maxFixAttempts)
            throw new Error(
              `Verification failed after ${attempts + 1} attempts`,
            );
          attempts++;
          await move("FIXING");
        }
        if (index < input.plan.steps.length - 1) await move("EXECUTING");
      }
      await move("COMPLETED");
    } catch (error) {
      if (!["FAILED", "CANCELLED"].includes(status)) {
        await this.workflow.setStatus(input.taskId, "FAILED");
      }
      throw error;
    }
  }
}
