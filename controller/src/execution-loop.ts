import type {
  EngineeringPlan,
  ProjectProfile,
  TaskStatus,
  ToolDefinition,
} from "@aegisforge/contracts";
import { transitionTask } from "./task-state.js";

export interface WorkflowPort {
  setStatus(taskId: string, status: TaskStatus): Promise<void>;
  saveProfile(projectId: string, profile: ProjectProfile): Promise<void>;
  savePlan(taskId: string, plan: EngineeringPlan): Promise<void>;
  recordEvidence(
    taskId: string,
    step: number,
    evidence: unknown,
    verified?: boolean,
  ): Promise<void>;
  loadContext?(projectId: string): Promise<unknown>;
  recordPhase?(taskId: string, phase: EngineeringPhase, detail?: unknown): Promise<void>;
  recordLearning?(projectId: string, taskId: string, learning: unknown): Promise<void>;
  completedSteps?(taskId: string): Promise<Set<number>>;
}
export type EngineeringPhase = "OBSERVE" | "UNDERSTAND" | "PLAN" | "EXECUTE" | "VERIFY" | "LEARN" | "CONTINUE";
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
  diagnose?(
    taskId: string,
    step: EngineeringPlan["steps"][number],
    verification: { ok: boolean; evidence: unknown },
    error?: unknown,
  ): Promise<unknown>;
  repair?(
    taskId: string,
    step: EngineeringPlan["steps"][number],
    diagnosis: unknown,
  ): Promise<unknown>;
}
export interface ControllerInput {
  taskId: string;
  projectId: string;
  goal: string;
  profile: ProjectProfile;
  plan: EngineeringPlan;
  tools: ToolDefinition[];
  maxFixAttempts: number;
  initialStatus?: TaskStatus;
}

export class WorkflowPausedError extends Error {
  constructor(public readonly detail: unknown) {
    super("Workflow is waiting for approval");
    this.name = "WorkflowPausedError";
  }
}

export class EngineeringController {
  constructor(
    private readonly workflow: WorkflowPort,
    private readonly executor: ExecutionPort,
  ) {}
  async run(input: ControllerInput): Promise<void> {
    let status: TaskStatus = input.initialStatus ?? "QUEUED";
    const move = async (next: TaskStatus) => {
      status = transitionTask(status, next);
      await this.workflow.setStatus(input.taskId, status);
    };
    const phase = async (name: EngineeringPhase, detail?: unknown) =>
      this.workflow.recordPhase?.(input.taskId, name, detail);
    try {
      await phase("OBSERVE");
      const previousContext = await this.workflow.loadContext?.(input.projectId);
      if (status === "WAITING_APPROVAL") {
        await move("EXECUTING");
      } else {
        await move("UNDERSTANDING");
        await phase("UNDERSTAND", { hasPreviousContext: previousContext != null });
        await this.workflow.saveProfile(input.projectId, input.profile);
        await move("PLANNING");
        await phase("PLAN");
        await this.workflow.savePlan(input.taskId, input.plan);
        await move("EXECUTING");
      }
      const completed = await this.workflow.completedSteps?.(input.taskId) ?? new Set<number>();
      for (let index = 0; index < input.plan.steps.length; index++) {
        if (completed.has(index)) continue;
        const step = input.plan.steps[index]!;
        let attempts = 0;
        while (true) {
          await phase("EXECUTE", { step: index, attempt: attempts + 1 });
          const result = await this.executor.execute(input.taskId, step);
          await move("VERIFYING");
          await phase("VERIFY", { step: index, attempt: attempts + 1 });
          const verification = await this.executor.verify(
            input.taskId,
            step,
            result,
          );
          if (verification.ok) {
            await this.workflow.recordEvidence(input.taskId, index, verification.evidence, true);
            break;
          }
          const diagnosis = this.executor.diagnose
            ? await this.executor.diagnose(input.taskId, step, verification)
            : { cause: "verification failed", evidence: verification.evidence };
          await this.workflow.recordEvidence(input.taskId, index, {
            verification: verification.evidence,
            diagnosis,
            attempt: attempts + 1,
          }, false);
          if (attempts >= input.maxFixAttempts)
            throw new Error(
              `Verification failed after ${attempts + 1} attempts`,
            );
          attempts++;
          await move("FIXING");
          if (this.executor.repair)
            await this.executor.repair(input.taskId, step, diagnosis);
        }
        if (index < input.plan.steps.length - 1) {
          await phase("CONTINUE", { completedStep: index });
          await move("EXECUTING");
        }
      }
      await phase("LEARN");
      await this.workflow.recordLearning?.(input.projectId, input.taskId, {
        outcome: "COMPLETED",
        summary: input.plan.summary,
        steps: input.plan.steps.length,
      });
      await move("COMPLETED");
    } catch (error) {
      if (error instanceof WorkflowPausedError) throw error;
      if (!["FAILED", "CANCELLED"].includes(status)) {
        await this.workflow.setStatus(input.taskId, "FAILED");
      }
      await this.workflow.recordLearning?.(input.projectId, input.taskId, {
        outcome: "FAILED",
        summary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
